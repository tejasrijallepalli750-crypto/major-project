import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { Order, Product, User } from '../../src/types';
import { db, IdempotencyConflictError } from '../db/database';
import { generateToken } from '../middleware/auth';
import orderRoutes from './orderRoutes';
import { createCheckoutIdempotencyManager, CheckoutOrderRequest } from '../../src/utils/checkoutIdempotency';

test('checkout idempotency keys follow checkout intent and remain stable for exact retries', async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const generatedKeys = [
    '11111111111111111111111111111111',
    '22222222222222222222222222222222',
    '33333333333333333333333333333333',
    '44444444444444444444444444444444',
  ];
  let generatedCount = 0;
  const createManager = () => createCheckoutIdempotencyManager(storage, () => generatedKeys[generatedCount++]);
  const request: CheckoutOrderRequest = {
    orderItems: [{ productId: 'product-1', quantity: 1 }],
    shippingAddress: {
      fullName: 'Test Customer',
      phone: '1234567890',
      street: '1 Test Road',
      city: 'Test City',
      district: '',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
    },
    paymentMethod: 'Razorpay',
  };

  const firstManager = createManager();
  const firstKey = await firstManager.getKey(request);
  assert.equal(firstKey, generatedKeys[0]);

  const remountedManager = createManager();
  assert.equal(await remountedManager.getKey(request), firstKey);
  assert.equal(await remountedManager.getKey({
    ...request,
    orderItems: [{ productId: 'product-1', quantity: 2 }],
  }), generatedKeys[1]);
  assert.equal(generatedCount, 2);

  const changedAddress: CheckoutOrderRequest = {
    ...request,
    shippingAddress: { ...request.shippingAddress, city: 'Another City' },
  };
  const changedKey = await remountedManager.getKey(changedAddress);
  assert.equal(changedKey, generatedKeys[2]);
  await remountedManager.clearKey(changedAddress, changedKey);
  assert.equal(await createManager().getKey(changedAddress), generatedKeys[3]);
  assert.equal(generatedCount, 4);
});

test('order API authenticates, recalculates authoritative totals, and reuses idempotent submissions', async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFindUserById = db.findUserById;
  const originalFindProductById = db.findProductById;
  const originalFindOrderByCheckoutRequest = db.findOrderByCheckoutRequest;
  const originalCreateOrder = db.createOrder;
  const user: User = {
    id: 'usr-order-route-test',
    name: 'Order Test',
    email: 'order-test@example.invalid',
    role: 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const product: Product = {
    id: 'prod-order-route-test',
    name: 'Test Product',
    description: 'Product used by the route test.',
    price: 100,
    category: 'Test',
    image: '/images/products/test.jpg',
    stock: 10,
    sku: 'TEST-ORDER',
    status: 'active',
    rating: 0,
    numReviews: 0,
    brand: 'AURA',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const savedOrders = new Map<string, { order: Order; hash: string }>();
  let createCalls = 0;

  process.env.JWT_SECRET = 'order-route-test-secret-that-is-at-least-32-characters';
  db.findUserById = async (id) => ({ ...user, id });
  db.findProductById = async (id) => id === product.id ? product : undefined;
  db.findOrderByCheckoutRequest = async (userId, key, hash) => {
    const saved = savedOrders.get(`${userId}:${key}`);
    if (!saved) return undefined;
    if (saved.hash !== hash || saved.order.status === 'Cancelled') throw new IdempotencyConflictError();
    return saved.order;
  };
  db.createOrder = async (order, key, hash) => {
    createCalls += 1;
    const created: Order = {
      ...order,
      id: 'ord-order-route-test',
      orderNumber: 'AURA-TEST-ORDER',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    savedOrders.set(`${order.user.id}:${key}`, { order: created, hash });
    return created;
  };

  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/orders`;
    const idempotencyKey = '11111111111111111111111111111111';
    const payload = {
      orderItems: [{ productId: product.id, quantity: 2, price: 0.01 }],
      shippingAddress: {
        fullName: 'Order Test',
        phone: '1234567890',
        street: 'Test Street',
        city: 'Test City',
        state: 'Test State',
        postalCode: '123456',
        country: 'India',
      },
      paymentMethod: 'Local Demo',
    };
    const send = (body: unknown, token?: string, key = idempotencyKey) => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    assert.equal((await send(payload)).status, 401);
    const token = generateToken(user);
    const first = await send(payload, token);
    assert.equal(first.status, 201);
    const firstOrder = (await first.json() as { data: Order }).data;
    assert.equal(firstOrder.itemsPrice, 200);
    assert.equal(firstOrder.shippingPrice, 150);
    assert.equal(firstOrder.taxPrice, 36);
    assert.equal(firstOrder.totalPrice, 386);
    assert.equal(firstOrder.orderItems[0].price, product.price);

    const replay = await send(payload, token);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as { data: Order }).data.id, firstOrder.id);
    assert.equal(createCalls, 1);

    const changedRequest = await send({
      ...payload,
      shippingAddress: { ...payload.shippingAddress, city: 'Different City' },
    }, token);
    assert.equal(changedRequest.status, 409);

    const changedPayload = {
      ...payload,
      orderItems: [{ productId: product.id, quantity: 3 }],
      shippingAddress: { ...payload.shippingAddress, city: 'Different City' },
    };
    const changedKey = '22222222222222222222222222222222';
    const changedIntent = await send(changedPayload, token, changedKey);
    assert.equal(changedIntent.status, 201);
    const changedOrder = (await changedIntent.json() as { data: Order }).data;
    assert.equal(changedOrder.itemsPrice, 300);
    assert.equal(createCalls, 2);

    const repeatedChangedIntent = await send(changedPayload, token, changedKey);
    assert.equal(repeatedChangedIntent.status, 200);
    assert.equal((await repeatedChangedIntent.json() as { data: Order }).data.id, changedOrder.id);
    assert.equal(createCalls, 2);

  } finally {
    server.close();
    await once(server, 'close');
    db.findUserById = originalFindUserById;
    db.findProductById = originalFindProductById;
    db.findOrderByCheckoutRequest = originalFindOrderByCheckoutRequest;
    db.createOrder = originalCreateOrder;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
