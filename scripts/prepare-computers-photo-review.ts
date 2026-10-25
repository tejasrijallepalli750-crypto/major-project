import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseOlistCsv } from './olist-product-importer';
import {
  buildOpenverseSearchUrl,
  buildWikimediaSearchUrl,
  downloadLicensedPhoto,
  evaluateCategoryRelevance,
  fetchWithRespectfulRetry,
  isCommerciallyUsableLicense,
  isSafeHttpsUrl,
  OpenPhotoCandidate,
  parseOpenverseSearchResponse,
  parseWikimediaSearchResponse,
  USER_AGENT,
} from './olist-image-enrichment';

const ROOT = process.cwd();
const BATCH_FILE = path.join(ROOT, 'data', 'olist-image-enrichment', 'computers-review', 'computers-products.csv');
const OUTPUT_ROOT = path.join(ROOT, 'data', 'olist-image-enrichment', 'computers-review', 'photo-candidates');
const MANIFEST_FILE = path.join(OUTPUT_ROOT, 'manifest.json');
const REPORT_FILE = path.join(OUTPUT_ROOT, 'report.html');
const CONTACT_SHEET_FILE = path.join(OUTPUT_ROOT, 'contact-sheet.jpg');
const IMAGE_DIR = path.join(OUTPUT_ROOT, 'images');
const SEARCH_CACHE_DIR = path.join(OUTPUT_ROOT, 'search-cache');
const PRODUCT_COUNT = 30;
const MAX_CANDIDATES = 30;
const MAX_SEARCH_REQUESTS = 8;
const SEARCH_TERMS = [
  'laptop',
  'notebook computer',
  'desktop computer',
  'computer keyboard',
  'computer mouse',
  'computer monitor',
  'computer tower',
  'computer peripherals',
] as const;

interface ComputerBatchRow extends Record<string, string> {
  'Olist product ID': string;
  'Original category identifier': string;
  'English category': string;
}

export interface ComputerPhotoCandidate {
  provider: OpenPhotoCandidate['provider'];
  title: string;
  description: string;
  creator: string;
  creatorUrl: string;
  sourceUrl: string;
  originalImageUrl: string;
  license: string;
  licenseVersion: string;
  licenseUrl: string;
  attribution: string;
  searchQuery: string;
  relevanceEvidence: string[];
  matchType: 'representative-category-match';
  assignment: null;
  reviewStatus: 'needs-human-review';
  visualScreening: 'needs-visual-screen' | 'category-relevant-candidate' | 'rejected-after-visual-screen';
  visualScreeningNote: string;
  imagePath: string;
  originalSha256: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
};

export interface SearchFailure {
  provider: string;
  query: string;
  reason: string;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] || character);

const xmlEscape = (value: string): string => escapeHtml(value);

export const validateComputersBatch = (rows: readonly ComputerBatchRow[]): void => {
  if (rows.length !== PRODUCT_COUNT) {
    throw new Error(`Expected the existing ${PRODUCT_COUNT}-product Computers batch; found ${rows.length}.`);
  }
  if (rows.some((row) => row['Original category identifier'] !== 'pcs' || row['English category'] !== 'computers')) {
    throw new Error('The input batch contains records outside Olist pcs / Computers.');
  }
};

export const selectComputerCategoryCandidates = (
  candidates: readonly { candidate: OpenPhotoCandidate; query: string }[],
  limit = MAX_CANDIDATES,
): Array<{ candidate: OpenPhotoCandidate; query: string; evidence: string[] }> => {
  const selected: Array<{ candidate: OpenPhotoCandidate; query: string; evidence: string[] }> = [];
  const sourceKeys = new Set<string>();
  for (const item of candidates) {
    const { candidate } = item;
    if (!isCommerciallyUsableLicense(candidate.license, candidate.licenseUrl)
      || !isSafeHttpsUrl(candidate.imageUrl) || !isSafeHttpsUrl(candidate.sourceUrl)
      || !isSafeHttpsUrl(candidate.creatorUrl) || !candidate.creator.trim() || !candidate.attribution.trim()) {
      continue;
    }
    const relevance = evaluateCategoryRelevance(candidate, 'computers');
    if (!relevance.accepted) continue;
    const key = `${candidate.provider}:${candidate.id}:${candidate.imageUrl}`;
    if (sourceKeys.has(key)) continue;
    sourceKeys.add(key);
    selected.push({ candidate, query: item.query, evidence: relevance.evidence });
    if (selected.length >= limit) break;
  }
  return selected;
};

