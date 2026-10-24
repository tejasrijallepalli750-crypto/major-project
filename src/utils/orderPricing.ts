export interface OrderTotals {
  itemsPrice: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
}

const roundCurrency = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100) / 100;

export const calculateOrderTotals = (itemsPrice: number): OrderTotals => {
  if (!Number.isFinite(itemsPrice) || itemsPrice < 0) {
    throw new RangeError('Order subtotal must be a non-negative finite amount.');
  }

  const subtotal = roundCurrency(itemsPrice);
  const shippingPrice = subtotal >= 2000 || subtotal === 0 ? 0 : 150;
  const taxPrice = roundCurrency(subtotal * 0.18);

  return {
    itemsPrice: subtotal,
    shippingPrice,
    taxPrice,
    totalPrice: roundCurrency(subtotal + shippingPrice + taxPrice),
  };
};
