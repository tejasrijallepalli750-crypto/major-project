import type { Order } from '../types';

type OrderClassification = Pick<Order, 'purchaseMode' | 'orderItems'>;

export const isDemoTestOrder = (order: OrderClassification): boolean =>
  order.purchaseMode === 'demo'
  || order.orderItems.some((item) => item.purchaseMode === 'demo');

export const isDemoOrderStatusUpdateForbidden = (
  order: OrderClassification,
  status: Order['status'],
): boolean =>
  isDemoTestOrder(order)
  && status !== 'Cancelled';