export const renderComputersReviewHtml = (
  candidates: readonly ComputerPhotoCandidate[],
  failures: readonly SearchFailure[],
): string => {
  const relevantCandidates = candidates.filter((candidate) =>
    candidate.visualScreening === 'category-relevant-candidate').length;
  const rejectedCandidates = candidates.filter((candidate) =>
    candidate.visualScreening === 'rejected-after-visual-screen').length;
  const pendingCandidates = candidates.filter((candidate) =>
    candidate.visualScreening === 'needs-visual-screen').length;
  const rows = candidates.map((candidate, index) => `<article class="candidate">
    <h2>Category candidate ${index + 1}: ${escapeHtml(candidate.title)}</h2>
    <img src="./${escapeHtml(candidate.imagePath)}" alt="${escapeHtml(candidate.title)}" loading="lazy">
    <dl>
      <dt>Olist category</dt><dd>Computers (original category identifier: pcs)</dd>
      <dt>Relationship</dt><dd>Representative category match only. No Olist product ID or SKU is assigned.</dd>
      <dt>Search query</dt><dd>${escapeHtml(candidate.searchQuery)}</dd>
      <dt>Creator</dt><dd>${escapeHtml(candidate.creator)} — <a href="${escapeHtml(candidate.creatorUrl)}">creator details</a></dd>
      <dt>Source</dt><dd><a href="${escapeHtml(candidate.sourceUrl)}">${escapeHtml(candidate.sourceUrl)}</a></dd>
      <dt>License</dt><dd>${escapeHtml(candidate.license)} ${escapeHtml(candidate.licenseVersion)} — <a href="${escapeHtml(candidate.licenseUrl)}">license terms</a></dd>
      <dt>Attribution</dt><dd>${escapeHtml(candidate.attribution)}</dd>
      <dt>Relevance evidence</dt><dd>${candidate.relevanceEvidence.map(escapeHtml).join('<br>')}</dd>
      <dt>Visual screening</dt><dd>${escapeHtml(candidate.visualScreening)} — ${escapeHtml(candidate.visualScreeningNote)}</dd>
      <dt>Image integrity</dt><dd>${candidate.width}×${candidate.height}; optimized WebP ${candidate.byteLength} bytes; SHA-256 ${candidate.sha256}; source SHA-256 ${candidate.originalSha256}</dd>
      <dt>Review status</dt><dd>Needs human review; not an original Olist product photo and not approved for production.</dd>
    </dl>
  </article>`).join('');
  const failureRows = failures.length
    ? `<ul>${failures.map((failure) => `<li><strong>${escapeHtml(failure.provider)} (${escapeHtml(failure.query)}):</strong> ${escapeHtml(failure.reason)}</li>`).join('')}</ul>`
    : '<p>No search or download errors were recorded.</p>';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Olist Computers photo candidates</title>
  <style>body{font:16px system-ui,sans-serif;color:#1b2a38;margin:24px;line-height:1.5}header{max-width:1000px}.candidate{border:1px solid #ccd4dc;border-radius:10px;padding:18px;margin:24px 0;display:grid;grid-template-columns:minmax(250px,45%) 1fr;gap:12px}.candidate h2{grid-column:1/-1}.candidate img{width:100%;max-height:560px;object-fit:contain;background:#f3f5f7}dl{margin:0}dt{font-weight:700;margin-top:10px}dd{margin-left:0;overflow-wrap:anywhere}.sheet{max-width:100%;height:auto}.warning{background:#fff6dc;padding:14px;border-left:4px solid #d7a82d}</style>
  <header><h1>Olist Computers (pcs) — category photo candidates</h1>
  <p class="warning">Olist's 30 Computers records do not contain actual product names or image URLs. These are category-representative candidates only. No image is connected to an Olist product ID. Exact matches: 0. Products still needing identity-matched images: 30/30. No image is production-approved.</p>
  <p>Unique files staged: ${candidates.length}; category-relevant candidates retained after visual screening: ${relevantCandidates}; visually rejected and preserved for inspection: ${rejectedCandidates}; awaiting visual screening: ${pendingCandidates}. Distinct optimized SHA-256 hashes: ${new Set(candidates.map((candidate) => candidate.sha256)).size}/${candidates.length}. All retained candidates still require human review. All images were sourced from free-license search results; no paid API or image generation was used.</p>
  ${candidates.length ? '<h2>Contact sheet</h2><img class="sheet" src="./contact-sheet.jpg" alt="Contact sheet of computer category photo candidates">' : '<p>No suitable image candidates passed the metadata, license, and relevance checks. No contact sheet is available.</p>'}
  <h2>Search and download issues</h2>${failureRows}</header>
  ${rows}</html>`;
};

const readBatch = (): ComputerBatchRow[] => {
  if (!fs.existsSync(BATCH_FILE)) throw new Error(`Required Computers batch is missing: ${BATCH_FILE}`);
  const rows = parseOlistCsv<ComputerBatchRow>(fs.readFileSync(BATCH_FILE, 'utf8'));
  validateComputersBatch(rows);
  return rows;
};

const cachedJson = (filename: string): unknown | undefined => {
  if (!fs.existsSync(filename)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
};

const writeJson = (filename: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
};

const searchOpenverse = async (query: string): Promise<OpenPhotoCandidate[]> => {
  const url = new URL(buildOpenverseSearchUrl('computers'));
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', '20');
  const cacheFile = path.join(SEARCH_CACHE_DIR, `openverse-${crypto.createHash('sha256').update(query).digest('hex')}.json`);
  const cache = cachedJson(cacheFile);
  if (cache && typeof cache === 'object' && 'results' in cache && Array.isArray(cache.results)) {
    return cache.results as OpenPhotoCandidate[];
  }
  const response = await fetchWithRespectfulRetry(url.toString(), {
    retries: 1,
    minimumIntervalMs: 1_100,
    userAgent: USER_AGENT,
  });
  const raw = await response.json() as unknown;
  const results = parseOpenverseSearchResponse(raw);
  writeJson(cacheFile, { fetchedAt: new Date().toISOString(), query, results });
  return results;
};

const searchCommons = async (): Promise<OpenPhotoCandidate[]> => {
  const url = buildWikimediaSearchUrl('computers');
  const cacheFile = path.join(SEARCH_CACHE_DIR, 'wikimedia-computers.json');
  const cache = cachedJson(cacheFile);
  if (cache && typeof cache === 'object' && 'results' in cache && Array.isArray(cache.results)) {
    return cache.results as OpenPhotoCandidate[];
  }
  const response = await fetchWithRespectfulRetry(url, {
    retries: 1,
    minimumIntervalMs: 1_100,
    userAgent: USER_AGENT,
  });
  const raw = await response.json() as unknown;
  const results = parseWikimediaSearchResponse(raw);
  writeJson(cacheFile, { fetchedAt: new Date().toISOString(), query: url, results });
  return results;
};

const writeContactSheet = async (
  candidates: readonly ComputerPhotoCandidate[],
  outputRoot = OUTPUT_ROOT,
): Promise<void> => {
  if (!candidates.length) return;
  const resolvedRoot = path.resolve(outputRoot);
  const columns = 4;
  const tileWidth = 360;
  const tileHeight = 310;
  const tiles: Parameters<ReturnType<typeof sharp>['composite']>[0] = [];
  for (const [index, candidate] of candidates.entries()) {
    const imagePath = path.resolve(resolvedRoot, candidate.imagePath);
    if (!imagePath.startsWith(`${resolvedRoot}${path.sep}`) || !fs.existsSync(imagePath)) {
      throw new Error(`Candidate image missing or outside the review directory: ${candidate.imagePath}`);
    }
    const photo = await sharp(imagePath).resize(tileWidth - 16, tileHeight - 70, {
      fit: 'contain',
      background: '#fff',
    }).jpeg({ quality: 85 }).toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth - 8}" height="54"><rect width="100%" height="100%" fill="#fff"/><text x="6" y="20" font-family="Arial" font-size="13" font-weight="bold">${xmlEscape(candidate.title.slice(0, 42))}</text>    <text x="6" y="42" font-family="Arial" font-size="12">${xmlEscape(`${candidate.visualScreening === 'category-relevant-candidate' ? 'CATEGORY CANDIDATE' : candidate.visualScreening === 'needs-visual-screen' ? 'VISUAL SCREEN PENDING' : 'REJECTED'} · ${candidate.license}`)}</text></svg>`);
    const tile = await sharp({
      create: { width: tileWidth - 8, height: tileHeight - 8, channels: 3, background: '#fff' },
    }).composite([
      { input: photo, left: 4, top: 4 },
      { input: label, left: 4, top: tileHeight - 62 },
    ]).jpeg({ quality: 85 }).toBuffer();
    tiles.push({
      input: tile,
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    });
  }
  await sharp({
    create: {
      width: columns * tileWidth,
      height: Math.ceil(candidates.length / columns) * tileHeight,
      channels: 3,
      background: '#eef2f5',
    },
  }).composite(tiles).jpeg({ quality: 88 }).toFile(path.join(outputRoot, 'contact-sheet.jpg'));
};

