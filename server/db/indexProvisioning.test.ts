import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertApplicationIndexDatabase,
  assertMongoUriTargetsApplicationIndexDatabase,
  makeCaseInsensitiveDuplicatePipeline,
  makeDuplicateKeyPipeline,
  parseIndexProvisioningMode,
  planApplicationIndexes,
  provisionMissingIndexes,
  type ExistingIndex,
  type RequiredIndex,
} from './indexProvisioning';

const required: RequiredIndex = {
  model: 'Order',
  collection: 'auraorders',
  key: { user: 1, checkoutIdempotencyKey: 1 },
  options: {
    unique: true,
    partialFilterExpression: { checkoutIdempotencyKey: { $type: 'string' } },
  },
};

const requiredProductTextIndex: RequiredIndex = {
  model: 'Product',
  collection: 'auraproducts',
  key: { name: 'text', description: 'text', brand: 'text', sku: 'text' },
  options: { background: true },
};

const physicalProductTextIndex = (options: Record<string, unknown> = {}): ExistingIndex => ({
  name: 'name_text_description_text_brand_text_sku_text',
  key: { _fts: 'text', _ftsx: 1 },
  options: {
    v: 2,
    background: true,
    weights: { name: 1, description: 1, brand: 1, sku: 1 },
    default_language: 'english',
    language_override: 'language',
    textIndexVersion: 3,
    ...options,
  },
});

test('accepts only a MongoDB URI targeting the exact application database', () => {
  assert.doesNotThrow(() => assertApplicationIndexDatabase('aura_payment_test'));
  assert.throws(
    () => assertApplicationIndexDatabase('test'),
    /restricted to the aura_payment_test database/,
  );
  assert.doesNotThrow(() => assertMongoUriTargetsApplicationIndexDatabase(
    'mongodb+srv://user:password@cluster.example/aura_payment_test?authSource=admin',
  ));
  assert.throws(
    () => assertMongoUriTargetsApplicationIndexDatabase('mongodb+srv://cluster.example/test'),
    /restricted to the aura_payment_test database/,
  );
  assert.throws(
    () => assertMongoUriTargetsApplicationIndexDatabase('mongodb+srv://cluster.example'),
    /restricted to the aura_payment_test database/,
  );
  assert.throws(
    () => assertMongoUriTargetsApplicationIndexDatabase('mongodb+srv://cluster.example/aura_payment_test_backup'),
    /restricted to the aura_payment_test database/,
  );
  assert.throws(
    () => assertMongoUriTargetsApplicationIndexDatabase('https://cluster.example/aura_payment_test'),
    /mongodb or mongodb\+srv/,
  );
});

test('defaults to dry run and accepts only explicit --apply for index creation', () => {
  assert.equal(parseIndexProvisioningMode([]), false);
  assert.equal(parseIndexProvisioningMode(['--apply']), true);
  assert.throws(() => parseIndexProvisioningMode(['--apply', '--apply']), /Supported option/);
  assert.throws(() => parseIndexProvisioningMode(['--force']), /Supported option/);
});

test('plans a missing partial unique index without changing the existing index definition', () => {
  const existing: ExistingIndex = {
    name: '_id_',
    key: { _id: 1 },
    options: {},
  };
  const plan = planApplicationIndexes([required], [existing]);
  assert.deepEqual(plan.missing, [required]);
  assert.deepEqual(plan.incompatible, []);
});

test('blocks a same-key index when its unique or partial options are incompatible', () => {
  const plan = planApplicationIndexes([required], [{
    name: 'user_1_checkoutIdempotencyKey_1',
    key: required.key,
    options: { unique: true },
  }]);
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.incompatible.length, 1);
});

test('accepts equivalent schema and physical MongoDB text-index representations', () => {
  const plan = planApplicationIndexes([requiredProductTextIndex], [physicalProductTextIndex()]);
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.incompatible, []);
});

test('rejects a physical text index missing a declared text field', () => {
  const plan = planApplicationIndexes([requiredProductTextIndex], [physicalProductTextIndex({
    weights: { name: 1, description: 1, brand: 1 },
  })]);
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.incompatible.length, 1);
  assert.match(plan.incompatible[0].reason, /incompatible options/);
});

test('rejects different weights for a declared text field', () => {
  const plan = planApplicationIndexes([requiredProductTextIndex], [physicalProductTextIndex({
    weights: { name: 1, description: 1, brand: 1, sku: 2 },
  })]);
  assert.equal(plan.incompatible.length, 1);
});

