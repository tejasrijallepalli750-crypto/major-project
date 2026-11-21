import assert from 'node:assert/strict';
import test from 'node:test';
import { Order } from '../../src/types';
import { isDemoModeEnabled, isNonProductionMongoTarget } from '../config/demoMode';
import { buildDemoInventoryBulkPlan, DatabaseUnavailableError, db, InventoryError } from '../db/database';
import {
  canReleaseDemoReservation,
  DemoReservationReconciliationError,
  reconcileExpiredDemoReservations,
} from '../payments/demoReservationReconciler';
import { getValidDemoStock, makeDemoStockAllocationOperation, makeStockAllocationOperation } from './inventory';

const makeExpiredDemoOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'ord-expired-demo-reservation-test',
  orderNumber: 'AURA-EXPIRED-DEMO-TEST',
  user: { id: 'usr-expired-demo-test', name: 'Demo Test', email: 'demo-test@example.invalid' },
  orderItems: [{
    product: 'prod-expired-demo-test',
    name: 'Demo product',
    price: 100,
    quantity: 1,
    image: '',
    sku: 'DEMO-TEST',
    purchaseMode: 'demo',
  }],
  shippingAddress: {
    fullName: 'Demo Test',
    phone: '1234567890',
    street: 'Test Street',
    city: 'Test City',
    state: 'Test State',
    postalCode: '123456',
    country: 'India',
  },
  paymentMethod: 'Razorpay',
  itemsPrice: 100,
  shippingPrice: 150,
  taxPrice: 18,
  totalPrice: 268,
  isPaid: false,
  isDelivered: false,
  status: 'Pending',
  purchaseMode: 'demo',
  demoReservationStatus: 'reserved',
  demoReservationExpiresAt: new Date(0).toISOString(),
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  ...overrides,
});

test('demonstration inventory mode is disabled unless explicitly enabled', () => {
  assert.equal(isDemoModeEnabled({}), false);
  assert.equal(isDemoModeEnabled({ DEMO_MODE_ENABLED: 'false' }), false);
  assert.equal(isDemoModeEnabled({ DEMO_MODE_ENABLED: 'true' }), true);
  assert.equal(isDemoModeEnabled({ DEMO_MODE_ENABLED: 'true', NODE_ENV: 'production' }), false);
  const productionTestEnvironment = {
    NODE_ENV: 'production',
    PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED: 'true',
    RAZORPAY_KEY_ID: 'rzp_test_production-demo',
    RAZORPAY_KEY_SECRET: 'production-demo-test-secret',
  };
  assert.equal(isDemoModeEnabled(productionTestEnvironment), true);
  assert.equal(isDemoModeEnabled({ ...productionTestEnvironment, PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED: 'false' }), false);
  assert.equal(isDemoModeEnabled({ ...productionTestEnvironment, RAZORPAY_KEY_SECRET: '' }), false);
  assert.equal(isDemoModeEnabled({ ...productionTestEnvironment, RAZORPAY_KEY_ID: 'rzp_live_production-demo' }), false);
  assert.equal(isDemoModeEnabled({ ...productionTestEnvironment, RAZORPAY_KEY_ID: '' }), false);
  assert.equal(isDemoModeEnabled({
    ...productionTestEnvironment,
    DEMO_MODE_ENABLED: 'true',
    PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED: undefined,
  }), false);
  assert.equal(isDemoModeEnabled({
    ...productionTestEnvironment,
    PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED: 'true ',
    RAZORPAY_KEY_SECRET: 'short',
  }), false);
});

