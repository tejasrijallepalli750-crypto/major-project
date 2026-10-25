import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import test from 'node:test';
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
  getOlistCategorySearchSpec,
  isCommerciallyUsableLicense,
  localPhotoProvenanceStatus,
  normalizeLicense,
  normalizeOpenverseResult,
  normalizeWikimediaPage,
  OLIST_FREE_PHOTO_ROOT,
  OlistImageSourceProduct,
  OlistPhotoManifestEntry,
  parseOlistImagePipelineOptions,
  parseOpenverseSearchResponse,
  parseWikimediaSearchResponse,
  readSearchCache,
  scoreCategoryMatch,
  selectOlistImagePilot,
  validatePhotoManifestEntries,
  writeSearchCache,
} from './olist-image-enrichment';
import { OLIST_CATEGORY_IMAGE_MAP } from '../src/data/olistCategoryImageMap';
import {
  inventoryLocalPhotos,
  parsePhotoReviewHtml,
} from './olist-local-photo-pilot';
import {
  runCategorySearches,
  writeManifest,
  writePilotReports,
} from './enrich-olist-product-images';

const firstId = '0123456789abcdef0123456789abcdef';
const secondId = '1123456789abcdef0123456789abcdef';
const sourceProduct = (
  product_id = firstId,
  product_category_name = 'beleza_saude',
): OlistImageSourceProduct => ({
  product_id,
  product_category_name,
  product_name_lenght: '20',
  product_description_lenght: '100',
  product_photos_qty: '2',
  product_weight_g: '450',
  product_length_cm: '10',
  product_height_cm: '5',
  product_width_cm: '8',
});

const openverseResult = (overrides: Record<string, unknown> = {}) => ({
  id: 'photo-1',
  title: 'Skincare cream product',
  description: 'A cosmetic skincare cream container photographed as an isolated product.',
  creator: 'Photo Creator',
  creator_url: 'https://creator.example.test/profile',
  foreign_landing_url: 'https://source.example.test/photo',
  url: 'https://images.example.test/photo.jpg',
  license: 'by',
  license_version: '4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Photo Creator, CC BY 4.0',
  width: 1200,
  height: 900,
  mature: false,
  filetype: 'jpg',
  tags: [{ name: 'skincare' }, { name: 'cream' }],
  ...overrides,
});

const manifestEntry = (overrides: Partial<OlistPhotoManifestEntry> = {}): OlistPhotoManifestEntry => ({
  sku: `OLIST-${firstId.toUpperCase()}`,
  productId: firstId,
  displayTitle: 'Olist Health & Beauty product 01234567',
  category: 'Health & Beauty',
  imagePath: `images/${crypto.createHash('sha256').update('photo1').digest('hex')}.webp`,
  sourceProvider: 'Openverse',
  sourceTitle: 'Skincare cream product',
  creator: 'Photo Creator',
  creatorUrl: 'https://creator.example.test/profile',
  sourceUrl: 'https://source.example.test/photo',
  originalImageUrl: 'https://images.example.test/photo.jpg',
  license: 'by',
  licenseVersion: '4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Photo Creator, CC BY 4.0',
  matchType: 'representative-category-match',
  matchConfidence: 0.82,
  matchReason: 'Category keywords appear in the photo title.',
  relevanceEvidence: ['Title identifies product term "skincare cream".'],
  relevanceStatus: 'candidate-accepted',
  sha256: crypto.createHash('sha256').update('photo1').digest('hex'),
  byteLength: 1234,
  width: 800,
  height: 600,
  validationStatus: 'needs-human-review',
  downloadedAt: new Date(0).toISOString(),
  ...overrides,
});