export const writeComputersReview = async (
  candidates: readonly ComputerPhotoCandidate[],
  failures: readonly SearchFailure[],
  outputRoot = OUTPUT_ROOT,
): Promise<void> => {
  fs.mkdirSync(outputRoot, { recursive: true });
  writeJson(path.join(outputRoot, 'manifest.json'), {
    generatedAt: new Date().toISOString(),
    category: 'computers',
    originalCategoryIdentifier: 'pcs',
    productCount: PRODUCT_COUNT,
    exactProductMatches: 0,
    productsStillNeedingIdentityMatchedImages: PRODUCT_COUNT,
    candidatesAreCategoryRepresentations: true,
    categoryRelevantCandidatesAfterVisualScreen: candidates.filter((candidate) =>
      candidate.visualScreening === 'category-relevant-candidate').length,
    visuallyRejectedCandidatesPreserved: candidates.filter((candidate) =>
      candidate.visualScreening === 'rejected-after-visual-screen').length,
    candidatesAwaitingVisualScreen: candidates.filter((candidate) =>
      candidate.visualScreening === 'needs-visual-screen').length,
    databaseUpdated: false,
    candidates,
    failures,
  });
  fs.writeFileSync(path.join(outputRoot, 'report.html'), renderComputersReviewHtml(candidates, failures));
  await writeContactSheet(candidates, outputRoot);
};

