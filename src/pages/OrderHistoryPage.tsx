import React, { useState, useEffect } from 'react';
import { Package, Download, ExternalLink, RefreshCw, AlertCircle, ShoppingBag } from 'lucide-react';
import { Order } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { generateInvoicePDF } from '../utils/invoiceGenerator';

interface OrderHistoryPageProps {
  onNavigate: (view: string, param?: string) => void;
}

export const OrderHistoryPage: React.FC<OrderHistoryPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const res = await api.getMyOrders();
        setOrders(res.data);
      } catch (err) {
        console.error('Failed to load order history', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (user) {
      fetchOrders();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Sign In to View Orders</h2>
        <p className="text-xs text-slate-500">Please sign in to access your order history and downloadable tax invoices.</p>
        <button
          onClick={() => onNavigate('login')}
          className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-xs rounded-xl cursor-pointer"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <div className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-1">
          Customer Portal
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          My Order History &amp; Invoices
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Showing orders placed under account {user.email}
        </p>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mb-3 text-slate-600" />
          <p className="text-xs">Fetching customer order history...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-4">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">No Orders Placed Yet</h3>
          <p className="text-xs text-slate-500">
            You haven't placed any orders with AURA Retail yet. Explore our catalog and complete a test purchase with Razorpay.
          </p>
          <button
            onClick={() => onNavigate('catalog')}
            className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-xs rounded-xl cursor-pointer"
          >
            Explore Catalog
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-xs"
            >
              {/* Top Row: Order Number & Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 font-mono">{order.orderNumber}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        order.status === 'Delivered'
                          ? 'bg-emerald-50 text-emerald-700'
                          : order.status === 'Processing'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {order.status.toUpperCase()}
                    </span>
                    {order.isPaid && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        PAID (Razorpay)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => generateInvoicePDF(order)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF Invoice</span>
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {order.orderItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-12 h-12 object-cover rounded-lg bg-white border border-slate-200 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-900 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {item.quantity} × ₹{item.price.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Row: Total & Delivery Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-xs text-slate-500">
                <div className="truncate">
                  <span>Shipping to: </span>
                  <span className="font-semibold text-slate-700">
                    {order.shippingAddress.fullName}, {order.shippingAddress.city} ({order.shippingAddress.postalCode})
                  </span>
                </div>
                <div className="text-right">
                  <span>Total Paid: </span>
                  <span className="font-bold font-mono text-sm text-slate-900">
                    ₹{order.totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