test('pilot SKU selection is deterministic, category-diverse, and capped at 50', () => {
  const rows = [
    sourceProduct(firstId, 'beauty_pt'),
    sourceProduct(secondId, 'beauty_pt'),
    sourceProduct('2123456789abcdef0123456789abcdef', 'phone_pt'),
    sourceProduct('3123456789abcdef0123456789abcdef', 'phone_pt'),
    sourceProduct('4123456789abcdef0123456789abcdef', 'home_pt'),
  ];
  const translations = new Map([
    ['beauty_pt', 'health_beauty'],
    ['phone_pt', 'telephony'],
    ['home_pt', 'furniture_decor'],
  ]);
  assert.deepEqual(selectOlistImagePilot(rows, translations, 3).map((row) => row.product_id), [
    '4123456789abcdef0123456789abcdef',
    firstId,
    '2123456789abcdef0123456789abcdef',
  ]);
  assert.throws(() => selectOlistImagePilot(rows, translations, 51), /from 1 to 50/);
});

test('default is an offline dry run; free network requires explicit pilot-search command', () => {
  assert.deepEqual(parseOlistImagePipelineOptions([]), { pilotSearch: false, retries: 2 });
  assert.deepEqual(parseOlistImagePipelineOptions(['--pilot-search']), { pilotSearch: true, retries: 2 });
  assert.deepEqual(parseOlistImagePipelineOptions(['--pilot-search', '--retries', '1']), { pilotSearch: true, retries: 1 });
  assert.throws(() => parseOlistImagePipelineOptions(['--generate']), /Unsupported option/);
  assert.throws(() => parseOlistImagePipelineOptions(['--provider']), /Unsupported option/);
  assert.throws(() => parseOlistImagePipelineOptions(['--approve-paid']), /Unsupported option/);
  assert.throws(() => parseOlistImagePipelineOptions(['--limit', '500']), /Unsupported option/);
  assert.throws(() => parseOlistImagePipelineOptions(['--pilot-search', '--retries', '4']), /0 to 3/);
});

test('Olist categories use explicit product-specific search queries and synonyms', () => {
  assert.match(categorySearchQuery('air_conditioning'), /air conditioner unit/i);
  assert.match(categorySearchQuery('bed_bath_table'), /bedding.*towels.*bathroom accessories/i);
  assert.match(categorySearchQuery('computers_accessories'), /laptop.*desktop computer peripherals/i);
  assert.match(categorySearchQuery('garden_tools'), /garden hand tools/i);
  assert.equal(categorySearchQuery('unknown_unmapped_category'), '');
  assert.equal(getOlistCategorySearchSpec('Computers & Accessories')?.productTerms.includes('laptop'), true);
  const url = new URL(buildOpenverseSearchUrl('air_conditioning'));
  assert.match(url.searchParams.get('q') || '', /air conditioner unit/i);
  assert.equal(url.searchParams.get('image_type'), 'photo');
  assert.equal(url.searchParams.get('license'), 'cc0,pdm,by,by-sa');
  assert.equal(url.searchParams.get('page_size'), '20');
});

test('every source category has an explicit free-photo search query and product terms', () => {
  const categories = OLIST_CATEGORY_IMAGE_MAP.filter((definition) => definition.sourceCategory);
  assert.equal(categories.length, 73);
  for (const definition of categories) {
    const spec = getOlistCategorySearchSpec(definition.categoryKey);
    assert.ok(spec, `Missing search mapping for ${definition.sourceCategory} (${definition.categoryKey})`);
    assert.ok(spec.query.length > 12, `Search query is not descriptive for ${definition.categoryKey}`);
    assert.ok(spec.productTerms.length > 0, `No product synonyms for ${definition.categoryKey}`);
  }
});

