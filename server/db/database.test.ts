import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import mongoose from 'mongoose';
import test from 'node:test';
import { Order } from '../../src/types';
import { generateToken } from '../middleware/auth';
import { OrderModel, IOrderDocument } from '../models/Order';
import { ProductModel } from '../models/Product';
import { makeDemoStockAllocationOperation } from '../orders/inventory';
import { db, InventoryError, OrderCancellationError } from './database';
import orderRoutes from '../routes/orderRoutes';

interface FakeProduct {
  id: string;
  status: 'active';
  demoEligible: true;
  demoStock: number;
  stock: number;
}

interface LeanQuery<T> {
  select(selection: string): LeanQuery<T>;
  session(session: unknown): LeanQuery<T>;
  lean(): { exec(): Promise<T | null> };
}

const makeLeanQuery = <T>(read: () => T | null): LeanQuery<T> => {
  const query: LeanQuery<T> = {
    select: () => query,
    session: () => query,
    lean: () => ({ exec: async () => read() }),
  };
  return query;
};

const cloneMap = <T>(values: Map<string, T>): Map<string, T> =>
  new Map([...values.entries()].map(([key, value]) => [key, structuredClone(value)]));

const restoreMap = <T extends object>(target: Map<string, T>, snapshot: Map<string, T>): void => {
  for (const key of target.keys()) {
    if (!snapshot.has(key)) target.delete(key);
  }
  for (const [key, savedValue] of snapshot) {
    const currentValue = target.get(key);
    if (currentValue) Object.assign(currentValue, savedValue);
    else target.set(key, structuredClone(savedValue));
  }
};

const makeDemoOrder = (userId: string): Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'> => ({
  user: {
    id: userId,
    name: `Test ${userId}`,
    email: `${userId}@example.invalid`,
  },
  orderItems: [{
    product: 'demo-product',
    name: 'Demo product',
    price: 100,
    quantity: 1,
    image: '/demo-product.webp',
    sku: 'DEMO-PRODUCT',
    inventoryStatus: 'unverified',
    purchaseMode: 'demo',
  }],
  shippingAddress: {
    fullName: `Test ${userId}`,
    phone: '1234567890',
    street: '1 Test Road',
    city: 'Test City',
    state: 'Test State',
    postalCode: '123456',
    country: 'India',
  },
  purchaseMode: 'demo',
  paymentMethod: 'Razorpay',
  itemsPrice: 100,
  shippingPrice: 0,
  taxPrice: 18,
  totalPrice: 118,
  isPaid: false,
  isDelivered: false,
  status: 'Pending',
});

test('order schema includes the payment-verified demo terminal status', () => {
  const statusPath = OrderModel.schema.path('status');
  assert.ok(statusPath);
  const allowedStatuses = statusPath.options.enum;
  assert.ok(Array.isArray(allowedStatuses));
  assert.ok(allowedStatuses.includes('Demo Completed'));
});

