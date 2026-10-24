import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  getRazorpayConfig,
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
