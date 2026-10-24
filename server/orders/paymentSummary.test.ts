import assert from 'node:assert/strict';
import test from 'node:test';
import { Order } from '../../src/types';
import { getOrderPaymentSummary } from '../../src/utils/orderPaymentSummary';

const makeOrder = (paymentMethod: Order['paymentMethod']): Order => ({
  id: 'order-test',
  orderNumber: 'AURA-TEST-123',
  user: { id: 'user-test', name: 'Test', email: 'test@example.invalid' },
  orderItems: [],
  shippingAddress: {
    fullName: 'Test',
    phone: '1234567890',
    street: 'Test Street',
    city: 'Test City',
    state: 'Test State',
    postalCode: '123456',
    country: 'India',
  },
  paymentMethod,
  itemsPrice: 100,
  shippingPrice: 150,
  taxPrice: 18,
  totalPrice: 268,
  isPaid: false,
  isDelivered: false,
  status: 'Pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

test('legacy demo orders remain unpaid and do not expose demo-payment details', () => {
  const summary = getOrderPaymentSummary({
    ...makeOrder('Local Demo'),
    demoPaymentAttempts: [{
      attemptId: '11111111111111111111111111111111',
      outcome: 'success',
      mode: 'LOCAL_DEMO',
      amount: 268,
      currency: 'INR',
      recordedAt: new Date().toISOString(),
    }],
  });

  assert.equal(summary.statusLabel, 'PENDING');
  assert.equal(summary.methodLabel, 'Unavailable');
  assert.equal(summary.reference, 'Pending');
});

test('order confirmation identifies a paid gateway order only from the stored paid state', () => {
  const summary = getOrderPaymentSummary({
    ...makeOrder('Razorpay'),
    isPaid: true,
    paymentResult: {
      id: 'pay-test',
      razorpay_payment_id: 'pay-test',
      status: 'captured',
      amount: 268,
      currency: 'INR',
    },
  });

  assert.equal(summary.statusLabel, 'CAPTURED / PAID');
  assert.equal(summary.methodLabel, 'Razorpay');
  assert.equal(summary.reference, 'pay-test');
});
