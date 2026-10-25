import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseOlistCsv } from './olist-product-importer';
import {
  buildOpenverseSearchUrl,
  buildOlistDisplayName,
  buildWikimediaSearchUrl,
  categorySearchQuery,
  countUniqueImageHashes,
  createPhotoManifestEntry,
  downloadLicensedPhoto,
  evaluateCategoryRelevance,
  fetchWithRespectfulRetry,
  isCommerciallyUsableLicense,
  isSafeHttpsUrl,
  localPhotoProvenanceStatus,
  OLIST_FREE_PHOTO_ROOT,
  OLIST_IMAGE_PILOT_SIZE,
  OlistImageSourceProduct,
  OlistPhotoManifestEntry,
  OpenPhotoCandidate,
  CategoryRelevance,
  parseOlistImagePipelineOptions,
  parseOpenverseSearchResponse,
  parseWikimediaSearchResponse,
  readSearchCache,
  scoreCategoryMatch,
  selectOlistImagePilot,
  USER_AGENT,
  validatePhotoManifestEntries,
  writeSearchCache,
} from './olist-image-enrichment';
import { formatCategoryLabel } from '../src/utils/productPresentation';

const ROOT = process.cwd();
const SOURCE_ROOT = path.resolve(ROOT, 'dataset', 'olist_raw');
const STAGING_ROOT = path.resolve(ROOT, OLIST_FREE_PHOTO_ROOT);
const SEARCH_CACHE_ROOT = path.join(STAGING_ROOT, 'search-cache');
const IMAGE_ROOT = path.join(STAGING_ROOT, 'images');
const MANIFEST_FILE = path.join(STAGING_ROOT, 'manifest.json');
const LOCAL_PROVENANCE_FILE = path.join(STAGING_ROOT, 'local-photo-provenance.json');
const PUBLIC_ROOT = path.resolve(ROOT, 'public');
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_NETWORK_ATTEMPTS_PER_PILOT = 200;

class FreePhotoPilotError extends Error {}

