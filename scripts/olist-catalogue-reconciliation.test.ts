import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProductReferenceIndex,
  ExistingCatalogueProduct,
  getPermanentDeleteCandidates,
  getOlistProductIdFromSku,
  makeOlistReconciliationOperations,
  makeSimulatedInventoryOperations,
  parseOlistReconciliationOptions,
  planOlistCatalogueReconciliation,
  planSimulatedInventory,
  resolveDemoInventoryStock,
  resolveSafeLocalImagePath,
} from './olist-catalogue-reconciliation';
import { buildOlistProductPlan, OLIST_CATALOG_FEATURE } from './olist-product-importer';
import { makeStockAllocationOperation } from '../server/orders/inventory';

const firstSourceId = '0123456789abcdef0123456789abcdef';
const secondSourceId = '1123456789abcdef0123456789abcdef';

const existingProduct = (
  id: string,
  sku: string,
  overrides: Partial<ExistingCatalogueProduct> = {},
): ExistingCatalogueProduct => ({
  id,
  sku,
  status: 'active',
  stock: 0,
  image: '/images/catalog-category-art/general.svg',
  features: [OLIST_CATALOG_FEATURE],
  ...overrides,
});

test('source membership detects missing, extra, and duplicate Olist product records', () => {
  const products = [
    existingProduct('prod-1', `OLIST-${firstSourceId.toUpperCase()}`),
    existingProduct('prod-duplicate', `olist-${firstSourceId}`),
    existingProduct('prod-extra-olist', 'OLIST-2123456789ABCDEF0123456789ABCDEF'),
    existingProduct('prod-extra-aura', 'AURA-STARTER-01'),
  ];
  const plan = planOlistCatalogueReconciliation(
    products,
    new Set([firstSourceId, secondSourceId]),
    { productIds: new Set(), skus: new Set() },
  );

  assert.equal(plan.sourceProductIds.size, 2);
  assert.equal(plan.matchingProducts.length, 2);
  assert.equal(plan.outsideProducts.length, 2);
  assert.deepEqual(plan.missingSourceProductIds, [secondSourceId]);
  assert.equal(plan.duplicateSourceGroups.length, 1);
  assert.equal(plan.duplicateSourceGroups[0].products.length, 2);
  assert.equal(getOlistProductIdFromSku(`OLIST-${firstSourceId.toUpperCase()}`), firstSourceId);
  assert.equal(getOlistProductIdFromSku('OLIST-not-a-product-id'), undefined);
});

test('order, cart, and wishlist references protect products from deletion', () => {
  const references = buildProductReferenceIndex(
    [{ orderItems: [{ product: 'prod-order-ref', sku: 'AURA-ORDERED' }] }],
    [{
      cartItems: [{ productId: 'prod-cart-ref' }],
      wishlistIds: ['prod-wishlist-ref'],
    }],
  );
  const plan = planOlistCatalogueReconciliation(
    [
      existingProduct('prod-order-ref', 'AURA-ORDERED'),
      existingProduct('prod-cart-ref', 'AURA-CART'),
      existingProduct('prod-wishlist-ref', 'AURA-WISHLIST'),
      existingProduct('prod-unused', 'AURA-UNUSED'),
    ],
    new Set([firstSourceId]),
    references,
  );

  assert.equal(plan.outsideProducts.filter((product) => product.referenced).length, 3);
  assert.equal(plan.outsideProducts.filter((product) => !product.referenced).length, 1);
});

test('permanent deletion excludes referenced products and startup-seeded SKUs', () => {
  const plan = planOlistCatalogueReconciliation(
    [
      existingProduct('prod-seed', 'AURA-SEED'),
      existingProduct('prod-referenced', 'AURA-ORDERED'),
      existingProduct('prod-eligible', 'AURA-UNUSED'),
    ],
    new Set([firstSourceId]),
    { productIds: new Set(['prod-referenced']), skus: new Set() },
    new Set(['AURA-SEED']),
  );
  assert.equal(plan.outsideProducts.find((product) => product.id === 'prod-seed')?.seedProduct, true);
  assert.deepEqual(
    getPermanentDeleteCandidates(plan.outsideProducts).map((product) => product.id),
    ['prod-eligible'],
  );
});

test('Olist reconciliation updates by existing product ID and repeatably upserts stable SKUs', () => {
  const productPlan = buildOlistProductPlan(
    [{ product_id: firstSourceId, product_category_name: 'health_beauty' }],
    [{ product_id: firstSourceId, price: '10.00' }],
    [],
    () => true,
  );
  const existing = existingProduct('prod-existing', `olist-${firstSourceId}`);
  const update = makeOlistReconciliationOperations(productPlan.products, [existing]);
  assert.equal(update.length, 1);
  assert.deepEqual(update[0].updateOne.filter, { id: existing.id });
  assert.equal(update[0].updateOne.upsert, false);
  assert.equal(update[0].updateOne.update.$set.sku, `OLIST-${firstSourceId.toUpperCase()}`);
  assert.equal('stock' in update[0].updateOne.update.$set, false);

  const insert = makeOlistReconciliationOperations(productPlan.products, []);
  assert.equal(insert.length, 1);
  assert.deepEqual(insert[0].updateOne.filter, { sku: `OLIST-${firstSourceId.toUpperCase()}` });
  assert.equal(insert[0].updateOne.upsert, true);

  assert.equal(makeOlistReconciliationOperations(productPlan.products, [
    existing,
    existingProduct('prod-duplicate', `OLIST-${firstSourceId.toUpperCase()}`),
  ]).length, 0);
});

