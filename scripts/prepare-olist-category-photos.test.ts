import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCategorySearchList,
  chooseCategoryPhotoCandidates,
  chooseCategoryPhotoCandidate,
  parseCategoryPhotoSearchOptions,
  renderCategoryPhotoReviewHtml,
  selectCategoryCandidatesRoundRobin,
} from './prepare-olist-category-photos';
import { OLIST_CATEGORY_IMAGE_MAP } from '../src/data/olistCategoryImageMap';
import {
  categoryPhotoSearchQueries,
  normalizeOpenverseResult,
  OpenPhotoCandidate,
} from './olist-image-enrichment';

const laptop = (): OpenPhotoCandidate => {
  const candidate = normalizeOpenverseResult({
    id: 'computer-candidate',
    title: 'Laptop computer product photograph',
    description: 'Notebook computer on a clean surface.',
    creator: 'Photographer',
    creator_url: 'https://creator.example.test/',
    foreign_landing_url: 'https://source.example.test/photo',
    url: 'https://image.example.test/photo.jpg',
    license: 'by',
    license_version: '4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Photographer, CC BY 4.0',
    width: 1200,
    height: 800,
    tags: [{ name: 'laptop' }, { name: 'computer' }],
    mature: false,
  });
  assert.ok(candidate);
  return candidate;
};

test('category photo searches default offline and enforce bounded search and download limits', () => {
  assert.deepEqual(parseCategoryPhotoSearchOptions([]), {
    search: false,
    maxCategories: 5,
    downloadLimit: 0,
  });
  assert.deepEqual(parseCategoryPhotoSearchOptions([
    '--search',
    '--max-categories',
    '73',
    '--download-limit',
    '73',
  ]), {
    search: true,
    maxCategories: 73,
    downloadLimit: 73,
  });
  assert.deepEqual(parseCategoryPhotoSearchOptions(['--search', '--category', 'Computers']), {
    search: true,
    maxCategories: 5,
    downloadLimit: 0,
    category: 'computers',
  });
  assert.throws(() => parseCategoryPhotoSearchOptions(['--download-limit', '1']), /requires explicit --search/);
  assert.throws(() => parseCategoryPhotoSearchOptions(['--search', '--max-categories', '74']), /from 1 to 73/);
  assert.deepEqual(parseCategoryPhotoSearchOptions(['--search', '--download-limit', '73']).downloadLimit, 73);
  assert.throws(() => parseCategoryPhotoSearchOptions(['--search', '--download-limit', '74']), /from 0 to 73/);
  assert.throws(() => parseCategoryPhotoSearchOptions(['--search', '--category']), /requires an Olist category key/);
  assert.throws(() => parseCategoryPhotoSearchOptions(['--other']), /Unsupported category-photo option/);
});

test('category search list includes all product categories but leaves uncategorized products out of search', () => {
  const products = OLIST_CATEGORY_IMAGE_MAP.map((definition, index) => ({
    product_id: `product-${index}`,
    product_category_name: definition.sourceCategory,
    product_name_lenght: '',
    product_description_lenght: '',
    product_photos_qty: '',
    product_weight_g: '',
    product_length_cm: '',
    product_height_cm: '',
    product_width_cm: '',
  }));
  const translations = OLIST_CATEGORY_IMAGE_MAP
    .filter((definition) => definition.sourceCategory && !['pc_gamer', 'portateis_cozinha_e_preparadores_de_alimentos'].includes(definition.sourceCategory))
    .map((definition) => ({
      product_category_name: definition.sourceCategory,
      product_category_name_english: definition.categoryKey,
    }));
  const categories = buildCategorySearchList(products, translations);
  assert.equal(categories.length, 73);
  assert.ok(categories.every((category) => category.productCount === 1));
  assert.equal(categories.some((category) => category.sourceCategory === ''), false);
  assert.ok(categories.every((category) => categoryPhotoSearchQueries(category.categoryKey).length > 0));
});

