import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lock, ShieldCheck, AlertCircle, CreditCard, User, Phone, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../services/api';
import { Order } from '../types';
import { RazorpayModal } from '../components/RazorpayModal';
import { StateSelectModal } from '../components/StateSelectModal';

interface CheckoutPageProps {
  onNavigate: (view: string, param?: string) => void;
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onNavigate, onOrderSuccess }) => {
  const { user } = useAuth();
  const { cart, itemsPrice, shippingPrice, taxPrice, totalPrice, clearCart } = useCart();

  // Delivery Address Form State (Matching Indian e-commerce layout from video)
  const [recipientName, setRecipientName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [houseBuilding, setHouseBuilding] = useState('');
  const [roadArea, setRoadArea] = useState('');
  const [postalCode, setPostalCode] = useState(user?.address?.postalCode || '');
  const [city, setCity] = useState(user?.address?.city || '');
  const [state, setState] = useState(user?.address?.state || 'Andhra Pradesh');
  const [isStateModalOpen, setIsStateModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'Razorpay' | 'Card' | 'UPI'>('Razorpay');

  const phoneClean = phone.replace(/\D/g, '');
  const isPhoneValid = phoneClean.length === 10;
  const phoneError = (phoneTouched || phone.length > 0) && !isPhoneValid;

  // Sync with user profile once loaded
  useEffect(() => {
    if (user) {
      if (!recipientName && user.name) setRecipientName(user.name);
      if (!phone && user.phone) setPhone(user.phone.replace(/\D/g, '').slice(0, 10));
      if (user.address) {
        if (!houseBuilding && !roadArea && user.address.street) {
          const parts = user.address.street.split(',');
          if (parts.length > 1) {
            setHouseBuilding(parts[0].trim());
            setRoadArea(parts.slice(1).join(',').trim());
          } else {
            setRoadArea(user.address.street);
          }
        }
        if (user.address.state) setState(user.address.state);
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

    // Form input validation matching video fields
    if (
      !recipientName.trim() ||
      !phone.trim() ||
      !houseBuilding.trim() ||
      !roadArea.trim() ||
      !postalCode.trim() ||
      !state.trim() ||
      !city.trim()
    ) {
      setPhoneTouched(true);
      setErrorMessage(
        'Please complete all required delivery address fields (Recipient Name, Contact Phone, House/Building, Road/Area, PIN Code, State, and City).'
      );
      return;
    }

    // Phone number strict 10-digit validation
    const cleanPhoneDigits = phone.replace(/\D/g, '');
    if (cleanPhoneDigits.length !== 10) {
      setPhoneTouched(true);
      setErrorMessage(
        cleanPhoneDigits.length === 0
          ? 'Contact phone number is required and must be 10 digits.'
          : `Phone number must be exactly 10 digits. You entered ${cleanPhoneDigits.length} digit${cleanPhoneDigits.length === 1 ? '' : 's'}.`
      );
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
        throw new Error(
          'Online payments are not available yet. The store administrator must add Razorpay Test Mode credentials before checkout can be enabled.'
        );
      }

      // 1. Authoritative Backend Validation of Cart & Inventory
      const cartValidation = await api.validateCart(
        cart.map((item) => ({ productId: item.productId, quantity: item.quantity }))
      );

      if (!cartValidation.success) {
        throw new Error('Some items in your cart are no longer available in the requested quantity.');
      }

      // 2. Create Pending Order on Express Backend
      const combinedStreet = `${houseBuilding.trim()}, ${roadArea.trim()}`;
      const orderRes = await api.createOrder({
        orderItems: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        shippingAddress: {
          fullName: recipientName.trim(),
          phone: phone.trim(),
          street: combinedStreet,
          city: city.trim(),
          district: '',
          state: state.trim(),
          postalCode: postalCode.trim(),
          country: 'India',
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
                  1. Delivery Address
                </h2>
                {user && (
                  <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Account: <strong className="text-slate-700">{user.email}</strong></span>
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {/* Row 1: Recipient Name and Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Recipient Name */}
                  <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white transition-all">
                    <label className="block text-[11px] font-medium text-slate-500">
                      Recipient Name *
                    </label>
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        required
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                        placeholder="Enter recipient name"
                      />
                      {recipientName.trim().length > 0 && (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                      )}
                    </div>
                  </div>

                  {/* Contact Phone Number */}
                  <div>
                    <div
                      className={`relative border rounded-xl px-3.5 pt-2.5 pb-2 bg-white transition-all ${
                        phoneError
                          ? 'border-rose-400 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500'
                          : 'border-slate-300 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600'
                      }`}
                    >
                      <label className="block text-[11px] font-medium text-slate-500">
                        Contact Phone Number *
                      </label>
                      <div className="flex items-center justify-between">
                        <input
                          type="tel"
                          required
                          maxLength={10}
                          value={phone}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                            setPhone(digits);
                            setPhoneTouched(true);
                          }}
                          onBlur={() => setPhoneTouched(true)}
                          className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                          placeholder="10-digit mobile number"
                        />
                        {isPhoneValid && (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                        )}
                        {phoneError && (
                          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 ml-2" />
                        )}
                      </div>
                    </div>
                    {phoneError && (
                      <p className="text-[11px] text-rose-600 mt-1 px-1 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {phoneClean.length === 0
                            ? 'Phone number is required (10 digits)'
                            : `Phone number must be exactly 10 digits (${phoneClean.length}/10 entered)`}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Row 2: House No., Building Name */}
                <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white transition-all">
                  <label className="block text-[11px] font-medium text-slate-500">
                    House No., Building Name *
                  </label>
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      required
                      value={houseBuilding}
                      onChange={(e) => setHouseBuilding(e.target.value)}
                      className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                      placeholder="e.g. Flat 302, Green Apartment"
                    />
                    {houseBuilding.trim().length > 0 && (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                    )}
                  </div>
                </div>

                {/* Row 3: Road Name, Area, Colony */}
                <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white transition-all">
                  <label className="block text-[11px] font-medium text-slate-500">
                    Road Name, Area, Colony *
                  </label>
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      required
                      value={roadArea}
                      onChange={(e) => setRoadArea(e.target.value)}
                      className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                      placeholder="e.g. MG Road, Indiranagar"
                    />
                    {roadArea.trim().length > 0 && (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                    )}
                  </div>
                </div>

                {/* Row 4: PIN Code and State (Side-by-side like video) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* PIN Code */}
                  <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white transition-all">
                    <label className="block text-[11px] font-medium text-slate-500">
                      PIN Code *
                    </label>
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                        placeholder="6-digit PIN code"
                      />
                      {postalCode.trim().length >= 6 && (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                      )}
                    </div>
                  </div>

                  {/* State (Click to open state selector sheet matching video) */}
                  <div
                    onClick={() => setIsStateModalOpen(true)}
                    className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 bg-white cursor-pointer hover:border-purple-500 transition-all select-none group"
                  >
                    <label className="block text-[11px] font-medium text-slate-500 cursor-pointer">
                      State *
                    </label>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 truncate py-0.5">
                        {state || 'Select State'}
                      </span>
                      {state ? (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                      ) : (
                        <span className="text-xs text-purple-600 font-bold group-hover:underline">
                          Choose
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 5: City */}
                <div className="relative border border-slate-300 rounded-xl px-3.5 pt-2.5 pb-2 focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-600 bg-white transition-all">
                  <label className="block text-[11px] font-medium text-slate-500">
                    City *
                  </label>
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-hidden py-0.5"
                      placeholder="e.g. Hyderabad, Bengaluru, Mumbai"
                    />
                    {city.trim().length > 0 && (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* State Select Bottom Sheet Modal */}
            <StateSelectModal
              isOpen={isStateModalOpen}
              onClose={() => setIsStateModalOpen(false)}
              selectedState={state}
              onSelectState={(st) => setState(st)}
            />

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
              className="w-full py-4 bg-purple-700 hover:bg-purple-800 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>
                {paymentConfigStatus === 'checking'
                  ? 'Checking payment availability…'
                  : paymentConfigStatus === 'unavailable'
                    ? 'Online payment setup required'
                    : isSubmitting
                      ? 'Verifying cart & creating payment order…'
                      : `Save & Continue · Pay ₹${totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
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
