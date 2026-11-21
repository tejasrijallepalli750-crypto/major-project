import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '../types';
import { isDemoOrderStatusUpdateForbidden, isDemoTestOrder } from './orderPresentation';

const order = (purchaseMode?: Order['purchaseMode'], itemMode?: Order['purchaseMode']) => ({
  purchaseMode,
  orderItems: [{ purchaseMode: itemMode } as Order['orderItems'][number]],
});

test('demo orders are classified from the order or its item markers', () => {
  assert.equal(isDemoTestOrder(order('demo')), true);
  assert.equal(isDemoTestOrder(order(undefined, 'demo')), true);
  assert.equal(isDemoTestOrder(order('physical', 'physical')), false);
  assert.equal(isDemoTestOrder(order()), false);
});

test('demo orders cannot be manually assigned physical or payment statuses', () => {
  const demoOrder = order('demo');
  for (const status of ['Pending', 'Processing', 'Shipped', 'Delivered', 'Demo Completed'] as const) {
    assert.equal(isDemoOrderStatusUpdateForbidden(demoOrder, status), true);
  }
  assert.equal(isDemoOrderStatusUpdateForbidden(demoOrder, 'Cancelled'), false);
  assert.equal(isDemoOrderStatusUpdateForbidden(order(undefined, 'demo'), 'Shipped'), true);
  assert.equal(isDemoOrderStatusUpdateForbidden(order('physical'), 'Shipped'), false);
});