test('simulated stock defaults only when enabled and preserves real or already-consumed quantities', () => {
  assert.equal(resolveDemoInventoryStock(false), undefined);
  assert.equal(resolveDemoInventoryStock(true), 20);
  assert.equal(resolveDemoInventoryStock(true, 7), 7);
  assert.throws(() => resolveDemoInventoryStock(false, 7), /requires demo inventory/);
  assert.throws(() => resolveDemoInventoryStock(true, 0), /whole number/);

  const candidates = [
    existingProduct('prod-zero', `OLIST-${firstSourceId.toUpperCase()}`),
    existingProduct('prod-real-stock', `OLIST-${secondSourceId.toUpperCase()}`, { stock: 6 }),
    existingProduct('prod-demo-stock', 'OLIST-2123456789ABCDEF0123456789ABCDEF', {
      stock: 2,
      inventoryMode: 'simulated-demo',
    }),
    existingProduct('prod-unmarked', 'OLIST-3123456789ABCDEF0123456789ABCDEF', { features: [] }),
    existingProduct('prod-not-olist', 'AURA-001'),
  ];
  const plan = planSimulatedInventory(candidates, new Set([
    firstSourceId,
    secondSourceId,
    '2123456789abcdef0123456789abcdef',
    '3123456789abcdef0123456789abcdef',
  ]));
  assert.equal(plan.eligible.length, 1);
  assert.equal(plan.alreadySimulated, 1);
  assert.equal(plan.preservedNonZeroStock, 1);

  const operations = makeSimulatedInventoryOperations(plan.eligible, 20);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].updateOne.filter.stock, 0);
  assert.deepEqual(operations[0].updateOne.update.$set, {
    stock: 20,
    inventoryMode: 'simulated-demo',
  });
  assert.throws(() => makeSimulatedInventoryOperations(plan.eligible, 0), /whole number/);
});

test('reconciliation defaults to dry-run and keeps deletion and demo stock explicit', () => {
  assert.deepEqual(parseOlistReconciliationOptions([]), {
    apply: false,
    deleteUnreferenced: false,
    enableDemoInventory: false,
    demoStock: undefined,
  });
  assert.deepEqual(parseOlistReconciliationOptions(['--delete-unreferenced']), {
    apply: false,
    deleteUnreferenced: true,
    enableDemoInventory: false,
    demoStock: undefined,
  });
  assert.deepEqual(parseOlistReconciliationOptions(['--apply', '--enable-demo-inventory']), {
    apply: true,
    deleteUnreferenced: false,
    enableDemoInventory: true,
    demoStock: 20,
  });
  assert.deepEqual(parseOlistReconciliationOptions([
    '--apply',
    '--enable-demo-inventory',
    '--demo-stock',
    '7',
  ]), {
    apply: true,
    deleteUnreferenced: false,
    enableDemoInventory: true,
    demoStock: 7,
  });
  assert.throws(() => parseOlistReconciliationOptions(['--demo-stock', '7']), /requires demo inventory/);
  assert.throws(() => parseOlistReconciliationOptions(['--apply', '--apply']), /Supported options/);
});

test('local image validation rejects traversal and missing files', () => {
  const root = 'C:\\aura\\public';
  assert.equal(
    resolveSafeLocalImagePath('/images/products/item.jpg', root, () => true),
    'C:\\aura\\public\\images\\products\\item.jpg',
  );
  assert.equal(resolveSafeLocalImagePath('/images/../../.env', root, () => true), undefined);
  assert.equal(resolveSafeLocalImagePath('//remote.example/image.jpg', root, () => true), undefined);
  assert.equal(resolveSafeLocalImagePath('/images/missing.jpg', root, () => false), undefined);
});

test('stock decrement stays atomic and rejects quantities above current stock', () => {
  const allocation = makeStockAllocationOperation('prod-available', 20);
  assert.deepEqual(allocation.filter, {
    id: 'prod-available',
    status: 'active',
    stock: { $gte: 20 },
  });
  assert.deepEqual(allocation.update, { $inc: { stock: -20 } });
  assert.throws(() => makeStockAllocationOperation('prod-available', 0), /positive whole quantity/);
  assert.throws(() => makeStockAllocationOperation('prod-available', 1.5), /positive whole quantity/);
});