const main = async (): Promise<void> => {
  const rows = readBatch();
  console.log(`Computers image review: ${rows.length} Olist category records; no product names or image URLs are available.`);
  if (!process.argv.slice(2).includes('--search')) {
    console.log('Dry run: no network requests or downloads. To search free sources, explicitly run: npx tsx scripts/prepare-computers-photo-review.ts --search');
    return;
  }
  if (process.argv.slice(2).some((argument) => argument !== '--search')) {
    throw new Error('Only the explicit --search option is supported.');
  }

  fs.mkdirSync(SEARCH_CACHE_DIR, { recursive: true });
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const failures: SearchFailure[] = [];
  const searchResults: Array<{ candidate: OpenPhotoCandidate; query: string }> = [];
  let openverseRequests = 0;
  let openverseAuthFailure = false;
  for (const query of SEARCH_TERMS) {
    if (openverseRequests >= MAX_SEARCH_REQUESTS || openverseAuthFailure) break;
    openverseRequests += 1;
    console.log(`[${openverseRequests}/${MAX_SEARCH_REQUESTS}] Openverse search: ${query}`);
    try {
      const results = await searchOpenverse(query);
      console.log(`  Received ${results.length} licensed metadata candidates.`);
      searchResults.push(...results.map((candidate) => ({ candidate, query })));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown search error.';
      failures.push({ provider: 'Openverse', query, reason });
      console.error(`  Openverse error: ${reason}`);
      openverseAuthFailure = /Openverse returned HTTP 401/.test(reason);
    }
  }

  let selected = selectComputerCategoryCandidates(searchResults);
  if (selected.length < MAX_CANDIDATES) {
    console.log(`Openverse supplied ${selected.length} strict category candidates; trying Wikimedia Commons fallback.`);
    try {
      const commons = await searchCommons();
      const combined = [
        ...searchResults,
        ...commons.map((candidate) => ({ candidate, query: 'Wikimedia Commons computer products' })),
      ];
      selected = selectComputerCategoryCandidates(combined);
      console.log(`Combined sources supplied ${selected.length} strict category candidates.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown search error.';
      failures.push({ provider: 'Wikimedia Commons', query: 'computer products', reason });
      console.error(`  Wikimedia Commons error: ${reason}`);
    }
  }

  const staged: ComputerPhotoCandidate[] = [];
  const sourceImageHashes = new Set<string>();
  const optimizedImageHashes = new Set<string>();
  for (const [index, item] of selected.entries()) {
    const candidate = item.candidate;
    console.log(`[${index + 1}/${selected.length}] Downloading category candidate: ${candidate.title}`);
    const temporaryPath = path.join(IMAGE_DIR, `${crypto.createHash('sha256').update(`${candidate.provider}\n${candidate.id}`).digest('hex')}.webp`);
    try {
      const image = await downloadLicensedPhoto(candidate, temporaryPath, 1);
      const originalSha256 = image.sourceSha256;
      const optimizedSha256 = crypto.createHash('sha256').update(image.bytes).digest('hex');
      if (sourceImageHashes.has(originalSha256) || optimizedImageHashes.has(optimizedSha256)) {
        fs.unlinkSync(temporaryPath);
        console.log('  Rejected duplicate image hash.');
        continue;
      }
      sourceImageHashes.add(originalSha256);
      optimizedImageHashes.add(optimizedSha256);
      staged.push({
        provider: candidate.provider,
        title: candidate.title,
        description: candidate.description,
        creator: candidate.creator,
        creatorUrl: candidate.creatorUrl,
        sourceUrl: candidate.sourceUrl,
        originalImageUrl: candidate.imageUrl,
        license: candidate.license,
        licenseVersion: candidate.licenseVersion,
        licenseUrl: candidate.licenseUrl,
        attribution: candidate.attribution,
        searchQuery: item.query,
        relevanceEvidence: item.evidence,
        matchType: 'representative-category-match',
        assignment: null,
        reviewStatus: 'needs-human-review',
        visualScreening: 'needs-visual-screen',
        visualScreeningNote: 'Not visually screened yet; inspect the image before considering it relevant.',
        imagePath: path.relative(OUTPUT_ROOT, temporaryPath).replace(/\\/g, '/'),
        originalSha256,
        sha256: optimizedSha256,
        byteLength: image.bytes.byteLength,
        width: image.width,
        height: image.height,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown image download error.';
      failures.push({ provider: candidate.provider, query: item.query, reason: `Candidate "${candidate.title}": ${reason}` });
      console.error(`  Download error: ${reason}`);
    }
  }
  await writeComputersReview(staged, failures);
  console.log(`Valid unique category candidates staged: ${staged.length}.`);
  console.log(`Exact Olist product-image matches: 0; Computers products still requiring identity-matched images: ${PRODUCT_COUNT}.`);
  console.log(`HTML report: ${REPORT_FILE}`);
  if (staged.length) console.log(`Contact sheet: ${CONTACT_SHEET_FILE}`);
  console.log(`Provenance manifest: ${MANIFEST_FILE}`);
  if (failures.length) {
    for (const failure of failures) {
      console.error(`${failure.provider} failure (${failure.query}): ${failure.reason}`);
    }
    process.exitCode = 1;
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`Computers photo review stopped: ${error instanceof Error ? error.message : 'Unknown error.'}`);
    process.exitCode = 1;
  });
}
