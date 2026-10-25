import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  buildOpenverseSearchUrl,
  buildWikimediaSearchUrl,
  categoryPhotoSearchQueries,
  downloadLicensedPhoto,
  evaluateCategoryRelevance,
  fetchWithRespectfulRetry,
  getOpenverseResultRejectionReason,
  getWikimediaPageRejectionReason,
  isCommerciallyUsableLicense,
  isSafeHttpsUrl,
  OpenPhotoCandidate,
  OpenverseSearchResult,
  parseOpenverseSearchResponse,
  parseWikimediaSearchResponse,
  WikimediaPage,
  USER_AGENT,
} from './olist-image-enrichment';
import { OlistImageSourceProduct } from './olist-image-enrichment';
import { parseOlistCsv } from './olist-product-importer';
import { OLIST_CATEGORY_IMAGE_MAP } from '../src/data/olistCategoryImageMap';
import { formatCategoryLabel } from '../src/utils/productPresentation';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'dataset', 'olist_raw');
const OUTPUT_ROOT = path.join(ROOT, 'data', 'olist-image-enrichment', 'category-photo-review');
const SEARCH_CACHE_ROOT = path.join(OUTPUT_ROOT, 'search-cache');
const IMAGE_ROOT = path.join(OUTPUT_ROOT, 'images');
const MANIFEST_FILE = path.join(OUTPUT_ROOT, 'manifest.json');
const REPORT_FILE = path.join(OUTPUT_ROOT, 'report.html');
const CONTACT_SHEET_FILE = path.join(OUTPUT_ROOT, 'contact-sheet.jpg');
const MAX_CATEGORIES = 73;
const MAX_DOWNLOADS = MAX_CATEGORIES;
const MAX_NETWORK_ATTEMPTS = 500;
const SEARCH_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface CategoryForSearch {
  sourceCategory: string;
  categoryKey: string;
  productCount: number;
}

export interface CategoryPhotoSearchCandidate {
  categoryKey: string;
  categoryLabel: string;
  productCount: number;
  searchQuery: string;
  candidate: OpenPhotoCandidate;
  matchConfidence: number;
  relevanceEvidence: string[];
  downloadedPath?: string;
  sha256?: string;
  sourceSha256?: string;
  byteLength?: number;
  width?: number;
  height?: number;
  reviewStatus: 'needs-human-review';
  approved: false;
}

export interface CategoryPhotoSearchFailure {
  categoryKey: string;
  provider: 'Openverse' | 'Wikimedia Commons' | 'download';
  reason: string;
}

export interface CategoryPhotoSearchAudit {
  categoryKey: string;
  provider: 'Openverse' | 'Wikimedia Commons';
  query: string;
  rawResultCount: number;
  metadataAcceptedCount: number;
  relevanceAcceptedCount: number;
  fromCache: boolean;
  rejections: Array<{ title: string; reason: string }>;
}

export interface CategoryPhotoSearchOptions {
  search: boolean;
  maxCategories: number;
  downloadLimit: number;
  category?: string;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] || character);

export const parseCategoryPhotoSearchOptions = (args: readonly string[]): CategoryPhotoSearchOptions => {
  let search = false;
  let maxCategories = 5;
  let downloadLimit = 0;
  let category: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (seen.has(option)) throw new Error(`Option may only be supplied once: ${option}`);
    seen.add(option);
    if (option === '--search') {
      search = true;
    } else if (option === '--category') {
      const value = args[index + 1]?.trim();
      if (!value || value.startsWith('--')) throw new Error('--category requires an Olist category key.');
      category = value.toLowerCase().replace(/[\s&-]+/g, '_').replace(/_+/g, '_');
      index += 1;
    } else if (option === '--max-categories' || option === '--download-limit') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value)) throw new Error(`${option} requires an integer value.`);
      index += 1;
      if (option === '--max-categories') {
        if (value < 1 || value > MAX_CATEGORIES) throw new RangeError(`--max-categories must be from 1 to ${MAX_CATEGORIES}.`);
        maxCategories = value;
      } else {
        if (value < 0 || value > MAX_DOWNLOADS) throw new RangeError(`--download-limit must be from 0 to ${MAX_DOWNLOADS}.`);
        downloadLimit = value;
      }
    } else {
      throw new Error(`Unsupported category-photo option: ${option}`);
    }
  }
  if (!search && downloadLimit > 0) throw new Error('--download-limit requires explicit --search.');
  return { search, maxCategories, downloadLimit, ...(category ? { category } : {}) };
};

