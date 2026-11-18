import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import helmet from 'helmet';
import test from 'node:test';
import {
  getRazorpayConfig,
  getRazorpayStartupMessage,
  getGatewayPaymentStatus,
  getWebhookPaymentStatus,
  canAccessPaymentOrder,
  isVerifiedPaymentReplay,
  paymentMatchesOrder,
  shouldMarkOrderPaid,
  toRazorpayAmountPaise,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from './razorpay';
import { getHelmetOptions } from '../config/contentSecurityPolicy';

test('Razorpay Checkout security policy permits workers and payment popups', () => {
  for (const isProduction of [false, true]) {
    const options = getHelmetOptions(isProduction);
    const directives = options.contentSecurityPolicy.directives;
    assert.equal(options.crossOriginOpenerPolicy.policy, 'same-origin-allow-popups');
    assert.deepEqual(directives.workerSrc, ["'self'", 'blob:']);
    assert.ok(directives.scriptSrc.includes('https://checkout.razorpay.com'));
    assert.ok(directives.frameSrc.includes('https://checkout.razorpay.com'));
    assert.ok(directives.connectSrc.includes('https://api.razorpay.com'));
  }
});

test('payment popup and Checkout worker policies are emitted as response headers', async () => {
  const app = express();
  app.use(helmet(getHelmetOptions(false)));
  app.get('/', (_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    const policy = response.headers.get('content-security-policy');

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
    assert.match(policy || '', /worker-src 'self' blob:/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('Razorpay amount conversion validates and rounds trusted rupee totals to paise', () => {
  assert.equal(toRazorpayAmountPaise(125.5), 12550);
  assert.equal(toRazorpayAmountPaise(0.01), 1);
  assert.equal(toRazorpayAmountPaise(0), undefined);
  assert.equal(toRazorpayAmountPaise(-1), undefined);
  assert.equal(toRazorpayAmountPaise(Number.NaN), undefined);
  assert.equal(toRazorpayAmountPaise(Number.POSITIVE_INFINITY), undefined);
  assert.equal(toRazorpayAmountPaise(Number.MAX_SAFE_INTEGER), undefined);
});

test('Razorpay configuration accepts test keys and rejects live or placeholder keys', () => {
  assert.equal(getRazorpayConfig({
    RAZORPAY_KEY_ID: 'rzp_test_example',
    RAZORPAY_KEY_SECRET: 'a-private-test-secret',
  }).isConfigured, true);
  assert.equal(getRazorpayConfig({
    RAZORPAY_KEY_ID: 'rzp_live_example',
    RAZORPAY_KEY_SECRET: 'a-private-test-secret',
  }).isConfigured, false);
  assert.equal(getRazorpayConfig({
    RAZORPAY_KEY_ID: 'rzp_test_YourTestKeyIdHere',
    RAZORPAY_KEY_SECRET: 'YourRazorpaySecretKeyHere',
  }).isConfigured, false);
});

test('Razorpay startup message reflects configuration without exposing credentials', () => {
  assert.equal(getRazorpayStartupMessage(true), 'Razorpay TEST mode enabled.');
  assert.equal(getRazorpayStartupMessage(false), 'Razorpay TEST credentials are missing; checkout is disabled.');
});

test('Checkout signature validates only for the trusted Razorpay order and payment', () => {
  const orderId = 'order_trusted';
  const paymentId = 'pay_example';
  const secret = 'private-test-secret';
  const signature = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

  assert.equal(verifyCheckoutSignature(orderId, paymentId, signature, secret), true);
  assert.equal(verifyCheckoutSignature('order_other', paymentId, signature, secret), false);
  assert.equal(verifyCheckoutSignature(orderId, paymentId, `${signature}x`, secret), false);
  assert.equal(verifyCheckoutSignature(orderId, paymentId, 'not-a-signature', secret), false);
});

test('Webhook signature verifies the exact raw bytes only', () => {
  const secret = 'private-webhook-secret';
  const body = Buffer.from('{"event":"payment.captured"}');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  assert.equal(verifyWebhookSignature(body, signature, secret), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}'), signature, secret), false);
  assert.equal(verifyWebhookSignature(body, signature, ''), false);
});

test('Gateway payment must match trusted order, exact amount, and currency', () => {
  const expected = { orderId: 'order_expected', amountPaise: 12500, currency: 'INR' as const };
  const capturedPayment = {
    order_id: 'order_expected',
    amount: 12500,
    currency: 'INR',
    status: 'captured',
  };

  assert.equal(paymentMatchesOrder(capturedPayment, expected), true);
  assert.equal(paymentMatchesOrder({ ...capturedPayment, amount: '12500' }, expected), true);
  assert.equal(paymentMatchesOrder({ ...capturedPayment, order_id: 'order_other' }, expected), false);
  assert.equal(paymentMatchesOrder({ ...capturedPayment, amount: 1 }, expected), false);
  assert.equal(paymentMatchesOrder({ ...capturedPayment, currency: 'USD' }, expected), false);
  assert.equal(getGatewayPaymentStatus('captured'), 'captured');
  assert.equal(getGatewayPaymentStatus('authorized'), 'authorized');
  assert.equal(getGatewayPaymentStatus('failed'), 'failed');
  assert.equal(getGatewayPaymentStatus('created'), 'pending');
  assert.equal(shouldMarkOrderPaid('captured'), true);
  assert.equal(shouldMarkOrderPaid('failed'), false);
  assert.equal(shouldMarkOrderPaid('authorized'), false);
  assert.equal(shouldMarkOrderPaid('pending'), false);
});

test('Only payment-specific webhook events yield a payment state', () => {
  assert.equal(getWebhookPaymentStatus('payment.captured'), 'captured');
  assert.equal(getWebhookPaymentStatus('payment.authorized'), 'authorized');
  assert.equal(getWebhookPaymentStatus('payment.failed'), 'failed');
  assert.equal(getWebhookPaymentStatus('order.paid'), undefined);
  assert.equal(getWebhookPaymentStatus('unknown.event'), undefined);
});

test('Order authorization permits only the owner or an administrator', () => {
  assert.equal(canAccessPaymentOrder('user-1', 'user-1', 'customer'), true);
  assert.equal(canAccessPaymentOrder('user-1', 'user-2', 'customer'), false);
  assert.equal(canAccessPaymentOrder('user-1', 'admin-1', 'admin'), true);
});

test('Payment verification replay is idempotent only for the already captured payment', () => {
  assert.equal(isVerifiedPaymentReplay(true, 'order_1', 'pay_1', 'order_1', 'pay_1'), true);
  assert.equal(isVerifiedPaymentReplay(true, 'order_1', 'pay_1', 'order_1', 'pay_2'), false);
  assert.equal(isVerifiedPaymentReplay(false, 'order_1', 'pay_1', 'order_1', 'pay_1'), false);
});
