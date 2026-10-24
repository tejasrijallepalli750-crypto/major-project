import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, LoaderCircle, X } from 'lucide-react';
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

let razorpayCheckoutScript: Promise<void> | undefined;

const loadRazorpayCheckout = (): Promise<void> => {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayCheckoutScript) return razorpayCheckoutScript;

  razorpayCheckoutScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve();
      else {
        script.remove();
        razorpayCheckoutScript = undefined;
        reject(new Error('Razorpay Checkout loaded without its payment handler.'));
      }
    };
    script.onerror = () => {
      script.remove();
      razorpayCheckoutScript = undefined;
      reject(new Error('Razorpay Checkout could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return razorpayCheckoutScript;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

export const RazorpayModal: React.FC<RazorpayModalProps> = ({ isOpen, onClose, order, razorpayData, onSuccess, onFailure }) => {
  const openedRef = useRef(false);
  const [message, setMessage] = useState('Opening secure Razorpay checkout…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || openedRef.current) return;
    openedRef.current = true;

    const openCheckout = async () => {
      try {
        await loadRazorpayCheckout();
      } catch {
        const detail = 'Razorpay Checkout could not be loaded. Check your internet connection and try again.';
        setError(detail);
        onFailure(detail);
        return;
      }

      const RazorpayConstructor = window.Razorpay;
      if (!RazorpayConstructor) {
        const detail = 'Razorpay Checkout could not be loaded. Check your internet connection and try again.';
        setError(detail);
        onFailure(detail);
        return;
      }

      const checkout = new RazorpayConstructor({
        key: razorpayData.keyId,
        amount: razorpayData.amount,
        currency: razorpayData.currency,
        name: 'AURA',
        description: `Order ${razorpayData.orderNumber}`,
        order_id: razorpayData.razorpayOrderId,
        prefill: { name: razorpayData.customer.name, email: razorpayData.customer.email, contact: razorpayData.customer.phone },
        notes: { orderNumber: razorpayData.orderNumber },
        theme: { color: '#0f172a' },
        modal: {
          ondismiss: () => {
            onClose();
            onFailure('Checkout was closed before payment completed. Your order remains unpaid.');
          },
        },
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
          } catch (verificationError: unknown) {
            const detail = verificationError instanceof Error
              ? verificationError.message
              : 'Payment could not be verified.';
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
        {error && <button onClick={onClose} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">Return to checkout</button>}
      </div>
    </div>
  );
};
