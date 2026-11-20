import React, { useState, useEffect, useRef } from 'react';
import { Download, RefreshCw, AlertCircle, ShoppingBag, Trash2 } from 'lucide-react';
import { Order } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { generateInvoicePDF } from '../utils/invoiceGenerator';
import { BackButton } from '../components/BackButton';
import { RazorpayModal } from '../components/RazorpayModal';
import { CheckPaymentStatusButton } from '../components/CheckPaymentStatusButton';
import { OrderItemProductCard } from '../components/OrderItemProductCard';
import {
  canRequestOrderCancellation,
  getPaymentRetryVisibility,
  PaymentRefreshState,
} from '../utils/paymentRetry';

interface OrderHistoryPageProps {
  onNavigate: (view: string, param?: string) => void;
}

export const OrderHistoryPage: React.FC<OrderHistoryPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [removingOrderId, setRemovingOrderId] = useState<string | null>(null);
  const [paymentRefreshStatus, setPaymentRefreshStatus] = useState<Record<string, PaymentRefreshState>>({});
  const [refreshingPaymentOrderIds, setRefreshingPaymentOrderIds] = useState<Record<string, boolean>>({});
  const [cancellationStatus, setCancellationStatus] = useState<Record<string, boolean>>({});
  const [activeRetry, setActiveRetry] = useState<{
    order: Order;
    data: Awaited<ReturnType<typeof api.retryPaymentOrder>>['data'];
  } | null>(null);
  const retryLock = useRef(false);
  const removalLock = useRef(false);
  const paymentStatusRequests = useRef(new Map<
    string,
    ReturnType<typeof api.refreshOrderPaymentStatus>
  >());

  const requestPaymentStatusRefresh = (orderId: string) => {
    const activeRequest = paymentStatusRequests.current.get(orderId);
    if (activeRequest) return activeRequest;

    setRefreshingPaymentOrderIds((current) => ({ ...current, [orderId]: true }));
    const request = api.refreshOrderPaymentStatus(orderId).finally(() => {
      if (paymentStatusRequests.current.get(orderId) === request) {
        paymentStatusRequests.current.delete(orderId);
      }
      setRefreshingPaymentOrderIds((current) => ({ ...current, [orderId]: false }));
    });
    paymentStatusRequests.current.set(orderId, request);
    return request;
  };

  const loadPaymentRefreshStatus = async (orderList: Order[]): Promise<Order[]> => {
    const candidates = orderList.filter((order) =>
      !order.isPaid && order.status === 'Pending' && order.paymentMethod === 'Razorpay');
    const initialStatus: Record<string, PaymentRefreshState> = Object.fromEntries(candidates.map((order) => [
      order.id,
      order.razorpayOrderId ? 'verification-pending' : 'recovery',
    ]));
    setPaymentRefreshStatus(initialStatus);

    const results = await Promise.all(candidates.map(async (order) => {
      if (!order.razorpayOrderId) {
        return [order.id, { order, state: 'recovery' as const }] as const;
      }
      try {
        const status = await requestPaymentStatusRefresh(order.id);
        return [order.id, {
          order: status.order,
          state: status.state,
        }] as const;
      } catch (error) {
        console.error('Failed to refresh payment status in My Orders:', error);
        return [order.id, {
          order,
          state: 'verification-pending' as const,
        }] as const;
      }
    }));

    const refreshedById = new Map(results.map(([id, result]) => [id, result]));
    const refreshedOrders = orderList.map((order) => refreshedById.get(order.id)?.order || order);
    setOrders(refreshedOrders);
    setPaymentRefreshStatus(Object.fromEntries(results.map(([id, result]) => [id, result.state])));
    return refreshedOrders;
  };

  const checkPaymentStatus = async (order: Order) => {
    if (!order.razorpayOrderId || paymentStatusRequests.current.has(order.id)) return;
    setPaymentRefreshStatus((current) => ({
      ...current,
      [order.id]: 'verification-pending',
    }));
    try {
      const status = await requestPaymentStatusRefresh(order.id);
      setOrders((current) => current.map((saved) => saved.id === order.id ? status.order : saved));
      setPaymentRefreshStatus((current) => ({
        ...current,
        [order.id]: status.state,
      }));
    } catch (error) {
      console.error('Failed to check payment status in My Orders:', error);
      setPaymentRefreshStatus((current) => ({
        ...current,
        [order.id]: 'verification-pending',
      }));
    }
  };

  const loadCancellationStatus = async (orderList: Order[]) => {
    const candidates = orderList.filter(canRequestOrderCancellation);
    setCancellationStatus(Object.fromEntries(candidates.map((order) => [
      order.id,
      false,
    ])));
    const results = await Promise.all(candidates.map(async (order) => {
      try {
        const status = await api.getOrderCancellationStatus(order.id);
        return [order.id, status.canCancel] as const;
      } catch (error) {
        console.error('Failed to check order cancellation status in My Orders:', error);
        return [order.id, false] as const;
      }
    }));
    setCancellationStatus(Object.fromEntries(results));
  };

  const refreshOrderHistory = async () => {
    const result = await api.getMyOrders();
    setOrders(result.data);
    const updatedOrders = await loadPaymentRefreshStatus(result.data);
    await loadCancellationStatus(updatedOrders);
  };

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        await refreshOrderHistory();
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

  const retryPayment = async (order: Order) => {
    if (retryLock.current || activeRetry) return;
    retryLock.current = true;
    setRetryingOrderId(order.id);
    try {
      const result = await api.retryPaymentOrder(order.id);
      setActiveRetry({ order, data: result.data });
    } catch (error) {
      console.error('Failed to retry payment in My Orders:', error);
    } finally {
      retryLock.current = false;
      setRetryingOrderId(null);
    }
  };

  const handleRetrySuccess = (verifiedOrder: Order) => {
    setOrders((current) => current.map((order) => order.id === verifiedOrder.id ? verifiedOrder : order));
    setPaymentRefreshStatus((current) => ({
      ...current,
      [verifiedOrder.id]: 'paid',
    }));
    setActiveRetry(null);
  };

  const cancelOrder = async (order: Order) => {
    if (retryLock.current || activeRetry) return;
    const confirmed = window.confirm(
      'Cancel this order? AURA will first verify that payment cannot still complete. If payment status is unresolved, the order and any reserved inventory will remain unchanged.',
    );
    if (!confirmed) return;

    retryLock.current = true;
    setCancellingOrderId(order.id);
    try {
      const result = await api.cancelOrder(order.id);
      setOrders((current) => current.map((saved) => saved.id === result.data.id ? result.data : saved));
      await refreshOrderHistory();
    } catch (error) {
      console.error('Failed to cancel order in My Orders:', error);
    } finally {
      retryLock.current = false;
      setCancellingOrderId(null);
    }
  };

  const removeOrderFromHistory = async (order: Order) => {
    if (removalLock.current || retryLock.current || activeRetry) return;
    const confirmed = window.confirm(
      `Remove ${order.orderNumber} from My Orders? The order record and invoice will be retained for audit purposes.`,
    );
    if (!confirmed) return;

    removalLock.current = true;
    setRemovingOrderId(order.id);
    try {
      await api.removeOrderFromMyHistory(order.id);
      setOrders((current) => current.filter((saved) => saved.id !== order.id));
      try {
        await refreshOrderHistory();
      } catch (error) {
        console.error('Removed order history could not be refreshed:', error);
      }
    } catch (error) {
      console.error('Failed to remove order from My Orders:', error);
    } finally {
      removalLock.current = false;
      setRemovingOrderId(null);
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <BackButton onClick={() => onNavigate('home')} label="Back to Home" />
        <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Sign In to View Orders</h2>
        <p className="text-xs text-slate-500">Please sign in to access your order history and downloadable invoices.</p>
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
      <BackButton onClick={() => onNavigate('home')} label="Back to Home" />
      <div className="border-b border-slate-200 pb-4">
        <div className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-1">
          Customer Portal
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          My Order History &amp; Invoices
        </h1>
        <p className="text-xs text-slate-500 mt-1">
        Showing orders placed under {user.email}
        </p>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mb-3 text-slate-600" />
          <p className="text-xs">Loading your order history...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-4">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">No Orders Placed Yet</h3>
          <p className="text-xs text-slate-500">
            You haven't placed any orders with AURA yet. Explore the collection when you're ready.
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
          {orders.map((order) => {
            const refreshedPayment = paymentRefreshStatus[order.id];
            const awaitingStatus = order.paymentMethod === 'Razorpay'
              && !order.isPaid
              && order.status === 'Pending'
              && Boolean(order.razorpayOrderId)
              && !refreshedPayment;
            const retryVisibility = getPaymentRetryVisibility(
              order,
              Date.now(),
              awaitingStatus ? 'verification-pending' : refreshedPayment,
            );
            const cancellationCandidate = canRequestOrderCancellation(order);
            const canCancel = cancellationCandidate && cancellationStatus[order.id] === true;
            return (
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
                        PAID · RAZORPAY VERIFIED
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {order.status === 'Cancelled' && !order.isPaid && (
                    <button
                      onClick={() => removeOrderFromHistory(order)}
                      disabled={removingOrderId === order.id || Boolean(activeRetry)}
                      aria-label={`Delete order ${order.orderNumber} from My Orders`}
                      title="Remove this cancelled order from My Orders"
                      className="px-3.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{removingOrderId === order.id ? 'Removing…' : 'Delete'}</span>
                    </button>
                  )}
                  <CheckPaymentStatusButton
                    order={order}
                    providerState={awaitingStatus ? 'verification-pending' : refreshedPayment}
                    isChecking={Boolean(refreshingPaymentOrderIds[order.id]) || retryingOrderId === order.id || Boolean(activeRetry)}
                    onCheck={() => checkPaymentStatus(order)}
                  />
                  {retryVisibility === 'retry' && (
                    <button
                      onClick={() => retryPayment(order)}
                      disabled={retryingOrderId === order.id || cancellingOrderId === order.id || Boolean(activeRetry)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      {retryingOrderId === order.id ? 'Checking payment…' : 'Pay Again'}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => cancelOrder(order)}
                      disabled={cancellingOrderId === order.id || retryingOrderId === order.id || Boolean(activeRetry)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      {cancellingOrderId === order.id ? 'Checking cancellation…' : 'Cancel Order'}
                    </button>
                  )}
                  <button
                    onClick={() => generateInvoicePDF(order)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download order invoice</span>
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {order.orderItems.map((item, idx) => (
                  <OrderItemProductCard
                    key={`${item.product}-${idx}`}
                    item={item}
                    onNavigate={onNavigate}
                  />
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
                  <span>Order total: </span>
                  <span className="font-bold font-mono text-sm text-slate-900">
                    ₹{order.totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
      {activeRetry && (
        <RazorpayModal
          isOpen
          order={activeRetry.order}
          razorpayData={activeRetry.data}
          onClose={() => setActiveRetry(null)}
          onFailure={(message) => console.error('Razorpay checkout failed in My Orders:', message)}
          onSuccess={handleRetrySuccess}
        />
      )}
    </div>
  );
};