test('strict relevance accepts product photographs and rejects unrelated scenes and weak overlaps', () => {
  const laptop = normalizeOpenverseResult(openverseResult({
    id: 'laptop',
    title: 'Laptop computer product photograph',
    description: 'Isolated notebook computer on a neutral background.',
    tags: [{ name: 'laptop' }, { name: 'computer' }],
  }));
  assert.ok(laptop);
  const relevant = evaluateCategoryRelevance(laptop, 'computers_accessories');
  assert.equal(relevant.accepted, true);
  assert.ok(relevant.score >= 0.8);
  assert.ok(relevant.evidence.length > 0);

  for (const title of [
    'Computer users at a concert',
    'People on a sunny beach',
    'Random person smiling at camera',
    'Computer science lecture audience',
  ]) {
    const scene = { ...laptop, title, description: '', tags: [] };
    const evaluated = evaluateCategoryRelevance(scene, 'computers_accessories');
    assert.equal(evaluated.accepted, false, title);
    assert.match(evaluated.rejectionReason, /unrelated scene|does not identify/);
  }

  const weak = evaluateCategoryRelevance({
    ...laptop,
    title: 'Modern technology scene',
    description: '',
    tags: ['accessories'],
  }, 'computers_accessories');
  assert.equal(weak.accepted, false);
  assert.equal(weak.score, 0);
});

test('pilot search execution invokes Openverse then Wikimedia fallback with mocked providers', async () => {
  const product = sourceProduct();
  const candidate = normalizeOpenverseResult(openverseResult());
  assert.ok(candidate);
  const commonsCandidate = { ...candidate, provider: 'Wikimedia Commons' as const };
  const calls: string[] = [];
  const progress: string[] = [];
  const result = await runCategorySearches({
    categories: ['health_beauty'],
    products: [product],
    translations: new Map([[product.product_category_name, 'health_beauty']]),
    localCandidates: new Map(),
    retries: 0,
    fetcher: async () => {
      throw new Error('The mocked search path must not make network requests.');
    },
    log: (message) => progress.push(message),
    openverseSearch: async () => {
      calls.push('openverse');
      return [];
    },
    commonsSearch: async () => {
      calls.push('wikimedia');
      return [commonsCandidate];
    },
  });
  assert.deepEqual(calls, ['openverse', 'wikimedia']);
  assert.equal(result.failures.length, 0);
  assert.equal(result.candidatesByCategory.get('health_beauty')?.[0].provider, 'Wikimedia Commons');
  assert.ok(progress.some((message) => message.includes('Searching Openverse')));
  assert.ok(progress.some((message) => message.includes('Searching Wikimedia Commons fallback')));
});

test('pilot search execution preserves and reports provider errors instead of swallowing them', async () => {
  const product = sourceProduct();
  const progress: string[] = [];
  const result = await runCategorySearches({
    categories: ['health_beauty'],
    products: [product],
    translations: new Map([[product.product_category_name, 'health_beauty']]),
    localCandidates: new Map(),
    retries: 0,
    fetcher: async () => {
      throw new Error('Unexpected real network request.');
    },
    log: (message) => progress.push(message),
    openverseSearch: async () => {
      throw new Error('Openverse fixture failure');
    },
    commonsSearch: async () => {
      throw new Error('Commons fixture failure');
    },
  });
  assert.deepEqual(result.failures.map((failure) => failure.reason), [
    'Openverse search failed: Openverse fixture failure',
    'Wikimedia Commons fallback failed: Commons fixture failure',
  ]);
  assert.ok(progress.filter((message) => message.startsWith('  ERROR:')).length === 2);
});

test('empty pilot results still write an unmatched-product HTML report and manifest', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-empty-photo-report-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const products = [sourceProduct(), sourceProduct(secondId, 'telefonia')];
  const translations = new Map([
    ['beleza_saude', 'health_beauty'],
    ['telefonia', 'telephony'],
  ]);
  const manifestFile = path.join(directory, 'manifest.json');
  writeManifest([], manifestFile);
  await writePilotReports([], products, translations, directory);
  const html = fs.readFileSync(path.join(directory, 'report.html'), 'utf8');
  assert.match(html, /0 photos passed strict metadata relevance checks/);
  assert.match(html, new RegExp(`OLIST-${firstId.toUpperCase()}`));
  assert.match(html, new RegExp(`OLIST-${secondId.toUpperCase()}`));
  assert.match(html, /No contact sheet was created/);
  assert.equal(fs.existsSync(path.join(directory, 'contact-sheet.jpg')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile, 'utf8')), []);
});

