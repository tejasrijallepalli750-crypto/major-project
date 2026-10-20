import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CreditCard, LoaderCircle, X } from 'lucide-react';
import { api } from '../services/api';
import { Order } from '../types';

interface RazorpayModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  razorpayData: {
    orderId: string;
    orderNumber: string;
    razorpayOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
    customer: { name: string; email: string; phone?: string };
  };
  onSuccess: (verifiedOrder: Order) => void;
  onFailure: (errorMessage: string) => void;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckout {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

export const RazorpayModal: React.FC<RazorpayModalProps> = ({ isOpen, onClose, order, razorpayData, onSuccess, onFailure }) => {
  const openedRef = useRef(false);
  const [message, setMessage] = useState('Opening secure Razorpay Test Mode checkout…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || openedRef.current) return;
    openedRef.current = true;

    const openCheckout = async () => {
      if (!window.Razorpay) {
        const detail = 'Razorpay Checkout could not be loaded. Check your internet connection and try again.';
        setError(detail);
        onFailure(detail);
        return;
      }

      const checkout = new window.Razorpay({
        key: razorpayData.keyId,
        amount: razorpayData.amount,
        currency: razorpayData.currency,
        name: 'AURA',
        description: `Order ${razorpayData.orderNumber}`,
        order_id: razorpayData.razorpayOrderId,
        prefill: { name: razorpayData.customer.name, email: razorpayData.customer.email, contact: razorpayData.customer.phone },
        notes: { orderNumber: razorpayData.orderNumber },
        theme: { color: '#0f172a' },
        modal: { ondismiss: onClose },
        handler: async (response: RazorpayResponse) => {
          setMessage('Verifying payment with our server…');
          try {
            const verified = await api.verifyPayment({
              orderId: order.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            if (!verified.success || !verified.order) throw new Error(verified.message || 'Payment verification failed.');
            onSuccess(verified.order);
          } catch (verificationError: any) {
            const detail = verificationError.message || 'Payment could not be verified.';
            setError(detail);
            onFailure(detail);
          }
        },
      });

      checkout.on('payment.failed', (response) => {
        const detail = response.error?.description || 'The payment was not completed.';
        setError(detail);
        onFailure(detail);
      });
      checkout.open();
    };

    openCheckout();
  }, [isOpen, onClose, onFailure, onSuccess, order.id, razorpayData]);

  useEffect(() => {
    if (!isOpen) openedRef.current = false;
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-2xl">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close payment window"><X className="h-4 w-4" /></button>
        {error ? <AlertCircle className="mx-auto h-8 w-8 text-rose-600" /> : <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-slate-900" />}
        <h2 className="mt-4 text-base font-bold text-slate-900">{error ? 'Payment needs attention' : 'Secure checkout'}</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{error || message}</p>
        {!error && <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-medium text-slate-600"><CreditCard className="h-3.5 w-3.5" />Razorpay Test Mode</div>}
        {error && <button onClick={onClose} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">Return to checkout</button>}
      </div>
    </div>
  );
};
