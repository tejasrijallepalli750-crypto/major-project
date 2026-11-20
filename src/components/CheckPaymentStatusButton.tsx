import React from 'react';
import { Order } from '../types';
import { PaymentRefreshState } from '../utils/paymentRetry';

interface CheckPaymentStatusButtonProps {
  order: Order;
  providerState?: PaymentRefreshState;
  isChecking: boolean;
  onCheck: () => void;
}

export const CheckPaymentStatusButton: React.FC<CheckPaymentStatusButtonProps> = ({
  order,
  providerState,
  isChecking,
  onCheck,
}) => {
  if (order.isPaid
    || order.status !== 'Pending'
    || order.paymentMethod !== 'Razorpay'
    || !order.razorpayOrderId
    || providerState !== 'verification-pending') {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onCheck}
      disabled={isChecking}
      className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-60 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
    >
      {isChecking ? 'Checking Payment Status…' : 'Check Payment Status'}
    </button>
  );
};
