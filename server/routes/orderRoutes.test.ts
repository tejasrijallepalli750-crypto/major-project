import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { Order, Product, User } from '../../src/types';
import { db, IdempotencyConflictError, InventoryError } from '../db/database';
import { IOrderDocument, OrderModel } from '../models/Order';
import { generateToken } from '../middleware/auth';
import orderRoutes from './orderRoutes';
import { createCheckoutIdempotencyManager, CheckoutOrderRequest } from '../../src/utils/checkoutIdempotency';
import { makeStockAllocationOperation } from '../orders/inventory';

test('atomic stock allocation requires physically verified inventory', () => {
  assert.deepEqual(makeStockAllocationOperation('prod-verified', 2).filter, {
    id: 'prod-verified',
    status: 'active',
    inventoryStatus: 'verified',
    stock: { $gte: 2 },
  });
});

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
      email: 'delivery@example.invalid',
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
  const environmentKeys = [
    'JWT_SECRET',
    'DEMO_MODE_ENABLED',
    'PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'NODE_ENV',
  ] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalFindProductById = db.findProductById;
  const originalFindOrderByCheckoutRequest = db.findOrderByCheckoutRequest;
  const originalFindOrderById = db.findOrderById;
  const originalFindOrdersByUser = db.findOrdersByUser;
  const originalFindAllOrders = db.findAllOrders;
  const originalCreateOrder = db.createOrder;
  const user: User = {
    id: 'usr-order-route-test',
    name: 'Order Test',
    email: 'order-test@example.invalid',
    role: 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const secondUser: User = {
    ...user,
    id: 'usr-order-route-second-customer',
    email: 'second-order-test@example.invalid',
  };
  const admin: User = {
    ...user,
    id: 'usr-order-route-admin',
    email: 'order-route-admin@example.invalid',
    role: 'admin',
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
    inventoryMode: 'simulated-demo',
    inventoryStatus: 'verified',
    rating: 0,
    numReviews: 0,
    brand: 'AURA',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const savedOrders = new Map<string, { order: Order; hash: string }>();
  const savedOrdersById = new Map<string, Order>();
  let createCalls = 0;

  process.env.JWT_SECRET = 'order-route-test-secret-that-is-at-least-32-characters';
  process.env.DEMO_MODE_ENABLED = 'false';
  process.env.NODE_ENV = 'development';
  delete process.env.PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  db.findUserById = async (id) => {
    if (id === user.id) return user;
    if (id === secondUser.id) return secondUser;
    if (id === admin.id) return admin;
    return undefined;
  };
  db.findProductById = async (id) => id === product.id ? product : undefined;
  db.findOrderByCheckoutRequest = async (userId, key, hash) => {
    const saved = savedOrders.get(`${userId}:${key}`);
    if (!saved) return undefined;
    if (saved.hash !== hash || saved.order.status === 'Cancelled') throw new IdempotencyConflictError();
    return saved.order;
  };
  db.createOrder = async (order, key, hash) => {
    createCalls += 1;
    if (order.purchaseMode === 'demo') {
      const demoQuantity = order.orderItems.reduce((sum, item) => sum + item.quantity, 0);
      if (product.demoStock! < demoQuantity) throw new InventoryError('Insufficient demo inventory in test allocation.');
      product.demoStock = product.demoStock! - demoQuantity;
    }
    const created: Order = {
      ...order,
      id: `ord-order-route-test-${order.user.id}`,
      orderNumber: 'AURA-TEST-ORDER',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    savedOrders.set(`${order.user.id}:${key}`, { order: created, hash });
    savedOrdersById.set(created.id, created);
    return created;
  };
  db.findOrderById = async (id) => savedOrdersById.get(id);
  db.findOrdersByUser = async (userId) => [...savedOrdersById.values()]
    .filter((savedOrder) => savedOrder.user.id === userId);
  db.findAllOrders = async () => [...savedOrdersById.values()];

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
        email: 'delivery@example.invalid',
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
    const cartValidation = await fetch(`${url}/validate-cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: product.id, quantity: 2 }] }),
    });
    assert.equal(cartValidation.status, 200);
    const validatedCart = await cartValidation.json() as { data: { items: Array<{ inventoryMode?: string; inventoryStatus?: string }> } };
    assert.equal(validatedCart.data.items[0].inventoryMode, 'simulated-demo');
    assert.equal(validatedCart.data.items[0].inventoryStatus, 'verified');

    const token = generateToken(user);
    const invalidBody = await send({
      ...payload,
      orderItems: [{ productId: product.id, quantity: '2' }],
    }, token);
    assert.equal(invalidBody.status, 400);
    assert.equal(
      (await invalidBody.json() as { message: string }).message,
      'Each item must include a valid product and quantity.',
    );
    assert.equal(createCalls, 0);

    const invalidDeliveryEmail = await send({
      ...payload,
      shippingAddress: { ...payload.shippingAddress, email: 'not-an-email' },
    }, token, '99999999999999999999999999999999');
    assert.equal(invalidDeliveryEmail.status, 400);
    assert.match(
      (await invalidDeliveryEmail.json() as { message: string }).message,
      /complete delivery shipping address/i,
    );
    assert.equal(createCalls, 0);

    const first = await send(payload, token);
    assert.equal(first.status, 201);
    const firstOrder = (await first.json() as { data: Order }).data;
    assert.equal(firstOrder.itemsPrice, 200);
    assert.equal(firstOrder.shippingPrice, 150);
    assert.equal(firstOrder.taxPrice, 36);
    assert.equal(firstOrder.totalPrice, 386);
    assert.equal(firstOrder.orderItems[0].price, product.price);
    assert.equal(firstOrder.shippingAddress.email, 'delivery@example.invalid');
    assert.equal(firstOrder.orderItems[0].inventoryMode, 'simulated-demo');
    assert.equal(firstOrder.orderItems[0].inventoryStatus, 'verified');

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

    const overStockRequest = await send({
      ...payload,
      orderItems: [{ productId: product.id, quantity: product.stock + 1 }],
    }, token, '33333333333333333333333333333333');
    assert.equal(overStockRequest.status, 400);
    assert.equal(createCalls, 2);

    product.inventoryStatus = 'unverified';
    const unverifiedCart = await fetch(`${url}/validate-cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }] }),
    });
    assert.equal(unverifiedCart.status, 400);
    assert.match((await unverifiedCart.json() as { errors: string[] }).errors[0], /not been physically verified/i);

    const unverifiedOrder = await send(payload, token, '44444444444444444444444444444444');
    assert.equal(unverifiedOrder.status, 409);
    assert.match((await unverifiedOrder.json() as { message: string }).message, /physically verifies its inventory/i);
    assert.equal(createCalls, 2);

    process.env.DEMO_MODE_ENABLED = 'true';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_demo-order-route';
    process.env.RAZORPAY_KEY_SECRET = 'demo-order-route-test-secret-at-least-12';
    product.demoModeEnabled = true;
    product.demoPurchasingAvailable = true;
    product.demoEligible = true;
    product.demoStock = 3;
    const demoCart = await fetch(`${url}/validate-cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: product.id, quantity: 2 }] }),
    });
    assert.equal(demoCart.status, 200);
    const validatedDemoCart = await demoCart.json() as {
      data: { items: Array<{ stock: number; purchaseMode?: string }> };
    };
    assert.equal(validatedDemoCart.data.items[0].stock, 3);
    assert.equal(validatedDemoCart.data.items[0].purchaseMode, 'demo');

    const demoPayload = {
      ...payload,
      paymentMethod: 'Razorpay',
      orderItems: [{ productId: product.id, quantity: 1 }],
    };
    const unauthenticatedDemo = await send(demoPayload);
    assert.equal(unauthenticatedDemo.status, 401);

    const demoOrderResponse = await send(demoPayload, token, '55555555555555555555555555555555');
    assert.equal(demoOrderResponse.status, 201);
    const demoOrder = (await demoOrderResponse.json() as { data: Order }).data;
    assert.equal(demoOrder.purchaseMode, 'demo');
    assert.equal(demoOrder.orderItems[0].purchaseMode, 'demo');
    assert.equal(product.stock, 10);
    assert.equal(product.demoStock, 2);
    assert.equal(createCalls, 3);

    const secondCustomerToken = generateToken(secondUser);
    const secondCustomerPurchase = await send(
      demoPayload,
      secondCustomerToken,
      'cccccccccccccccccccccccccccccccc',
    );
    assert.equal(secondCustomerPurchase.status, 201);
    const secondCustomerOrder = (await secondCustomerPurchase.json() as { data: Order }).data;
    assert.equal(secondCustomerOrder.user.id, secondUser.id);
    assert.equal(secondCustomerOrder.purchaseMode, 'demo');
    assert.equal(product.demoStock, 1);
    assert.equal(createCalls, 4);

    const ownHistory = await fetch(`${url}/my-orders`, {
      headers: { Authorization: `Bearer ${secondCustomerToken}` },
    });
    assert.equal(ownHistory.status, 200);
    const ownOrders = (await ownHistory.json() as { data: Order[] }).data;
    assert.deepEqual(ownOrders.map((savedOrder) => savedOrder.id), [secondCustomerOrder.id]);

    assert.equal((await fetch(url)).status, 401);
    const customerAllOrders = await fetch(url, {
      headers: { Authorization: `Bearer ${secondCustomerToken}` },
    });
    assert.equal(customerAllOrders.status, 403);
    const adminAllOrders = await fetch(url, {
      headers: { Authorization: `Bearer ${generateToken(admin)}` },
    });
    assert.equal(adminAllOrders.status, 200);
    const allOrders = (await adminAllOrders.json() as { data: Order[] }).data;
    assert.deepEqual(new Set(allOrders.map((savedOrder) => savedOrder.user.id)), new Set([user.id, secondUser.id]));
    assert.equal(allOrders.find((savedOrder) => savedOrder.id === secondCustomerOrder.id)?.shippingAddress.email, 'delivery@example.invalid');

    const otherCustomerOrder = await fetch(`${url}/${demoOrder.id}`, {
      headers: { Authorization: `Bearer ${secondCustomerToken}` },
    });
    assert.equal(otherCustomerOrder.status, 403);
    const ownerOrder = await fetch(`${url}/${demoOrder.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(ownerOrder.status, 200);

    product.demoEligible = false;
    const clientCannotOptIn = await send({
      ...demoPayload,
      purchaseMode: 'demo',
    }, token, '66666666666666666666666666666666');
    assert.equal(clientCannotOptIn.status, 409);
    assert.equal(createCalls, 4);

    product.demoEligible = true;
    product.demoStock = 0;
    const zeroDemoStock = await send(demoPayload, token, '77777777777777777777777777777777');
    assert.equal(zeroDemoStock.status, 400);
    product.demoStock = 1;
    const insufficientDemoStock = await send({
      ...demoPayload,
      orderItems: [{ productId: product.id, quantity: 2 }],
    }, token, '88888888888888888888888888888888');
    assert.equal(insufficientDemoStock.status, 400);
    assert.equal(createCalls, 4);
    product.demoStock = 1.5;
    const invalidDemoStock = await send(demoPayload, token, 'dddddddddddddddddddddddddddddddd');
    assert.equal(invalidDemoStock.status, 400);
    assert.equal(createCalls, 4);

    product.demoStock = 3;
    const localDemoPayment = await send({
      ...demoPayload,
      paymentMethod: 'Local Demo',
    }, token, '99999999999999999999999999999999');
    assert.equal(localDemoPayment.status, 503);
    assert.equal(createCalls, 4);

    process.env.RAZORPAY_KEY_ID = 'rzp_live_demo-order-route';
    const liveCredentials = await send(demoPayload, token, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(liveCredentials.status, 503);
    assert.equal(createCalls, 4);

    process.env.NODE_ENV = 'production';
    const productionDemo = await send(demoPayload, token, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(productionDemo.status, 409);
    assert.equal(createCalls, 4);
    assert.equal(product.stock, 10);

    process.env.PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED = 'true';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_production-order-route';
    process.env.RAZORPAY_KEY_SECRET = 'production-order-route-test-secret';
    const productionTestDemo = await send(demoPayload, token, 'cccccccccccccccccccccccccccccccc');
    assert.equal(productionTestDemo.status, 201);
    const productionDemoOrder = (await productionTestDemo.json() as { data: Order }).data;
    assert.equal(productionDemoOrder.purchaseMode, 'demo');
    assert.equal(product.stock, 10);
    assert.equal(product.demoStock, 2);
    assert.equal(createCalls, 5);

    process.env.RAZORPAY_KEY_ID = 'rzp_live_production-order-route';
    const liveProductionDemo = await send(demoPayload, token, 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    assert.equal(liveProductionDemo.status, 409);
    assert.equal(createCalls, 5);

    process.env.RAZORPAY_KEY_ID = 'rzp_test_production-order-route';
    product.demoStock = 1;
    const concurrentDemoOrders = await Promise.all([
      send(demoPayload, token, 'ffffffffffffffffffffffffffffffff'),
      send(demoPayload, secondCustomerToken, '10101010101010101010101010101010'),
    ]);
    const concurrentStatuses = concurrentDemoOrders.map((response) => response.status);
    assert.equal(concurrentStatuses.filter((status) => status === 201).length, 1);
    assert.ok(concurrentStatuses.filter((status) => status !== 201).every((status) => status === 400 || status === 409));
    assert.equal(product.demoStock, 0);
    assert.equal(product.stock, 10);

  } finally {
    server.close();
    await once(server, 'close');
    db.findUserById = originalFindUserById;
    db.findProductById = originalFindProductById;
    db.findOrderByCheckoutRequest = originalFindOrderByCheckoutRequest;
    db.findOrderById = originalFindOrderById;
    db.findOrdersByUser = originalFindOrdersByUser;
    db.findAllOrders = originalFindAllOrders;
    db.createOrder = originalCreateOrder;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('customers can idempotently hide only their own cancelled unpaid orders', async () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalFindUserById = db.findUserById;
  const originalFindOrdersByUser = db.findOrdersByUser;
  const originalRemoveCancelledOrderFromCustomerHistory = db.removeCancelledOrderFromCustomerHistory;
  const owner: User = {
    id: 'usr-history-removal-owner',
    name: 'History Owner',
    email: 'history-owner@example.invalid',
    role: 'customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const otherCustomer: User = {
    ...owner,
    id: 'usr-history-removal-other',
    email: 'history-other@example.invalid',
  };
  const makeOrder = (
    id: string,
    userId: string,
    status: Order['status'],
    isPaid: boolean,
  ): Order => ({
    id,
    orderNumber: `AURA-${id}`,
    user: { id: userId, name: 'History Owner', email: 'history-owner@example.invalid' },
    orderItems: [{
      product: 'prod-history-removal',
      name: 'Preserved Product',
      price: 100,
      quantity: 1,
      image: '/images/products/preserved.jpg',
      sku: 'PRESERVED-001',
      inventoryStatus: 'verified',
    }],
    shippingAddress: {
      fullName: 'History Owner',
      phone: '1234567890',
      email: 'delivery@example.invalid',
      street: '1 Test Road',
      city: 'Test City',
      district: '',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
    },
    razorpayOrderId: `provider-${id}`,
    paymentMethod: 'Razorpay',
    paymentResult: {
      id: `attempt-${id}`,
      status: 'failed',
      razorpay_order_id: `provider-${id}`,
      amount: 100,
      currency: 'INR',
    },
    itemsPrice: 100,
    shippingPrice: 0,
    taxPrice: 0,
    totalPrice: 100,
    isPaid,
    isDelivered: false,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const cancelledOrder = makeOrder('history-cancelled', owner.id, 'Cancelled', false);
  const pendingOrder = makeOrder('history-pending', owner.id, 'Pending', false);
  const paidCancelledOrder = makeOrder('history-paid-cancelled', owner.id, 'Cancelled', true);
  const otherCustomerOrder = makeOrder('history-other-customer', otherCustomer.id, 'Cancelled', false);
  const savedOrders = new Map([
    [cancelledOrder.id, { order: cancelledOrder, hiddenFromCustomerAt: undefined as Date | undefined }],
    [pendingOrder.id, { order: pendingOrder, hiddenFromCustomerAt: undefined as Date | undefined }],
    [paidCancelledOrder.id, { order: paidCancelledOrder, hiddenFromCustomerAt: undefined as Date | undefined }],
    [otherCustomerOrder.id, { order: otherCustomerOrder, hiddenFromCustomerAt: undefined as Date | undefined }],
  ]);
  const savedOrderSnapshot = structuredClone(cancelledOrder);
  const stockBefore = 17;
  let stock = stockBefore;

  process.env.JWT_SECRET = 'order-history-removal-test-secret-at-least-32-characters';
  db.findUserById = async (id) => {
    if (id === owner.id) return owner;
    if (id === otherCustomer.id) return otherCustomer;
    return undefined;
  };
  db.findOrdersByUser = async (userId) => [...savedOrders.values()]
    .filter((saved) => saved.order.user.id === userId && !saved.hiddenFromCustomerAt)
    .map((saved) => saved.order);
  db.removeCancelledOrderFromCustomerHistory = async (orderId, userId) => {
    const saved = savedOrders.get(orderId)
      || [...savedOrders.values()].find((candidate) => candidate.order.orderNumber === orderId);
    if (!saved) return 'not-found';
    if (saved.order.user.id !== userId) return 'forbidden';
    if (saved.order.status !== 'Cancelled' || saved.order.isPaid) return 'not-cancelled';
    if (saved.hiddenFromCustomerAt) return 'already-removed';
    saved.hiddenFromCustomerAt = new Date();
    return 'removed';
  };

  const app = express();
  app.use('/api/orders', orderRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/orders`;
    const ownerToken = generateToken(owner);
    const otherCustomerToken = generateToken(otherCustomer);
    const deleteOrder = (orderId: string, token?: string) => fetch(
      `${url}/${encodeURIComponent(orderId)}/customer-history`,
      {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );

    assert.equal((await deleteOrder(cancelledOrder.id)).status, 401);
    assert.equal((await deleteOrder(cancelledOrder.id, otherCustomerToken)).status, 403);
    assert.equal((await deleteOrder(pendingOrder.id, ownerToken)).status, 409);
    assert.equal((await deleteOrder(paidCancelledOrder.id, ownerToken)).status, 409);
    assert.equal(savedOrders.get(pendingOrder.id)?.hiddenFromCustomerAt, undefined);
    assert.equal(savedOrders.get(paidCancelledOrder.id)?.hiddenFromCustomerAt, undefined);

    const removed = await deleteOrder(cancelledOrder.id, ownerToken);
    assert.equal(removed.status, 200);
    assert.equal((await removed.json() as { message: string }).message, 'Order removed from your order history.');
    const firstHiddenAt = savedOrders.get(cancelledOrder.id)?.hiddenFromCustomerAt;
    assert.ok(firstHiddenAt instanceof Date);

    const duplicateRemoval = await deleteOrder(cancelledOrder.id, ownerToken);
    assert.equal(duplicateRemoval.status, 200);
    assert.equal(savedOrders.get(cancelledOrder.id)?.hiddenFromCustomerAt, firstHiddenAt);
    assert.deepEqual(savedOrders.get(cancelledOrder.id)?.order, savedOrderSnapshot);
    assert.equal(stock, stockBefore);
    assert.deepEqual(savedOrders.get(cancelledOrder.id)?.order.paymentResult, savedOrderSnapshot.paymentResult);

    const historyResponse = await fetch(`${url}/my-orders`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(historyResponse.status, 200);
    const ownerHistory = (await historyResponse.json() as { data: Order[] }).data;
    assert.deepEqual(new Set(ownerHistory.map((order) => order.id)), new Set([pendingOrder.id, paidCancelledOrder.id]));
    assert.ok(savedOrders.has(cancelledOrder.id), 'soft removal must preserve the order record');
  } finally {
    server.close();
    await once(server, 'close');
    db.findUserById = originalFindUserById;
    db.findOrdersByUser = originalFindOrdersByUser;
    db.removeCancelledOrderFromCustomerHistory = originalRemoveCancelledOrderFromCustomerHistory;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});

test('database soft removal changes only the customer-history timestamp and keeps the audit record', async () => {
  const originalIsConnected = Object.getOwnPropertyDescriptor(db, 'isConnected');
  const originalFindOne = Object.getOwnPropertyDescriptor(OrderModel, 'findOne');
  const originalFindOneAndUpdate = Object.getOwnPropertyDescriptor(OrderModel, 'findOneAndUpdate');
  const originalFind = Object.getOwnPropertyDescriptor(OrderModel, 'find');
  const orderDocument: IOrderDocument = {
    id: 'ord-database-history-removal',
    orderNumber: 'AURA-DATABASE-HISTORY-REMOVAL',
    user: {
      id: 'usr-database-history-removal',
      name: 'History Owner',
      email: 'history-owner@example.invalid',
    },
    orderItems: [{
      product: 'prod-database-history-removal',
      name: 'Audit Product',
      price: 250,
      quantity: 2,
      image: '/images/products/audit.jpg',
      sku: 'AUDIT-001',
      inventoryStatus: 'verified',
    }],
    shippingAddress: {
      fullName: 'History Owner',
      phone: '1234567890',
      email: 'delivery@example.invalid',
      street: '1 Test Road',
      city: 'Test City',
      district: '',
      state: 'Test State',
      postalCode: '123456',
      country: 'India',
    },
    razorpayOrderId: 'provider-audit-order',
    paymentMethod: 'Razorpay',
    paymentResult: {
      id: 'attempt-audit-order',
      status: 'failed',
      razorpay_order_id: 'provider-audit-order',
      amount: 500,
      currency: 'INR',
    },
    itemsPrice: 500,
    shippingPrice: 0,
    taxPrice: 0,
    totalPrice: 500,
    isPaid: false,
    isDelivered: false,
    status: 'Cancelled',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const originalFinancialAndInventoryData = structuredClone({
    orderItems: orderDocument.orderItems,
    paymentResult: orderDocument.paymentResult,
    totalPrice: orderDocument.totalPrice,
    isPaid: orderDocument.isPaid,
  });
  let updateFilter: Record<string, unknown> | undefined;
  let updateDocument: Record<string, unknown> | undefined;
  let updateOptions: Record<string, unknown> | undefined;
  let customerFindFilter: Record<string, unknown> | undefined;
  let updateCalls = 0;
  const makeQuery = (getValue: () => unknown) => {
    const query = {
      select: () => query,
      sort: () => query,
      lean: () => query,
      exec: async () => getValue(),
    };
    return query;
  };

  Object.defineProperty(db, 'isConnected', { value: true, configurable: true });
  Object.defineProperty(OrderModel, 'findOne', {
    configurable: true,
    value: () => makeQuery(() => orderDocument),
  });
  Object.defineProperty(OrderModel, 'findOneAndUpdate', {
    configurable: true,
    value: (filter: Record<string, unknown>, update: Record<string, unknown>, options: Record<string, unknown>) => {
      updateFilter = filter;
      updateDocument = update;
      updateOptions = options;
      updateCalls += 1;
      const set = update.$set as { hiddenFromCustomerAt: Date };
      orderDocument.hiddenFromCustomerAt = set.hiddenFromCustomerAt;
      return makeQuery(() => orderDocument);
    },
  });
  Object.defineProperty(OrderModel, 'find', {
    configurable: true,
    value: (filter?: Record<string, unknown>) => {
      if (filter) customerFindFilter = filter;
      return makeQuery(() => {
        if (filter?.hiddenFromCustomerAt === null) {
          return orderDocument.hiddenFromCustomerAt ? [] : [orderDocument];
        }
        return [orderDocument];
      });
    },
  });

  try {
    assert.equal(
      await db.removeCancelledOrderFromCustomerHistory(orderDocument.id, orderDocument.user.id),
      'removed',
    );
    assert.deepEqual(updateFilter, {
      id: orderDocument.id,
      'user.id': orderDocument.user.id,
      status: 'Cancelled',
      isPaid: false,
      hiddenFromCustomerAt: null,
    });
    assert.deepEqual(updateDocument, {
      $set: { hiddenFromCustomerAt: orderDocument.hiddenFromCustomerAt },
    });
    assert.deepEqual(updateOptions, { new: true });
    assert.ok(orderDocument.hiddenFromCustomerAt instanceof Date);
    assert.deepEqual({
      orderItems: orderDocument.orderItems,
      paymentResult: orderDocument.paymentResult,
      totalPrice: orderDocument.totalPrice,
      isPaid: orderDocument.isPaid,
    }, originalFinancialAndInventoryData);

    assert.equal(
      await db.removeCancelledOrderFromCustomerHistory(orderDocument.id, orderDocument.user.id),
      'already-removed',
    );
    assert.equal(updateCalls, 1);
    assert.deepEqual(await db.findOrdersByUser(orderDocument.user.id), []);
    assert.deepEqual(customerFindFilter, {
      'user.id': orderDocument.user.id,
      hiddenFromCustomerAt: null,
    });
    const auditOrders = await db.findAllOrders();
    assert.equal(auditOrders.length, 1);
    assert.equal(auditOrders[0].id, orderDocument.id);
    assert.equal('hiddenFromCustomerAt' in auditOrders[0], false);

    orderDocument.hiddenFromCustomerAt = undefined;
    orderDocument.status = 'Pending';
    assert.equal(
      await db.removeCancelledOrderFromCustomerHistory(orderDocument.id, orderDocument.user.id),
      'not-cancelled',
    );
    orderDocument.status = 'Cancelled';
    orderDocument.isPaid = true;
    assert.equal(
      await db.removeCancelledOrderFromCustomerHistory(orderDocument.id, orderDocument.user.id),
      'not-cancelled',
    );
    orderDocument.isPaid = false;
    assert.equal(
      await db.removeCancelledOrderFromCustomerHistory(orderDocument.id, 'another-customer'),
      'forbidden',
    );
    assert.equal(updateCalls, 1);
  } finally {
    if (originalIsConnected) Object.defineProperty(db, 'isConnected', originalIsConnected);
    else Reflect.deleteProperty(db, 'isConnected');
    if (originalFindOne) Object.defineProperty(OrderModel, 'findOne', originalFindOne);
    else Reflect.deleteProperty(OrderModel, 'findOne');
    if (originalFindOneAndUpdate) Object.defineProperty(OrderModel, 'findOneAndUpdate', originalFindOneAndUpdate);
    else Reflect.deleteProperty(OrderModel, 'findOneAndUpdate');
    if (originalFind) Object.defineProperty(OrderModel, 'find', originalFind);
    else Reflect.deleteProperty(OrderModel, 'find');
  }
});
