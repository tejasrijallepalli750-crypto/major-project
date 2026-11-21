import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import crypto from 'node:crypto';
import express from 'express';
import Razorpay from 'razorpay';
import { DemoPaymentAttempt, Order, User } from '../../src/types';
import { db } from '../db/database';
import { generateToken } from '../middleware/auth';
import { reconcileExpiredDemoReservations } from '../payments/demoReservationReconciler';
import paymentRoutes from './paymentRoutes';

test('payment routes enforce authentication, ownership, demo outcomes, and unpaid-state safety', async () => {
  const environmentKeys = ['JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NODE_ENV', 'DEMO_MODE_ENABLED'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalFindOrderById = db.findOrderById;
  const originalRecordDemoPaymentAttempt = db.recordDemoPaymentAttempt;
  const user: User = {
    id: 'usr-payment-route-test',
    name: 'Payment Test',
    email: 'payment-test@example.invalid',
    role: 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const order: Order = {
    id: 'ord-payment-route-test',
    orderNumber: 'AURA-TEST-123',
    user: { id: user.id, name: user.name, email: user.email },
    orderItems: [],
    shippingAddress: {
      fullName: user.name,
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let currentOrder = order;

  process.env.JWT_SECRET = 'payment-route-test-secret-that-is-at-least-32-characters';
  process.env.NODE_ENV = 'development';
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  db.findUserById = async (id) => ({ ...user, id });
  db.findOrderById = async () => currentOrder;
  db.recordDemoPaymentAttempt = async (_orderId, _userId, attempt) => {
    const priorAttempt = currentOrder.demoPaymentAttempts?.find((saved) => saved.attemptId === attempt.attemptId);
    if (priorAttempt) return currentOrder;
    const savedAttempt: DemoPaymentAttempt = {
      ...attempt,
      mode: 'LOCAL_DEMO',
      amount: currentOrder.totalPrice,
      currency: 'INR',
      recordedAt: new Date().toISOString(),
    };
    currentOrder = {
      ...currentOrder,
      demoPaymentAttempts: [...(currentOrder.demoPaymentAttempts || []), savedAttempt],
      status: attempt.outcome === 'cancelled' ? 'Cancelled' : currentOrder.status,
    };
    return currentOrder;
  };

  const app = express();
  app.use(express.json());
  app.use('/api/payment', paymentRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/payment/create-order`;
    const token = generateToken(user);
    const invalidVerification = await fetch(`http://127.0.0.1:${address.port}/api/payment/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        orderId: order.id,
        razorpay_order_id: 'order_test',
        razorpay_payment_id: 3,
        razorpay_signature: 'signature',
      }),
    });
    assert.equal(invalidVerification.status, 400);
    assert.equal(
      (await invalidVerification.json() as { message: string }).message,
      'The payment response is incomplete or invalid.',
    );

    const send = (authorization?: string) => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
      },
      body: JSON.stringify({ orderId: order.id }),
    });

    assert.equal((await send()).status, 401);

    const unauthorized = await send(generateToken({ ...user, id: 'usr-other-customer' }));
    assert.equal(unauthorized.status, 403);

    const missingCredentials = await send(token);
    assert.equal(missingCredentials.status, 503);

    currentOrder = {
      ...order,
      purchaseMode: 'demo',
      demoReservationStatus: 'reserved',
      demoReservationExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    };
    process.env.DEMO_MODE_ENABLED = 'false';
    assert.equal((await send(token)).status, 503);
    process.env.DEMO_MODE_ENABLED = 'true';
    assert.equal((await send(token)).status, 503);
    currentOrder = {
      ...currentOrder,
      demoReservationExpiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    assert.equal((await send(token)).status, 409);
    process.env.NODE_ENV = 'production';
    assert.equal((await send(token)).status, 503);
    process.env.NODE_ENV = 'development';
    process.env.DEMO_MODE_ENABLED = 'false';
    currentOrder = order;

    db.findOrderById = async () => {
      throw Object.assign(new Error('temporary database failure'), { name: 'MongoNetworkError' });
    };
    const databaseFailure = await send(token);
    assert.equal(databaseFailure.status, 503);

    currentOrder = { ...order, paymentMethod: 'Local Demo', demoPaymentAttempts: [] };
    db.findOrderById = async () => currentOrder;
    const demoUrl = `http://127.0.0.1:${address.port}/api/payment/demo/complete`;
    const sendDemo = (attemptId: string, outcome: DemoPaymentAttempt['outcome'], authorization = token) => fetch(demoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
      },
      body: JSON.stringify({ orderId: order.id, attemptId, outcome }),
    });

    assert.equal((await sendDemo('11111111111111111111111111111111', 'success', '')).status, 401);
    assert.equal((await sendDemo('11111111111111111111111111111111', 'success', generateToken({ ...user, id: 'usr-other-customer' }))).status, 403);

    const success = await sendDemo('11111111111111111111111111111111', 'success');
    assert.equal(success.status, 200);
    const successOrder = (await success.json() as { order: Order }).order;
    assert.equal(successOrder.isPaid, false);
    assert.equal(successOrder.paymentResult, undefined);
    assert.equal(successOrder.demoPaymentAttempts?.[0].outcome, 'success');

    const replay = await sendDemo('11111111111111111111111111111111', 'success');
    assert.equal(replay.status, 200);
    assert.equal(currentOrder.demoPaymentAttempts?.length, 1);
    assert.equal((await sendDemo('11111111111111111111111111111111', 'failure')).status, 409);
    assert.equal((await sendDemo('22222222222222222222222222222222', 'failure')).status, 409);

    currentOrder = { ...order, paymentMethod: 'Local Demo', demoPaymentAttempts: [] };
    const failure = await sendDemo('33333333333333333333333333333333', 'failure');
    assert.equal(failure.status, 200);
    assert.equal((await failure.json() as { order: Order }).order.isPaid, false);

    const retrySuccess = await sendDemo('44444444444444444444444444444444', 'success');
    assert.equal(retrySuccess.status, 200);
    assert.equal((await retrySuccess.json() as { order: Order }).order.demoPaymentAttempts?.length, 2);

    currentOrder = { ...order, paymentMethod: 'Local Demo', demoPaymentAttempts: [] };
    const cancellation = await sendDemo('55555555555555555555555555555555', 'cancelled');
    assert.equal(cancellation.status, 200);
    const cancelledOrder = (await cancellation.json() as { order: Order }).order;
    assert.equal(cancelledOrder.status, 'Cancelled');
    assert.equal(cancelledOrder.isPaid, false);
    assert.equal((await sendDemo('66666666666666666666666666666666', 'success')).status, 409);

    process.env.NODE_ENV = 'production';
    assert.equal((await sendDemo('77777777777777777777777777777777', 'success')).status, 404);
  } finally {
    server.close();
    await once(server, 'close');
    db.findUserById = originalFindUserById;
    db.findOrderById = originalFindOrderById;
    db.recordDemoPaymentAttempt = originalRecordDemoPaymentAttempt;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('production TEST demo checkout creates a Razorpay order with supported fields and returns Checkout data', async () => {
  const environmentKeys = [
    'JWT_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'NODE_ENV',
    'DEMO_MODE_ENABLED',
    'PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED',
  ] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalFindOrderById = db.findOrderById;
  const originalUpdateOrderRazorpayId = db.updateOrderRazorpayId;
  const addResourcesDescriptor = Object.getOwnPropertyDescriptor(Razorpay.prototype, 'addResources');
  assert.ok(addResourcesDescriptor);
  const user: User = {
    id: 'usr-create-payment-test',
    name: 'Checkout Test',
    email: 'checkout-test@example.invalid',
    role: 'customer',
    phone: '9876543210',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const order: Order = {
    id: 'ord-create-payment-test',
    orderNumber: 'AURA-CREATE-PAYMENT-TEST',
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
    orderItems: [],
    shippingAddress: {
      fullName: user.name,
      phone: '1234567890',
      street: 'Test Street',
      city: 'Test City',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
      email: user.email,
    },
    purchaseMode: 'demo',
    demoReservationStatus: 'reserved',
    demoReservationExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    paymentMethod: 'Razorpay',
    itemsPrice: 100,
    shippingPrice: 150,
    taxPrice: 18,
    totalPrice: 268,
    isPaid: false,
    isDelivered: false,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const razorpayOrderId = 'order_testcreate123';
  let gatewayRequestJson = '';
  let gatewayCreateCalls = 0;
  let databaseUpdateCalls = 0;
  let persistedExpiryParameter: Date | undefined;

  process.env.JWT_SECRET = 'create-payment-route-test-secret-at-least-32-characters';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_create-payment-key';
  process.env.RAZORPAY_KEY_SECRET = 'create-payment-route-test-secret';
  process.env.NODE_ENV = 'production';
  process.env.DEMO_MODE_ENABLED = 'false';
  process.env.PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED = 'true';
  db.findUserById = async (id) => id === user.id ? user : undefined;
  db.findOrderById = async (id) => id === order.id ? order : undefined;
  db.updateOrderRazorpayId = async (orderId, createdOrderId, expiresAt) => {
    assert.equal(orderId, order.id);
    databaseUpdateCalls += 1;
    persistedExpiryParameter = expiresAt;
    return { ...order, razorpayOrderId: createdOrderId };
  };
  Object.defineProperty(Razorpay.prototype, 'addResources', {
    ...addResourcesDescriptor,
    value: function (this: Razorpay) {
      addResourcesDescriptor.value.call(this);
      Object.defineProperty(this.orders, 'create', {
        configurable: true,
        value: async (request: unknown) => {
          gatewayCreateCalls += 1;
          gatewayRequestJson = JSON.stringify(request);
          return { id: razorpayOrderId, amount: 26800, currency: 'INR' };
        },
      });
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/payment', paymentRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/payment/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${generateToken(user)}`,
      },
      body: JSON.stringify({ orderId: order.id }),
    });

    assert.equal(response.status, 200);
    const body = await response.json() as {
      success: boolean;
      data: { orderId: string; razorpayOrderId: string; amount: number; currency: string; keyId: string };
    };
    assert.equal(body.success, true);
    assert.deepEqual(body.data, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      razorpayOrderId,
      amount: 26800,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      customer: { name: user.name, email: user.email, phone: order.shippingAddress.phone },
    });
    const request = JSON.parse(gatewayRequestJson) as Record<string, unknown>;
    assert.deepEqual(Object.keys(request).sort(), ['amount', 'currency', 'notes', 'receipt']);
    assert.equal(request.amount, 26800);
    assert.equal(request.currency, 'INR');
    assert.equal(gatewayCreateCalls, 1);
    assert.equal(databaseUpdateCalls, 1);
    assert.equal(persistedExpiryParameter, undefined);
  } finally {
    server.close();
    await once(server, 'close');
    Object.defineProperty(Razorpay.prototype, 'addResources', addResourcesDescriptor);
    db.findUserById = originalFindUserById;
    db.findOrderById = originalFindOrderById;
    db.updateOrderRazorpayId = originalUpdateOrderRazorpayId;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('Razorpay order persistence failure reports safely and retains the demo reservation', async () => {
  const environmentKeys = ['JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NODE_ENV', 'DEMO_MODE_ENABLED'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalFindOrderById = db.findOrderById;
  const originalUpdateOrderRazorpayId = db.updateOrderRazorpayId;
  const originalFindExpiredDemoReservations = db.findExpiredDemoReservations;
  const originalReleaseExpiredDemoReservation = db.releaseExpiredDemoReservation;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const addResourcesDescriptor = Object.getOwnPropertyDescriptor(Razorpay.prototype, 'addResources');
  assert.ok(addResourcesDescriptor);
  const user: User = {
    id: 'usr-create-persistence-failure-test',
    name: 'Persistence Failure Test',
    email: 'persistence-failure@example.invalid',
    role: 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let currentOrder: Order = {
    id: 'ord-create-persistence-failure-test',
    orderNumber: 'AURA-CREATE-PERSISTENCE-FAILURE',
    user: { id: user.id, name: user.name, email: user.email },
    orderItems: [{
      product: 'prod-persistence-failure-test',
      name: 'Test product',
      price: 100,
      quantity: 1,
      image: '',
      sku: 'PERSISTENCE-TEST',
      purchaseMode: 'demo',
    }],
    shippingAddress: {
      fullName: user.name,
      phone: '1234567890',
      street: 'Test Street',
      city: 'Test City',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
    },
    purchaseMode: 'demo',
    demoReservationStatus: 'reserved',
    demoReservationExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    paymentMethod: 'Razorpay',
    itemsPrice: 100,
    shippingPrice: 150,
    taxPrice: 18,
    totalPrice: 268,
    isPaid: false,
    isDelivered: false,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let gatewayCreateCalls = 0;
  let databaseUpdateCalls = 0;
  let releaseCalls = 0;
  let gatewayLookupCalls = 0;
  const errorLog: string[] = [];

  process.env.JWT_SECRET = 'create-persistence-failure-test-secret-at-least-32-characters';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_persistence-failure-key';
  process.env.RAZORPAY_KEY_SECRET = 'persistence-failure-test-secret';
  process.env.NODE_ENV = 'development';
  process.env.DEMO_MODE_ENABLED = 'true';
  db.findUserById = async (id) => id === user.id ? user : undefined;
  db.findOrderById = async (id) => id === currentOrder.id ? currentOrder : undefined;
  db.updateOrderRazorpayId = async () => {
    databaseUpdateCalls += 1;
    throw Object.assign(new Error('sensitive database failure details'), { name: 'MongoNetworkError' });
  };
  db.findExpiredDemoReservations = async (before = new Date()) =>
    new Date(currentOrder.demoReservationExpiresAt || 0) <= before ? [currentOrder] : [];
  db.releaseExpiredDemoReservation = async () => {
    releaseCalls += 1;
    return undefined;
  };
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith('https://api.razorpay.com/')) {
      gatewayLookupCalls += 1;
      return new Response('{}', { status: 200 });
    }
    return originalFetch(input, init);
  };
  console.error = (...args: unknown[]) => {
    errorLog.push(args.map(String).join(' '));
  };
  Object.defineProperty(Razorpay.prototype, 'addResources', {
    ...addResourcesDescriptor,
    value: function (this: Razorpay) {
      addResourcesDescriptor.value.call(this);
      Object.defineProperty(this.orders, 'create', {
        configurable: true,
        value: async () => {
          gatewayCreateCalls += 1;
          return { id: 'order_persistencefailed123', amount: 26800, currency: 'INR' };
        },
      });
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/payment', paymentRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/payment/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${generateToken(user)}`,
      },
      body: JSON.stringify({ orderId: currentOrder.id }),
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      success: false,
      message: 'Unable to start the Razorpay checkout.',
    });
    assert.equal(gatewayCreateCalls, 1);
    assert.equal(databaseUpdateCalls, 1);
    assert.equal(currentOrder.demoReservationStatus, 'reserved');
    assert.equal(currentOrder.status, 'Pending');
    assert.equal(currentOrder.razorpayOrderId, undefined);
    assert.equal(releaseCalls, 0);
    assert.deepEqual(errorLog, ['[Payment] Create order error: MongoNetworkError']);

    currentOrder = {
      ...currentOrder,
      demoReservationExpiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    const reconciliation = await reconcileExpiredDemoReservations();
    assert.deepEqual(reconciliation, { scanned: 1, released: 0, retained: 1, skipped: false });
    assert.equal(currentOrder.demoReservationStatus, 'reserved');
    assert.equal(releaseCalls, 0);
    assert.equal(gatewayLookupCalls, 0);
  } finally {
    server.close();
    await once(server, 'close');
    Object.defineProperty(Razorpay.prototype, 'addResources', addResourcesDescriptor);
    db.findUserById = originalFindUserById;
    db.findOrderById = originalFindOrderById;
    db.updateOrderRazorpayId = originalUpdateOrderRazorpayId;
    db.findExpiredDemoReservations = originalFindExpiredDemoReservations;
    db.releaseExpiredDemoReservation = originalReleaseExpiredDemoReservation;
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('customers can retry only their own eligible Razorpay order using the verified existing gateway order', async () => {
  const environmentKeys = [
    'JWT_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'NODE_ENV',
    'DEMO_MODE_ENABLED',
    'PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED',
  ] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalFindOrderById = db.findOrderById;
  const addResourcesDescriptor = Object.getOwnPropertyDescriptor(Razorpay.prototype, 'addResources');
  assert.ok(addResourcesDescriptor);
  const user: User = {
    id: 'usr-payment-retry-owner',
    name: 'Payment Retry Customer',
    email: 'payment-retry@example.invalid',
    phone: '9876543210',
    role: 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const otherCustomer: User = {
    ...user,
    id: 'usr-payment-retry-other',
    email: 'other-payment-retry@example.invalid',
  };
  const razorpayOrderId = 'order_paymentretry123';
  let currentOrder: Order = {
    id: 'ord-payment-retry-route-test',
    orderNumber: 'AURA-PAYMENT-RETRY-ROUTE-TEST',
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
    orderItems: [],
    shippingAddress: {
      fullName: user.name,
      phone: '1234567890',
      email: user.email,
      street: 'Test Street',
      city: 'Test City',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
    },
    razorpayOrderId,
    paymentMethod: 'Razorpay',
    itemsPrice: 100,
    shippingPrice: 150,
    taxPrice: 18,
    totalPrice: 268,
    isPaid: false,
    isDelivered: false,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let gatewayOrder: Record<string, unknown> = {
    id: razorpayOrderId,
    amount: 26800,
    amount_paid: 0,
    amount_due: 26800,
    currency: 'INR',
    status: 'attempted',
  };
  let gatewayPayments: { count: number; items: Array<Record<string, unknown>> } = {
    count: 1,
    items: [{
      id: 'pay_retry_failed',
      order_id: razorpayOrderId,
      amount: 26800,
      currency: 'INR',
      status: 'failed',
    }],
  };
  let orderFetchCalls = 0;
  let paymentFetchCalls = 0;
  let createCalls = 0;

  process.env.JWT_SECRET = 'payment-retry-route-test-secret-at-least-32-characters';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_payment-retry-key';
  process.env.RAZORPAY_KEY_SECRET = 'payment-retry-route-test-secret';
  process.env.NODE_ENV = 'development';
  process.env.DEMO_MODE_ENABLED = 'true';
  delete process.env.PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED;
  db.findUserById = async (id) => id === user.id ? user : id === otherCustomer.id ? otherCustomer : undefined;
  db.findOrderById = async (id) => id === currentOrder.id ? currentOrder : undefined;
  Object.defineProperty(Razorpay.prototype, 'addResources', {
    ...addResourcesDescriptor,
    value: function (this: Razorpay) {
      addResourcesDescriptor.value.call(this);
      Object.defineProperty(this.orders, 'fetch', {
        configurable: true,
        value: async (requestedOrderId: string) => {
          orderFetchCalls += 1;
          assert.equal(requestedOrderId, razorpayOrderId);
          await new Promise((resolve) => setTimeout(resolve, 20));
          return gatewayOrder;
        },
      });
      Object.defineProperty(this.orders, 'fetchPayments', {
        configurable: true,
        value: async (requestedOrderId: string) => {
          paymentFetchCalls += 1;
          assert.equal(requestedOrderId, razorpayOrderId);
          return gatewayPayments;
        },
      });
      Object.defineProperty(this.orders, 'create', {
        configurable: true,
        value: async () => {
          createCalls += 1;
          throw new Error('Retry must not create another Razorpay order.');
        },
      });
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/payment', paymentRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/payment/retry-order`;
    const ownerToken = generateToken(user);
    const otherToken = generateToken(otherCustomer);
    const send = (authorization: string, orderId = currentOrder.id) => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorization}`,
      },
      body: JSON.stringify({ orderId }),
    });

    assert.equal((await send(otherToken)).status, 403);
    assert.equal(orderFetchCalls, 0);

    currentOrder = { ...currentOrder, razorpayOrderId: undefined };
    const missingGatewayOrder = await send(ownerToken);
    assert.equal(missingGatewayOrder.status, 409);
    assert.match((await missingGatewayOrder.json() as { message: string }).message, /payment recovery|required/i);
    assert.equal(orderFetchCalls, 0);
    assert.equal(createCalls, 0);
    currentOrder = {
      ...currentOrder,
      paymentResult: { id: 'pay_unresolved', status: 'authorized', amount: 268, currency: 'INR' },
    };
    const unresolvedWithoutGatewayOrder = await send(ownerToken);
    assert.equal(unresolvedWithoutGatewayOrder.status, 409);
    assert.match((await unresolvedWithoutGatewayOrder.json() as { message: string }).message, /payment recovery|required/i);
    currentOrder = { ...currentOrder, paymentResult: undefined };

    currentOrder = { ...currentOrder, razorpayOrderId, isPaid: true };
    assert.equal((await send(ownerToken)).status, 409);
    currentOrder = { ...currentOrder, isPaid: false, status: 'Cancelled' };
    assert.equal((await send(ownerToken)).status, 409);
    currentOrder = {
      ...currentOrder,
      status: 'Pending',
      purchaseMode: 'demo',
      demoReservationStatus: 'reserved',
      demoReservationExpiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    assert.equal((await send(ownerToken)).status, 409);
    assert.equal(orderFetchCalls, 0);
    currentOrder = {
      ...currentOrder,
      demoReservationStatus: 'released',
      demoReservationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    assert.equal((await send(ownerToken)).status, 409);
    currentOrder = {
      ...currentOrder,
      demoReservationStatus: 'reserved',
    };
    process.env.NODE_ENV = 'production';
    assert.equal((await send(ownerToken)).status, 503);
    process.env.NODE_ENV = 'development';
    assert.equal(orderFetchCalls, 0);

    currentOrder = {
      ...currentOrder,
      purchaseMode: 'physical',
      demoReservationStatus: undefined,
      demoReservationExpiresAt: undefined,
      status: 'Pending',
    };
    const [firstRetry, concurrentRetry] = await Promise.all([send(ownerToken), send(ownerToken)]);
    assert.equal(firstRetry.status, 200);
    assert.equal(concurrentRetry.status, 200);
    const retryBody = await firstRetry.json() as {
      success: boolean;
      data: { orderId: string; razorpayOrderId: string; amount: number; currency: string; customer: { phone: string } };
    };
    assert.equal(retryBody.success, true);
    assert.equal(retryBody.data.orderId, currentOrder.id);
    assert.equal(retryBody.data.razorpayOrderId, razorpayOrderId);
    assert.equal(retryBody.data.amount, 26800);
    assert.equal(retryBody.data.currency, 'INR');
    assert.equal(retryBody.data.customer.phone, currentOrder.shippingAddress.phone);
    assert.equal(currentOrder.user.phone, user.phone);
    assert.equal(orderFetchCalls, 1);
    assert.equal(paymentFetchCalls, 1);
    assert.equal(createCalls, 0);

    gatewayPayments = {
      count: 1,
      items: [{
        id: 'pay_retry_captured',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'captured',
      }],
    };
    assert.equal((await send(ownerToken)).status, 409);
    gatewayPayments = {
      count: 1,
      items: [{
        id: 'pay_retry_pending',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'created',
      }],
    };
    assert.equal((await send(ownerToken)).status, 409);

    gatewayOrder = { ...gatewayOrder, amount: 100 };
    gatewayPayments = { count: 0, items: [] };
    assert.equal((await send(ownerToken)).status, 409);
    assert.equal(createCalls, 0);
  } finally {
    server.close();
    await once(server, 'close');
    Object.defineProperty(Razorpay.prototype, 'addResources', addResourcesDescriptor);
    db.findUserById = originalFindUserById;
    db.findOrderById = originalFindOrderById;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('customers can refresh authoritative Razorpay status and retry only a verified open failed order', async () => {
  const environmentKeys = [
    'JWT_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'NODE_ENV',
    'DEMO_MODE_ENABLED',
    'PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED',
  ] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalFindOrderById = db.findOrderById;
  const originalUpdateOrderPayment = db.updateOrderPayment;
  const addResourcesDescriptor = Object.getOwnPropertyDescriptor(Razorpay.prototype, 'addResources');
  assert.ok(addResourcesDescriptor);
  const user: User = {
    id: 'usr-payment-refresh-owner',
    name: 'Payment Refresh Customer',
    email: 'payment-refresh@example.invalid',
    role: 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const otherCustomer: User = {
    ...user,
    id: 'usr-payment-refresh-other',
    email: 'other-payment-refresh@example.invalid',
  };
  const razorpayOrderId = 'order_payment_refresh_test';
  let currentOrder: Order = {
    id: 'ord-payment-refresh-test',
    orderNumber: 'AURA-PAYMENT-REFRESH-TEST',
    user: { id: user.id, name: user.name, email: user.email },
    orderItems: [],
    shippingAddress: {
      fullName: user.name,
      phone: '1234567890',
      email: user.email,
      street: 'Test Street',
      city: 'Test City',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
    },
    razorpayOrderId,
    purchaseMode: 'demo',
    demoReservationStatus: 'reserved',
    demoReservationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    paymentMethod: 'Razorpay',
    itemsPrice: 100,
    shippingPrice: 150,
    taxPrice: 18,
    totalPrice: 268,
    isPaid: false,
    isDelivered: false,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paymentResult: {
      id: 'pay_refresh_stale',
      status: 'authorized',
      amount: 268,
      currency: 'INR',
    },
  };
  let gatewayOrder: Record<string, unknown> = {
    id: razorpayOrderId,
    amount: 26800,
    amount_paid: 0,
    amount_due: 26800,
    currency: 'INR',
    status: 'attempted',
  };
  let gatewayPayments: { count: number; items: Array<Record<string, unknown>> } = {
    count: 2,
    items: [
      {
        id: 'pay_refresh_old_failed',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'failed',
        created_at: 10,
      },
      {
        id: 'pay_refresh_latest_failed',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'failed',
        created_at: 20,
      },
    ],
  };
  let verifiedPayment: Record<string, unknown> = {};
  let orderFetchCalls = 0;
  let paymentHistoryCalls = 0;
  let paymentFetchCalls = 0;
  let orderCreateCalls = 0;
  let updateCalls = 0;
  let providerGate: Promise<void> | undefined;
  let releaseProviderGate: (() => void) | undefined;

  process.env.JWT_SECRET = 'payment-refresh-test-secret-at-least-32-characters';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_payment-refresh-key';
  process.env.RAZORPAY_KEY_SECRET = 'payment-refresh-test-secret';
  process.env.NODE_ENV = 'development';
  process.env.DEMO_MODE_ENABLED = 'true';
  delete process.env.PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED;
  db.findUserById = async (id) => id === user.id ? user : id === otherCustomer.id ? otherCustomer : undefined;
  db.findOrderById = async (id) => id === currentOrder.id ? currentOrder : undefined;
  db.updateOrderPayment = async (_orderId, updatedPayment) => {
    updateCalls += 1;
    currentOrder = {
      ...currentOrder,
      paymentResult: updatedPayment,
      isPaid: updatedPayment.status === 'captured',
      status: updatedPayment.status === 'captured' ? 'Demo Completed' : 'Pending',
      ...(updatedPayment.status === 'captured' && currentOrder.purchaseMode === 'demo'
        ? { demoReservationStatus: 'consumed', demoReservationExpiresAt: undefined }
        : {}),
    };
    return currentOrder;
  };
  Object.defineProperty(Razorpay.prototype, 'addResources', {
    ...addResourcesDescriptor,
    value: function (this: Razorpay) {
      addResourcesDescriptor.value.call(this);
      Object.defineProperty(this.orders, 'fetch', {
        configurable: true,
        value: async (requestedOrderId: string) => {
          orderFetchCalls += 1;
          assert.equal(requestedOrderId, razorpayOrderId);
          await providerGate;
          return gatewayOrder;
        },
      });
      Object.defineProperty(this.orders, 'fetchPayments', {
        configurable: true,
        value: async (requestedOrderId: string) => {
          paymentHistoryCalls += 1;
          assert.equal(requestedOrderId, razorpayOrderId);
          await providerGate;
          return gatewayPayments;
        },
      });
      Object.defineProperty(this.orders, 'create', {
        configurable: true,
        value: async () => {
          orderCreateCalls += 1;
          throw new Error('Status refresh must not create another Razorpay order.');
        },
      });
      Object.defineProperty(this.payments, 'fetch', {
        configurable: true,
        value: async (paymentId: string) => {
          paymentFetchCalls += 1;
          assert.equal(paymentId, 'pay_refresh_captured');
          return verifiedPayment;
        },
      });
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/payment', paymentRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/payment/refresh-order-status`;
    const ownerToken = generateToken(user);
    const otherToken = generateToken(otherCustomer);
    const send = (authorization: string) => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorization}`,
      },
      body: JSON.stringify({ orderId: currentOrder.id }),
    });

    assert.equal((await send(otherToken)).status, 403);
    assert.equal(orderFetchCalls, 0);

    currentOrder = { ...currentOrder, razorpayOrderId: undefined, paymentResult: undefined };
    const missingGatewayOrder = await send(ownerToken);
    assert.equal(missingGatewayOrder.status, 200);
    const recovery = await missingGatewayOrder.json() as { state: string; message: string };
    assert.equal(recovery.state, 'recovery');
    assert.match(recovery.message, /manual payment recovery required/i);
    assert.equal(orderFetchCalls, 0);
    assert.equal(updateCalls, 0);

    currentOrder = { ...currentOrder, razorpayOrderId, paymentResult: {
      id: 'pay_refresh_stale',
      status: 'authorized',
      amount: 268,
      currency: 'INR',
    } };
    providerGate = new Promise((resolve) => {
      releaseProviderGate = resolve;
    });
    const firstFailedResult = send(ownerToken);
    for (let attempt = 0; attempt < 20 && paymentHistoryCalls === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const duplicateFailedResult = send(ownerToken);
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseProviderGate?.();
    const [failedResult, duplicateResult] = await Promise.all([firstFailedResult, duplicateFailedResult]);
    providerGate = undefined;
    assert.equal(failedResult.status, 200);
    assert.equal(duplicateResult.status, 200);
    assert.equal(orderFetchCalls, 1);
    assert.equal(paymentHistoryCalls, 1);
    const failedBody = await failedResult.json() as { state: string; message: string; order: Order };
    const duplicateBody = await duplicateResult.json() as { state: string; order: Order };
    assert.equal(failedBody.state, 'retry-ready');
    assert.equal(duplicateBody.state, 'retry-ready');
    assert.equal(failedBody.message, 'Payment failed. You can try again.');
    assert.equal(failedBody.order.paymentResult?.status, 'failed');
    assert.equal(failedBody.order.paymentResult?.id, 'pay_refresh_latest_failed');
    assert.equal(failedBody.order.status, 'Pending');
    assert.equal(failedBody.order.isPaid, false);
    assert.equal(failedBody.order.demoReservationStatus, 'reserved');
    assert.equal(updateCalls, 1);
    assert.equal(orderCreateCalls, 0);

    gatewayPayments = {
      count: 3,
      items: [
        {
          id: 'pay_refresh_created_1',
          order_id: razorpayOrderId,
          amount: 26800,
          currency: 'INR',
          status: 'created',
          created_at: 21,
        },
        {
          id: 'pay_refresh_created_2',
          order_id: razorpayOrderId,
          amount: 26800,
          currency: 'INR',
          status: 'created',
          created_at: 22,
        },
        {
          id: 'pay_refresh_created_3',
          order_id: razorpayOrderId,
          amount: 26800,
          currency: 'INR',
          status: 'created',
          created_at: 23,
        },
      ],
    };
    const pendingResult = await send(ownerToken);
    const pendingBody = await pendingResult.json() as { state: string; message: string };
    assert.equal(pendingBody.state, 'verification-pending');
    assert.match(pendingBody.message, /3 created payment attempts/i);
    assert.equal(updateCalls, 1);
    assert.equal(currentOrder.paymentResult?.status, 'failed');

    const validReservationExpiry = currentOrder.demoReservationExpiresAt;
    currentOrder = { ...currentOrder, demoReservationExpiresAt: new Date(0).toISOString() };
    const expiredReservationPendingResult = await send(ownerToken);
    const expiredReservationPendingBody = await expiredReservationPendingResult.json() as { state: string; message: string };
    assert.equal(expiredReservationPendingBody.state, 'verification-pending');
    assert.match(expiredReservationPendingBody.message, /demo reservation has expired or is unavailable/i);
    currentOrder = { ...currentOrder, demoReservationExpiresAt: validReservationExpiry };

    gatewayPayments = {
      count: 1,
      items: [{
        id: 'pay_refresh_authorized',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'authorized',
        created_at: 31,
      }],
    };
    const authorizedResult = await send(ownerToken);
    const authorizedBody = await authorizedResult.json() as { state: string; message: string };
    assert.equal(authorizedBody.state, 'verification-pending');
    assert.match(authorizedBody.message, /1 authorized payment attempt/i);

    gatewayPayments = {
      count: 1,
      items: [{
        id: 'pay_refresh_pending',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'pending',
        created_at: 32,
      }],
    };
    const pendingPaymentResult = await send(ownerToken);
    const pendingPaymentBody = await pendingPaymentResult.json() as { state: string; message: string };
    assert.equal(pendingPaymentBody.state, 'verification-pending');
    assert.match(pendingPaymentBody.message, /1 pending payment attempt/i);

    gatewayOrder = { ...gatewayOrder, status: 'expired' };
    gatewayPayments = {
      count: 1,
      items: [{
        id: 'pay_refresh_expired_created',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'created',
        created_at: 39,
      }],
    };
    const expiredUnresolvedResult = await send(ownerToken);
    const expiredUnresolvedBody = await expiredUnresolvedResult.json() as { state: string; message: string };
    assert.equal(expiredUnresolvedBody.state, 'verification-pending');
    assert.match(expiredUnresolvedBody.message, /order has expired.*1 created payment attempt/i);

    gatewayPayments = {
      count: 1,
      items: [{
        id: 'pay_refresh_expired_failed',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'failed',
        created_at: 40,
      }],
    };
    const expiredResult = await send(ownerToken);
    const expiredBody = await expiredResult.json() as { state: string; message: string };
    assert.equal(expiredBody.state, 'expired');
    assert.match(expiredBody.message, /Razorpay order expired/i);

    gatewayOrder = { ...gatewayOrder, status: 'paid', amount_paid: 26800, amount_due: 0 };
    gatewayPayments = {
      count: 1,
      items: [{
        id: 'pay_refresh_captured',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'captured',
        method: 'card',
      }],
    };
    verifiedPayment = {
      id: 'pay_refresh_captured',
      order_id: razorpayOrderId,
      amount: 26800,
      currency: 'INR',
      status: 'captured',
      method: 'card',
    };
    const capturedResult = await send(ownerToken);
    const capturedBody = await capturedResult.json() as { state: string; message: string; order: Order };
    assert.equal(capturedBody.state, 'paid');
    assert.equal(capturedBody.message, 'Payment successful.');
    assert.equal(capturedBody.order.isPaid, true);
    assert.equal(capturedBody.order.status, 'Demo Completed');
    assert.equal(capturedBody.order.demoReservationStatus, 'consumed');
    assert.equal(paymentFetchCalls, 1);
    assert.equal(orderCreateCalls, 0);
  } finally {
    server.close();
    await once(server, 'close');
    Object.defineProperty(Razorpay.prototype, 'addResources', addResourcesDescriptor);
    db.findUserById = originalFindUserById;
    db.findOrderById = originalFindOrderById;
    db.updateOrderPayment = originalUpdateOrderPayment;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('customers can cancel only their own unpaid order after provider payment becomes impossible', async () => {
  const environmentKeys = ['JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NODE_ENV'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalFindOrderById = db.findOrderById;
  const originalCancelOrderAfterVerifiedGatewayExpiry = db.cancelOrderAfterVerifiedGatewayExpiry;
  const originalCancelUnpaidOrderWithoutGateway = db.cancelUnpaidOrderWithoutGateway;
  const addResourcesDescriptor = Object.getOwnPropertyDescriptor(Razorpay.prototype, 'addResources');
  assert.ok(addResourcesDescriptor);
  const user: User = {
    id: 'usr-order-cancel-owner',
    name: 'Order Cancellation Customer',
    email: 'order-cancel@example.invalid',
    role: 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const otherCustomer: User = {
    ...user,
    id: 'usr-order-cancel-other',
    email: 'other-order-cancel@example.invalid',
  };
  const razorpayOrderId = 'order_safe_cancel_test';
  let currentOrder: Order = {
    id: 'ord-safe-cancel-test',
    orderNumber: 'AURA-SAFE-CANCEL-TEST',
    user: { id: user.id, name: user.name, email: user.email },
    orderItems: [],
    shippingAddress: {
      fullName: user.name,
      phone: '1234567890',
      email: user.email,
      street: 'Test Street',
      city: 'Test City',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
    },
    razorpayOrderId,
    purchaseMode: 'demo',
    demoReservationStatus: 'reserved',
    demoReservationExpiresAt: new Date(Date.now() - 1000).toISOString(),
    paymentMethod: 'Razorpay',
    itemsPrice: 100,
    shippingPrice: 150,
    taxPrice: 18,
    totalPrice: 268,
    isPaid: false,
    isDelivered: false,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let gatewayOrder: Record<string, unknown> = {
    id: razorpayOrderId,
    amount: 26800,
    amount_paid: 0,
    amount_due: 26800,
    currency: 'INR',
    status: 'attempted',
  };
  let gatewayPayments: { count: number; items: Array<Record<string, unknown>> } = {
    count: 1,
    items: [{
      id: 'pay_cancel_unresolved',
      order_id: razorpayOrderId,
      amount: 26800,
      currency: 'INR',
      status: 'created',
    }],
  };
  let orderFetchCalls = 0;
  let paymentFetchCalls = 0;
  let gatewayCancellationCalls = 0;
  let localCancellationCalls = 0;

  process.env.JWT_SECRET = 'order-cancel-test-secret-that-is-at-least-32-characters';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_order-cancel-key';
  process.env.RAZORPAY_KEY_SECRET = 'order-cancel-test-secret';
  process.env.NODE_ENV = 'development';
  db.findUserById = async (id) => id === user.id ? user : id === otherCustomer.id ? otherCustomer : undefined;
  db.findOrderById = async (id) => id === currentOrder.id ? currentOrder : undefined;
  db.cancelOrderAfterVerifiedGatewayExpiry = async (orderId, userId, gatewayId) => {
    gatewayCancellationCalls += 1;
    assert.equal(orderId, currentOrder.id);
    assert.equal(userId, user.id);
    assert.equal(gatewayId, razorpayOrderId);
    if (currentOrder.status !== 'Pending' || currentOrder.isPaid) return undefined;
    currentOrder = {
      ...currentOrder,
      status: 'Cancelled',
      demoReservationStatus: currentOrder.purchaseMode === 'demo' ? 'released' : currentOrder.demoReservationStatus,
    };
    return currentOrder;
  };
  db.cancelUnpaidOrderWithoutGateway = async (orderId, userId, paymentMethod) => {
    localCancellationCalls += 1;
    assert.equal(orderId, currentOrder.id);
    assert.equal(userId, user.id);
    assert.equal(paymentMethod, currentOrder.paymentMethod);
    currentOrder = { ...currentOrder, status: 'Cancelled' };
    return currentOrder;
  };
  Object.defineProperty(Razorpay.prototype, 'addResources', {
    ...addResourcesDescriptor,
    value: function (this: Razorpay) {
      addResourcesDescriptor.value.call(this);
      Object.defineProperty(this.orders, 'fetch', {
        configurable: true,
        value: async (requestedOrderId: string) => {
          orderFetchCalls += 1;
          assert.equal(requestedOrderId, razorpayOrderId);
          return gatewayOrder;
        },
      });
      Object.defineProperty(this.orders, 'fetchPayments', {
        configurable: true,
        value: async (requestedOrderId: string) => {
          paymentFetchCalls += 1;
          assert.equal(requestedOrderId, razorpayOrderId);
          return gatewayPayments;
        },
      });
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/payment', paymentRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/payment/cancel-order`;
    const statusUrl = `http://127.0.0.1:${address.port}/api/payment/cancellation-status/${currentOrder.id}`;
    const ownerToken = generateToken(user);
    const otherToken = generateToken(otherCustomer);
    const send = (authorization: string, orderId = currentOrder.id) => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorization}`,
      },
      body: JSON.stringify({ orderId }),
    });
    const checkStatus = (authorization: string) => fetch(statusUrl, {
      headers: { Authorization: `Bearer ${authorization}` },
    });

    assert.equal((await send(otherToken)).status, 403);
    assert.equal((await checkStatus(otherToken)).status, 403);
    assert.equal(orderFetchCalls, 0);
    assert.equal(gatewayCancellationCalls, 0);

    currentOrder = { ...currentOrder, razorpayOrderId: undefined };
    const missingGatewayOrder = await send(ownerToken);
    assert.equal(missingGatewayOrder.status, 409);
    assert.match((await missingGatewayOrder.json() as { message: string }).message, /orphaned provider order/i);
    assert.equal(orderFetchCalls, 0);
    assert.equal(gatewayCancellationCalls, 0);
    currentOrder = { ...currentOrder, razorpayOrderId };

    currentOrder = {
      ...currentOrder,
      paymentResult: { id: 'pay_local_unresolved', status: 'authorized', amount: 268, currency: 'INR' },
    };
    assert.equal((await send(ownerToken)).status, 409);
    assert.equal(orderFetchCalls, 0);
    currentOrder = { ...currentOrder, paymentResult: undefined };

    const activeStatus = await checkStatus(ownerToken);
    assert.equal(activeStatus.status, 200);
    const activeEligibility = await activeStatus.json() as { canCancel: boolean; message: string };
    assert.equal(activeEligibility.canCancel, false);
    assert.match(activeEligibility.message, /can no longer accept payment/i);

    const activeGatewayOrder = await send(ownerToken);
    assert.equal(activeGatewayOrder.status, 409);
    assert.match((await activeGatewayOrder.json() as { message: string }).message, /can no longer accept payment/i);
    assert.equal(currentOrder.status, 'Pending');
    assert.equal(currentOrder.demoReservationStatus, 'reserved');
    assert.equal(gatewayCancellationCalls, 0);

    gatewayOrder = { ...gatewayOrder, status: 'expired' };
    const unresolvedStatus = await checkStatus(ownerToken);
    const unresolvedEligibility = await unresolvedStatus.json() as { canCancel: boolean; message: string };
    assert.equal(unresolvedEligibility.canCancel, false);
    assert.match(unresolvedEligibility.message, /captured or unresolved/i);
    const unresolvedGatewayAttempt = await send(ownerToken);
    assert.equal(unresolvedGatewayAttempt.status, 409);
    assert.match((await unresolvedGatewayAttempt.json() as { message: string }).message, /captured or unresolved/i);
    assert.equal(currentOrder.status, 'Pending');
    assert.equal(currentOrder.demoReservationStatus, 'reserved');
    assert.equal(gatewayCancellationCalls, 0);

    gatewayPayments = {
      count: 1,
      items: [{
        id: 'pay_cancel_failed',
        order_id: razorpayOrderId,
        amount: 26800,
        currency: 'INR',
        status: 'failed',
      }],
    };
    const safeStatus = await checkStatus(ownerToken);
    assert.equal((await safeStatus.json() as { canCancel: boolean }).canCancel, true);
    const safeCancellation = await send(ownerToken);
    assert.equal(safeCancellation.status, 200);
    const cancelled = await safeCancellation.json() as { data: Order };
    assert.equal(cancelled.data.status, 'Cancelled');
    assert.equal(cancelled.data.demoReservationStatus, 'released');
    assert.equal(gatewayCancellationCalls, 1);
    assert.equal(currentOrder.status, 'Cancelled');

    currentOrder = {
      ...currentOrder,
      razorpayOrderId: undefined,
      purchaseMode: 'physical',
      demoReservationStatus: undefined,
      paymentMethod: 'Cash on Delivery',
      status: 'Pending',
    };
    const cashOnDeliveryCancellation = await send(ownerToken);
    assert.equal(cashOnDeliveryCancellation.status, 200);
    assert.equal(localCancellationCalls, 1);
  } finally {
    server.close();
    await once(server, 'close');
    Object.defineProperty(Razorpay.prototype, 'addResources', addResourcesDescriptor);
    db.findUserById = originalFindUserById;
    db.findOrderById = originalFindOrderById;
    db.cancelOrderAfterVerifiedGatewayExpiry = originalCancelOrderAfterVerifiedGatewayExpiry;
    db.cancelUnpaidOrderWithoutGateway = originalCancelUnpaidOrderWithoutGateway;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('authenticated demo customers are paid only after valid signature and captured Razorpay TEST payment', async () => {
  const environmentKeys = ['JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NODE_ENV', 'DEMO_MODE_ENABLED'] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalFindOrderById = db.findOrderById;
  const originalUpdateOrderPayment = db.updateOrderPayment;
  const addResourcesDescriptor = Object.getOwnPropertyDescriptor(Razorpay.prototype, 'addResources');
  assert.ok(addResourcesDescriptor);
  const user: User = {
    id: 'usr-demo-payment-customer',
    name: 'Demo Payment Customer',
    email: 'demo-payment-customer@example.invalid',
    role: 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const otherCustomer: User = {
    ...user,
    id: 'usr-other-demo-payment-customer',
    email: 'other-demo-payment-customer@example.invalid',
  };
  const paymentId = 'pay_demo_test_123';
  const order: Order = {
    id: 'ord-demo-payment-test',
    orderNumber: 'AURA-DEMO-PAYMENT-TEST',
    user: { id: user.id, name: user.name, email: user.email },
    orderItems: [],
    shippingAddress: {
      fullName: user.name,
      phone: '1234567890',
      street: 'Demo Test Street',
      city: 'Test City',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
    },
    razorpayOrderId: 'order_demo_test_123',
    purchaseMode: 'demo',
    demoReservationStatus: 'reserved',
    demoReservationExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    paymentMethod: 'Razorpay',
    itemsPrice: 100,
    shippingPrice: 150,
    taxPrice: 18,
    totalPrice: 268,
    isPaid: false,
    isDelivered: false,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let currentOrder = order;
  let gatewayFetchCalls = 0;
  let updateCalls = 0;

  process.env.JWT_SECRET = 'demo-payment-route-test-secret-at-least-32-characters';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_demo-payment-key';
  process.env.RAZORPAY_KEY_SECRET = 'demo-payment-route-test-secret';
  process.env.NODE_ENV = 'development';
  process.env.DEMO_MODE_ENABLED = 'true';
  db.findUserById = async (id) => id === user.id ? user : id === otherCustomer.id ? otherCustomer : undefined;
  db.findOrderById = async (id) => id === currentOrder.id ? currentOrder : undefined;
  db.updateOrderPayment = async (_orderId, result) => {
    updateCalls += 1;
    currentOrder = {
      ...currentOrder,
      paymentResult: result,
      isPaid: result.status === 'captured',
      status: result.status === 'captured' ? 'Demo Completed' : currentOrder.status,
    };
    return currentOrder;
  };
  Object.defineProperty(Razorpay.prototype, 'addResources', {
    ...addResourcesDescriptor,
    value: function (this: Razorpay) {
      addResourcesDescriptor.value.call(this);
      Object.defineProperty(this.payments, 'fetch', {
        configurable: true,
        value: async (requestedPaymentId: string) => {
          gatewayFetchCalls += 1;
          assert.equal(requestedPaymentId, paymentId);
          return {
            id: paymentId,
            order_id: order.razorpayOrderId,
            amount: 26800,
            currency: 'INR',
            status: 'captured',
          };
        },
      });
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/payment', paymentRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/payment/verify`;
    const token = generateToken(user);
    const otherCustomerToken = generateToken(otherCustomer);
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${order.razorpayOrderId}|${paymentId}`)
      .digest('hex');
    const send = (authorization: string, providedSignature: string) => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorization}`,
      },
      body: JSON.stringify({
        orderId: order.id,
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: providedSignature,
      }),
    });

    assert.equal((await send(otherCustomerToken, signature)).status, 403);
    assert.equal(gatewayFetchCalls, 0);
    assert.equal((await send(token, 'invalid-signature')).status, 400);
    assert.equal(gatewayFetchCalls, 0);
    assert.equal(updateCalls, 0);

    const verified = await send(token, signature);
    assert.equal(verified.status, 200);
    assert.equal(gatewayFetchCalls, 1);
    assert.equal(updateCalls, 1);
    assert.equal(currentOrder.isPaid, true);
    assert.equal(currentOrder.paymentResult?.status, 'captured');
    assert.equal(currentOrder.paymentResult?.amount, 268);
  } finally {
    server.close();
    await once(server, 'close');
    if (addResourcesDescriptor) {
      Object.defineProperty(Razorpay.prototype, 'addResources', addResourcesDescriptor);
    }
    db.findUserById = originalFindUserById;
    db.findOrderById = originalFindOrderById;
    db.updateOrderPayment = originalUpdateOrderPayment;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
