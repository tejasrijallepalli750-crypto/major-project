import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lock, ShieldCheck, AlertCircle, CreditCard, User, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../services/api';
import { Order } from '../types';
import { RazorpayModal } from '../components/RazorpayModal';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  COUNTRIES_A_TO_Z,
  STATES_A_TO_Z,
  DISTRICTS_A_TO_Z,
  CITIES_A_TO_Z,
} from '../data/locationData';

interface CheckoutPageProps {
  onNavigate: (view: string, param?: string) => void;
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onNavigate, onOrderSuccess }) => {
  const { user } = useAuth();
  const { cart, itemsPrice, shippingPrice, taxPrice, totalPrice, clearCart } = useCart();

  // Delivery Address Form State
  const [fullName, setFullName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [street, setStreet] = useState(user?.address?.street || '');
  const [country, setCountry] = useState(user?.address?.country || 'India');
  const [state, setState] = useState(user?.address?.state || 'Delhi');
  const [district, setDistrict] = useState(user?.address?.district || 'New Delhi');
  const [city, setCity] = useState(user?.address?.city || 'Delhi');
  const [postalCode, setPostalCode] = useState(user?.address?.postalCode || '');
  const [paymentMethod, setPaymentMethod] = useState<'Razorpay' | 'Card' | 'UPI'>('Razorpay');

  // Sync with user profile once loaded
  useEffect(() => {
    if (user) {
      if (!fullName && user.name) setFullName(user.name);
      if (!phone && user.phone) setPhone(user.phone);
      if (user.address) {
        if (!street && user.address.street) setStreet(user.address.street);
        if (user.address.country) setCountry(user.address.country);
        if (user.address.state) setState(user.address.state);
        if (user.address.district) setDistrict(user.address.district);
        if (user.address.city) setCity(user.address.city);
        if (!postalCode && user.address.postalCode) setPostalCode(user.address.postalCode);
      }
    }
  }, [user]);

  // State for order creation & Razorpay modal
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentConfigStatus, setPaymentConfigStatus] = useState<'checking' | 'configured' | 'unavailable'>('checking');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [razorpayOrderData, setRazorpayOrderData] = useState<
    Awaited<ReturnType<typeof api.createPaymentOrder>>['data'] | null
  >(null);
  const [isRazorpayModalOpen, setIsRazorpayModalOpen] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    api.getPaymentConfig()
      .then((config) => {
        if (isCurrent) setPaymentConfigStatus(config.isConfigured ? 'configured' : 'unavailable');
      })
      .catch((error: unknown) => {
        console.error('Unable to check payment configuration', error);
        if (isCurrent) setPaymentConfigStatus('unavailable');
      });
    return () => {
      isCurrent = false;
    };
  }, []);

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
    if (!fullName.trim() || !phone.trim() || !street.trim() || !city.trim() || !country.trim() || !postalCode.trim()) {
      setErrorMessage('Please complete all required shipping and delivery address fields (Name, Phone, Street, City, Country, and PIN/Postal Code).');
      return;
    }

    if (!user) {
      setErrorMessage('Please sign in or register to complete your order checkout.');
      return;
    }

    setIsSubmitting(true);
    try {
      const paymentConfig = await api.getPaymentConfig();
      if (!paymentConfig.isConfigured) {
        throw new Error('Online payments are not available yet. The store administrator must add Razorpay Test Mode credentials before checkout can be enabled.');
      }

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
          district,
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
          Secure checkout
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Delivery &amp; payment
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  1. Delivery &amp; Shipping Details
                </h2>
                {user && (
                  <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Booking for: <strong className="text-slate-700">{user.email}</strong></span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Username / Full Name */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Recipient Full Name *
                    </label>
                    {user?.name && fullName !== user.name && (
                      <button
                        type="button"
                        onClick={() => setFullName(user.name)}
                        className="text-[10px] text-slate-500 hover:text-slate-900 underline cursor-pointer"
                      >
                        Use account name
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900 focus:bg-white transition-colors"
                      placeholder="Enter recipient full name"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Contact Phone Number *
                    </label>
                    {user?.phone && phone !== user.phone && (
                      <button
                        type="button"
                        onClick={() => setPhone(user.phone || '')}
                        className="text-[10px] text-slate-500 hover:text-slate-900 underline cursor-pointer"
                      >
                        Use saved phone
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900 focus:bg-white transition-colors"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                {/* Street Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Street Address / Flat / Floor / Building *
                  </label>
                  <input
                    type="text"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900 focus:bg-white transition-colors"
                    placeholder="House/Flat No., Building name, Street name, Area"
                  />
                </div>

                {/* Country (Selectable from A to Z) */}
                <div>
                  <SearchableSelect
                    label="Country"
                    value={country}
                    onChange={setCountry}
                    options={COUNTRIES_A_TO_Z}
                    required
                    placeholder="Search or select country from A to Z..."
                    helperText="Select from all countries alphabetically"
                  />
                </div>

                {/* State / Province (Selectable from A to Z) */}
                <div>
                  <SearchableSelect
                    label="State / Province"
                    value={state}
                    onChange={setState}
                    options={STATES_A_TO_Z}
                    required
                    placeholder="Search or select state from A to Z..."
                    helperText="Select state or province alphabetically"
                  />
                </div>

                {/* District (Selectable from A to Z) */}
                <div>
                  <SearchableSelect
                    label="District"
                    value={district}
                    onChange={setDistrict}
                    options={DISTRICTS_A_TO_Z}
                    placeholder="Search or select district from A to Z..."
                    helperText="All major districts sorted alphabetically"
                  />
                </div>

                {/* City (Selectable from A to Z) */}
                <div>
                  <SearchableSelect
                    label="City"
                    value={city}
                    onChange={setCity}
                    options={CITIES_A_TO_Z}
                    required
                    placeholder="Search or select city from A to Z..."
                    helperText="Cities sorted alphabetically from A to Z"
                  />
                </div>

                {/* Postal Code (PIN) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    PIN / Postal / Zip Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900 focus:bg-white transition-colors"
                    placeholder="Enter 6-digit PIN code or Postal Code"
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
                      <span className="text-xs font-bold text-slate-900">Razorpay Test Mode</span>
                      {paymentConfigStatus === 'configured' && (
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                          TEST MODE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {paymentConfigStatus === 'configured'
                        ? 'Test credentials are configured. Payment is verified by the store server.'
                        : paymentConfigStatus === 'checking'
                          ? 'Checking payment availability…'
                          : 'Online payment setup is required before checkout can be completed.'}
                    </p>
                  </div>
                  <CreditCard className="w-5 h-5 text-slate-500 shrink-0" />
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || paymentConfigStatus !== 'configured'}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>
                {paymentConfigStatus === 'checking'
                  ? 'Checking payment availability…'
                  : paymentConfigStatus === 'unavailable'
                    ? 'Online payment setup required'
                    : isSubmitting
                      ? 'Verifying cart & creating payment order…'
                      : `Pay ₹${totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })} with Razorpay`}
              </span>
            </button>
          </form>
        </div>

        {/* Right Column: Order Items & Pricing Breakdown */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 space-y-6 sticky top-24 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
            Your items ({cart.length})
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
              <span>Secure order review</span>
            </div>
            <p>
              Prices and availability are checked again before payment is started.
            </p>
          </div>
        </div>
      </div>

      {/* Razorpay Checkout */}
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