test('database demo reservations are atomic, rollback-safe, and idempotent', async () => {
  const environmentKeys = [
    'NODE_ENV',
    'PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED',
    'DEMO_MODE_ENABLED',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'JWT_SECRET',
  ] as const;
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const originalFindUserById = db.findUserById;
  const originalConnectedDescriptor = Object.getOwnPropertyDescriptor(db, 'isConnected');
  const restoreProperties: Array<() => void> = [];
  const products = new Map<string, FakeProduct>();
  const orders = new Map<string, IOrderDocument>();
  let nextOrderCreateFailure: Error | undefined;
  let transactionTail: Promise<void> = Promise.resolve();
  let orderUpdateCalls = 0;

  const overrideProperty = (target: object, property: string, value: unknown): void => {
    const descriptor = Object.getOwnPropertyDescriptor(target, property);
    Object.defineProperty(target, property, { configurable: true, writable: true, value });
    restoreProperties.push(() => {
      if (descriptor) Object.defineProperty(target, property, descriptor);
      else Reflect.deleteProperty(target, property);
    });
  };

  const findOrder = (filter: Record<string, unknown>): IOrderDocument | null => {
    if (typeof filter.id === 'string') return orders.get(filter.id) ?? null;
    if (typeof filter['user.id'] === 'string' && typeof filter.checkoutIdempotencyKey === 'string') {
      return [...orders.values()].find((order) =>
        order.user.id === filter['user.id']
        && order.checkoutIdempotencyKey === filter.checkoutIdempotencyKey) ?? null;
    }
    if (Array.isArray(filter.$or)) {
      for (const alternative of filter.$or) {
        if (!alternative || typeof alternative !== 'object') continue;
        const condition = alternative as Record<string, unknown>;
        const found = [...orders.values()].find((order) =>
          (typeof condition.id === 'string' && order.id === condition.id)
          || (typeof condition.orderNumber === 'string' && order.orderNumber === condition.orderNumber));
        if (found) return found;
      }
    }
    return null;
  };

  const createSession = () => ({
    withTransaction: async (operation: () => Promise<unknown>) => {
      let release: () => void = () => undefined;
      const previous = transactionTail;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const productsBefore = cloneMap(products);
      const ordersBefore = cloneMap(orders);
      try {
        await operation();
      } catch (error) {
        restoreMap(products, productsBefore);
        restoreMap(orders, ordersBefore);
        throw error;
      } finally {
        release();
      }
    },
    endSession: async () => undefined,
  });

  process.env.NODE_ENV = 'production';
  process.env.PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED = 'true';
  process.env.DEMO_MODE_ENABLED = 'false';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_database-transaction-test';
  process.env.RAZORPAY_KEY_SECRET = 'database-transaction-test-secret';
  process.env.JWT_SECRET = 'database-transaction-test-jwt-secret-over-32-characters';
  Object.defineProperty(db, 'isConnected', { configurable: true, value: true });

  overrideProperty(mongoose, 'startSession', createSession);
  overrideProperty(OrderModel, 'findOne', (filter: Record<string, unknown>) =>
    makeLeanQuery(() => {
      const order = findOrder(filter);
      return order ? structuredClone(order) : null;
    }));
  overrideProperty(OrderModel, 'findOneAndUpdate', (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => {
    orderUpdateCalls += 1;
    return makeLeanQuery(() => {
      const order = findOrder(filter);
      if (!order || order.isPaid || order.status !== 'Pending') return null;
      const fields = update.$set;
      if (!fields || typeof fields !== 'object') return null;
      Object.assign(order, fields);
      const unset = update.$unset;
      if (unset && typeof unset === 'object') {
        for (const field of Object.keys(unset)) Reflect.deleteProperty(order, field);
      }
      return structuredClone(order);
    });
  });
  overrideProperty(OrderModel, 'create', async (documents: IOrderDocument[]) => {
    const document = structuredClone(documents[0]);
    if (nextOrderCreateFailure) {
      const error = nextOrderCreateFailure;
      nextOrderCreateFailure = undefined;
      throw error;
    }
    const duplicate = [...orders.values()].some((order) =>
      order.user.id === document.user.id
      && order.checkoutIdempotencyKey === document.checkoutIdempotencyKey);
    if (duplicate) throw Object.assign(new Error('duplicate key'), { code: 11000 });
    orders.set(document.id, document);
    return [{ toObject: () => structuredClone(document) }];
  });
  overrideProperty(ProductModel, 'updateOne', async (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => {
    const increment = update.$inc;
    if (filter.id === 'demo-product'
      && Object.keys(filter).length === 1
      && increment && typeof increment === 'object'
      && 'demoStock' in increment
      && increment.demoStock === 1) {
      const product = products.get('demo-product');
      if (!product) return { modifiedCount: 0 };
      product.demoStock += 1;
      return { modifiedCount: 1 };
    }

    const expected = makeDemoStockAllocationOperation('demo-product', 1);
    assert.deepEqual(filter, expected.filter);
    assert.deepEqual(update, expected.update);
    const product = products.get('demo-product');
    if (!product || product.status !== 'active' || !product.demoEligible
      || !Number.isSafeInteger(product.demoStock) || product.demoStock < 1) {
      return { modifiedCount: 0 };
    }
    product.demoStock -= 1;
    return { modifiedCount: 1 };
  });

  try {
    const product: FakeProduct = {
      id: 'demo-product',
      status: 'active',
      demoEligible: true,
      demoStock: 1,
      stock: 37,
    };
    products.set(product.id, product);

    const concurrentResults = await Promise.allSettled([
      db.createOrder(makeDemoOrder('customer-one'), 'concurrent-key-one', 'payload-one'),
      db.createOrder(makeDemoOrder('customer-two'), 'concurrent-key-two', 'payload-two'),
    ]);
    assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(concurrentResults.filter((result) => result.status === 'rejected').length, 1);
    const rejected = concurrentResults.find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' && rejected.reason instanceof InventoryError);
    assert.equal(product.demoStock, 0);
    assert.equal(product.stock, 37);
    assert.equal(orders.size, 1);

    product.demoStock = 0;
    await assert.rejects(
      db.createOrder(makeDemoOrder('customer-insufficient'), 'insufficient-key', 'insufficient-payload'),
      InventoryError,
    );
    assert.equal(product.demoStock, 0);
    assert.equal(product.stock, 37);
    assert.equal(orders.size, 1);

    product.demoStock = 3;
    nextOrderCreateFailure = new Error('simulated order persistence failure');
    await assert.rejects(
      db.createOrder(makeDemoOrder('customer-rollback'), 'rollback-key', 'rollback-payload'),
      /simulated order persistence failure/,
    );
    assert.equal(product.demoStock, 3);
    assert.equal(product.stock, 37);
    assert.equal(orders.size, 1);

    const duplicateRequest = makeDemoOrder('customer-idempotent');
    const duplicateResults = await Promise.all([
      db.createOrder(duplicateRequest, 'same-idempotency-key', 'same-payload'),
      db.createOrder(duplicateRequest, 'same-idempotency-key', 'same-payload'),
    ]);
    assert.equal(duplicateResults[0].id, duplicateResults[1].id);
    assert.equal(product.demoStock, 2);
    assert.equal(product.stock, 37);
    assert.equal(orders.size, 2);

    const reservedForCancellation = await db.createOrder(
      makeDemoOrder('customer-cancellation'),
      'cancellation-key',
      'cancellation-payload',
    );
    assert.equal(product.demoStock, 1);
    const cancelled = await db.updateOrderStatus(reservedForCancellation.id, 'Cancelled');
    assert.equal(cancelled?.status, 'Cancelled');
    assert.equal(cancelled?.demoReservationStatus, 'released');
    assert.equal(product.demoStock, 2);
    assert.equal(product.stock, 37);

    const admin = {
      id: 'demo-status-admin',
      name: 'Demo Status Admin',
      email: 'demo-status-admin@example.invalid',
      role: 'admin' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const paidDemoOrder = structuredClone(orders.get(duplicateResults[0].id)!);
    paidDemoOrder.status = 'Demo Completed';
    paidDemoOrder.isPaid = true;
    paidDemoOrder.paymentResult = {
      id: 'payment-captured',
      status: 'captured',
      amount: 118,
      currency: 'INR',
    };
    orders.set(paidDemoOrder.id, paidDemoOrder);
    db.findUserById = async (id) => id === admin.id ? admin : undefined;
    const app = express();
    app.use(express.json());
    app.use('/api/orders', orderRoutes);
    const server = app.listen(0, '127.0.0.1');

    try {
      await once(server, 'listening');
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const url = `http://127.0.0.1:${address.port}/api/orders/${paidDemoOrder.id}/status`;
      const token = generateToken(admin);
      for (const status of ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']) {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status }),
        });
        assert.equal(response.status, 409, `Expected ${status} update to be rejected.`);
      }
      const attemptedDemoCompletion = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'Demo Completed' }),
      });
      assert.equal(attemptedDemoCompletion.status, 400);
      assert.equal(orderUpdateCalls, 1, 'Only the earlier unpaid cancellation may update an order.');
      assert.equal(orders.get(paidDemoOrder.id)?.status, 'Demo Completed');
      assert.equal(orders.get(paidDemoOrder.id)?.isDelivered, false);
      assert.equal(product.stock, 37);
    } finally {
      server.close();
      await once(server, 'close');
    }
  } finally {
    db.findUserById = originalFindUserById;
    if (originalConnectedDescriptor) {
      Object.defineProperty(db, 'isConnected', originalConnectedDescriptor);
    } else {
      Reflect.deleteProperty(db, 'isConnected');
    }
    for (const restore of restoreProperties.reverse()) restore();
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('captured demo payments use a non-fulfillment order status', async () => {
  const originalConnectedDescriptor = Object.getOwnPropertyDescriptor(db, 'isConnected');
  const originalFindOne = Object.getOwnPropertyDescriptor(OrderModel, 'findOne');
  const originalFindOneAndUpdate = Object.getOwnPropertyDescriptor(OrderModel, 'findOneAndUpdate');
  const originalEnvironment = new Map(['NODE_ENV', 'PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']
    .map((key) => [key, process.env[key]]));
  const orders = new Map<string, IOrderDocument>();
  const demo = {
    id: 'captured-demo-order',
    orderNumber: 'AURA-DEMO-CAPTURE',
    user: { id: 'demo-user', name: 'Demo User', email: 'demo-user@example.invalid' },
    orderItems: [{ product: 'demo-product', name: 'Demo Product', price: 100, quantity: 1, image: '/demo.webp', sku: 'DEMO', purchaseMode: 'demo' }],
    shippingAddress: { fullName: 'Demo User', phone: '1234567890', street: 'Test Street', city: 'Test City', state: 'Test State', postalCode: '123456', country: 'India' },
    purchaseMode: 'demo',
    demoReservationStatus: 'reserved',
    demoReservationExpiresAt: new Date(Date.now() + 60_000),
    paymentMethod: 'Razorpay',
    itemsPrice: 100,
    shippingPrice: 0,
    taxPrice: 18,
    totalPrice: 118,
    isPaid: false,
    isDelivered: false,
    status: 'Pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as IOrderDocument;
  const physical = {
    ...structuredClone(demo),
    id: 'captured-physical-order',
    orderNumber: 'AURA-PHYSICAL-CAPTURE',
    purchaseMode: 'physical',
    orderItems: demo.orderItems.map((item) => ({ ...item, purchaseMode: 'physical' })),
  } as IOrderDocument;
  orders.set(demo.id, demo);
  orders.set(physical.id, physical);

  const overrideProperty = (target: object, property: string, value: unknown): void => {
    Object.defineProperty(target, property, { configurable: true, writable: true, value });
  };
  const restoreProperty = (target: object, property: string, descriptor: PropertyDescriptor | undefined): void => {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else Reflect.deleteProperty(target, property);
  };
  const queryFor = (filter: Record<string, unknown>) => {
    const findMatchingOrder = (): IOrderDocument | null => {
      if (typeof filter.id === 'string') return orders.get(filter.id) ?? null;
      const alternatives = filter.$or;
      if (Array.isArray(alternatives)) {
        return [...orders.values()].find((order) => alternatives.some((condition: unknown) => {
          if (!condition || typeof condition !== 'object') return false;
          const fields = condition as Record<string, unknown>;
          return (typeof fields.id === 'string' && fields.id === order.id)
            || (typeof fields.orderNumber === 'string' && fields.orderNumber === order.orderNumber);
        })) ?? null;
      }
      return null;
    };
    const query = {
      select: () => query,
      lean: () => ({ exec: async () => structuredClone(findMatchingOrder()) }),
    };
    return query;
  };

  process.env.NODE_ENV = 'production';
  process.env.PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED = 'true';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_capture-status-test';
  process.env.RAZORPAY_KEY_SECRET = 'capture-status-test-secret';
  Object.defineProperty(db, 'isConnected', { configurable: true, value: true });
  overrideProperty(OrderModel, 'findOne', (filter: Record<string, unknown>) => queryFor(filter));
  overrideProperty(OrderModel, 'findOneAndUpdate', (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => ({
    lean: () => ({
      exec: async () => {
        const order = typeof filter.id === 'string' ? orders.get(filter.id) : undefined;
        if (!order || order.isPaid || order.status !== 'Pending') return null;
        const fields = update.$set;
        if (!fields || typeof fields !== 'object') return null;
        Object.assign(order, fields);
        const unset = update.$unset;
        if (unset && typeof unset === 'object') {
          for (const field of Object.keys(unset)) Reflect.deleteProperty(order, field);
        }
        return structuredClone(order);
      },
    }),
  }));

  try {
    const demoResult = await db.updateOrderPayment(demo.id, {
      id: 'demo-payment',
      status: 'captured',
      amount: 118,
      currency: 'INR',
    });
    assert.equal(demoResult?.isPaid, true);
    assert.equal(demoResult?.status, 'Demo Completed');
    assert.equal(demoResult?.demoReservationStatus, 'consumed');
    assert.equal(demoResult?.demoReservationExpiresAt, undefined);

    const physicalResult = await db.updateOrderPayment(physical.id, {
      id: 'physical-payment',
      status: 'captured',
      amount: 118,
      currency: 'INR',
    });
    assert.equal(physicalResult?.isPaid, true);
    assert.equal(physicalResult?.status, 'Processing');
    await assert.rejects(
      db.updateOrderStatus(physical.id, 'Demo Completed'),
      OrderCancellationError,
    );
  } finally {
    restoreProperty(OrderModel, 'findOne', originalFindOne);
    restoreProperty(OrderModel, 'findOneAndUpdate', originalFindOneAndUpdate);
    restoreProperty(db, 'isConnected', originalConnectedDescriptor);
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