test('bulk demo inventory plans use bounded random stock and leave reserved products unchanged', () => {
  const products = [
    { id: 'bulk-product-1', name: 'First product', stock: 7, demoEligible: false, demoStock: 2 },
    { id: 'bulk-product-2', name: 'Reserved product', stock: 9, demoEligible: false, demoStock: 4 },
    { id: 'bulk-product-3', name: 'Third product', stock: 11, demoEligible: true, demoStock: 6 },
  ];
  const originalProducts = structuredClone(products);
  const randomArguments: Array<[number, number]> = [];
  const generatedStock = [1, 100];
  const plan = buildDemoInventoryBulkPlan(
    products,
    new Map([['bulk-product-2', 3]]),
    (minimum, maximumExclusive) => {
      randomArguments.push([minimum, maximumExclusive]);
      return generatedStock.shift() ?? 1;
    },
  );

  assert.deepEqual(products, originalProducts);
  assert.deepEqual(randomArguments, [[1, 101], [1, 101]]);
  assert.equal(plan.operations.length, 2);
  assert.deepEqual(plan.updateProducts.map(({ id }) => id), ['bulk-product-1', 'bulk-product-3']);
  assert.deepEqual(plan.skippedProducts, [{
    productId: 'bulk-product-2',
    name: 'Reserved product',
    reason: 'Active demo reservations exist; inventory was left unchanged.',
    activeReservedQuantity: 3,
  }]);

  const productIds: string[] = [];
  for (const operation of plan.operations) {
    assert.ok('updateOne' in operation);
    productIds.push(operation.updateOne.filter.id as string);
    assert.deepEqual(operation.updateOne.update, {
      $set: { demoEligible: true, demoStock: operation.updateOne.filter.id === 'bulk-product-1' ? 1 : 100 },
    });
    assert.notEqual(operation.updateOne.upsert, true);
  }
  assert.deepEqual(productIds, ['bulk-product-1', 'bulk-product-3']);
  assert.throws(
    () => buildDemoInventoryBulkPlan([{ id: 'invalid-stock', name: 'Invalid' }], new Map(), () => 101),
    InventoryError,
  );
});

test('bulk demo inventory plan updates existing product IDs without adding duplicate products', () => {
  const products = [
    { id: 'existing-1', name: 'Existing one' },
    { id: 'existing-2', name: 'Existing two' },
  ];
  const firstPlan = buildDemoInventoryBulkPlan(products, new Map(), () => 10);
  const secondPlan = buildDemoInventoryBulkPlan(products, new Map(), () => 20);
  for (const plan of [firstPlan, secondPlan]) {
    const ids = plan.operations.flatMap((operation) => 'updateOne' in operation ? [operation.updateOne.filter.id as string] : []);
    assert.deepEqual(ids, ['existing-1', 'existing-2']);
    assert.ok(plan.operations.every((operation) => 'updateOne' in operation && operation.updateOne.upsert !== true));
  }
});

test('bulk demo inventory database guard fails closed for production and unknown Mongo targets', () => {
  assert.equal(isNonProductionMongoTarget('aura_payment_test', 'mongodb://localhost:27017/aura_payment_test', 'development'), true);
  assert.equal(isNonProductionMongoTarget('aura-staging', 'mongodb+srv://cluster.example.mongodb.net/aura-staging', 'staging'), true);
  assert.equal(isNonProductionMongoTarget('aura_production', 'mongodb://localhost:27017/aura_production', 'development'), false);
  assert.equal(isNonProductionMongoTarget('aura_payment_test', 'mongodb://prod-db.example.com/aura_payment_test', 'development'), false);
  assert.equal(isNonProductionMongoTarget('aura_payment_test', 'mongodb://localhost:27017/aura_payment_test', 'production'), false);
  assert.equal(isNonProductionMongoTarget(undefined, 'mongodb://localhost:27017/aura_payment_test', 'development'), false);
});

test('demo stock allocation is separate and conditional on admin eligibility', () => {
  assert.deepEqual(makeDemoStockAllocationOperation('demo-product', 3), {
    filter: {
      id: 'demo-product',
      status: 'active',
      demoEligible: true,
      demoStock: {
        $gte: 3,
        $lte: Number.MAX_SAFE_INTEGER,
        $mod: [1, 0],
        $type: 'number',
      },
    },
    update: { $inc: { demoStock: -3 } },
  });
  assert.deepEqual(makeStockAllocationOperation('physical-product', 3).filter, {
    id: 'physical-product',
    status: 'active',
    inventoryStatus: 'verified',
    stock: { $gte: 3 },
  });
  assert.throws(() => makeDemoStockAllocationOperation('demo-product', 0), RangeError);
  assert.throws(
    () => makeDemoStockAllocationOperation('demo-product', Number.MAX_SAFE_INTEGER + 1),
    RangeError,
  );
});

test('demo stock accepts only nonnegative safe integers and allocation remains atomic', () => {
  assert.equal(getValidDemoStock(0), 0);
  assert.equal(getValidDemoStock(4), 4);
  for (const invalidStock of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '4', null, undefined]) {
    assert.equal(getValidDemoStock(invalidStock), 0);
  }
  const allocation = makeDemoStockAllocationOperation('demo-product', 2);
  assert.equal(allocation.filter.demoStock.$gte, 2);
  assert.deepEqual(allocation.update.$inc, { demoStock: -2 });
});

