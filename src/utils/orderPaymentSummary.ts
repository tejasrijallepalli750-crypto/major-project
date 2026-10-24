import { Order } from '../types';

export interface OrderPaymentSummary {
  statusLabel: string;
  methodLabel: string;
  reference: string;
}

export const getOrderPaymentSummary = (order: Order): OrderPaymentSummary => {
  return {
    statusLabel: order.isPaid ? 'CAPTURED / PAID' : 'PENDING',
    methodLabel: order.paymentMethod === 'Local Demo' ? 'Unavailable' : order.paymentMethod,
    reference: order.paymentResult?.razorpay_payment_id || order.paymentResult?.id || 'Pending',
  };
};
