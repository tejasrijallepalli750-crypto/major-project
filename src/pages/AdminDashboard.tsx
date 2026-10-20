import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Package,
  ShoppingBag,
  Users,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  RefreshCw,
  Search,
  X,
  ExternalLink,
  Database,
  UploadCloud,
  FileSpreadsheet,
  FolderOpen,
  ArrowRight,
  Download,
} from 'lucide-react';
import { api } from '../services/api';
import { Product, Order } from '../types';
import { useAuth } from '../context/AuthContext';
import { generateInvoicePDF } from '../utils/invoiceGenerator';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'dataset'>('overview');
  const [stats, setStats] = useState<any | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Dataset State
  const [datasetInfo, setDatasetInfo] = useState<{
    folderPath: string;
    filesCount: number;
    files: Array<{ name: string; size: number; updatedAt: string; type: string }>;
  } | null>(null);
  const [isSyncingDataset, setIsSyncingDataset] = useState(false);
  const [isUploadingDataset, setIsUploadingDataset] = useState(false);
  const [rawFileText, setRawFileText] = useState('');
  const [customFileName, setCustomFileName] = useState('products_custom.csv');

  // Product Add / Edit Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: 0,
    category: 'Electronics',
    stock: 20,
    sku: '',
    image: '',
    brand: 'AURA Custom',
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, prodRes, ordersRes, datasetRes] = await Promise.all([
        api.getAdminStats(),
        api.getProducts({ limit: 100 }),
        api.getAllOrders(),
        api.getDatasetStatus().catch(() => ({ success: true, folderPath: '/dataset', filesCount: 0, files: [] })),
      ]);
      setStats(statsRes.data);
      setProducts(prodRes.data);
      setOrders(ordersRes.data);
      if (datasetRes && datasetRes.success) {
        setDatasetInfo(datasetRes);
      }
    } catch (err: any) {
      console.error('Failed to load admin stats', err);
      setMessage({ text: err.message || 'Failed to load administration data', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncDataset = async () => {
    setIsSyncingDataset(true);
    try {
      const res = await api.syncDataset();
      setMessage({
        text: res.message || `Successfully synced ${res.importedCount} product(s) from /dataset folder to storefront!`,
        type: 'success',
      });
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to sync dataset', type: 'error' });
    } finally {
      setIsSyncingDataset(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDataset(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          await api.uploadDatasetFile(file.name, content);
          setMessage({
            text: `File "${file.name}" uploaded to /dataset folder. Click "Sync Dataset to Storefront" to import products!`,
            type: 'success',
          });
          const updatedStatus = await api.getDatasetStatus();
          setDatasetInfo(updatedStatus);
        } catch (uploadErr: any) {
          setMessage({ text: uploadErr.message || 'Failed to save dataset file', type: 'error' });
        } finally {
          setIsUploadingDataset(false);
        }
      };
      reader.readAsText(file);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to read file', type: 'error' });
      setIsUploadingDataset(false);
    }
  };

  const handleSaveRawDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawFileText.trim()) {
      setMessage({ text: 'Please enter CSV or JSON dataset content', type: 'error' });
      return;
    }
    setIsUploadingDataset(true);
    try {
      await api.uploadDatasetFile(customFileName, rawFileText);
      setMessage({
        text: `Dataset file "${customFileName}" saved to /dataset folder successfully.`,
        type: 'success',
      });
      setRawFileText('');
      const updatedStatus = await api.getDatasetStatus();
      setDatasetInfo(updatedStatus);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save dataset file', type: 'error' });
    } finally {
      setIsUploadingDataset(false);
    }
  };

  const handleRegenerateSample = async () => {
    try {
      await api.createSampleDataset();
      setMessage({ text: 'Sample dataset recreated in /dataset/sample_products.csv', type: 'success' });
      const updatedStatus = await api.getDatasetStatus();
      setDatasetInfo(updatedStatus);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to recreate sample dataset', type: 'error' });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAddProduct = () => {
    setEditingProductId(null);
    setProductForm({
      name: '',
      description: '',
      price: 1999,
      category: 'Electronics',
      stock: 25,
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      image: '/images/product_headphones_matte_1792292817977.jpg',
      brand: 'AURA Signature',
    });
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProductId(prod.id);
    setProductForm({
      name: prod.name,
      description: prod.description,
      price: prod.price,
      category: prod.category,
      stock: prod.stock,
      sku: prod.sku,
      image: prod.image,
      brand: prod.brand,
    });
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProductId) {
        await api.updateProduct(editingProductId, productForm);
        setMessage({ text: 'Product updated successfully in database.', type: 'success' });
      } else {
        await api.createProduct(productForm);
        setMessage({ text: 'New product added to catalog successfully.', type: 'success' });
      }
      setIsProductModalOpen(false);
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save product.', type: 'error' });
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete product "${name}"?`)) return;
    try {
      await api.deleteProduct(id);
      setMessage({ text: `Product "${name}" deleted.`, type: 'success' });
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to delete product', type: 'error' });
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      await api.updateOrderStatus(orderId, status);
      setMessage({ text: `Order fulfillment status updated to ${status}.`, type: 'success' });
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update order status', type: 'error' });
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Administrator Access Required</h2>
        <p className="text-xs text-slate-500">
          This dashboard is protected by server-side role-based access control. Please sign in with an administrator account.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="text-xs uppercase font-bold tracking-wider text-emerald-700 mb-1">
            Protected Administration Console
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Store Operations &amp; Inventory
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage inventory, fulfil orders, and review payment records
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg cursor-pointer"
            title="Refresh database records"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="p-0.5 hover:opacity-75 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Overview &amp; Metrics
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'products'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Product Catalog ({products.length})
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Orders &amp; Fulfillment ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('dataset')}
          className={`px-4 py-2 rounded-lg cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'dataset'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>Dataset &amp; File Sync {datasetInfo ? `(${datasetInfo.filesCount})` : ''}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mb-3 text-slate-600" />
          <p className="text-xs">Loading administration records...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && stats && (
            <div className="space-y-8">
              {/* KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white border border-slate-200/80 p-5 rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs">
                    <span>Total Sales Revenue</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    ₹{stats.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    From {stats.paidOrdersCount} verified Razorpay transactions
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 p-5 rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs">
                    <span>Total Customer Orders</span>
                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    {stats.totalOrders}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {orders.filter((o) => o.status === 'Delivered').length} orders fulfilled &amp; delivered
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 p-5 rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs">
                    <span>Active Products</span>
                    <Package className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    {stats.totalProducts}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Across 6 retail categories
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 p-5 rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs">
                    <span>Low Stock Alerts</span>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    {stats.lowStockCount}
                  </div>
                  <div className="text-[11px] text-amber-700 font-medium">
                    Inventory &lt; 10 units threshold
                  </div>
                </div>
              </div>

              {/* Category Revenue Breakdown & Recent Orders */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Category Revenue */}
                <div className="lg:col-span-5 bg-white border border-slate-200/80 p-6 rounded-2xl space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Sales by Category
                  </h3>
                  <div className="space-y-3">
                    {stats.categoryRevenue.length === 0 ? (
                      <p className="text-xs text-slate-400">No revenue data recorded yet.</p>
                    ) : (
                      stats.categoryRevenue.map((cat: any) => (
                        <div key={cat.category} className="space-y-1 text-xs">
                          <div className="flex justify-between font-medium">
                            <span className="text-slate-700">{cat.category}</span>
                            <span className="font-mono tabular-nums text-slate-900 font-bold">
                              ₹{cat.revenue.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-slate-900 h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (cat.revenue / (stats.totalSales || 1)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Recent Orders Snapshot */}
                <div className="lg:col-span-7 bg-white border border-slate-200/80 p-6 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Recent Transactions
                    </h3>
                    <button
                      onClick={() => setActiveTab('orders')}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      View All Orders
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 overflow-x-auto">
                    {orders.slice(0, 5).map((order) => (
                      <div key={order.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                        <div>
                          <p className="font-mono font-bold text-slate-900">{order.orderNumber}</p>
                          <p className="text-[11px] text-slate-500">{order.user.name} · {order.user.email}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-slate-900">
                            ₹{order.totalPrice.toLocaleString('en-IN')}
                          </p>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              order.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {order.isPaid ? 'PAID' : 'PENDING'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRODUCTS MANAGEMENT */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Manage product listings, inventory levels, SKUs, and INR prices.
                </p>
                <button
                  onClick={handleOpenAddProduct}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Product</span>
                </button>
              </div>

              {/* Product Table */}
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-4">Product Details</th>
                        <th className="p-4">Category</th>
                        <th className="p-4">Price (INR)</th>
                        <th className="p-4">Inventory</th>
                        <th className="p-4">SKU</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-4 flex items-center gap-3">
                            <img
                              src={p.image}
                              alt={p.name}
                              className="w-10 h-10 object-cover rounded-lg bg-slate-100 border border-slate-200 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="truncate max-w-[240px]">
                              <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                              <p className="text-[11px] text-slate-400 truncate">{p.brand}</p>
                            </div>
                          </td>
                          <td className="p-4 text-slate-600">{p.category}</td>
                          <td className="p-4 font-mono font-bold text-slate-900 tabular-nums">
                            ₹{p.price.toLocaleString('en-IN')}
                          </td>
                          <td className="p-4">
                            <span
                              className={`font-mono font-semibold ${
                                p.stock === 0
                                  ? 'text-rose-600'
                                  : p.stock < 10
                                  ? 'text-amber-600'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {p.stock} in stock
                            </span>
                          </td>
                          <td className="p-4 font-mono text-[11px] text-slate-500">{p.sku}</td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenEditProduct(p)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                                title="Edit product"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Delete product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ORDERS MANAGEMENT */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <p className="text-xs text-slate-500">
                Manage customer orders, view gateway verification hashes, and advance fulfillment statuses.
              </p>

              <div className="space-y-4">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 font-mono">{order.orderNumber}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              order.isPaid ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {order.isPaid ? 'PAID (Razorpay Verified)' : 'PENDING PAYMENT'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Customer: {order.user.name} ({order.user.email}) · Placed: {new Date(order.createdAt).toLocaleString('en-IN')}
                        </p>
                      </div>

                      {/* Fulfillment Status Control */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Status:</span>
                        <select
                          value={order.status}
                          onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                          className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 cursor-pointer"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Processing">Processing</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Delivered">Delivered</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>

                        <button
                          onClick={() => generateInvoicePDF(order)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
                          title="Generate Invoice PDF"
                        >
                          <Package className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {order.orderItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl text-xs">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-10 h-10 object-cover rounded-lg bg-white border border-slate-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="truncate">
                            <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {item.quantity} × ₹{item.price.toLocaleString('en-IN')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Razorpay Transaction Signature Information */}
                    <div className="pt-2 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                      <div>
                        <span>Payment ID: </span>
                        <span className="font-mono text-slate-700">
                          {order.paymentResult?.razorpay_payment_id || 'Not available'}
                        </span>
                      </div>
                      <div>
                        <span>Destination: </span>
                        <span className="text-slate-700">
                          {order.shippingAddress.city}, {order.shippingAddress.state} ({order.shippingAddress.postalCode})
                        </span>
                      </div>
                      <div>
                        <span>Order Total: </span>
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          ₹{order.totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: DATASET MANAGEMENT & FILE SYNC */}
          {activeTab === 'dataset' && (
            <div className="space-y-6">
              {/* Directory Status Header Banner */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 sm:p-8 rounded-2xl shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-400">
                        Manual Dataset Directory Active
                      </span>
                    </div>
                    <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                      <FolderOpen className="w-5 h-5 text-emerald-400" />
                      <span>Connected Folder: <code className="bg-slate-800/80 px-2 py-0.5 rounded text-emerald-300 font-mono text-base">/dataset</code></span>
                    </h2>
                    <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                      You can manually add your CSV or JSON datasets directly into the project&apos;s <code className="text-white font-mono">/dataset</code> directory, or upload them through the form below. Once files are in the folder, click <strong>Sync Dataset to Storefront</strong> to parse and load them straight into the live catalog!
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
                    <button
                      onClick={handleSyncDataset}
                      disabled={isSyncingDataset}
                      className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncingDataset ? 'animate-spin' : ''}`} />
                      <span>{isSyncingDataset ? 'Parsing & Syncing...' : 'Sync Dataset to Storefront'}</span>
                    </button>
                    <button
                      onClick={handleRegenerateSample}
                      className="px-4 py-3 bg-slate-700/80 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      <span>Restore Sample CSV</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Detected Files in /dataset */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <Database className="w-4 h-4 text-slate-600" />
                      <span>Detected Dataset Files in /dataset/ ({datasetInfo?.files.length || 0})</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Files scanned directly from disk in the <code className="font-mono text-slate-700">/dataset/</code> project folder
                    </p>
                  </div>
                  <button
                    onClick={fetchData}
                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                    title="Re-scan directory"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {(!datasetInfo?.files || datasetInfo.files.length === 0) ? (
                  <div className="py-8 text-center text-slate-400 space-y-2">
                    <FolderOpen className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="text-xs font-medium text-slate-600">No dataset files currently detected in /dataset/</p>
                    <p className="text-[11px]">Add a CSV or JSON file below or place one in the /dataset folder.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="p-3">File Name</th>
                          <th className="p-3">Format</th>
                          <th className="p-3">File Size</th>
                          <th className="p-3">Last Modified</th>
                          <th className="p-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {datasetInfo.files.map((file) => (
                          <tr key={file.name} className="hover:bg-slate-50/60">
                            <td className="p-3 flex items-center gap-2.5 font-medium text-slate-900">
                              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span className="font-mono text-[11px]">{file.name}</span>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                                {file.type}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">
                              {(file.size / 1024).toFixed(1)} KB
                            </td>
                            <td className="p-3 text-slate-500 text-[11px]">
                              {new Date(file.updatedAt).toLocaleString()}
                            </td>
                            <td className="p-3 text-right">
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle className="w-3 h-3" />
                                <span>Ready to Sync</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Upload or Add Files Manually */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Method A: File Upload */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-slate-600" />
                    <span>Option 1: Upload File to /dataset/</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select a <code className="font-mono text-slate-700">.csv</code> or <code className="font-mono text-slate-700">.json</code> dataset file from your computer. It will be saved into the <code className="font-mono text-slate-700">/dataset/</code> directory.
                  </p>

                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-slate-400 transition-colors bg-slate-50">
                    <input
                      type="file"
                      id="dataset-file-input"
                      accept=".csv,.json"
                      onChange={handleUploadFile}
                      disabled={isUploadingDataset}
                      className="hidden"
                    />
                    <label
                      htmlFor="dataset-file-input"
                      className="cursor-pointer inline-flex flex-col items-center gap-2"
                    >
                      <UploadCloud className="w-8 h-8 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-700">
                        {isUploadingDataset ? 'Uploading to /dataset...' : 'Click to choose a .csv or .json file'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Supports products, catalogs, or custom e-commerce datasets
                      </span>
                    </label>
                  </div>
                </div>

                {/* Method B: Paste Dataset Content */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                    <span>Option 2: Paste Raw CSV / JSON</span>
                  </h3>
                  <form onSubmit={handleSaveRawDataset} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-semibold text-slate-700">Save as:</label>
                      <input
                        type="text"
                        value={customFileName}
                        onChange={(e) => setCustomFileName(e.target.value)}
                        placeholder="e.g. products_batch.csv"
                        className="flex-1 text-xs font-mono px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <textarea
                      rows={4}
                      value={rawFileText}
                      onChange={(e) => setRawFileText(e.target.value)}
                      placeholder="Paste CSV rows here (e.g. name,price,category,stock...)"
                      className="w-full text-[11px] font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                    <button
                      type="submit"
                      disabled={isUploadingDataset || !rawFileText.trim()}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Save File to /dataset/ Folder
                    </button>
                  </form>
                </div>
              </div>

              {/* Supported Columns & Guide */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-3 shadow-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Dataset Column Format Reference
                </h3>
                <p className="text-xs text-slate-500">
                  When adding CSV datasets to <code className="font-mono text-slate-700">/dataset/</code>, include the following standard column headers:
                </p>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[11px] overflow-x-auto text-slate-700">
                  <code>name,description,price,category,stock,sku,brand,image</code>
                </div>
                <div className="text-[11px] text-slate-500 space-y-1">
                  <p>• <strong>name</strong> (Required): Product title (e.g. &quot;AURA Wireless Headphones&quot;)</p>
                  <p>• <strong>price</strong> (Required): Price in INR (e.g. &quot;4999&quot;)</p>
                  <p>• <strong>category</strong>: Category name (e.g. &quot;Electronics&quot;, &quot;Audio &amp; Wearables&quot;)</p>
                  <p>• <strong>stock</strong>: Available inventory count (default: 20)</p>
                  <p>• <strong>sku</strong>: Unique product code (automatically generated if omitted)</p>
                  <p>• <strong>image</strong>: Image URL or studio asset path (fallback applied if omitted)</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add / Edit Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setIsProductModalOpen(false)} className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 z-10 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">
                {editingProductId ? 'Edit Product' : 'Add New Product to Catalog'}
              </h3>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  required
                  rows={2}
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price in INR (₹)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })}
                    className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Quantity</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: Number(e.target.value) })}
                    className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    <option value="Electronics">Electronics</option>
                    <option value="Audio & Wearables">Audio &amp; Wearables</option>
                    <option value="Bags & Accessories">Bags &amp; Accessories</option>
                    <option value="Home & Living">Home &amp; Living</option>
                    <option value="Apparel">Apparel</option>
                    <option value="Stationery & Books">Stationery &amp; Books</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU</label>
                  <input
                    type="text"
                    required
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Image URL / Local Asset Path</label>
                <input
                  type="text"
                  required
                  value={productForm.image}
                  onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg cursor-pointer"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