test('expired demo reservations release only after no unresolved gateway payments remain', () => {
  const now = 1_800_000_000_000;
  const expireBy = now / 1000 - 1;
  const expiredOrder = { status: 'attempted', expire_by: expireBy };
  assert.equal(canReleaseDemoReservation(expiredOrder, [], now, expireBy), true);
  assert.equal(canReleaseDemoReservation(expiredOrder, ['failed', 'failed'], now, expireBy), true);
  assert.equal(canReleaseDemoReservation(expiredOrder, ['captured'], now, expireBy), false);
  assert.equal(canReleaseDemoReservation(expiredOrder, ['authorized'], now, expireBy), false);
  assert.equal(canReleaseDemoReservation(expiredOrder, ['created'], now, expireBy), false);
  assert.equal(canReleaseDemoReservation(expiredOrder, ['unknown'], now, expireBy), false);
  assert.equal(canReleaseDemoReservation({ status: 'paid', expire_by: expireBy }, [], now, expireBy), false);
  assert.equal(canReleaseDemoReservation({ status: 'created' }, [], now, expireBy), false);
  assert.equal(canReleaseDemoReservation(expiredOrder, [], now - 2000, expireBy), false);
  assert.equal(canReleaseDemoReservation(expiredOrder, [], now, expireBy + 1), false);
});