export const buildCategorySearchList = (
  products: readonly OlistImageSourceProduct[],
  translationRows: readonly { product_category_name: string; product_category_name_english: string }[],
): CategoryForSearch[] => {
  const translations = new Map(translationRows.map((row) => [
    row.product_category_name.trim(),
    row.product_category_name_english.trim(),
  ]));
  const definitions = new Map(OLIST_CATEGORY_IMAGE_MAP.map((definition) => [
    definition.sourceCategory,
    definition.categoryKey,
  ]));
  const counts = new Map<string, number>();
  for (const product of products) {
    const source = product.product_category_name.trim();
    counts.set(source, (counts.get(source) || 0) + 1);
  }
  const unmapped = [...counts.keys()].filter((source) => !definitions.has(source));
  if (unmapped.length) throw new Error(`No central image mapping for source categories: ${unmapped.join(', ')}`);
  return [...counts.entries()]
    .filter(([source]) => Boolean(source))
    .map(([sourceCategory, productCount]) => ({
      sourceCategory,
      categoryKey: translations.get(sourceCategory) || definitions.get(sourceCategory) || sourceCategory,
      productCount,
    }))
    .sort((left, right) => right.productCount - left.productCount || left.categoryKey.localeCompare(right.categoryKey));
};

export const chooseCategoryPhotoCandidate = (
  category: CategoryForSearch,
  candidates: readonly OpenPhotoCandidate[],
): CategoryPhotoSearchCandidate | undefined => {
  return chooseCategoryPhotoCandidates(
    category,
    candidates.map((candidate) => ({
      candidate,
      query: categoryPhotoSearchQueries(category.categoryKey)[0] || category.categoryKey,
    })),
    1,
  )[0];
};