test('accepted license normalization excludes noncommercial and no-derivatives terms', () => {
  assert.equal(normalizeLicense('cc0'), 'cc0');
  assert.equal(normalizeLicense('pdm'), 'pdm');
  assert.equal(normalizeLicense('by'), 'by');
  assert.equal(normalizeLicense('by-sa'), 'by-sa');
  assert.equal(normalizeLicense('CC BY 4.0'), 'by');
  assert.equal(normalizeLicense('CC BY-SA 4.0'), 'by-sa');
  assert.equal(normalizeLicense('CC BY-NC 4.0'), undefined);
  assert.equal(normalizeLicense('CC BY-ND 4.0'), undefined);
  assert.equal(isCommerciallyUsableLicense('by', 'https://creativecommons.org/licenses/by/4.0/'), true);
  assert.equal(isCommerciallyUsableLicense('by-nc', 'https://creativecommons.org/licenses/by-nc/4.0/'), false);
  assert.equal(isCommerciallyUsableLicense('by', 'http://creativecommons.org/licenses/by/4.0/'), false);
});

test('Openverse parser requires source, creator, commercial license, and photographic dimensions', () => {
  const candidate = normalizeOpenverseResult(openverseResult());
  assert.ok(candidate);
  assert.equal(candidate.provider, 'Openverse');
  assert.equal(candidate.licenseCode, 'by');
  assert.equal(normalizeOpenverseResult(openverseResult({ license: 'by-nc' })), undefined);
  assert.equal(normalizeOpenverseResult(openverseResult({ license: 'by-nd' })), undefined);
  assert.equal(normalizeOpenverseResult(openverseResult({ creator: '' })), undefined);
  assert.equal(normalizeOpenverseResult(openverseResult({ attribution: '' })), undefined);
  assert.equal(normalizeOpenverseResult(openverseResult({ url: 'http://images.example.test/a.jpg' })), undefined);
  assert.equal(normalizeOpenverseResult(openverseResult({ width: 400 })), undefined);
  assert.equal(normalizeOpenverseResult(openverseResult({ mature: true })), undefined);
  const parsed = parseOpenverseSearchResponse({ results: [openverseResult(), openverseResult({ license: 'by-nc' })] });
  assert.equal(parsed.length, 1);
});

test('Wikimedia fallback extracts creator, license, original links, and rejects restricted licenses', () => {
  const page = {
    title: 'File:skincare cream.jpg',
    imageinfo: [{
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/skincare.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:skincare.jpg',
      mime: 'image/jpeg',
      width: 1400,
      height: 1000,
      extmetadata: {
        LicenseShortName: { value: 'CC BY 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
        Artist: { value: '<a href="https://commons.wikimedia.org/wiki/User:Creator">A. Creator</a>' },
        Attribution: { value: 'A. Creator / CC BY 4.0' },
      },
    }],
  };
  const normalized = normalizeWikimediaPage(page);
  assert.ok(normalized);
  assert.equal(normalized.creator, 'A. Creator');
  assert.equal(normalized.licenseCode, 'by');
  assert.equal(parseWikimediaSearchResponse({ query: { pages: [page] } }).length, 1);
  assert.equal(normalizeWikimediaPage({
    ...page,
    imageinfo: [{
      ...page.imageinfo[0],
      extmetadata: {
        ...page.imageinfo[0].extmetadata,
        LicenseShortName: { value: 'CC BY-NC 4.0' },
      },
    }],
  }), undefined);
  assert.match(buildWikimediaSearchUrl('health_beauty'), /gsrnamespace=6/);
  assert.match(buildWikimediaSearchUrl('health_beauty'), /extmetadata/);
});

test('Openverse requests are restricted to commercial-use-compatible photo search', () => {
  const url = new URL(buildOpenverseSearchUrl('health_beauty'));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.searchParams.get('license'), 'cc0,pdm,by,by-sa');
  assert.equal(url.searchParams.get('license_type'), 'commercial');
  assert.equal(url.searchParams.get('image_type'), 'photo');
  assert.equal(url.searchParams.get('mature'), 'false');
  assert.equal(url.searchParams.get('page_size'), '20');
  assert.match(categorySearchQuery('garden_tools'), /garden/);
});