test('Computers uses separate descriptive product queries rather than one restrictive synonym list', () => {
  const queries = categoryPhotoSearchQueries('computers');
  assert.equal(queries.length, 5);
  assert.match(queries[0], /computer product photograph/i);
  assert.match(queries[1], /laptop/i);
  assert.match(queries[2], /computer monitor/i);
  assert.match(queries[3], /computer keyboard/i);
  assert.match(queries[4], /computer accessories/i);
  assert.deepEqual(categoryPhotoSearchQueries('computers_accessories'), queries);
});

test('category candidate selection requires strict relevance and never approves or assigns a SKU', () => {
  const category = { sourceCategory: 'pcs', categoryKey: 'computers', productCount: 30 };
  const result = chooseCategoryPhotoCandidate(category, [
    { ...laptop(), id: 'irrelevant', title: 'People on a beach', description: '', tags: ['laptop'] },
    laptop(),
  ]);
  assert.ok(result);
  assert.equal(result.categoryKey, 'computers');
  assert.equal(result.productCount, 30);
  assert.equal(result.approved, false);
  assert.equal(result.reviewStatus, 'needs-human-review');
  assert.ok(result.relevanceEvidence.length > 0);
  assert.equal('sku' in result, false);
  assert.equal(chooseCategoryPhotoCandidate(category, [
    { ...laptop(), id: 'weak', title: 'Modern technology scene', description: '', tags: ['accessories'] },
  ]), undefined);
  assert.deepEqual(chooseCategoryPhotoCandidates(category, [
    { candidate: { ...laptop(), id: 'non-commercial', license: 'by-nc' }, query: 'laptop' },
  ]), []);
});

test('candidate cap prioritizes one candidate per category before second candidates', () => {
  const first = chooseCategoryPhotoCandidate(
    { sourceCategory: 'pcs', categoryKey: 'computers', productCount: 1 },
    [laptop()],
  );
  assert.ok(first);
  const groups = [
    { categoryKey: 'computers', candidates: [first, { ...first, candidate: { ...first.candidate, id: 'computer-2' } }] },
    { categoryKey: 'toys', candidates: [{ ...first, categoryKey: 'toys', candidate: { ...first.candidate, id: 'toy-1' } }] },
    { categoryKey: 'garden_tools', candidates: [{ ...first, categoryKey: 'garden_tools', candidate: { ...first.candidate, id: 'garden-1' } }] },
  ];
  assert.deepEqual(selectCategoryCandidatesRoundRobin(groups, 3).map((item) => item.candidate.id), [
    'computer-candidate',
    'toy-1',
    'garden-1',
  ]);
  assert.deepEqual(selectCategoryCandidatesRoundRobin(groups, 4).map((item) => item.candidate.id), [
    'computer-candidate',
    'toy-1',
    'garden-1',
    'computer-2',
  ]);
});

test('zero-result report includes actual search counts and rejection reasons without claiming a contact sheet', () => {
  const category = { sourceCategory: 'pcs', categoryKey: 'computers', productCount: 30 };
  const report = renderCategoryPhotoReviewHtml(
    [category],
    ['computers'],
    [],
    [],
    [{
      categoryKey: 'computers',
      provider: 'Openverse',
      query: 'laptop notebook computer product photograph',
      rawResultCount: 4,
      metadataAcceptedCount: 1,
      relevanceAcceptedCount: 0,
      fromCache: false,
      rejections: [
        { title: 'Portrait of a laptop user', reason: 'Rejected: metadata identifies an unrelated scene or subject ("portrait").' },
        { title: 'Laptop on table', reason: 'license is missing or unsupported' },
      ],
    }],
  );
  assert.match(report, /Raw API results/);
  assert.match(report, /laptop notebook computer product photograph/);
  assert.match(report, /<td>4<\/td>/);
  assert.match(report, /Portrait of a laptop user/);
  assert.match(report, /license is missing or unsupported/);
  assert.match(report, /No contact sheet/);
  assert.match(report, /use category illustration/);
});