export const chooseCategoryPhotoCandidates = (
  category: CategoryForSearch,
  candidates: readonly { candidate: OpenPhotoCandidate; query: string }[],
  limit = MAX_DOWNLOADS,
): CategoryPhotoSearchCandidate[] => {
  const seen = new Set<string>();
  const qualified = candidates.flatMap(({ candidate, query }) => {
    if (!isCommerciallyUsableLicense(candidate.license, candidate.licenseUrl)
      || !isSafeHttpsUrl(candidate.imageUrl) || !isSafeHttpsUrl(candidate.sourceUrl)
      || !isSafeHttpsUrl(candidate.creatorUrl) || !candidate.creator.trim() || !candidate.attribution.trim()) {
      return [];
    }
    const relevance = evaluateCategoryRelevance(candidate, category.categoryKey);
    if (!relevance.accepted) return [];
    const id = `${candidate.provider}\n${candidate.id}\n${candidate.imageUrl}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ candidate, query, relevance }];
  }).sort((left, right) => right.relevance.score - left.relevance.score).slice(0, limit);
  return qualified.map((selected) => ({
    categoryKey: category.categoryKey,
    categoryLabel: formatCategoryLabel(category.categoryKey),
    productCount: category.productCount,
    searchQuery: selected.query,
    candidate: selected.candidate,
    matchConfidence: selected.relevance.score,
    relevanceEvidence: selected.relevance.evidence,
    reviewStatus: 'needs-human-review',
    approved: false,
  }));
};

export const selectCategoryCandidatesRoundRobin = (
  categoryGroups: readonly { categoryKey: string; candidates: readonly CategoryPhotoSearchCandidate[] }[],
  limit: number,
): CategoryPhotoSearchCandidate[] => {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('Candidate limit must be a non-negative integer.');
  const selected: CategoryPhotoSearchCandidate[] = [];
  const seen = new Set<string>();
  for (let round = 0; selected.length < limit; round += 1) {
    let foundCandidate = false;
    for (const group of categoryGroups) {
      const candidate = group.candidates[round];
      if (!candidate) continue;
      foundCandidate = true;
      const id = `${candidate.candidate.provider}:${candidate.candidate.id}:${candidate.candidate.imageUrl}`;
      if (seen.has(id)) continue;
      seen.add(id);
      selected.push(candidate);
      if (selected.length === limit) break;
    }
    if (!foundCandidate) break;
  }
  return selected;
};

const readCsv = <TRow extends Record<string, string>>(filename: string): TRow[] => {
  const filePath = path.resolve(SOURCE_ROOT, filename);
  if (!filePath.startsWith(`${SOURCE_ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
    throw new Error(`Required Olist source file is missing: ${filename}`);
  }
  return parseOlistCsv<TRow>(fs.readFileSync(filePath, 'utf8'));
};

const cachePath = (provider: string, categoryKey: string, query: string): string =>
  path.join(SEARCH_CACHE_ROOT, `${provider}-${crypto.createHash('sha256').update(`${categoryKey}\n${query}`).digest('hex')}.json`);

interface ProviderSearchResult {
  results: OpenPhotoCandidate[];
  rawResultCount: number;
  rejections: Array<{ title: string; reason: string }>;
  fromCache: boolean;
}

const readCache = (filename: string, categoryKey: string, query: string): ProviderSearchResult | undefined => {
  if (!fs.existsSync(filename)) return undefined;
  try {
    const value = JSON.parse(fs.readFileSync(filename, 'utf8')) as {
      categoryKey?: string;
      query?: string;
      createdAt?: string;
      results?: OpenPhotoCandidate[];
      rawResultCount?: number;
      rejections?: Array<{ title: string; reason: string }>;
    };
    const createdAt = Date.parse(value.createdAt || '');
    if (value.categoryKey !== categoryKey || value.query !== query || !Array.isArray(value.results)
      || !Number.isFinite(createdAt) || Date.now() - createdAt > SEARCH_CACHE_MAX_AGE_MS) return undefined;
    return {
      results: value.results,
      rawResultCount: Number.isInteger(value.rawResultCount) ? value.rawResultCount! : value.results.length,
      rejections: Array.isArray(value.rejections) ? value.rejections : [],
      fromCache: true,
    };
  } catch {
    return undefined;
  }
};

const writeCache = (
  filename: string,
  categoryKey: string,
  query: string,
  search: Omit<ProviderSearchResult, 'fromCache'>,
): void => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify({
    categoryKey,
    query,
    createdAt: new Date().toISOString(),
    results: search.results,
    rawResultCount: search.rawResultCount,
    rejections: search.rejections,
  }, null, 2)}\n`);
};

const searchProvider = async (
  category: CategoryForSearch,
  provider: 'Openverse' | 'Wikimedia Commons',
  query: string,
  fetcher: typeof fetch,
): Promise<ProviderSearchResult> => {
  const filename = cachePath(provider, category.categoryKey, query);
  const cached = readCache(filename, category.categoryKey, query);
  if (cached) return cached;
  const url = provider === 'Openverse'
    ? (() => {
      const searchUrl = new URL(buildOpenverseSearchUrl(category.categoryKey));
      searchUrl.searchParams.set('q', query);
      return searchUrl.toString();
    })()
    : (() => {
      const searchUrl = new URL(buildWikimediaSearchUrl(category.categoryKey));
      searchUrl.searchParams.set('gsrsearch', `filetype:bitmap ${query}`);
      return searchUrl.toString();
    })();
  const response = await fetchWithRespectfulRetry(url, {
    retries: 2,
    minimumIntervalMs: 1_100,
    userAgent: USER_AGENT,
    fetcher,
  });
  const json = await response.json() as unknown;
  const results = provider === 'Openverse'
    ? parseOpenverseSearchResponse(json)
    : parseWikimediaSearchResponse(json);
  const rawItems = provider === 'Openverse'
    ? json && typeof json === 'object' && 'results' in json && Array.isArray(json.results) ? json.results : []
    : json && typeof json === 'object' && 'query' in json && json.query && typeof json.query === 'object'
      && 'pages' in json.query && Array.isArray(json.query.pages) ? json.query.pages : [];
  const rejections = rawItems.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== 'object') {
      return [{ title: '(untitled result)', reason: 'result metadata is not an object' }];
    }
    const reason = provider === 'Openverse'
      ? getOpenverseResultRejectionReason(rawItem as OpenverseSearchResult)
      : getWikimediaPageRejectionReason(rawItem as WikimediaPage);
    if (!reason) return [];
    const titleValue = 'title' in rawItem ? rawItem.title : undefined;
    return [{ title: typeof titleValue === 'string' && titleValue.trim() ? titleValue.trim() : '(untitled result)', reason }];
  });
  const search = { results, rawResultCount: rawItems.length, rejections };
  writeCache(filename, category.categoryKey, query, search);
  return { ...search, fromCache: false };
};

const createContactSheet = async (candidates: readonly CategoryPhotoSearchCandidate[]): Promise<void> => {
  const downloaded = candidates.filter((candidate) => candidate.downloadedPath);
  if (!downloaded.length) return;
  const columns = 4;
  const width = 340;
  const height = 300;
  const composites: Parameters<ReturnType<typeof sharp>['composite']>[0] = [];
  for (const [index, item] of downloaded.entries()) {
    const filename = path.resolve(OUTPUT_ROOT, item.downloadedPath!);
    const preview = await sharp(filename).resize(width - 16, height - 68, {
      fit: 'contain',
      background: '#fff',
    }).jpeg({ quality: 84 }).toBuffer();
    const label = Buffer.from(`<svg width="${width - 8}" height="52"><rect width="100%" height="100%" fill="#fff"/><text x="5" y="19" font-family="Arial" font-size="12" font-weight="bold">${escapeHtml(item.candidate.title.slice(0, 40))}</text><text x="5" y="40" font-family="Arial" font-size="11">${escapeHtml(`${item.categoryLabel} · ${item.candidate.provider} · review`)}</text></svg>`);
    const tile = await sharp({
      create: { width: width - 8, height: height - 8, channels: 3, background: '#fff' },
    }).composite([
      { input: preview, left: 4, top: 4 },
      { input: label, left: 4, top: height - 60 },
    ]).jpeg({ quality: 84 }).toBuffer();
    composites.push({
      input: tile,
      left: (index % columns) * width,
      top: Math.floor(index / columns) * height,
    });
  }
  await sharp({
    create: {
      width: columns * width,
      height: Math.ceil(downloaded.length / columns) * height,
      channels: 3,
      background: '#eef2f5',
    },
  }).composite(composites).jpeg({ quality: 88 }).toFile(CONTACT_SHEET_FILE);
};

export const renderCategoryPhotoReviewHtml = (
  categories: readonly CategoryForSearch[],
  searchedCategories: readonly string[],
  candidates: readonly CategoryPhotoSearchCandidate[],
  failures: readonly CategoryPhotoSearchFailure[],
  audits: readonly CategoryPhotoSearchAudit[],
): string => {
  const candidatesByCategory = new Map<string, CategoryPhotoSearchCandidate[]>();
  for (const candidate of candidates) {
    const items = candidatesByCategory.get(candidate.categoryKey) || [];
    items.push(candidate);
    candidatesByCategory.set(candidate.categoryKey, items);
  }
  const searched = new Set(searchedCategories);
  const rows = categories.map((category) => {
    const categoryCandidates = candidatesByCategory.get(category.categoryKey) || [];
    const outcome = categoryCandidates.length
      ? `${categoryCandidates.length} candidate(s) require human review; none are approved.`
      : searched.has(category.categoryKey) ? 'No sufficiently relevant licensed candidate found; use category illustration.'
        : 'Not searched in this bounded run; use category illustration.';
    const candidateDetails = categoryCandidates.map((candidate) => `<section class="candidate">
      <strong>${escapeHtml(candidate.candidate.title)}</strong> — confidence ${candidate.matchConfidence.toFixed(2)}; query: ${escapeHtml(candidate.searchQuery)}<br>
      Creator: ${escapeHtml(candidate.candidate.creator)}<br>
      <a href="${escapeHtml(candidate.candidate.sourceUrl)}">Source</a> ·
      <a href="${escapeHtml(candidate.candidate.licenseUrl)}">${escapeHtml(candidate.candidate.license)} ${escapeHtml(candidate.candidate.licenseVersion)}</a><br>
      ${escapeHtml(candidate.candidate.attribution)}<br>
      Evidence: ${candidate.relevanceEvidence.map(escapeHtml).join('; ')}
      ${candidate.downloadedPath ? `<br><img class="preview" src="./${escapeHtml(candidate.downloadedPath)}" alt="${escapeHtml(candidate.candidate.title)}">` : ''}</section>`).join('');
    return `<tr><td>${escapeHtml(category.categoryKey)}</td><td>${category.productCount}</td><td>${escapeHtml(outcome)}${candidateDetails}</td></tr>`;
  }).join('');
  const auditRows = audits.map((audit) => `<tr><td>${escapeHtml(audit.categoryKey)}</td><td>${escapeHtml(audit.provider)}</td>
    <td>${escapeHtml(audit.query)}</td><td>${audit.rawResultCount}</td><td>${audit.metadataAcceptedCount}</td>
    <td>${audit.relevanceAcceptedCount}</td><td>${audit.fromCache ? 'cached' : 'network'}</td>
    <td>${audit.rejections.length ? `<details><summary>${audit.rejections.length} rejected result(s)</summary><ul>${audit.rejections.map((item) =>
      `<li>${escapeHtml(item.title)} — ${escapeHtml(item.reason)}</li>`).join('')}</ul></details>` : 'None'}</td></tr>`).join('');
  const failureRows = failures.length
    ? `<ul>${failures.map((failure) => `<li>${escapeHtml(failure.categoryKey)} — ${escapeHtml(failure.provider)}: ${escapeHtml(failure.reason)}</li>`).join('')}</ul>`
    : '<p>No provider or download errors.</p>';
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Olist category photo review</title>
    <style>body{font:14px system-ui,sans-serif;color:#1b2a38;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5df;padding:10px;text-align:left;vertical-align:top}th{background:#edf2f7}.preview{display:block;max-width:320px;max-height:320px;object-fit:contain;background:#f4f5f7;margin:8px 0}.candidate{border-top:1px solid #ddd;margin-top:10px;padding-top:8px}p{max-width:1000px;line-height:1.5}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
    <h1>Olist representative category-photo review</h1>
    <p>Category-only results; no product SKU or product ID is assigned to a photo. Every candidate is unapproved and requires human review. Exact Olist product photo matches: 0. Products with no original product name or image URL remain identity-unmatched.</p>
    <p>Categories searched: ${searchedCategories.length}/${categories.length}. Unapproved candidate files: ${candidates.length}; images downloaded for review: ${candidates.filter((candidate) => candidate.downloadedPath).length}; exact product matches: 0. Every other category remains on its local illustration.</p>
    <p>${candidates.some((candidate) => candidate.downloadedPath) ? '<img src="./contact-sheet.jpg" alt="Downloaded category photo contact sheet" style="max-width:100%;height:auto">' : 'No contact sheet: no relevant, licensed candidates were downloaded.'}</p>
    <table><thead><tr><th>Translated Olist category</th><th>Products</th><th>Candidate / fallback status and provenance</th></tr></thead><tbody>${rows}</tbody></table>
    <h2>Search diagnostics</h2><table><thead><tr><th>Category</th><th>Provider</th><th>Actual query</th><th>Raw API results</th><th>Passed metadata/license filters</th><th>Passed relevance</th><th>Source</th><th>Rejection details</th></tr></thead><tbody>${auditRows || '<tr><td colspan="8">No searches were run.</td></tr>'}</tbody></table>
    <h2>Search and download errors</h2>${failureRows}</html>`;
  return html;
};

