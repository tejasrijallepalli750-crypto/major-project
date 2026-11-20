import { Order } from '../types';

export type PaymentRetryVisibility =
  | 'hidden'
  | 'recovery'
  | 'verification-pending'
  | 'reservation-expired'
  | 'cannot-pay'
  | 'retry';

export type PaymentRefreshState =
  | 'retry-ready'
  | 'verification-pending'
  | 'paid'
  | 'expired'
  | 'recovery';

export const getPaymentRetryVisibility = (
  order: Order,
  now: number = Date.now(),
  providerState?: PaymentRefreshState,
): PaymentRetryVisibility => {
  if (order.isPaid || order.status !== 'Pending' || order.demoReservationStatus === 'released') {
    return 'cannot-pay';
  }
  if (order.paymentMethod !== 'Razorpay' || order.demoPaymentAttempts?.length) return 'hidden';
  if (order.purchaseMode === 'demo'
    && (order.demoReservationStatus !== 'reserved'
      || !order.demoReservationExpiresAt
      || !Number.isFinite(new Date(order.demoReservationExpiresAt).getTime())
      || new Date(order.demoReservationExpiresAt).getTime() <= now)) {
    return 'reservation-expired';
  }
  if (!order.razorpayOrderId) return 'recovery';
  if (providerState === 'paid') return 'cannot-pay';
  if (providerState === 'expired' || providerState === 'recovery') return 'recovery';
  if (providerState === 'verification-pending') return 'verification-pending';
  if (providerState === 'retry-ready') return 'retry';
  if (order.paymentResult?.status && order.paymentResult.status !== 'failed') return 'verification-pending';
  return 'retry';
};

export const getPaymentRetryMessage = (
  order: Order,
  visibility: PaymentRetryVisibility,
  providerMessage?: string,
): string | undefined => {
  if (providerMessage) return providerMessage;
  switch (visibility) {
    case 'recovery':
      return order.razorpayOrderId
        ? 'Payment recovery is required. The Razorpay order is no longer available for another checkout.'
        : 'Manual payment recovery required because this order has no stored Razorpay order ID. Contact support; do not start another payment.';
    case 'verification-pending':
      return 'Checking your previous payment. Pay Again will be available once its status is confirmed.';
    case 'reservation-expired':
      return 'The demo reservation has expired or is no longer available. Payment retry is blocked; contact support for payment recovery. The reservation remains held until payment status is safely reconciled.';
    case 'cannot-pay':
      if (order.isPaid) return 'Payment successful.';
      if (order.status === 'Cancelled') return 'This order is cancelled and cannot be paid again.';
      if (order.demoReservationStatus === 'released') return 'The reservation was released; this order cannot be paid again.';
      return 'This order cannot be paid again.';
    case 'retry':
      return order.paymentResult?.status === 'failed' ? 'Payment failed. You can try again.' : undefined;
    default:
      return undefined;
  }
};

export const canRequestOrderCancellation = (order: Order): boolean => {
  if (order.isPaid
    || order.status !== 'Pending'
    || order.demoPaymentAttempts?.some((attempt) => attempt.outcome === 'success')
    || (order.paymentResult && order.paymentResult.status !== 'failed')) {
    return false;
  }

  if (order.paymentMethod === 'Razorpay') return Boolean(order.razorpayOrderId);
  if (order.razorpayOrderId || order.paymentResult) return false;
  return order.paymentMethod === 'Local Demo' || order.paymentMethod === 'Cash on Delivery';
};
