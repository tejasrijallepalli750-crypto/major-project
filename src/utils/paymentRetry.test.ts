import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { CheckPaymentStatusButton } from '../components/CheckPaymentStatusButton';
import { Order } from '../types';
import {
  canRequestOrderCancellation,
  getPaymentRetryMessage,
  getPaymentRetryVisibility,
} from './paymentRetry';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'ord-payment-retry-test',
  orderNumber: 'AURA-PAYMENT-RETRY-TEST',
  user: { id: 'customer-retry-test', name: 'Customer', email: 'customer@example.invalid' },
  orderItems: [],
  shippingAddress: {
    fullName: 'Customer',
    phone: '1234567890',
    street: 'Test Street',
    city: 'Test City',
    state: 'Test State',
    postalCode: '123456',
    country: 'India',
  },
  razorpayOrderId: 'order_paymentretry123',
  paymentMethod: 'Razorpay',
  itemsPrice: 100,
  shippingPrice: 150,
  taxPrice: 18,
  totalPrice: 268,
  isPaid: false,
  isDelivered: false,
  status: 'Pending',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  ...overrides,
});

test('payment retry is shown only for eligible unpaid pending orders and surfaces missing-ID recovery', () => {
  const now = Date.now();
  const eligible = makeOrder();
  assert.equal(getPaymentRetryVisibility(eligible, now), 'retry');
  assert.equal(getPaymentRetryVisibility(makeOrder({ isPaid: true }), now), 'cannot-pay');
  assert.equal(getPaymentRetryVisibility(makeOrder({ status: 'Cancelled' }), now), 'cannot-pay');
  assert.equal(getPaymentRetryVisibility(makeOrder({ paymentMethod: 'Local Demo' }), now), 'hidden');
  assert.equal(getPaymentRetryVisibility(makeOrder({ razorpayOrderId: undefined }), now), 'recovery');
  assert.equal(getPaymentRetryVisibility(makeOrder({
    razorpayOrderId: undefined,
    paymentResult: {
      id: 'pay_unresolved',
      status: 'authorized',
      amount: 268,
      currency: 'INR',
    },
  }), now), 'recovery');
  assert.equal(getPaymentRetryVisibility(makeOrder({
    paymentResult: {
      id: 'pay_pending',
      status: 'authorized',
      amount: 268,
      currency: 'INR',
    },
  }), now), 'verification-pending');
  assert.equal(
    getPaymentRetryMessage(makeOrder(), 'verification-pending'),
    'Checking your previous payment. Pay Again will be available once its status is confirmed.',
  );
  assert.equal(
    getPaymentRetryMessage(makeOrder({ paymentResult: {
      id: 'pay_failed',
      status: 'failed',
      amount: 268,
      currency: 'INR',
    } }), 'retry'),
    'Payment failed. You can try again.',
  );
  assert.equal(
    getPaymentRetryMessage(makeOrder({ isPaid: true }), 'cannot-pay'),
    'Payment successful.',
  );
  assert.equal(
    getPaymentRetryVisibility(makeOrder({ paymentResult: {
      id: 'pay_stale',
      status: 'authorized',
      amount: 268,
      currency: 'INR',
    } }), now, 'retry-ready'),
    'retry',
  );
});

test('My Orders renders Check Payment Status for an unresolved existing Razorpay order', () => {
  const order = makeOrder({
    purchaseMode: 'demo',
    demoReservationStatus: 'reserved',
    demoReservationExpiresAt: new Date(Date.now() - 1).toISOString(),
  });
  const markup = renderToStaticMarkup(React.createElement(CheckPaymentStatusButton, {
    order,
    providerState: 'verification-pending',
    isChecking: false,
    onCheck: () => undefined,
  }));
  assert.match(markup, /Check Payment Status/);
  assert.match(markup, /<button/);
  assert.doesNotMatch(markup, /Pay Again/);
  assert.equal(renderToStaticMarkup(React.createElement(CheckPaymentStatusButton, {
    order,
    providerState: 'retry-ready',
    isChecking: false,
    onCheck: () => undefined,
  })), '');
});

test('demo payment retry requires a currently reserved, unexpired reservation', () => {
  const now = Date.now();
  const demoOrder = makeOrder({
    purchaseMode: 'demo',
    demoReservationStatus: 'reserved',
    demoReservationExpiresAt: new Date(now + 60_000).toISOString(),
  });
  assert.equal(getPaymentRetryVisibility(demoOrder, now), 'retry');
  const expiredDemoOrder = makeOrder({
    ...demoOrder,
    demoReservationExpiresAt: new Date(now - 1).toISOString(),
  });
  assert.equal(getPaymentRetryVisibility(expiredDemoOrder, now), 'reservation-expired');
  assert.equal(canRequestOrderCancellation(expiredDemoOrder), true);
  assert.match(
    getPaymentRetryMessage(expiredDemoOrder, 'reservation-expired') || '',
    /reservation has expired.*payment retry is blocked/i,
  );
  assert.equal(getPaymentRetryVisibility(makeOrder({
    ...demoOrder,
    demoReservationStatus: 'released',
  }), now), 'cannot-pay');
});

