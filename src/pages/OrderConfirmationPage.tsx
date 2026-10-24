import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle, Download, ShieldCheck, MapPin } from 'lucide-react';
import { Order } from '../types';
import { generateInvoicePDF } from '../utils/invoiceGenerator';
import { ProductImage } from '../components/ProductImage';
import { getOrderPaymentSummary } from '../utils/orderPaymentSummary';
import { BackButton } from '../components/BackButton';

interface OrderConfirmationPageProps {
  order: Order;
  onNavigate: (view: string) => void;
}

export const OrderConfirmationPage: React.FC<OrderConfirmationPageProps> = ({ order, onNavigate }) => {
  const paymentSummary = getOrderPaymentSummary(order);

  useEffect(() => {
    // Fire celebratory confetti on verified order completion
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch (e) {
      // Ignore if confetti context unavailable
    }
  }, []);

  const handleDownloadInvoice = () => {
    generateInvoicePDF(order);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <BackButton onClick={() => onNavigate('home')} label="Back to Home" />
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-10 text-center space-y-4 shadow-xs">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
          <CheckCircle className="w-10 h-10" />
        </div>

        <div className="space-y-1">
          <span className="text-xs uppercase font-bold tracking-widest text-emerald-700">
            Order confirmed
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Thank you for your order!
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            Order <span className="font-mono font-bold text-slate-900">{order.orderNumber}</span>
            {' is confirmed. You can follow its status from your account.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => onNavigate('catalog')}
            className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Continue shopping
          </button>
          <button
            onClick={handleDownloadInvoice}
            className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download invoice</span>
          </button>

          <button
            onClick={() => onNavigate('orders')}
            className="px-5 py-3 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            <span>View All Orders</span>
          </button>
        </div>
      </div>

      {/* Order Snapshot Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Gateway & Payment Details */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Payment Summary</span>
          </div>

          <div className="space-y-2 text-xs divide-y divide-slate-100">
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Payment status</span>
              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                {paymentSummary.statusLabel}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Payment reference</span>
              <span className="font-mono text-slate-800 text-[11px]">
                {paymentSummary.reference}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Payment method</span>
              <span className="font-semibold text-slate-800">{paymentSummary.methodLabel}</span>
            </div>
          </div>
        </div>

        {/* Shipping & Delivery Address */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span>Delivery address</span>
          </div>

          <div className="text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-900">{order.shippingAddress.fullName}</p>
            <p>{order.shippingAddress.street}</p>
            <p>
              {order.shippingAddress.city}
              {order.shippingAddress.district ? `, ${order.shippingAddress.district}` : ''}, {order.shippingAddress.state} - {order.shippingAddress.postalCode}
            </p>
            <p className="font-medium text-slate-700">{order.shippingAddress.country}</p>
            <p className="text-slate-500">Phone: {order.shippingAddress.phone}</p>
            <p className="text-slate-500">Email: {order.user.email}</p>
          </div>
        </div>
      </div>

      {/* Purchased Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Purchased Items ({order.orderItems.length})
        </h3>

        <div className="divide-y divide-slate-100">
          {order.orderItems.map((item, idx) => (
            <div key={idx} className="py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ProductImage
                  src={item.image}
                  name={item.name}
                  category={item.category}
                  sku={item.sku}
                  className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-slate-100"
                  imageClassName="h-full w-full object-cover"
                />
                <div>
                  <h4 className="text-xs font-semibold text-slate-900">{item.name}</h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Qty: {item.quantity} × ₹{item.price.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              <span className="text-xs font-bold font-mono text-slate-900">
                ₹{(item.price * item.quantity).toLocaleString('en-IN')}
              </span>
            </div>
          ))}
        </div>

        {/* Pricing Math Summary */}
        <div className="border-t border-slate-200 pt-4 space-y-1.5 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-mono">₹{order.itemsPrice.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between">
            <span>GST (18%):</span>
            <span className="font-mono">₹{order.taxPrice.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between">
            <span>Shipping:</span>
            <span className="font-mono">
              {order.shippingPrice === 0 ? 'FREE' : `₹${order.shippingPrice}`}
            </span>
          </div>
          <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold text-slate-900">
            <span>{order.isPaid ? 'Total Amount Paid:' : 'Order Total:'}</span>
            <span className="font-mono">₹{order.totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