const writeReview = async (
  categories: readonly CategoryForSearch[],
  searchedCategories: readonly string[],
  candidates: readonly CategoryPhotoSearchCandidate[],
  failures: readonly CategoryPhotoSearchFailure[],
  audits: readonly CategoryPhotoSearchAudit[],
): Promise<void> => {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  fs.writeFileSync(REPORT_FILE, renderCategoryPhotoReviewHtml(
    categories,
    searchedCategories,
    candidates,
    failures,
    audits,
  ));
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    productCategoryCount: categories.length,
    searchedCategoryCount: searchedCategories.length,
    candidatesAreApproved: false,
    databaseUpdated: false,
    candidates,
    failures,
    audits,
  }, null, 2)}\n`);
  await createContactSheet(candidates);
};

const main = async (): Promise<void> => {
  const options = parseCategoryPhotoSearchOptions(process.argv.slice(2));
  const products = readCsv<OlistImageSourceProduct>('olist_products_dataset.csv');
  const translations = readCsv<{ product_category_name: string; product_category_name_english: string }>(
    'product_category_name_translation.csv',
  );
  const categories = buildCategorySearchList(products, translations);
  console.log(`Olist category photo workflow: ${products.length} source records; ${categories.length} categorized groups; no database writes.`);
  console.log(`Network search: ${options.search ? 'explicitly enabled' : 'disabled'}; max categories: ${options.maxCategories}; category filter: ${options.category || 'none'}; download limit: ${options.downloadLimit}.`);
  if (!options.search) {
    console.log('Offline dry run. To search one category: npx tsx scripts/prepare-olist-category-photos.ts --search --category computers --download-limit 10');
    return;
  }

  fs.mkdirSync(SEARCH_CACHE_ROOT, { recursive: true });
  fs.mkdirSync(IMAGE_ROOT, { recursive: true });
  let attempts = 0;
  const limitedFetcher: typeof fetch = async (input, init) => {
    if (attempts >= MAX_NETWORK_ATTEMPTS) {
      throw new Error(`Request limit exceeded (${MAX_NETWORK_ATTEMPTS} network attempts).`);
    }
    attempts += 1;
    return fetch(input, init);
  };
  const selectedCategories = options.category
    ? categories.filter((category) => category.categoryKey === options.category || category.sourceCategory === options.category)
    : categories.slice(0, options.maxCategories);
  if (options.category && !selectedCategories.length) {
    throw new Error(`No Olist category matched --category ${options.category}.`);
  }
  const searchedCategories: string[] = [];
  const categoryCandidateGroups: Array<{ categoryKey: string; candidates: CategoryPhotoSearchCandidate[] }> = [];
  const failures: CategoryPhotoSearchFailure[] = [];
  const audits: CategoryPhotoSearchAudit[] = [];
  console.log(`Beginning bounded searches for ${selectedCategories.length} translated categories.`);
  for (const [index, category] of selectedCategories.entries()) {
    const queries = categoryPhotoSearchQueries(category.categoryKey);
    if (!queries.length) throw new Error(`No descriptive photo-search queries are configured for ${category.categoryKey}.`);
    console.log(`[${index + 1}/${selectedCategories.length}] ${category.categoryKey} (${category.productCount} products): ${queries.length} descriptive queries`);
    const categoryResults: Array<{ candidate: OpenPhotoCandidate; query: string }> = [];
    for (const query of queries) {
      console.log(`  Openverse query: "${query}"`);
      let openverseQualified = 0;
      try {
        const search = await searchProvider(category, 'Openverse', query, limitedFetcher);
        const relevanceRejections = search.results.flatMap((candidate) => {
          const relevance = evaluateCategoryRelevance(candidate, category.categoryKey);
          return relevance.accepted ? [] : [{ title: candidate.title, reason: relevance.rejectionReason }];
        });
        const qualified = chooseCategoryPhotoCandidates(category, search.results.map((candidate) => ({ candidate, query })));
        openverseQualified = qualified.length;
        categoryResults.push(...qualified.map((candidate) => ({ candidate: candidate.candidate, query })));
        audits.push({
          categoryKey: category.categoryKey,
          provider: 'Openverse',
          query,
          rawResultCount: search.rawResultCount,
          metadataAcceptedCount: search.results.length,
          relevanceAcceptedCount: openverseQualified,
          fromCache: search.fromCache,
          rejections: [...search.rejections, ...relevanceRejections],
        });
        console.log(`    Raw API results: ${search.rawResultCount}; passed license/metadata: ${search.results.length}; passed relevance: ${openverseQualified}; rejected: ${search.rejections.length + relevanceRejections.length}${search.fromCache ? ' (cache)' : ''}.`);
        for (const rejection of [...search.rejections, ...relevanceRejections].slice(0, 4)) {
          console.log(`    Rejected "${rejection.title}": ${rejection.reason}`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown source search error.';
        failures.push({ categoryKey: category.categoryKey, provider: 'Openverse', reason: `${query}: ${reason}` });
        console.error(`    Openverse error: ${reason}`);
      }
      if (!openverseQualified) {
        console.log(`  Wikimedia Commons fallback query: "${query}"`);
        try {
          const search = await searchProvider(category, 'Wikimedia Commons', query, limitedFetcher);
          const relevanceRejections = search.results.flatMap((candidate) => {
            const relevance = evaluateCategoryRelevance(candidate, category.categoryKey);
            return relevance.accepted ? [] : [{ title: candidate.title, reason: relevance.rejectionReason }];
          });
          const qualified = chooseCategoryPhotoCandidates(category, search.results.map((candidate) => ({ candidate, query })));
          categoryResults.push(...qualified.map((candidate) => ({ candidate: candidate.candidate, query })));
          audits.push({
            categoryKey: category.categoryKey,
            provider: 'Wikimedia Commons',
            query,
            rawResultCount: search.rawResultCount,
            metadataAcceptedCount: search.results.length,
            relevanceAcceptedCount: qualified.length,
            fromCache: search.fromCache,
            rejections: [...search.rejections, ...relevanceRejections],
          });
          console.log(`    Raw API results: ${search.rawResultCount}; passed license/metadata: ${search.results.length}; passed relevance: ${qualified.length}; rejected: ${search.rejections.length + relevanceRejections.length}${search.fromCache ? ' (cache)' : ''}.`);
          for (const rejection of [...search.rejections, ...relevanceRejections].slice(0, 4)) {
            console.log(`    Rejected "${rejection.title}": ${rejection.reason}`);
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unknown source search error.';
          failures.push({ categoryKey: category.categoryKey, provider: 'Wikimedia Commons', reason: `${query}: ${reason}` });
          console.error(`    Wikimedia Commons error: ${reason}`);
        }
      }
    }
    searchedCategories.push(category.categoryKey);
    const foundCandidates = chooseCategoryPhotoCandidates(category, categoryResults, MAX_DOWNLOADS);
    categoryCandidateGroups.push({ categoryKey: category.categoryKey, candidates: foundCandidates });
    for (const found of foundCandidates) {
      console.log(`  Candidate retained for human review: ${found.candidate.title} (${found.candidate.license}).`);
    }
    if (!foundCandidates.length) console.log('  No sufficiently relevant licensed candidate; category remains on illustration.');
  }

  const candidates = selectCategoryCandidatesRoundRobin(categoryCandidateGroups, MAX_DOWNLOADS);
  const sourceHashes = new Set<string>();
  const optimizedHashes = new Set<string>();
  let downloaded = 0;
  for (const candidate of candidates) {
    if (downloaded >= options.downloadLimit) break;
    const sourceId = `${candidate.candidate.provider}\n${candidate.candidate.id}`;
    const filename = `${crypto.createHash('sha256').update(sourceId).digest('hex')}.webp`;
    const outputPath = path.join(IMAGE_ROOT, filename);
    if (fs.existsSync(outputPath)) {
      failures.push({
        categoryKey: candidate.categoryKey,
        provider: 'download',
        reason: 'A staged file for this candidate already exists; it was preserved and not overwritten.',
      });
      continue;
    }
    try {
      const image = await downloadLicensedPhoto(candidate.candidate, outputPath, 2, limitedFetcher);
      const optimizedSha = crypto.createHash('sha256').update(image.bytes).digest('hex');
      if (sourceHashes.has(image.sourceSha256) || optimizedHashes.has(optimizedSha)) {
        fs.rmSync(outputPath, { force: true });
        failures.push({
          categoryKey: candidate.categoryKey,
          provider: 'download',
          reason: 'Duplicate source or optimized SHA-256 image; candidate rejected and category remains on illustration.',
        });
        candidate.downloadedPath = undefined;
        continue;
      }
      sourceHashes.add(image.sourceSha256);
      optimizedHashes.add(optimizedSha);
      candidate.downloadedPath = `images/${filename}`;
      candidate.sourceSha256 = image.sourceSha256;
      candidate.sha256 = optimizedSha;
      candidate.byteLength = image.bytes.byteLength;
      candidate.width = image.width;
      candidate.height = image.height;
      downloaded += 1;
    } catch (error) {
      failures.push({
        categoryKey: candidate.categoryKey,
        provider: 'download',
        reason: error instanceof Error ? error.message : 'Unknown download error.',
      });
      console.error(`  Image download failed for ${candidate.categoryKey}.`);
    }
  }
  await writeReview(categories, searchedCategories, candidates, failures, audits);
  console.log(`Categories searched: ${searchedCategories.length}/${categories.length}.`);
  console.log(`Unapproved category candidates: ${candidates.length}; images staged: ${downloaded}; exact product matches: 0.`);
  console.log(`HTML report: ${REPORT_FILE}`);
  console.log(`Provenance manifest: ${MANIFEST_FILE}`);
  if (downloaded) console.log(`Contact sheet: ${CONTACT_SHEET_FILE}`);
  console.log(`Network attempts: ${attempts}/${MAX_NETWORK_ATTEMPTS}.`);
  if (failures.length) process.exitCode = 1;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`Olist category-photo workflow stopped: ${error instanceof Error ? error.message : 'Unknown error.'}`);
    process.exitCode = 1;
  });
}