test('expired demo reservations without a stored Razorpay order ID are retained', async () => {
  const environmentKeys = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NODE_ENV', 'DEMO_MODE_ENABLED'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindExpiredDemoReservations = db.findExpiredDemoReservations;
  const originalReleaseExpiredDemoReservation = db.releaseExpiredDemoReservation;
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const order = makeExpiredDemoOrder();
  let releaseCalls = 0;
  let gatewayLookupCalls = 0;
  let warning = '';

  process.env.RAZORPAY_KEY_ID = 'rzp_test_reservation-key';
  process.env.RAZORPAY_KEY_SECRET = 'reservation-test-secret-123';
  process.env.NODE_ENV = 'development';
  process.env.DEMO_MODE_ENABLED = 'true';
  db.findExpiredDemoReservations = async () => [order];
  db.releaseExpiredDemoReservation = async () => {
    releaseCalls += 1;
    return undefined;
  };
  globalThis.fetch = async () => {
    gatewayLookupCalls += 1;
    return new Response('{}', { status: 200 });
  };
  console.warn = (message?: unknown) => {
    warning = String(message);
  };

  try {
    const result = await reconcileExpiredDemoReservations();

    assert.deepEqual(result, { scanned: 1, released: 0, retained: 1, skipped: false });
    assert.equal(order.demoReservationStatus, 'reserved');
    assert.equal(releaseCalls, 0);
    assert.equal(gatewayLookupCalls, 0);
    assert.match(warning, /no stored Razorpay order ID/i);
    assert.match(warning, /manual\/provider reconciliation/i);
  } finally {
    db.findExpiredDemoReservations = originalFindExpiredDemoReservations;
    db.releaseExpiredDemoReservation = originalReleaseExpiredDemoReservation;
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('expired demo reservations without a verifiable provider expiry are retained without gateway lookups', async () => {
  const environmentKeys = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NODE_ENV', 'DEMO_MODE_ENABLED'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindExpiredDemoReservations = db.findExpiredDemoReservations;
  const originalReleaseExpiredDemoReservation = db.releaseExpiredDemoReservation;
  const originalFetch = globalThis.fetch;
  const order = makeExpiredDemoOrder({ razorpayOrderId: 'order_expiredtest123' });
  let releaseCalls = 0;
  let gatewayLookupCalls = 0;

  process.env.RAZORPAY_KEY_ID = 'rzp_test_reservation-key';
  process.env.RAZORPAY_KEY_SECRET = 'reservation-test-secret-123';
  process.env.NODE_ENV = 'development';
  process.env.DEMO_MODE_ENABLED = 'true';
  db.findExpiredDemoReservations = async () => [order];
  db.releaseExpiredDemoReservation = async () => {
    releaseCalls += 1;
    return undefined;
  };
  globalThis.fetch = async () => {
    gatewayLookupCalls += 1;
    return new Response('{}', { status: 200 });
  };

  try {
    const result = await reconcileExpiredDemoReservations();

    assert.deepEqual(result, { scanned: 1, released: 0, retained: 1, skipped: false });
    assert.equal(order.demoReservationStatus, 'reserved');
    assert.equal(releaseCalls, 0);
    assert.equal(gatewayLookupCalls, 0);
  } finally {
    db.findExpiredDemoReservations = originalFindExpiredDemoReservations;
    db.releaseExpiredDemoReservation = originalReleaseExpiredDemoReservation;
    globalThis.fetch = originalFetch;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('concurrent demo reservation reconciliation runs do not overlap', async () => {
  const environmentKeys = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NODE_ENV', 'DEMO_MODE_ENABLED'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindExpiredDemoReservations = db.findExpiredDemoReservations;
  let resolveQuery: ((orders: Order[]) => void) | undefined;

  process.env.RAZORPAY_KEY_ID = 'rzp_test_reservation-key';
  process.env.RAZORPAY_KEY_SECRET = 'reservation-test-secret-123';
  process.env.NODE_ENV = 'development';
  process.env.DEMO_MODE_ENABLED = 'true';
  db.findExpiredDemoReservations = () => new Promise((resolve) => {
    resolveQuery = resolve;
  });

  try {
    const firstRun = reconcileExpiredDemoReservations();
    assert.ok(resolveQuery);
    const concurrentRun = await reconcileExpiredDemoReservations();

    assert.deepEqual(concurrentRun, { scanned: 0, released: 0, retained: 0, skipped: true });
    resolveQuery([]);
    assert.deepEqual(await firstRun, { scanned: 0, released: 0, retained: 0, skipped: false });
  } finally {
    db.findExpiredDemoReservations = originalFindExpiredDemoReservations;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('database failures identify their stage and do not release reservations', async () => {
  const environmentKeys = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NODE_ENV', 'DEMO_MODE_ENABLED'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindExpiredDemoReservations = db.findExpiredDemoReservations;
  const originalReleaseExpiredDemoReservation = db.releaseExpiredDemoReservation;
  const originalFetch = globalThis.fetch;
  let releaseCalls = 0;

  process.env.RAZORPAY_KEY_ID = 'rzp_test_reservation-key';
  process.env.RAZORPAY_KEY_SECRET = 'reservation-test-secret-123';
  process.env.NODE_ENV = 'development';
  process.env.DEMO_MODE_ENABLED = 'true';
  db.releaseExpiredDemoReservation = async () => {
    releaseCalls += 1;
    return undefined;
  };

  try {
    db.findExpiredDemoReservations = async () => {
      throw new DatabaseUnavailableError();
    };
    await assert.rejects(reconcileExpiredDemoReservations(), (error: unknown) => {
      assert.ok(error instanceof DemoReservationReconciliationError);
      assert.equal(error.stage, 'querying expired reservations');
      assert.equal(error.sourceErrorName, 'DatabaseUnavailableError');
      return true;
    });
    assert.equal(releaseCalls, 0);

    const now = Date.now();
    const gatewayExpireBy = Math.floor((now - 60_000) / 1000);
    const order = makeExpiredDemoOrder({
      razorpayOrderId: 'order_databasefailure123',
      demoReservationExpiresAt: new Date(now - 30_000).toISOString(),
      demoGatewayOrderExpiresAt: new Date(gatewayExpireBy * 1000).toISOString(),
    });
    db.findExpiredDemoReservations = async () => [order];
    globalThis.fetch = async (input) => new Response(JSON.stringify(
      String(input).endsWith('/payments')
        ? { items: [] }
        : { status: 'created', expire_by: gatewayExpireBy },
    ), { status: 200, headers: { 'Content-Type': 'application/json' } });
    db.releaseExpiredDemoReservation = async () => {
      releaseCalls += 1;
      throw new DatabaseUnavailableError();
    };

    await assert.rejects(reconcileExpiredDemoReservations(), (error: unknown) => {
      assert.ok(error instanceof DemoReservationReconciliationError);
      assert.equal(error.stage, 'releasing eligible reservation');
      assert.equal(error.sourceErrorName, 'DatabaseUnavailableError');
      return true;
    });
    assert.equal(releaseCalls, 1);
    assert.equal(order.demoReservationStatus, 'reserved');
  } finally {
    db.findExpiredDemoReservations = originalFindExpiredDemoReservations;
    db.releaseExpiredDemoReservation = originalReleaseExpiredDemoReservation;
    globalThis.fetch = originalFetch;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('reconciliation errors sanitize untrusted error names', () => {
  const error = new Error('details are not exposed');
  error.name = 'secret database credentials';
  const reconciliationError = new DemoReservationReconciliationError(
    'querying expired reservations',
    error,
  );

  assert.equal(reconciliationError.sourceErrorName, 'UnknownError');
  assert.equal(reconciliationError.message, 'Demo reservation reconciliation failed while querying expired reservations.');
});
