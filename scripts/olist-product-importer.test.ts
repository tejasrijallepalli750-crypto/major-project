import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  applyOlistImportPlan,
  assertOlistTargetDatabase,
  buildOlistProductPlan,
  makeOlistBulkOperations,
  OLIST_TO_INR_RATE,
  parseOlistCsv,
} from './olist-product-importer';
import {
  isManagedOlistCatalogProduct,
  OLIST_CATALOG_FEATURE,
  getOlistCategoryPhotoPath,
  getCategoryArtPath,
  usesSharedOlistCatalogImage,
} from '../src/utils/productPresentation';

const productId = '0123456789abcdef0123456789abcdef';
const secondProductId = '1123456789abcdef0123456789abcdef';
const products = [
  { product_id: productId, product_category_name: 'health_beauty' },
  { product_id: secondProductId, product_category_name: 'unknown_category' },
];
const orderItems = [
  { product_id: productId, price: '10.00' },
  { product_id: productId, price: '20.00' },
  { product_id: productId, price: 'not-a-price' },
  { product_id: secondProductId, price: '0' },
];
const translations = [
  { product_category_name: 'health_beauty', product_category_name_english: 'health_beauty' },
];

test('parses quoted CSV fields and BOM headers', () => {
  const rows = parseOlistCsv<{ product_id: string; note: string }>(
    '\uFEFFproduct_id,note\r\n0123456789abcdef0123456789abcdef,"translated, quoted value"\r\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].note, 'translated, quoted value');
});

test('accepts only MongoDB URIs targeting the exact test database', () => {
  assert.doesNotThrow(() => assertOlistTargetDatabase(
    'mongodb+srv://user:password@cluster.example/aura_payment_test?authSource=admin',
  ));
  assert.throws(
    () => assertOlistTargetDatabase('mongodb+srv://user:password@cluster.example/aura_payment_test_backup'),
    /must target aura_payment_test/,
  );
  assert.throws(
    () => assertOlistTargetDatabase('https://cluster.example/aura_payment_test'),
    /MongoDB URI scheme/,
  );
});

test('collapses duplicate product IDs and reports invalid IDs', () => {
  const plan = buildOlistProductPlan(
    [...products, products[0], { product_id: 'invalid', product_category_name: '' }],
    orderItems,
    translations,
    () => true,
  );
  assert.equal(plan.counts.sourceRecordCount, 4);
  assert.equal(plan.counts.uniqueProductIds, 2);
  assert.equal(plan.counts.duplicateProductRows, 1);
  assert.equal(plan.counts.invalidProductIdRows, 1);
  assert.equal(plan.products.length, 1);
});

test('aggregates only valid historical prices and converts the average using the catalogue rate', () => {
  const plan = buildOlistProductPlan(products, orderItems, translations, () => true);
  assert.equal(plan.counts.productsWithUsableHistoricalPrices, 1);
  assert.equal(plan.counts.invalidHistoricalPriceRows, 2);
  assert.equal(plan.counts.noUsableHistoricalPrice, 1);
  assert.equal(plan.products[0].price, Math.round(15 * OLIST_TO_INR_RATE));
  assert.match(plan.products[0].name, /^Olist Health & Beauty product /);
  assert.equal(plan.products[0].stock, 0);
});

test('skips products with no existing category artwork', () => {
  const plan = buildOlistProductPlan(products.slice(0, 1), orderItems, translations, () => false);
  assert.equal(plan.counts.missingArtwork, 1);
  assert.equal(plan.products.length, 0);
});

test('uses existing general artwork when a translated-category illustration is unavailable', () => {
  const plan = buildOlistProductPlan(
    [{ product_id: productId, product_category_name: 'music' }],
    orderItems,
    translations,
    (image) => image.endsWith('/general.svg'),
  );
  assert.equal(plan.counts.fallbackArtwork, 1);
  assert.equal(plan.counts.missingArtwork, 0);
  assert.equal(plan.products[0].image, '/images/catalog-category-art/general.svg');
});

test('does not use a category-photo candidate whose placement was not approved', () => {
  const translatedCategories = [
    { product_category_name: 'moveis_escritorio', product_category_name_english: 'office_furniture' },
  ];
  const photoPlan = buildOlistProductPlan(
    [{ product_id: productId, product_category_name: 'moveis_escritorio' }],
    [{ product_id: productId, price: '10.00' }],
    translatedCategories,
    (image) => image.endsWith('/home.svg') || image.endsWith('/general.svg'),
  );
  assert.equal(getOlistCategoryPhotoPath('office_furniture'), undefined);
  assert.equal(photoPlan.counts.categoryPhotoProducts, 0);
  assert.equal(photoPlan.counts.fallbackArtwork, 1);
  assert.equal(photoPlan.products[0].image, '/images/catalog-category-art/home.svg');
  assert.match(photoPlan.products[0].description, /not an original Olist product photo/);
  assert.match(photoPlan.products[0].description, /not a current market price/);
});

test('all category illustration families used by the catalogue exist as local assets', () => {
  const categoryArtwork = [
    'accessories',
    'automotive',
    'beauty',
    'food',
    'garden',
    'general',
    'home',
    'sports',
    'stationery',
    'technology',
    'toys',
  ].map(getCategoryArtPath);

  for (const image of categoryArtwork) {
    const filePath = path.resolve(process.cwd(), 'public', `.${image}`);
    assert.equal(fs.existsSync(filePath), true, `${image} should exist locally`);
  }
});

test('shared category artwork is allowed only for Olist catalog listings', () => {
  assert.equal(usesSharedOlistCatalogImage('OLIST-0123456789ABCDEF', '/images/catalog-category-art/general.svg'), true);
  assert.equal(usesSharedOlistCatalogImage('AURA-001', '/images/catalog-category-art/general.svg'), false);
  assert.equal(usesSharedOlistCatalogImage('OLIST-0123456789ABCDEF', '/images/products/pexels-16378446.jpg'), true);
  assert.equal(usesSharedOlistCatalogImage('OLIST-0123456789ABCDEF', '/images/products/item.jpg'), false);
});

test('server startup preserves only marked Olist catalog entries with safe artwork', () => {
  assert.equal(isManagedOlistCatalogProduct('OLIST-0123456789ABCDEF', [OLIST_CATALOG_FEATURE], true), true);
  assert.equal(isManagedOlistCatalogProduct('OLIST-0123456789ABCDEF', [], true), false);
  assert.equal(isManagedOlistCatalogProduct('AURA-001', [OLIST_CATALOG_FEATURE], true), false);
  assert.equal(isManagedOlistCatalogProduct('OLIST-0123456789ABCDEF', [OLIST_CATALOG_FEATURE], false), false);
});

test('dry run reports planned inserts and updates without calling the writer', async () => {
  const plan = buildOlistProductPlan(products, orderItems, translations, () => true);
  let writes = 0;
  const summary = await applyOlistImportPlan(
    plan,
    new Set(),
    false,
    async () => {
      writes += 1;
      return { importedProducts: 1, updatedProducts: 0 };
    },
  );
  assert.deepEqual(summary, { importedProducts: 1, updatedProducts: 0 });
  assert.equal(writes, 0);
});

test('repeat imports upsert Olist SKUs and preserve all non-Olist product records', async () => {
  const plan = buildOlistProductPlan(products, orderItems, translations, () => true);
  const existingSkus = new Set<string>();
  let inserts = 0;
  let updates = 0;
  const write = async (records: typeof plan.products) => {
    let importedProducts = 0;
    let updatedProducts = 0;
    for (const record of records) {
      if (existingSkus.has(record.sku)) {
        updatedProducts += 1;
        updates += 1;
      } else {
        importedProducts += 1;
        inserts += 1;
        existingSkus.add(record.sku);
      }
    }
    return { importedProducts, updatedProducts };
  };

  const first = await applyOlistImportPlan(plan, existingSkus, true, write);
  const second = await applyOlistImportPlan(plan, existingSkus, true, write);
  assert.deepEqual(first, { importedProducts: 1, updatedProducts: 0 });
  assert.deepEqual(second, { importedProducts: 0, updatedProducts: 1 });
  assert.equal(inserts, 1);
  assert.equal(updates, 1);

  const operations = makeOlistBulkOperations(plan.products);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].updateOne.filter.sku, plan.products[0].sku);
  assert.equal(operations[0].updateOne.upsert, true);
  assert.deepEqual(Object.keys(operations[0].updateOne), ['filter', 'update', 'upsert']);
  assert.equal(operations[0].updateOne.update.$set.sku.startsWith('OLIST-'), true);
  assert.equal('stock' in operations[0].updateOne.update.$set, false);
});