test('rejects different default language and language override settings', () => {
  for (const options of [
    { default_language: 'spanish' },
    { language_override: 'locale' },
  ]) {
    const plan = planApplicationIndexes([requiredProductTextIndex], [physicalProductTextIndex(options)]);
    assert.equal(plan.incompatible.length, 1);
  }
});

test('rejects other incompatible text-index options', () => {
  const plan = planApplicationIndexes([requiredProductTextIndex], [physicalProductTextIndex({
    collation: { locale: 'en', strength: 2 },
  })]);
  assert.equal(plan.incompatible.length, 1);
});

test('rejects a genuine name collision with a different non-text index key', () => {
  const plan = planApplicationIndexes([requiredProductTextIndex], [{
    name: 'name_text_description_text_brand_text_sku_text',
    key: { name: 1 },
    options: {},
  }]);
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.incompatible.length, 1);
  assert.match(plan.incompatible[0].reason, /different key/);
});

test('keeps compound non-text key ordering strict', () => {
  const compound: RequiredIndex = {
    model: 'Order',
    collection: 'auraorders',
    key: { 'user.id': 1, createdAt: -1 },
    options: {},
  };
  const plan = planApplicationIndexes([compound], [{
    name: 'user.id_1_createdAt_-1',
    key: { createdAt: -1, 'user.id': 1 },
    options: {},
  }]);
  assert.equal(plan.incompatible.length, 1);
});

test('duplicate preflight honors sparse and partial index filters without exposing values', () => {
  const sparseIndex: RequiredIndex = {
    ...required,
    key: { 'paymentResult.razorpay_payment_id': 1 },
    options: { unique: true, sparse: true },
  };
  const pipeline = makeDuplicateKeyPipeline(sparseIndex);
  assert.deepEqual(pipeline[0], {
    $match: { $or: [{ 'paymentResult.razorpay_payment_id': { $exists: true } }] },
  });
  assert.deepEqual(pipeline[1], {
    $group: {
      _id: { key0: '$paymentResult.razorpay_payment_id' },
      duplicateCount: { $sum: 1 },
    },
  });
  assert.deepEqual(makeCaseInsensitiveDuplicatePipeline('email')[0], {
    $match: { email: { $type: 'string' } },
  });
});

test('does not create any indexes when a unique-index duplicate is found', async () => {
  let createCount = 0;
  const result = await provisionMissingIndexes(
    { missing: [required], incompatible: [] },
    {
      apply: true,
      hasDuplicates: async () => true,
      createIndex: async () => { createCount += 1; },
    },
  );
  assert.equal(createCount, 0);
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.duplicateIndexes, [required]);
});

test('preflights all missing unique indexes before creating any index', async () => {
  const first: RequiredIndex = {
    model: 'User',
    collection: 'aurausers',
    key: { id: 1 },
    options: { unique: true },
  };
  let createCount = 0;
  const result = await provisionMissingIndexes(
    { missing: [first, required], incompatible: [] },
    {
      apply: true,
      hasDuplicates: async (index) => index === required,
      createIndex: async () => { createCount += 1; },
    },
  );
  assert.equal(createCount, 0);
  assert.deepEqual(result.duplicateIndexes, [required]);
});

test('does not create any indexes when any existing index is incompatible', async () => {
  let createCount = 0;
  const plan = planApplicationIndexes([required], [{
    name: 'user_1_checkoutIdempotencyKey_1',
    key: required.key,
    options: { unique: true },
  }]);
  const result = await provisionMissingIndexes(plan, {
    apply: true,
    hasDuplicates: async () => false,
    createIndex: async () => { createCount += 1; },
  });
  assert.equal(createCount, 0);
  assert.equal(result.blockedByIncompatibleIndexes, true);
});

test('dry run checks unique-index safety but never creates indexes', async () => {
  let createCount = 0;
  let duplicateChecks = 0;
  const result = await provisionMissingIndexes(
    { missing: [required], incompatible: [] },
    {
      apply: false,
      hasDuplicates: async () => { duplicateChecks += 1; return false; },
      createIndex: async () => { createCount += 1; },
    },
  );
  assert.equal(duplicateChecks, 1);
  assert.equal(createCount, 0);
  assert.deepEqual(result.created, []);
});

test('apply creates only missing indexes after all unique checks pass', async () => {
  let createCount = 0;
  const result = await provisionMissingIndexes(
    { missing: [required], incompatible: [] },
    {
      apply: true,
      hasDuplicates: async () => false,
      createIndex: async () => { createCount += 1; },
    },
  );
  assert.equal(createCount, 1);
  assert.deepEqual(result.created, [required]);
});
