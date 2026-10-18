import React, { useState } from 'react';
import { ArrowLeft, Lock, ShieldCheck, AlertCircle, CreditCard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../services/api';
import { Order } from '../types';
import { RazorpayModal } from '../components/RazorpayModal';

interface CheckoutPageProps {
  onNavigate: (view: string, param?: string) => void;
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onNavigate, onOrderSuccess }) => {
  const { user } = useAuth();
  const { cart, itemsPrice, shippingPrice, taxPrice, totalPrice, clearCart } = useCart();

  // Delivery Address Form State
  const [fullName, setFullName] = useState(user?.name || 'Demo Student Customer');
  const [phone, setPhone] = useState(user?.phone || '+91 98765 43210');
  const [street, setStreet] = useState(user?.address?.street || '14 Lake View Residency, Koramangala');
  const [city, setCity] = useState(user?.address?.city || 'Bengaluru');
  const [state, setState] = useState(user?.address?.state || 'Karnataka');
  const [postalCode, setPostalCode] = useState(user?.address?.postalCode || '560034');
  const [country] = useState('India');
  const [paymentMethod, setPaymentMethod] = useState<'Razorpay' | 'Card' | 'UPI'>('Razorpay');

  // State for order creation & Razorpay modal
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [razorpayOrderData, setRazorpayOrderData] = useState<any | null>(null);
  const [isRazorpayModalOpen, setIsRazorpayModalOpen] = useState(false);

  if (cart.length === 0 && !createdOrder) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Your Cart is Empty</h2>
        <p className="text-xs text-slate-500">Please add items from the catalog before proceeding to checkout.</p>
        <button
          onClick={() => onNavigate('catalog')}
          className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-xs rounded-xl cursor-pointer"
        >
          Browse Products
        </button>
      </div>
    );
  }

  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Form input validation
    if (!fullName.trim() || !phone.trim() || !street.trim() || !city.trim() || !postalCode.trim()) {
      setErrorMessage('Please complete all required shipping and delivery address fields.');
      return;
    }

    if (!user) {
      setErrorMessage('Please sign in or register to complete your order checkout.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Authoritative Backend Validation of Cart & Inventory
      const cartValidation = await api.validateCart(
        cart.map((item) => ({ productId: item.productId, quantity: item.quantity }))
      );

      if (!cartValidation.success) {
        throw new Error('Some items in your cart are no longer available in the requested quantity.');
      }

      // 2. Create Pending Order on Express Backend
      const orderRes = await api.createOrder({
        orderItems: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        shippingAddress: {
          fullName,
          phone,
          street,
          city,
          state,
          postalCode,
          country,
        },
        paymentMethod,
      });

      const order = orderRes.data;
      setCreatedOrder(order);

      // 3. Initiate Razorpay Order on Backend
      const rzpRes = await api.createPaymentOrder(order.id);
      setRazorpayOrderData(rzpRes.data);

      // 4. Open Razorpay Checkout Interface
      setIsRazorpayModalOpen(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initiate checkout order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = (verifiedOrder: Order) => {
    setIsRazorpayModalOpen(false);
    clearCart();
    onOrderSuccess(verifiedOrder);
  };

  const handlePaymentFailure = (msg: string) => {
    setErrorMessage(`Payment error: ${msg}. You can retry or choose a different payment method.`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top breadcrumb */}
      <button
        onClick={() => onNavigate('cart')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Shopping Cart</span>
      </button>

      <div className="border-b border-slate-200 pb-4">
        <div className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-1">
          Step 2 of 2: Delivery &amp; Payment
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Checkout &amp; Gateway Order
        </h1>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Grid: Form Left + Summary Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Delivery Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 space-y-6">
          <form onSubmit={handleProceedToPayment} className="space-y-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                1. Delivery &amp; Shipping Address
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recipient Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900"
                    placeholder="Enter full name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900"
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Street Address / Flat / Floor *
                  </label>
                  <input
                    type="text"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900"
                    placeholder="Street name, Apartment, Block"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900"
                    placeholder="City"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900"
                    placeholder="State"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PIN / Postal Code *</label>
                  <input
                    type="text"
                    required
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900"
                    placeholder="6-digit PIN"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
                  <input
                    type="text"
                    disabled
                    value={country}
                    className="w-full text-xs px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="pt-4 border-t border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                2. Payment Method
              </h2>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === 'Razorpay'}
                    onChange={() => setPaymentMethod('Razorpay')}
                    className="text-slate-900"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Razorpay Payment Gateway (Test Mode)
                      </span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Supports Test Cards, UPI, NetBanking with HMAC-SHA256 signature verification.
                    </p>
                  </div>
                  <CreditCard className="w-5 h-5 text-slate-500 shrink-0" />
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Verifying Cart & Creating Razorpay Order...'
                  : `Pay ₹${totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })} with Razorpay`}
              </span>
            </button>
          </form>
        </div>

        {/* Right Column: Order Items & Pricing Breakdown */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 space-y-6 sticky top-24 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
            Purchased Item Snapshots ({cart.length})
          </h2>

          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
            {cart.map((item) => (
              <div key={item.productId} className="py-3 first:pt-0 last:pb-0 flex items-center gap-3">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-12 h-12 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 truncate">
                  <h4 className="text-xs font-semibold text-slate-900 truncate">{item.name}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                    <span>Qty: {item.quantity}</span>
                    <span>·</span>
                    <span>₹{item.price.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <span className="text-xs font-bold font-mono tabular-nums text-slate-900">
                  ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ₹{itemsPrice.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>GST (18% Goods &amp; Services Tax)</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ₹{taxPrice.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Shipping Fee</span>
              <span className="font-mono tabular-nums">
                {shippingPrice === 0 ? <span className="text-emerald-700 font-semibold">FREE</span> : `₹${shippingPrice}`}
              </span>
            </div>
            <div className="border-t border-slate-200 pt-3 flex justify-between text-base font-bold text-slate-900">
              <span>Total Payable</span>
              <span className="font-mono tabular-nums">₹{totalPrice.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Razorpay Test Security Guarantee</span>
            </div>
            <p>
              Prices are strictly validated server-side against database inventory before generating order tokens.
            </p>
          </div>
        </div>
      </div>

      {/* Razorpay Interactive Test Checkout Modal */}
      {isRazorpayModalOpen && createdOrder && razorpayOrderData && (
        <RazorpayModal
          isOpen={isRazorpayModalOpen}
          onClose={() => setIsRazorpayModalOpen(false)}
          order={createdOrder}
          razorpayData={razorpayOrderData}
          onSuccess={handlePaymentSuccess}
          onFailure={handlePaymentFailure}
        />
      )}
    </div>
  );
};
