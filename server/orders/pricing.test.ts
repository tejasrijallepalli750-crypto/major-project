import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOrderTotals } from '../../src/utils/orderPricing';

test('cart totals apply GST and shipping consistently below the free-shipping threshold', () => {
  assert.deepEqual(calculateOrderTotals(1800), {
    itemsPrice: 1800,
    shippingPrice: 150,
    taxPrice: 324,
    totalPrice: 2274,
  });
});

test('cart totals apply free shipping at the threshold and round currency to paise', () => {
  assert.deepEqual(calculateOrderTotals(2000), {
    itemsPrice: 2000,
    shippingPrice: 0,
    taxPrice: 360,
    totalPrice: 2360,
  });
  assert.deepEqual(calculateOrderTotals(12.345), {
    itemsPrice: 12.35,
    shippingPrice: 150,
    taxPrice: 2.22,
    totalPrice: 164.57,
  });
});

test('cart totals reject negative and non-finite subtotals', () => {
  assert.throws(() => calculateOrderTotals(-1), RangeError);
  assert.throws(() => calculateOrderTotals(Number.NaN), RangeError);
  assert.throws(() => calculateOrderTotals(Number.POSITIVE_INFINITY), RangeError);
});
