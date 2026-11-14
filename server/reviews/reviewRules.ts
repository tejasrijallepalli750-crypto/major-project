import { Order } from '../../src/types';

export const hasEligibleReviewOrder = (orders: Order[], productId: string): boolean =>
  orders.some((order) =>
    (order.isPaid || order.isDelivered || order.status === 'Delivered')
    && order.orderItems.some((item) => item.product === productId));

export const calculateReviewSummary = (ratings: number[]): { rating: number; numReviews: number } => ({
  rating: ratings.length
    ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
    : 0,
  numReviews: ratings.length,
});