const readCsv = <TRow extends Record<string, string>>(filename: string): TRow[] => {
  const filePath = path.resolve(SOURCE_ROOT, filename);
  if (!filePath.startsWith(`${SOURCE_ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
    throw new FreePhotoPilotError(`Required Olist source file is missing: ${filename}`);
  }
  return parseOlistCsv<TRow>(fs.readFileSync(filePath, 'utf8'));
};

const readManifest = (): OlistPhotoManifestEntry[] => {
  if (!fs.existsSync(MANIFEST_FILE)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')) as unknown;
  } catch {
    throw new FreePhotoPilotError('Pilot photo manifest is not valid JSON; repair it before resuming.');
  }
  if (!Array.isArray(parsed)) throw new FreePhotoPilotError('Pilot photo manifest must be a JSON array.');
  return (parsed as OlistPhotoManifestEntry[]).map((entry) => ({
    ...entry,
    relevanceEvidence: Array.isArray(entry.relevanceEvidence) ? entry.relevanceEvidence : [],
    relevanceStatus: entry.relevanceStatus || 'needs-re-review',
    matchReason: entry.relevanceStatus
      ? entry.matchReason
      : `${entry.matchReason} Previous keyword matching was too permissive; relevance needs re-review.`,
  }));
};

const sha256File = (filename: string): string =>
  crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

export const writeManifest = (entries: OlistPhotoManifestEntry[], manifestFile = MANIFEST_FILE): void => {
  validatePhotoManifestEntries(entries);
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  const temporary = `${manifestFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(entries, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, manifestFile);
};

const writeJson = (filename: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, filename);
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);

export const writePilotReports = async (
  entries: OlistPhotoManifestEntry[],
  products: OlistImageSourceProduct[],
  translations: ReadonlyMap<string, string>,
  stagingRoot = STAGING_ROOT,
  rejectedByCategory: ReadonlyMap<string, Array<{ title: string; reason: string; provider: string }>> = new Map(),
): Promise<void> => {
  const columns = 5;
  const tileWidth = 300;
  const tileHeight = 340;
  const tiles: Parameters<ReturnType<typeof sharp>['composite']>[0] = [];
  for (const [index, entry] of entries.entries()) {
    const filename = path.resolve(stagingRoot, entry.imagePath);
    if (!filename.startsWith(`${stagingRoot}${path.sep}`) || !fs.existsSync(filename)
      || sha256File(filename) !== entry.sha256) {
      throw new FreePhotoPilotError(`Staged photo is missing or has changed for ${entry.sku}.`);
    }
    const photo = await sharp(filename)
      .resize(tileWidth - 16, tileHeight - 76, { fit: 'contain', background: '#fff' })
      .jpeg({ quality: 86 })
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${tileWidth - 8}" height="64"><rect width="100%" height="100%" fill="#fff"/><text x="4" y="20" font-family="Arial" font-size="13" font-weight="bold">${escapeHtml(entry.sku)}</text><text x="4" y="42" font-family="Arial" font-size="12">${escapeHtml(entry.category.slice(0, 35))}</text><text x="4" y="58" font-family="Arial" font-size="10">${escapeHtml(`${entry.sourceProvider} · ${entry.license}`.slice(0, 42))}</text></svg>`,
    );
    const tile = await sharp({
      create: { width: tileWidth - 8, height: tileHeight - 8, channels: 3, background: '#fff' },
    }).composite([
      { input: photo, left: 4, top: 4 },
      { input: label, left: 4, top: tileHeight - 72 },
    ]).jpeg({ quality: 86 }).toBuffer();
    tiles.push({
      input: tile,
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    });
  }
  if (entries.length) {
    await sharp({
      create: {
        width: columns * tileWidth,
        height: Math.ceil(entries.length / columns) * tileHeight,
        channels: 3,
        background: '#eaf0f5',
      },
    }).composite(tiles).jpeg({ quality: 90 }).toFile(path.join(stagingRoot, 'contact-sheet.jpg'));
  }

  const entriesBySku = new Map(entries.map((entry) => [entry.sku, entry]));
  const rows = products.map((product) => {
    const sku = `OLIST-${product.product_id.toUpperCase()}`;
    const sourceCategory = product.product_category_name.trim();
    const category = formatCategoryLabel(translations.get(sourceCategory) || sourceCategory || 'General');
    const entry = entriesBySku.get(sku);
    if (!entry) {
      const categoryKey = (translations.get(sourceCategory) || sourceCategory || 'General')
        .trim().toLowerCase().replace(/[_&-]+/g, ' ').replace(/\s+/g, ' ');
      const rejectionRows = rejectedByCategory.get(categoryKey) || [];
      const rejectionDetails = rejectionRows.length
        ? rejectionRows.slice(0, 5).map((rejection) =>
          `<li>${escapeHtml(rejection.provider)} — ${escapeHtml(rejection.title)}: ${escapeHtml(rejection.reason)}</li>`).join('')
        : '<li>No relevant, licensed candidate was found for this category.</li>';
      return `<tr><td><code>${escapeHtml(sku)}</code><br>${escapeHtml(buildOlistDisplayName(category, product.product_id))}</td>
        <td>${escapeHtml(category)}</td><td colspan="6"><strong>Unmatched — human review required.</strong><br>
        <strong>Relevance rejection / search result:</strong><ul>${rejectionDetails}</ul></td></tr>`;
    }
    return `<tr>
    <td><code>${escapeHtml(entry.sku)}</code><br>${escapeHtml(entry.displayTitle)}</td>
    <td>${escapeHtml(entry.category)}</td>
    <td><img src="./${escapeHtml(entry.imagePath)}" alt="${escapeHtml(entry.sourceTitle)}"><br>${escapeHtml(entry.sourceTitle)}</td>
    <td>${escapeHtml(entry.creator)}</td>
    <td><a href="${escapeHtml(entry.sourceUrl)}">${escapeHtml(entry.sourceProvider)} source page</a><br><a href="${escapeHtml(entry.originalImageUrl)}">Original image URL</a></td>
    <td>${escapeHtml(entry.license)} ${escapeHtml(entry.licenseVersion)}<br><a href="${escapeHtml(entry.licenseUrl)}">License terms</a><br>${escapeHtml(entry.attribution)}</td>
    <td>${escapeHtml(entry.matchType)}<br>Evidence score: ${entry.matchConfidence.toFixed(2)}<br>
    ${(entry.relevanceEvidence || []).map(escapeHtml).join('<br>')}<br>${escapeHtml(entry.matchReason)}</td>
    <td>${entry.width}×${entry.height}<br><code>${entry.sha256}</code><br>
    Relevance: ${escapeHtml(entry.relevanceStatus || 'needs-re-review')}<br>Review: ${escapeHtml(entry.validationStatus)}</td>
  </tr>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AURA free Olist photo pilot</title>
  <style>body{font:14px system-ui,sans-serif;margin:24px;color:#183047}p{max-width:1100px;line-height:1.55}.sheet{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cad5df;padding:12px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#edf3f7}td img{width:min(34vw,440px);height:min(34vw,440px);min-width:280px;min-height:280px;object-fit:contain;background:#f5f7f9}code{overflow-wrap:anywhere}td{max-width:520px}</style>
  <h1>AURA free-licensed Olist photo pilot</h1>
  <p>${entries.filter((entry) => entry.relevanceStatus === 'candidate-accepted').length} photos passed strict metadata relevance checks; ${entries.filter((entry) => entry.relevanceStatus !== 'candidate-accepted').length} retained images need re-review or rejection. These are out of ${products.length} pilot products. No photo is production-approved; human review is still required.</p>
  <p>Distinct hashes among retained photos: ${countUniqueImageHashes(entries)}/${entries.length}. Products still needing a relevant image: ${products.length - entries.filter((entry) => entry.relevanceStatus === 'candidate-accepted').length}.</p>
  ${entries.length ? '<img class="sheet" src="./contact-sheet.jpg" alt="Pilot contact sheet">' : '<p>No contact sheet was created because no qualifying images passed validation.</p>'}
  <table><thead><tr><th>SKU / generated title</th><th>Product category</th><th>Large image preview</th><th>Creator</th><th>Source link</th><th>License / attribution</th><th>Relevance evidence</th><th>Relevance / review status</th></tr></thead><tbody>${rows}</tbody></table>
  </html>`;
  fs.mkdirSync(stagingRoot, { recursive: true });
  fs.writeFileSync(path.join(stagingRoot, 'report.html'), html);
  const csv = [
    'sku,display_title,category,image_path,creator,source_url,license,license_version,license_url,attribution,match_type,evidence_score,relevance_evidence,match_reason,sha256,relevance_status,validation_status',
    ...entries.map((entry) => [
      entry.sku, entry.displayTitle, entry.category, entry.imagePath, entry.creator, entry.sourceUrl,
      entry.license, entry.licenseVersion, entry.licenseUrl, entry.attribution, entry.matchType,
      entry.matchConfidence.toFixed(2), (entry.relevanceEvidence || []).join('; '), entry.matchReason,
      entry.sha256, entry.relevanceStatus || 'needs-re-review', entry.validationStatus,
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  fs.writeFileSync(path.join(stagingRoot, 'report.csv'), `${csv}\n`);
};

export interface PhotoSearchFailure {
  sku: string;
  category: string;
  reason: string;
}

export interface CategorySearchResult {
  candidatesByCategory: Map<string, OpenPhotoCandidate[]>;
  failures: PhotoSearchFailure[];
  rejectedByCategory: Map<string, Array<{ title: string; reason: string; provider: string }>>;
}

export const runCategorySearches = async (options: {
  categories: readonly string[];
  products: readonly OlistImageSourceProduct[];
  translations: ReadonlyMap<string, string>;
  localCandidates: ReadonlyMap<string, OpenPhotoCandidate[]>;
  retries: number;
  fetcher: typeof fetch;
  log: (message: string) => void;
  openverseSearch?: (
    category: string,
    retries: number,
    fetcher: typeof fetch,
  ) => Promise<OpenPhotoCandidate[]>;
  commonsSearch?: (
    category: string,
    retries: number,
    fetcher: typeof fetch,
  ) => Promise<OpenPhotoCandidate[]>;
}): Promise<CategorySearchResult> => {
  const candidatesByCategory = new Map<string, OpenPhotoCandidate[]>();
  const failures: PhotoSearchFailure[] = [];
  const rejectedByCategory = new Map<string, Array<{ title: string; reason: string; provider: string }>>();
  const openverseSearch = options.openverseSearch || ((
    category: string,
    retries: number,
    fetcher: typeof fetch,
  ) => searchOpenverse(category, retries, fetcher));
  const searchCommons = options.commonsSearch || ((
    category: string,
    retries: number,
    fetcher: typeof fetch,
  ) => searchWikimedia(category, retries, fetcher));
  for (const [index, category] of options.categories.entries()) {
    if (!categorySearchQuery(category)) {
      const reason = `No explicit product-specific query mapping exists for category "${category}".`;
      failures.push({ sku: '', category, reason });
      options.log(`  ERROR: ${reason}`);
      candidatesByCategory.set(category, []);
      rejectedByCategory.set(category.trim().toLowerCase().replace(/[_&-]+/g, ' ').replace(/\s+/g, ' '), []);
      continue;
    }
    options.log(`[${index + 1}/${options.categories.length}] Searching Openverse: ${category}`);
    let results: OpenPhotoCandidate[] = [];
    const rejected: Array<{ title: string; reason: string; provider: string }> = [];
    try {
      results = await openverseSearch(category, options.retries, options.fetcher);
      options.log(`  Openverse returned ${results.length} usable, licensed candidates.`);
    } catch (error) {
      const reason = `Openverse search failed: ${error instanceof Error ? error.message : 'unknown error'}`;
      failures.push({ sku: '', category, reason });
      options.log(`  ERROR: ${reason}`);
    }
    const evaluateCandidates = (candidates: OpenPhotoCandidate[]): OpenPhotoCandidate[] => candidates.filter((candidate) => {
      const relevance = evaluateCategoryRelevance(candidate, category);
      if (relevance.accepted) return true;
      rejected.push({ title: candidate.title, reason: relevance.rejectionReason, provider: candidate.provider });
      return false;
    });
    const qualifiedOpenverse = evaluateCandidates(results)
      .sort((left, right) => scoreCategoryMatch(right, category) - scoreCategoryMatch(left, category));
    const categoryProductCount = options.products.filter((product) => {
      const source = product.product_category_name.trim();
      return (options.translations.get(source) || source || 'General') === category;
    }).length;
    let candidates = qualifiedOpenverse;
    if (candidates.length < categoryProductCount) {
      options.log(`  Searching Wikimedia Commons fallback for ${category}.`);
      try {
        const commons = await searchCommons(category, options.retries, options.fetcher);
        const qualifiedCommons = evaluateCandidates(commons)
          .sort((left, right) => scoreCategoryMatch(right, category) - scoreCategoryMatch(left, category));
        options.log(`  Wikimedia Commons returned ${qualifiedCommons.length} category-qualified candidates.`);
        candidates = [...candidates, ...qualifiedCommons];
      } catch (error) {
        const reason = `Wikimedia Commons fallback failed: ${error instanceof Error ? error.message : 'unknown error'}`;
        failures.push({ sku: '', category, reason });
        options.log(`  ERROR: ${reason}`);
      }
    }
    const categoryKey = category.trim().toLowerCase().replace(/[_&-]+/g, ' ').replace(/\s+/g, ' ');
    const qualifiedLocal = evaluateCandidates(options.localCandidates.get(categoryKey) || []);
    candidatesByCategory.set(category, [...qualifiedLocal, ...candidates]);
    rejectedByCategory.set(categoryKey, rejected);
  }
  return { candidatesByCategory, failures, rejectedByCategory };
};

const cacheFilename = (provider: OpenPhotoCandidate['provider'], category: string): string => {
  const key = crypto.createHash('sha256').update(`${provider}\n${category}`).digest('hex');
  return path.join(SEARCH_CACHE_ROOT, `${key}.json`);
};

const searchOpenverse = async (
  category: string,
  retries: number,
  fetcher: typeof fetch,
): Promise<OpenPhotoCandidate[]> => {
  const query = categorySearchQuery(category);
  const filename = cacheFilename('Openverse', category);
  const cached = readSearchCache(filename, 'Openverse', query);
  if (cached) return cached.results;
  const response = await fetchWithRespectfulRetry(buildOpenverseSearchUrl(category), {
    retries,
    minimumIntervalMs: 1_000,
    userAgent: USER_AGENT,
    fetcher,
  });
  const results = parseOpenverseSearchResponse(await response.json());
  writeSearchCache(filename, 'Openverse', query, results);
  return results;
};

const searchWikimedia = async (
  category: string,
  retries: number,
  fetcher: typeof fetch,
): Promise<OpenPhotoCandidate[]> => {
  const query = categorySearchQuery(category);
  const filename = cacheFilename('Wikimedia Commons', category);
  const cached = readSearchCache(filename, 'Wikimedia Commons', query);
  if (cached) return cached.results;
  const response = await fetchWithRespectfulRetry(buildWikimediaSearchUrl(category), {
    retries,
    minimumIntervalMs: 1_000,
    userAgent: USER_AGENT,
    fetcher,
  });
  const results = parseWikimediaSearchResponse(await response.json());
  writeSearchCache(filename, 'Wikimedia Commons', query, results);
  return results;
};

const readVerifiedLocalCandidates = (): Map<string, OpenPhotoCandidate[]> => {
  if (!fs.existsSync(LOCAL_PROVENANCE_FILE)) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(LOCAL_PROVENANCE_FILE, 'utf8')) as unknown;
  } catch {
    throw new FreePhotoPilotError('local-photo-provenance.json is invalid JSON.');
  }
  if (!Array.isArray(parsed)) throw new FreePhotoPilotError('local-photo-provenance.json must contain an array.');
  const byCategory = new Map<string, OpenPhotoCandidate[]>();
  for (const value of parsed) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    const category = typeof record.category === 'string' ? record.category.trim() : '';
    const filename = typeof record.filename === 'string' ? record.filename.trim() : '';
    const caption = typeof record.caption === 'string' ? record.caption.trim() : '';
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    const sourceUrl = typeof record.sourceUrl === 'string' ? record.sourceUrl.trim() : '';
    const license = typeof record.license === 'string' ? record.license.trim() : '';
    const licenseUrl = typeof record.licenseUrl === 'string' ? record.licenseUrl.trim() : '';
    const creator = typeof record.creator === 'string' ? record.creator.trim() : '';
    const attribution = typeof record.attribution === 'string' ? record.attribution.trim() : '';
    const localPath = path.resolve(PUBLIC_ROOT, 'images', 'products', filename);
    if (!category || !caption || !/^pexels-\d+\.jpg$/i.test(filename)
      || !localPath.startsWith(`${path.resolve(PUBLIC_ROOT, 'images', 'products')}${path.sep}`)
      || !fs.existsSync(localPath) || !isSafeHttpsUrl(sourceUrl)
      || !creator || !attribution || !isCommerciallyUsableLicense(license, licenseUrl)) {
      continue;
    }
    const candidate: OpenPhotoCandidate = {
      id: filename,
      provider: 'Existing local photo',
      title: `${caption} ${description}`.trim(),
      creator,
      creatorUrl: sourceUrl,
      sourceUrl,
      imageUrl: sourceUrl,
      license,
      licenseCode: license.toLowerCase().startsWith('cc0') ? 'cc0' : license.toLowerCase().startsWith('pdm') ? 'pdm' : license.toLowerCase().includes('by-sa') ? 'by-sa' : 'by',
      licenseVersion: typeof record.licenseVersion === 'string' ? record.licenseVersion : '',
      licenseUrl,
      attribution,
      width: 0,
      height: 0,
      description: `${caption} ${description}`.trim(),
      tags: Array.isArray(record.tags)
        ? record.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()))
        : [],
    };
    const categoryKey = category.toLowerCase().replace(/[_&-]+/g, ' ').replace(/\s+/g, ' ');
    const entries = byCategory.get(categoryKey) || [];
    entries.push(candidate);
    byCategory.set(categoryKey, entries);
  }
  return byCategory;
};

const downloadExistingLocal = async (
  candidate: OpenPhotoCandidate,
  outputPath: string,
): Promise<{ bytes: Buffer; width: number; height: number }> => {
  const localPath = path.resolve(PUBLIC_ROOT, 'images', 'products', candidate.id);
  const original = fs.readFileSync(localPath);
  const metadata = await sharp(original, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 512 || metadata.height < 512
    || metadata.format !== 'jpeg') {
    throw new FreePhotoPilotError(`Existing local photo ${candidate.id} is not a valid large JPEG raster.`);
  }
  const bytes = await sharp(original).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84, effort: 5 }).toBuffer();
  const optimized = await sharp(bytes).metadata();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes, { flag: 'wx' });
  return { bytes, width: optimized.width || 0, height: optimized.height || 0 };
};