test('category match confidence requires relevant category terms, not random search results', () => {
  const matching = normalizeOpenverseResult(openverseResult());
  assert.ok(matching);
  assert.ok(scoreCategoryMatch(matching, 'health_beauty') >= 0.8);
  assert.equal(scoreCategoryMatch({
    ...matching,
    title: 'Product design innovation',
    description: '',
    tags: [],
  }, 'health_beauty'), 0);
});

test('search result cache is validated, resumable, and keyed by provider plus query', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-openverse-cache-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'cache.json');
  const results = [normalizeOpenverseResult(openverseResult())!];
  writeSearchCache(filename, 'Openverse', 'skincare cosmetics beauty', results);
  assert.equal(readSearchCache(filename, 'Openverse', 'skincare cosmetics beauty')?.results.length, 1);
  assert.equal(readSearchCache(filename, 'Wikimedia Commons', 'skincare cosmetics beauty'), undefined);
  assert.equal(readSearchCache(filename, 'Openverse', 'other query'), undefined);
  fs.writeFileSync(filename, '{bad json');
  assert.equal(readSearchCache(filename, 'Openverse', 'skincare cosmetics beauty'), undefined);
});

test('rate-limit retry respects Retry-After and sends a descriptive User-Agent', async () => {
  const started = Date.now();
  let calls = 0;
  const response = await fetchWithRespectfulRetry('https://api.example.test/search', {
    retries: 1,
    minimumIntervalMs: 0,
    fetcher: async (_input, init) => {
      calls += 1;
      assert.match(new Headers(init?.headers).get('user-agent') || '', /AURA-Olist-Free-Photo-Pilot/);
      if (calls === 1) return new Response('limited', { status: 429, headers: { 'retry-after': '0.02' } });
      return new Response('ok', { status: 200 });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.ok(Date.now() - started >= 15);
  await assert.rejects(
    fetchWithRespectfulRetry('http://api.example.test/search', { retries: 0, minimumIntervalMs: 0 }),
    /HTTPS/,
  );
  await assert.rejects(
    fetchWithRespectfulRetry('https://api.example.test/search', {
      retries: 2,
      minimumIntervalMs: 0,
      fetcher: async () => {
        const unsafeRedirect = new Response('redirected');
        Object.defineProperty(unsafeRedirect, 'url', { value: 'http://api.example.test/result' });
        return unsafeRedirect;
      },
    }),
    /redirected to an unsafe URL/,
  );
});

test('Openverse anonymous requests omit Authorization and do not retry HTTP 401', async () => {
  let calls = 0;
  await assert.rejects(fetchWithRespectfulRetry(
    buildOpenverseSearchUrl('audio'),
    {
      retries: 3,
      minimumIntervalMs: 0,
      fetcher: async (_input, init) => {
        calls += 1;
        assert.equal(new Headers(init?.headers).has('authorization'), false);
        return new Response('unauthorized', { status: 401 });
      },
    },
  ), /Openverse returned HTTP 401 for anonymous access/);
  assert.equal(calls, 1);
});

test('Openverse HTTP 429 retries with Retry-After using mocked responses', async () => {
  let calls = 0;
  const response = await fetchWithRespectfulRetry(
    buildOpenverseSearchUrl('audio'),
    {
      retries: 1,
      minimumIntervalMs: 0,
      fetcher: async () => {
        calls += 1;
        return calls === 1
          ? new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } })
          : new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test('download validates source metadata and raster bytes, then optimizes safely to WebP', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-free-photo-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 80, g: 120, b: 160 } },
  }).jpeg().toBuffer();
  const candidate = normalizeOpenverseResult(openverseResult());
  assert.ok(candidate);
  const saved = await downloadLicensedPhoto(candidate, path.join(directory, 'photo.webp'), 1, async () =>
    new Response(new Uint8Array(input), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
  assert.equal(saved.format, 'webp');
  assert.equal(saved.sourceSha256, crypto.createHash('sha256').update(input).digest('hex'));
  assert.equal((await sharp(saved.bytes).metadata()).format, 'webp');
  await assert.rejects(downloadLicensedPhoto(
    { ...candidate, license: 'by-nc' },
    path.join(directory, 'bad.webp'),
    0,
    async () => new Response('no'),
  ), /public-use licensing/);
  await assert.rejects(downloadLicensedPhoto(
    candidate,
    path.join(directory, 'svg.webp'),
    0,
    async () => new Response('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }),
  ), /raster photograph/);
});

test('photo manifest records license provenance, representative-only match, and unique hashes', () => {
  const candidate = normalizeOpenverseResult(openverseResult());
  assert.ok(candidate);
  const image = Buffer.from('optimized photo');
  const entry = createPhotoManifestEntry(
    sourceProduct(),
    'Health & Beauty',
    candidate,
    `images/${crypto.createHash('sha256').update(image).digest('hex')}.webp`,
    image,
    900,
    600,
    0.82,
    'Category words match the image title.',
    ['Title identifies product term "skincare cream".'],
  );
  assert.equal(entry.matchType, 'representative-category-match');
  assert.equal(entry.displayTitle, buildOlistDisplayName('Health & Beauty', firstId));
  validatePhotoManifestEntries([entry]);
  assert.equal(countUniqueImageHashes([entry]), 1);
  assert.throws(() => validatePhotoManifestEntries([
    entry,
    { ...entry, sku: `OLIST-${secondId.toUpperCase()}`, productId: secondId },
  ]), /Duplicate/);
  assert.throws(() => validatePhotoManifestEntries([{ ...entry, license: 'by-nc' }]), /Missing or invalid/);
  assert.throws(() => validatePhotoManifestEntries([
    { ...entry, licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  ]), /Missing or invalid/);
  assert.throws(() => validatePhotoManifestEntries([{ ...entry, sourceUrl: 'javascript:alert(1)' }]), /Missing or invalid/);
  assert.throws(() => validatePhotoManifestEntries([{ ...entry, matchConfidence: 0.2 }]), /Invalid path, match metadata/);
});

test('existing local photos remain excluded until creator, license, and source provenance is verified', () => {
  const status = localPhotoProvenanceStatus(
    '<img src="/images/products/pexels-123.jpg"><img src="/images/products/pexels-456.jpg">',
  );
  assert.equal(status.count, 2);
  assert.equal(status.ineligibleCount, 2);
  assert.match(status.reason, /creator, source URL, and license metadata/);
});

test('existing local photo review parser and raster audit remain available', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-local-photo-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const publicRoot = path.join(root, 'public');
  const productsPath = path.join(publicRoot, 'images', 'products');
  fs.mkdirSync(productsPath, { recursive: true });
  const imagePath = path.join(productsPath, 'pexels-1.jpg');
  await sharp({ create: { width: 640, height: 640, channels: 3, background: '#224466' } }).jpeg().toFile(imagePath);
  const cards = parsePhotoReviewHtml(
    '<div class="card"><img src="/images/products/pexels-1.jpg"><div><span class="id">1</span> Camera<br>A real camera.</div></div>',
  );
  const inventory = await inventoryLocalPhotos(cards, publicRoot);
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].validRaster, true);
  assert.equal(inventory[0].caption, 'Camera');
});

test('pilot staging remains inside the ignored data directory, not the public catalogue', () => {
  assert.match(OLIST_FREE_PHOTO_ROOT, /^data[\\/]/);
  assert.doesNotMatch(OLIST_FREE_PHOTO_ROOT, /^public[\\/]/);
});
