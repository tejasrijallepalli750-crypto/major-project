import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { DemoPaymentAttempt, Order, User } from '../../src/types';
import { db } from '../db/database';
import { generateToken } from '../middleware/auth';
import paymentRoutes from './paymentRoutes';

test('payment routes enforce authentication, ownership, demo outcomes, and unpaid-state safety', async () => {
  const environmentKeys = ['JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NODE_ENV'] as const;
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