const loadResumablePhoto = async (outputPath: string): Promise<{ bytes: Buffer; width: number; height: number } | undefined> => {
  if (!fs.existsSync(outputPath)) return undefined;
  const bytes = fs.readFileSync(outputPath);
  const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
  if (metadata.format !== 'webp' || !metadata.width || !metadata.height
    || metadata.width < 512 || metadata.height < 512) {
    throw new FreePhotoPilotError('An interrupted staged image exists but is not a valid WebP; inspect it before retrying.');
  }
  return { bytes, width: metadata.width, height: metadata.height };
};

const main = async (): Promise<void> => {
  const options = parseOlistImagePipelineOptions(process.argv.slice(2));
  const sourceProducts = readCsv<OlistImageSourceProduct>('olist_products_dataset.csv');
  const translationRows = readCsv<{ product_category_name: string; product_category_name_english: string }>(
    'product_category_name_translation.csv',
  );
  const translations = new Map(translationRows.map((row) => [
    row.product_category_name.trim(),
    row.product_category_name_english.trim(),
  ]));
  const products = selectOlistImagePilot(sourceProducts, translations);
  if (products.length !== OLIST_IMAGE_PILOT_SIZE) {
    throw new FreePhotoPilotError(`Expected 50 Olist pilot products; found ${products.length}.`);
  }
  const pilotManifest = readManifest();
  validatePhotoManifestEntries(pilotManifest);
  const existingBySku = new Map(pilotManifest.map((entry) => [entry.sku, entry]));
  const pending = products.filter((product) => {
    const sku = `OLIST-${product.product_id.toUpperCase()}`;
    const entry = existingBySku.get(sku);
    if (!entry) return true;
    const imagePath = path.resolve(STAGING_ROOT, entry.imagePath);
    return entry.relevanceStatus !== 'candidate-accepted'
      || !imagePath.startsWith(`${STAGING_ROOT}${path.sep}`)
      || !fs.existsSync(imagePath)
      || sha256File(imagePath) !== entry.sha256;
  });
  const localHtml = fs.readFileSync(path.join(PUBLIC_ROOT, 'photo-review.html'), 'utf8');
  const localStatus = localPhotoProvenanceStatus(localHtml);
  const verifiedLocalCandidates = readVerifiedLocalCandidates();
  const verifiedLocalCount = [...verifiedLocalCandidates.values()].reduce((count, candidates) => count + candidates.length, 0);
  console.log(`Olist free-photo pilot (${options.pilotSearch ? 'EXPLICIT SEARCH' : 'DRY RUN'})`);
  console.log(`Products in this pilot: ${products.length}; products still needing images: ${pending.length}.`);
  console.log(`Existing local photos listed: ${localStatus.count}; locally eligible with recorded license provenance: ${verifiedLocalCount}.`);
  console.log(`Local photo eligibility: ${verifiedLocalCount ? 'verified provenance records are available; each still requires a category-content match.' : localStatus.reason}`);
  console.log(`Cached search files: ${fs.existsSync(SEARCH_CACHE_ROOT) ? fs.readdirSync(SEARCH_CACHE_ROOT).length : 0}.`);
  console.log('Allowed licenses: CC0, Public Domain Mark, CC BY, and CC BY-SA; NonCommercial and NoDerivatives licenses are rejected.');
  console.log(`Fallback order: Openverse first; Wikimedia Commons only if category-qualified Openverse candidates are insufficient.`);
  if (!options.pilotSearch) {
    console.log('Dry run only: no network requests, downloads, or database operations were made.');
    console.log('After reviewing this plan, explicitly run: npm run enrich:olist-images -- --pilot-search');
    return;
  }

  const localCandidates = readVerifiedLocalCandidates();
  const hashes = new Set(pilotManifest.map((entry) => entry.sha256));
  let networkAttempts = 0;
  const boundedFetch: typeof fetch = async (input, init) => {
    if (networkAttempts >= MAX_NETWORK_ATTEMPTS_PER_PILOT) {
      throw new FreePhotoPilotError(`Free-image source request limit exceeded (${MAX_NETWORK_ATTEMPTS_PER_PILOT} attempts for this pilot).`);
    }
    networkAttempts += 1;
    return fetch(input, init);
  };
  const downloaded: OlistPhotoManifestEntry[] = [];
  const failures: PhotoSearchFailure[] = [];
  const categories = [...new Set(products.map((product) => {
    const source = product.product_category_name.trim();
    return translations.get(source) || source || 'General';
  }))];
  const searchResult = await runCategorySearches({
    categories,
    products,
    translations,
    localCandidates,
    retries: options.retries,
    fetcher: boundedFetch,
    log: console.log,
  });
  const resultsByCategory = searchResult.candidatesByCategory;
  const rejectedByCategory = searchResult.rejectedByCategory;
  failures.push(...searchResult.failures);

  const selectedProducts = products.filter((product) => pending.some((item) => item.product_id === product.product_id));
  for (const [productIndex, product] of selectedProducts.entries()) {
    const sku = `OLIST-${product.product_id.toUpperCase()}`;
    const sourceCategory = product.product_category_name.trim();
    const sourceEnglish = translations.get(sourceCategory) || sourceCategory || 'General';
    const category = formatCategoryLabel(sourceEnglish);
    const candidates = resultsByCategory.get(sourceEnglish) || [];
    console.log(`[${productIndex + 1}/${selectedProducts.length}] Selecting a distinct photo for ${sku}.`);
    let selected: {
      candidate: OpenPhotoCandidate;
      bytes: Buffer;
      width: number;
      height: number;
      path: string;
      confidence: number;
      evidence: string[];
    } | undefined;
    for (const candidate of candidates) {
      const relevance = evaluateCategoryRelevance(candidate, sourceEnglish);
      if (!relevance.accepted) {
        const categoryKey = sourceEnglish.trim().toLowerCase().replace(/[_&-]+/g, ' ').replace(/\s+/g, ' ');
        const rejected = rejectedByCategory.get(categoryKey) || [];
        rejected.push({ title: candidate.title, reason: relevance.rejectionReason, provider: candidate.provider });
        rejectedByCategory.set(categoryKey, rejected);
        continue;
      }
      const confidence = relevance.score;
      const candidateKey = `${candidate.provider}:${candidate.id}`;
      if (hashes.has(candidateKey)) continue;
      if (!isCommerciallyUsableLicense(candidate.license, candidate.licenseUrl)) continue;
      const filename = `${crypto.createHash('sha256').update(`${sku}:${candidate.id}`).digest('hex')}.webp`;
      const outputPath = path.join(IMAGE_ROOT, filename);
      try {
        const image = await loadResumablePhoto(outputPath) || (candidate.provider === 'Existing local photo'
          ? await downloadExistingLocal(candidate, outputPath)
          : await downloadLicensedPhoto(candidate, outputPath, options.retries, boundedFetch));
        const hash = crypto.createHash('sha256').update(image.bytes).digest('hex');
        if (hashes.has(hash)) {
          fs.rmSync(outputPath, { force: true });
          continue;
        }
        hashes.add(candidateKey);
        hashes.add(hash);
        selected = {
          candidate,
          bytes: image.bytes,
          width: image.width,
          height: image.height,
          path: `images/${filename}`,
          confidence,
          evidence: relevance.evidence,
        };
        break;
      } catch (error) {
        const failure = {
          sku,
          category,
          reason: `${candidate.provider} candidate ${candidate.id} rejected: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
        failures.push(failure);
        console.error(`  ERROR: ${failure.reason}`);
      }
    }
    if (!selected) {
      failures.push({ sku, category, reason: 'No distinct, category-relevant, licensed raster photograph passed validation.' });
      continue;
    }
    const entry = createPhotoManifestEntry(
      product,
      category,
      selected.candidate,
      selected.path,
      selected.bytes,
      selected.width,
      selected.height,
      selected.confidence,
      `Product-specific title/metadata evidence matched translated category "${sourceEnglish}"; not an original Olist product photo.`,
      selected.evidence,
    );
    downloaded.push(entry);
    writeManifest([...pilotManifest.filter((saved) => saved.sku !== entry.sku), ...downloaded]);
    console.log(`Accepted ${sku} (${entry.sourceProvider}; ${entry.license}; confidence ${entry.matchConfidence.toFixed(2)}).`);
  }

  const finalEntries = [...pilotManifest.filter((saved) =>
    !products.some((product) => `OLIST-${product.product_id.toUpperCase()}` === saved.sku)),
  ...pilotManifest.filter((saved) =>
    products.some((product) => `OLIST-${product.product_id.toUpperCase()}` === saved.sku)
    && !downloaded.some((entry) => entry.sku === saved.sku)),
  ...downloaded];
  validatePhotoManifestEntries(finalEntries);
  writeManifest(finalEntries);
  const finalPilot = finalEntries.filter((entry) =>
    products.some((product) => `OLIST-${product.product_id.toUpperCase()}` === entry.sku));
  await writePilotReports(finalPilot, products, translations, STAGING_ROOT, rejectedByCategory);
  const productsStillNeedingImages = products.filter((product) =>
    !finalPilot.some((entry) => entry.sku === `OLIST-${product.product_id.toUpperCase()}`
      && entry.relevanceStatus === 'candidate-accepted'));
  const missingCategories = [...new Set(productsStillNeedingImages.map((product) => {
    const source = product.product_category_name.trim();
    return formatCategoryLabel(translations.get(source) || source || 'General');
  }))].sort((left, right) => left.localeCompare(right));
  writeJson(path.join(STAGING_ROOT, 'search-summary.json'), {
    completedAt: new Date().toISOString(),
    requestedProducts: products.length,
    validUniquePhotos: finalPilot.filter((entry) => entry.relevanceStatus === 'candidate-accepted').length,
    uniqueSha256Hashes: countUniqueImageHashes(finalPilot.filter((entry) => entry.relevanceStatus === 'candidate-accepted')),
    productsStillNeedingImages: products.filter((product) =>
      !finalPilot.some((entry) => entry.sku === `OLIST-${product.product_id.toUpperCase()}`
        && entry.relevanceStatus === 'candidate-accepted')).length,
    missingCategories,
    failures,
    sources: ['Openverse', 'Wikimedia Commons', 'Existing local photo with manually verified provenance only'],
    networkSearchOccurred: true,
    networkAttempts,
    databaseUpdated: false,
  });
  const acceptedCandidates = finalPilot.filter((entry) => entry.relevanceStatus === 'candidate-accepted');
  console.log(`Strict relevance candidates found: ${acceptedCandidates.length}/${products.length}.`);
  console.log(`Unique SHA-256 hashes among candidates: ${countUniqueImageHashes(acceptedCandidates)}/${acceptedCandidates.length}.`);
  console.log(`Products still needing images: ${productsStillNeedingImages.length}.`);
  console.log(`Categories still missing images: ${missingCategories.join(', ') || 'none'}.`);
  console.log(`HTML report: ${path.join(STAGING_ROOT, 'report.html')}`);
  if (finalPilot.length) console.log(`Contact sheet: ${path.join(STAGING_ROOT, 'contact-sheet.jpg')}`);
  console.log(`Detailed search failures/rejections: ${failures.length}.`);
  if (failures.length) {
    for (const failure of failures) {
      console.error(`Failure${failure.sku ? ` for ${failure.sku}` : ''}${failure.category ? ` [${failure.category}]` : ''}: ${failure.reason}`);
    }
  }
  console.log(`Network request attempts: ${networkAttempts}/${MAX_NETWORK_ATTEMPTS_PER_PILOT}.`);
  console.log('The command did not connect to MongoDB or update product records.');
  if (failures.length) {
    process.exitCode = 1;
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`Free Olist photo pilot stopped: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
  });
}