test('cancellation is offered only for unpaid pending orders without unresolved local payment state', () => {
  assert.equal(canRequestOrderCancellation(makeOrder()), true);
  assert.equal(canRequestOrderCancellation(makeOrder({ razorpayOrderId: undefined })), false);
  assert.equal(canRequestOrderCancellation(makeOrder({ isPaid: true })), false);
  assert.equal(canRequestOrderCancellation(makeOrder({ status: 'Cancelled' })), false);
  assert.equal(canRequestOrderCancellation(makeOrder({
    paymentResult: {
      id: 'pay_unresolved',
      status: 'authorized',
      amount: 268,
      currency: 'INR',
    },
  })), false);
  assert.equal(canRequestOrderCancellation(makeOrder({
    paymentMethod: 'Local Demo',
    razorpayOrderId: undefined,
  })), true);
  assert.equal(canRequestOrderCancellation(makeOrder({
    paymentMethod: 'Cash on Delivery',
    razorpayOrderId: undefined,
  })), true);
});

test('order history exposes retry and safe cancellation, confirmation, and refreshed status', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'src/pages/OrderHistoryPage.tsx'), 'utf8');
  assert.match(page, /Pay Again/);
  assert.match(page, /<CheckPaymentStatusButton/);
  assert.match(page, /providerState=\{awaitingStatus \? 'verification-pending' : refreshedPayment\}/);
  assert.match(page, /checkPaymentStatus\(order\)/);
  assert.match(page, /requestPaymentStatusRefresh\(order\.id\)/);
  assert.match(page, /paymentStatusRequests/);
  const checkButton = fs.readFileSync(path.join(projectRoot, 'src/components/CheckPaymentStatusButton.tsx'), 'utf8');
  assert.match(checkButton, /Check Payment Status/);
  assert.match(checkButton, /providerState !== 'verification-pending'/);
  assert.match(page, /api\.retryPaymentOrder\(order\.id\)/);
  assert.match(page, /<RazorpayModal/);
  assert.match(page, /setOrders\(\(current\) => current\.map/);
  assert.match(page, /getPaymentRetryVisibility\(\s*order,/);
  assert.match(page, /Cancel Order/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /api\.cancelOrder\(order\.id\)/);
  assert.match(page, /api\.getOrderCancellationStatus\(order\.id\)/);
  assert.match(page, /cancellationStatus\[order\.id\] === true/);
  assert.match(page, /api\.getMyOrders\(\)/);
  assert.doesNotMatch(page, /getPaymentRetryMessage|orderNotificationClassName|role="(?:alert|status)"/);

  const modal = fs.readFileSync(path.join(projectRoot, 'src/components/RazorpayModal.tsx'), 'utf8');
  assert.match(modal, /amount:\s*razorpayData\.amount/);
  assert.match(modal, /currency:\s*razorpayData\.currency/);
  assert.match(modal, /order_id:\s*razorpayData\.razorpayOrderId/);
});

test('payment cancellation endpoint is owner-only and gates inventory restoration on provider expiry', () => {
  const routes = fs.readFileSync(path.join(projectRoot, 'server/routes/paymentRoutes.ts'), 'utf8');
  assert.match(routes, /router\.post\('\/cancel-order', requireAuth/);
  assert.match(routes, /order\.user\.id !== req\.user!\.id/);
  assert.match(routes, /gatewayOrder\.status !== 'expired'/);
  assert.match(routes, /payment\.status !== 'failed'/);
  assert.match(routes, /cancelOrderAfterVerifiedGatewayExpiry/);
  assert.match(routes, /cancelUnpaidOrderWithoutGateway/);
});

test('standard Razorpay Checkout does not filter payment methods or replace the shared order', () => {
  const modal = fs.readFileSync(path.join(projectRoot, 'src/components/RazorpayModal.tsx'), 'utf8');
  assert.match(modal, /amount:\s*razorpayData\.amount/);
  assert.match(modal, /currency:\s*razorpayData\.currency/);
  assert.match(modal, /order_id:\s*razorpayData\.razorpayOrderId/);
  assert.match(modal, /checkout\.open\(\)/);
  assert.match(modal, /checkout\.on\('payment\.failed'/);
  assert.match(modal, /handler:\s*async\s*\(response:\s*RazorpayResponse\)/);
  assert.doesNotMatch(modal, /method:\s*['"](?:card|netbanking|wallet|upi)/i);
});
