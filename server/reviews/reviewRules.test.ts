import assert from 'node:assert/strict';
import test from 'node:test';
import { Order } from '../../src/types';
import { calculateReviewSummary, hasEligibleReviewOrder } from './reviewRules';

const makeOrder = (updates: Partial<Order>): Order => ({
  id: 'ord-review-test',
  orderNumber: 'AURA-REVIEW-TEST',
  user: { id: 'usr-review-test', name: 'Review Test', email: 'review@example.invalid' },
  orderItems: [{
    product: 'prod-review-test',
    name: 'Review Product',
    price: 100,
    quantity: 1,
    image: '/images/products/review.jpg',
    sku: 'REVIEW-TEST',
  }],
  shippingAddress: {
    fullName: 'Review Test',
    phone: '1234567890',
    street: '1 Test Street',
    city: 'Test City',
    state: 'Test State',
    postalCode: '123456',
    country: 'India',
  },
  paymentMethod: 'Razorpay',
  itemsPrice: 100,
  shippingPrice: 0,
  taxPrice: 18,
  totalPrice: 118,
  isPaid: false,
  isDelivered: false,
  status: 'Pending',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  ...updates,
});

test('review eligibility requires a paid or delivered order containing the product', () => {
  assert.equal(hasEligibleReviewOrder([makeOrder({})], 'prod-review-test'), false);
  assert.equal(hasEligibleReviewOrder([makeOrder({ isPaid: true })], 'prod-review-test'), true);
  assert.equal(hasEligibleReviewOrder([makeOrder({ status: 'Delivered' })], 'prod-review-test'), true);
  assert.equal(hasEligibleReviewOrder([makeOrder({
    orderItems: [{ ...makeOrder({}).orderItems[0], product: 'another-product' }],
    isPaid: true,
  })], 'prod-review-test'), false);
});

test('review recalculation returns the rounded mean and review count', () => {
  assert.deepEqual(calculateReviewSummary([4, 5, 3]), { rating: 4, numReviews: 3 });
  assert.deepEqual(calculateReviewSummary([5, 4]), { rating: 4.5, numReviews: 2 });
  assert.deepEqual(calculateReviewSummary([]), { rating: 0, numReviews: 0 });
});
