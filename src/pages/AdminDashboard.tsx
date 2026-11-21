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
import { isDemoTestOrder } from '../utils/orderPresentation';
import { isEstimatedOlistPrice } from '../utils/productPresentation';
import { BackButton } from '../components/BackButton';

interface AdminDashboardProps {
  onNavigate: (view: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'demo' | 'orders' | 'dataset'>('overview');
  const [stats, setStats] = useState<any | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productTotal, setProductTotal] = useState(0);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [demoModeStatus, setDemoModeStatus] = useState<'unknown' | 'enabled' | 'disabled'>('unknown');
  const [demoPurchasingAvailable, setDemoPurchasingAvailable] = useState(false);
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
  const [inventoryProduct, setInventoryProduct] = useState<Product | null>(null);
  const [inventoryStock, setInventoryStock] = useState('');
  const [inventoryConfirmed, setInventoryConfirmed] = useState(false);
  const [isSavingInventory, setIsSavingInventory] = useState(false);
  const [demoProduct, setDemoProduct] = useState<Product | null>(null);
  const [demoEligible, setDemoEligible] = useState(false);
  const [demoStock, setDemoStock] = useState('');
  const [isSavingDemoInventory, setIsSavingDemoInventory] = useState(false);
  const [isReconcilingDemo, setIsReconcilingDemo] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: 0,
    category: 'Computers & Accessories',
    sku: '',
    image: '',
    brand: 'AURA Custom',
    status: 'active' as Product['status'],
  });

  const fetchData = async (): Promise<string | null> => {
    setIsLoading(true);
    setOrdersLoaded(false);
    try {
      const results = await Promise.allSettled([
        api.getAdminStats(),
        api.getProducts({
          search: productSearch || undefined,
          page: productPage,
          limit: 50,
          includeInactive: true,
        }),
        api.getAllOrders(),
        api.getDatasetStatus(),
        api.getPaymentConfig(),
      ]);

      const errors: string[] = [];
      const getErrorMessage = (reason: unknown, fallback: string) =>
        reason instanceof Error ? reason.message : fallback;

      if (results[0].status === 'fulfilled') {
        setStats(results[0].value.data);
      } else {
        errors.push(`Store statistics: ${getErrorMessage(results[0].reason, 'request failed')}`);
      }

      if (results[1].status === 'fulfilled') {
        setProducts(results[1].value.data);
        setProductTotal(results[1].value.total);
        setProductTotalPages(results[1].value.totalPages);
        setProductPage(results[1].value.page);
      } else {
        errors.push(`Product catalog: ${getErrorMessage(results[1].reason, 'request failed')}`);
      }

      if (results[2].status === 'fulfilled') {
        setOrders(results[2].value.data);
        setOrdersLoaded(true);
      } else {
        errors.push(`Orders: ${getErrorMessage(results[2].reason, 'request failed')}`);
      }

      if (results[3].status === 'fulfilled') {
        setDatasetInfo(results[3].value);
      } else {
        errors.push(`Dataset status: ${getErrorMessage(results[3].reason, 'request failed')}`);
      }

      if (results[4].status === 'fulfilled') {
        const paymentConfig = results[4].value;
        setDemoModeEnabled(paymentConfig.demoModeEnabled === true);
        setDemoModeStatus(typeof paymentConfig.demoModeEnabled === 'boolean'
          ? paymentConfig.demoModeEnabled ? 'enabled' : 'disabled'
          : 'unknown');
        setDemoPurchasingAvailable(paymentConfig.demoPurchasingAvailable === true);
      } else {
        setDemoModeEnabled(false);
        setDemoModeStatus('unknown');
        setDemoPurchasingAvailable(false);
        errors.push(`Demo-mode configuration: ${getErrorMessage(results[4].reason, 'request failed')}`);
      }

      if (errors.length > 0) {
        const errorMessage = `Some administration data could not be loaded. ${errors.join('. ')}`;
        setMessage({ text: errorMessage, type: 'error' });
        return errorMessage;
      }
      return null;
    } catch (err: unknown) {
      console.error('Failed to load administration data', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load administration data';
      setMessage({ text: errorMessage, type: 'error' });
      return errorMessage;
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProductPage = async (search: string, page: number) => {
    try {
      const result = await api.getProducts({
        search: search || undefined,
        page,
        limit: 50,
        includeInactive: true,
      });
      setProducts(result.data);
      setProductTotal(result.total);
      setProductTotalPages(result.totalPages);
      setProductPage(result.page);
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Failed to load product results.',
        type: 'error',
      });
    }
  };

  const handleProductSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const search = productSearch.trim();
    setProductSearch(search);
    setProductPage(1);
    await fetchProductPage(search, 1);
  };

  const handleSyncDataset = async () => {
    setIsSyncingDataset(true);
    try {
      const res = await api.syncDataset();
      const refreshError = await fetchData();
      const resultDetails = [
        `${res.importedCount} product(s) added`,
        `${res.updatedCount} existing product(s) refreshed`,
        `${res.duplicateCount} already present`,
        `${res.invalidCount} invalid row(s) skipped`,
        `processed: ${res.processedFiles.join(', ') || 'no files'}`,
        ...res.errors,
      ];
      if (refreshError) resultDetails.push(`Dashboard refresh failed: ${refreshError}`);
      setMessage({
        text: resultDetails.join('. '),
        type: res.errors.length > 0 || refreshError ? 'error' : 'success',
      });
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Failed to sync dataset', type: 'error' });
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
      category: 'Computers & Accessories',
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      image: '',
      brand: 'AURA Signature',
      status: 'active',
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
      sku: prod.sku,
      image: prod.image,
      brand: prod.brand,
      status: prod.status,
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
        await api.createProduct({ ...productForm, stock: 0 });
        setMessage({ text: 'New product added to catalog successfully.', type: 'success' });
      }
      setIsProductModalOpen(false);
      fetchData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save product.', type: 'error' });
    }
  };

  const handleOpenInventory = (product: Product) => {
    setInventoryProduct(product);
    setInventoryStock(product.inventoryStatus === 'verified' ? String(product.stock) : '');
    setInventoryConfirmed(false);
  };

  const handleSaveInventory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inventoryProduct || !inventoryConfirmed) return;
    const stock = Number(inventoryStock);
    if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
      setMessage({ text: 'Enter a whole-number physical count from 0 to 1,000,000.', type: 'error' });
      return;
    }

    setIsSavingInventory(true);
    try {
      await api.updateProductInventory(inventoryProduct.id, { stock, confirmPhysicalCount: true });
      setMessage({
        text: `Verified available quantity for "${inventoryProduct.name}" was saved.`,
        type: 'success',
      });
      setInventoryProduct(null);
      await fetchData();
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Failed to save verified inventory.',
        type: 'error',
      });
    } finally {
      setIsSavingInventory(false);
    }
  };

  const handleOpenDemoInventory = (product: Product) => {
    setDemoProduct(product);
    setDemoEligible(product.demoEligible === true);
    setDemoStock(product.demoStock ? String(product.demoStock) : '');
  };

  const handleSaveDemoInventory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!demoProduct) return;
    const stock = demoEligible ? Number(demoStock) : 0;
    if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000 || (demoEligible && stock === 0)) {
      setMessage({
        text: demoEligible
          ? 'Enter a positive whole-number demo quantity from 1 to 1,000,000 when enabling demo purchases.'
          : 'Demo quantity must be a whole number from 0 to 1,000,000.',
        type: 'error',
      });
      return;
    }

    if (!demoEligible) {
      if (!ordersLoaded) {
        setMessage({
          text: 'Active demo reservations could not be checked. Refresh administration data before disabling demo purchasing.',
          type: 'error',
        });
        return;
      }
      const activeReservations = orders.filter((order) =>
        (order.purchaseMode === 'demo' || order.orderItems.some((item) => item.purchaseMode === 'demo'))
        && order.demoReservationStatus === 'reserved'
        && order.status === 'Pending'
        && order.orderItems.some((item) => item.product === demoProduct.id),
      ).length;
      if (activeReservations > 0 && !window.confirm(
        `${activeReservations} active demo reservation(s) exist for this product. The server will protect these reservations and may block the change until they are resolved. Continue?`,
      )) {
        return;
      }
    }

    setIsSavingDemoInventory(true);
    try {
      await api.updateDemoInventory(demoProduct.id, { eligible: demoEligible, demoStock: stock });
      setMessage({
        text: demoEligible
          ? `Demonstration quantity for "${demoProduct.name}" was saved separately from physical stock.`
          : `Demonstration purchasing was disabled for "${demoProduct.name}".`,
        type: 'success',
      });
      setDemoProduct(null);
      await fetchData();
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Failed to save demonstration inventory.',
        type: 'error',
      });
    } finally {
      setIsSavingDemoInventory(false);
    }
  };

  const handleReconcileDemoReservations = async () => {
    setIsReconcilingDemo(true);
    try {
      const { data } = await api.reconcileDemoInventory();
      setMessage({
        text: data.skipped
          ? 'Reconciliation was skipped because demo mode or Razorpay TEST credentials are unavailable.'
          : `Expired demo reservations checked: ${data.scanned}; released: ${data.released}; retained for safety: ${data.retained}.`,
        type: data.retained > 0 ? 'error' : 'success',
      });
      await fetchData();
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Failed to reconcile demo reservations.',
        type: 'error',
      });
    } finally {
      setIsReconcilingDemo(false);
    }
  };

  const handleToggleProductStatus = async (product: Product) => {
    const nextStatus = product.status === 'active' ? 'inactive' : 'active';
    const action = nextStatus === 'inactive' ? 'deactivate' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${action} "${product.name}"?`)) return;
    try {
      if (nextStatus === 'inactive') await api.deleteProduct(product.id);
      else await api.updateProduct(product.id, { status: nextStatus });
      setMessage({ text: `Product "${product.name}" ${nextStatus === 'active' ? 'reactivated' : 'deactivated'}.`, type: 'success' });
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
        <BackButton onClick={() => onNavigate('home')} label="Back to Home" />
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
      <BackButton onClick={() => onNavigate('home')} label="Back to Home" />
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
          <button
            type="button"
            onClick={handleOpenAddProduct}
            className="ml-3 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" />
            Add product
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

      {demoModeStatus !== 'enabled' ? (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
          {demoModeStatus === 'unknown'
            ? 'The application server did not report its demo-mode status. Restart it with the current project code before managing demo inventory.'
            : 'Demo inventory management is disabled. In development, set DEMO_MODE_ENABLED=true. Production requires PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED=true and valid Razorpay TEST credentials; live credentials always disable it.'}
        </div>
      ) : !demoPurchasingAvailable ? (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
          Demo inventory management is enabled, but Razorpay TEST checkout is not ready. Demo purchases remain blocked until valid TEST credentials are configured.
        </div>
      ) : null}

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
          Product Catalog ({stats?.totalProducts ?? products.length})
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
          onClick={() => setActiveTab('demo')}
          className={`px-4 py-2 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'demo'
              ? 'bg-violet-800 text-white'
              : 'text-violet-800 hover:text-violet-950 hover:bg-violet-50'
          }`}
        >
          Demo Inventory <span className="text-[10px]">· TEST only</span>
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
                    From {stats.paidOrdersCount} physical Razorpay transactions; DEMO/TEST payments are excluded
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 p-5 rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 text-xs">
                    <span>Total Physical Orders</span>
                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    {stats.physicalOrdersCount}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {orders.filter((o) => !isDemoTestOrder(o) && o.status === 'Delivered').length} delivered · {stats.demoOrdersCount} DEMO/TEST orders excluded
                  </div>
                  <div className="text-[10px] text-violet-700">
                    {stats.demoPaidOrdersCount} Razorpay TEST payments are not counted as sales
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
                  Manage active and inactive product listings stored in the catalog database.
                </p>
                <button
                  onClick={() => setActiveTab('dataset')}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Import catalog file</span>
                </button>
              </div>

              <form onSubmit={handleProductSearch} className="flex gap-2">
                <label htmlFor="admin-product-search" className="sr-only">Search products by name or SKU</label>
                <input
                  id="admin-product-search"
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search products by name, SKU, or category"
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                />
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </form>

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
                        <th className="p-4">Status</th>
                        <th className="p-4">Actions</th>
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
                            {isEstimatedOlistPrice(p.sku) && (
                              <p className="mt-1 font-sans text-[10px] font-medium text-amber-700">Historical Olist estimate</p>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`font-semibold ${p.inventoryStatus === 'verified' ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {p.inventoryStatus === 'verified' ? `${p.stock} verified available` : `Unverified quantity: ${p.stock}`}
                            </span>
                            {p.inventoryVerifiedAt && (
                              <p className="mt-1 text-[10px] text-slate-400">
                                Checked {new Date(p.inventoryVerifiedAt).toLocaleDateString('en-IN')}
                              </p>
                            )}
                          </td>
                          <td className="p-4 font-mono text-[11px] text-slate-500">{p.sku}</td>
                          <td className="p-4">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => handleOpenInventory(p)} aria-label={`Verify inventory for ${p.name}`} className="rounded-md p-1.5 text-amber-700 hover:bg-amber-50">
                                <Package className="h-4 w-4" />
                              </button>
                              {demoModeEnabled && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDemoInventory(p)}
                                  aria-label={`Manage demonstration stock for ${p.name}`}
                                  className="rounded-md px-2 py-1 text-[10px] font-bold text-violet-800 hover:bg-violet-50"
                                >
                                  DEMO
                                </button>
                              )}
                              <button type="button" onClick={() => handleOpenEditProduct(p)} aria-label={`Edit ${p.name}`} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100">
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => handleToggleProductStatus(p)} aria-label={`${p.status === 'active' ? 'Deactivate' : 'Reactivate'} ${p.name}`} className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50">
                                {p.status === 'active' ? <Trash2 className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                  <span>{productTotal.toLocaleString('en-IN')} products · page {productPage} of {productTotalPages}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={productPage <= 1}
                      onClick={() => { const page = productPage - 1; setProductPage(page); void fetchProductPage(productSearch, page); }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={productPage >= productTotalPages}
                      onClick={() => { const page = productPage + 1; setProductPage(page); void fetchProductPage(productSearch, page); }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'demo' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Demo Inventory</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Select a small set of products and manage separate Razorpay TEST quantities. Physical inventory is not changed or verified.
                </p>
              </div>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs leading-relaxed text-violet-900">
                {demoModeStatus === 'enabled'
                  ? 'Demo quantities are separate from physical stock and are never treated as physically verified.'
                  : demoModeStatus === 'disabled'
                    ? 'Demo mode is disabled by the server. Inventory is read-only until it is enabled in a non-production environment.'
                    : 'The server has not confirmed demo mode. Inventory controls remain read-only until server configuration is available.'}
                {' '}Select only a small set of products for Razorpay TEST demonstrations.
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void fetchProductPage(productSearch, productPage)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh inventory
                </button>
              </div>
              <form onSubmit={handleProductSearch} className="flex gap-2">
                <label htmlFor="demo-product-search" className="sr-only">Search products for demo inventory</label>
                <input
                  id="demo-product-search"
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search products by name or SKU"
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                />
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-violet-800 px-4 py-2 text-xs font-semibold text-white">
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </form>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="p-4">Product</th>
                      <th className="p-4">Product ID</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Price</th>
                      <th className="p-4">Eligibility</th>
                      <th className="p-4">Demo stock</th>
                      <th className="p-4">Demo purchasing</th>
                      <th className="p-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td className="p-4">
                          <div className="flex min-w-52 items-center gap-3">
                            <img
                              src={product.image}
                              alt=""
                              loading="lazy"
                              className="h-12 w-12 shrink-0 rounded-lg border border-slate-100 object-cover"
                            />
                            <div>
                              <p className="font-semibold text-slate-900">{product.name}</p>
                              <p className="mt-1 font-mono text-[10px] text-slate-500">{product.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-48 break-all p-4 font-mono text-[10px] text-slate-500">{product.id}</td>
                        <td className="p-4 text-slate-600">{product.category}</td>
                        <td className="whitespace-nowrap p-4 text-slate-700">₹{product.price.toLocaleString('en-IN')}</td>
                        <td className="p-4">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                            product.demoEligible ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {product.demoEligible ? 'Eligible' : 'Not eligible'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-semibold text-violet-800">{product.demoStock || 0}</span>
                        </td>
                        <td className="p-4">
                          {(() => {
                            const available = demoModeEnabled
                              && demoPurchasingAvailable
                              && product.demoPurchasingAvailable === true
                              && product.status === 'active'
                              && product.demoEligible === true
                              && Number.isSafeInteger(product.demoStock)
                              && (product.demoStock || 0) > 0;
                            const reason = !demoModeEnabled
                              ? 'Demo mode disabled'
                              : !demoPurchasingAvailable || product.demoPurchasingAvailable !== true
                                ? 'Razorpay TEST unavailable'
                                : product.status !== 'active'
                                  ? 'Product inactive'
                                  : !product.demoEligible
                                    ? 'Not selected'
                                    : (product.demoStock || 0) <= 0
                                      ? 'No demo stock'
                                      : 'Available to customers';
                            return (
                              <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold ${
                                available ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {reason}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            disabled={!demoModeEnabled}
                            onClick={() => handleOpenDemoInventory(product)}
                            title={!demoModeEnabled ? 'Enable demo mode on the server to manage demo inventory.' : undefined}
                            className="whitespace-nowrap rounded-lg bg-violet-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-900 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Manage demo stock
                          </button>
                        </td>
                      </tr>
                    ))}
                    {products.length === 0 && (
                      <tr><td className="p-5 text-center text-slate-500" colSpan={8}>No products match this search.</td></tr>
                    )}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                  <span>{productTotal.toLocaleString('en-IN')} products · page {productPage} of {productTotalPages}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={productPage <= 1}
                      onClick={() => { const page = productPage - 1; setProductPage(page); void fetchProductPage(productSearch, page); }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={productPage >= productTotalPages}
                      onClick={() => { const page = productPage + 1; setProductPage(page); void fetchProductPage(productSearch, page); }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ORDERS MANAGEMENT */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Manage customer orders, review payment verification, and advance fulfillment statuses.
                </p>
                {demoModeEnabled && (
                  <button
                    type="button"
                    onClick={() => void handleReconcileDemoReservations()}
                    disabled={isReconcilingDemo}
                    className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-900 disabled:opacity-50"
                  >
                    {isReconcilingDemo ? 'Reconciling…' : 'Reconcile expired demo reservations'}
                  </button>
                )}
              </div>

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
                            {isDemoTestOrder(order)
                              ? order.isPaid ? 'RAZORPAY TEST PAYMENT VERIFIED' : 'DEMO PAYMENT PENDING'
                              : order.isPaid ? 'PAID (Razorpay Verified)' : 'PENDING PAYMENT'}
                          </span>
                          {isDemoTestOrder(order) && (
                            <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                              DEMO · TEST ONLY
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Customer: {order.user.name} ({order.user.email}) · Placed: {new Date(order.createdAt).toLocaleString('en-IN')}
                        </p>
                        {isDemoTestOrder(order) && order.demoReservationStatus === 'reserved' && order.demoReservationExpiresAt && (
                          <p className="mt-1 text-[10px] text-violet-700">
                            Demo stock reservation expires {new Date(order.demoReservationExpiresAt).toLocaleString('en-IN')}
                          </p>
                        )}
                      </div>

                      {/* Fulfillment Status Control */}
                      <div className="flex items-center gap-2">
                        {isDemoTestOrder(order) ? (
                          <span className="text-[11px] font-semibold text-violet-800">
                            DEMO/TEST — fulfillment disabled
                          </span>
                        ) : (
                          <>
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
                          </>
                        )}

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
                        <span>{isDemoTestOrder(order) ? 'Order handling: ' : 'Destination: '}</span>
                        <span className="text-slate-700">
                          {isDemoTestOrder(order)
                            ? 'DEMO/TEST only — no shipment'
                            : `${order.shippingAddress.city}, ${order.shippingAddress.state} (${order.shippingAddress.postalCode})`}
                        </span>
                      </div>
                      <div>
                        <span>Order Total: </span>
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          ₹{order.totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                        Inspect transaction and {isDemoTestOrder(order) ? 'checkout' : 'delivery'} details
                      </summary>
                      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <p className="font-semibold text-slate-500">Customer</p>
                          <p className="break-words text-slate-800">{order.user.name}</p>
                          <p className="break-words text-slate-700">{order.user.email}</p>
                          <p className="text-slate-700">Phone: {order.user.phone || 'Not provided'}</p>
                        </div>
                        {!isDemoTestOrder(order) && (
                          <>
                            <div>
                              <p className="font-semibold text-slate-500">Delivery contact</p>
                              <p className="break-words text-slate-800">{order.shippingAddress.fullName}</p>
                              <p className="break-words text-slate-700">{order.shippingAddress.email || order.user.email}</p>
                              <p className="text-slate-700">Phone: {order.shippingAddress.phone}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-500">Complete delivery address</p>
                              <p className="break-words text-slate-800">
                                {[
                                  order.shippingAddress.street,
                                  order.shippingAddress.district,
                                  order.shippingAddress.city,
                                  order.shippingAddress.state,
                                  order.shippingAddress.postalCode,
                                  order.shippingAddress.country,
                                ].filter(Boolean).join(', ')}
                              </p>
                            </div>
                          </>
                        )}
                        <div>
                          <p className="font-semibold text-slate-500">Order</p>
                          <p className="break-all text-slate-800">ID: {order.id}</p>
                          <p className="text-slate-700">
                            Status: {isDemoTestOrder(order) ? 'DEMO/TEST — not eligible for fulfillment' : order.status}
                          </p>
                          <p className="text-slate-700">Placed: {new Date(order.createdAt).toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-500">Payment</p>
                          <p className="text-slate-800">Method: {order.paymentMethod}</p>
                          <p className="text-slate-700">
                            Status: {order.paymentResult?.status || (order.isPaid ? 'captured' : 'pending')}
                          </p>
                          <p className="text-slate-700">
                            Amount: ₹{(order.paymentResult?.amount ?? order.totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {order.paymentResult?.currency || 'INR'}
                          </p>
                          <p className="text-slate-700">
                            Payment date / last update: {order.paidAt || order.paymentResult?.verifiedAt
                              ? new Date(order.paidAt || order.paymentResult?.verifiedAt || '').toLocaleString('en-IN')
                              : 'Not paid'}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-500">Razorpay references</p>
                          <p className="break-all text-slate-700">Order ID: {order.razorpayOrderId || order.paymentResult?.razorpay_order_id || 'Not available'}</p>
                          <p className="break-all text-slate-700">Payment ID: {order.paymentResult?.razorpay_payment_id || 'Not available'}</p>
                        </div>
                      </div>
                    </details>
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
                  <p>• <strong>stock</strong>: Unverified source quantity only; not sellable until an administrator records a physical count</p>
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
                    min={1}
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })}
                    className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>
                <p className="self-end pb-2 text-[10px] text-slate-500">
                  New listings start with zero stock. Use inventory management after a physical count.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    <option value="Computers & Accessories">Computers &amp; Accessories</option>
                    <option value="Health & Beauty">Health &amp; Beauty</option>
                    <option value="Sports & Outdoors">Sports &amp; Outdoors</option>
                    <option value="Garden & Tools">Garden &amp; Tools</option>
                    <option value="Bags & Accessories">Bags &amp; Accessories</option>
                    <option value="Home Essentials">Home Essentials</option>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Local image path</label>
                <input
                  type="text"
                  required
                  value={productForm.image}
                  onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                  placeholder="/images/products/product-name.jpg"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
                <p className="mt-1 text-[10px] text-slate-500">Use a unique image already stored under public/images/.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Listing status</label>
                <select
                  value={productForm.status}
                  onChange={(e) => setProductForm({ ...productForm, status: e.target.value as Product['status'] })}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
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

      {inventoryProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setInventoryProduct(null)} className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" />
          <div className="relative z-10 w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Verify Physical Inventory</h3>
                <p className="mt-1 text-xs text-slate-500">{inventoryProduct.name}</p>
              </div>
              <button type="button" onClick={() => setInventoryProduct(null)} aria-label="Close inventory dialog" className="p-1 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveInventory} className="space-y-4">
              <p className="text-xs leading-relaxed text-amber-800">
                Enter the physically counted quantity available for sale after accounting for units already reserved by pending orders. Imported or demo quantities are not carried forward.
              </p>
              <div>
                <label htmlFor="verified-stock" className="mb-1 block text-xs font-semibold text-slate-700">
                  Verified available quantity
                </label>
                <input
                  id="verified-stock"
                  type="number"
                  min={demoEligible ? 1 : 0}
                  max={1000000}
                  step={1}
                  required
                  value={inventoryStock}
                  onChange={(event) => setInventoryStock(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs"
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={inventoryConfirmed}
                  onChange={(event) => setInventoryConfirmed(event.target.checked)}
                  className="mt-0.5"
                />
                <span>I physically counted this product and entered its available-to-sell quantity.</span>
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setInventoryProduct(null)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!inventoryConfirmed || isSavingInventory}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingInventory ? 'Saving…' : 'Save Verified Count'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {demoProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <div onClick={() => setDemoProduct(null)} className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" />
          <div className="relative z-10 w-full max-w-md space-y-4 rounded-2xl border border-violet-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Manage Demonstration Inventory</h3>
                <p className="mt-1 text-xs text-slate-500">{demoProduct.name}</p>
              </div>
              <button type="button" onClick={() => setDemoProduct(null)} aria-label="Close demo inventory dialog" className="p-1 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveDemoInventory} className="space-y-4">
              <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-900">
                This separate quantity is for Razorpay TEST demonstrations only. It never changes or verifies physical stock.
              </p>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={demoEligible}
                  onChange={(event) => setDemoEligible(event.target.checked)}
                  className="mt-0.5"
                />
                <span>Allow this product in the demonstration catalog</span>
              </label>
              <div>
                <label htmlFor="demo-stock" className="mb-1 block text-xs font-semibold text-slate-700">
                  Separate demo quantity
                </label>
                <input
                  id="demo-stock"
                  type="number"
                  min={demoEligible ? 1 : 0}
                  max={1000000}
                  step={1}
                  required
                  disabled={!demoEligible}
                  value={demoStock}
                  onChange={(event) => setDemoStock(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs disabled:opacity-50"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDemoProduct(null)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDemoInventory}
                  className="rounded-lg bg-violet-800 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingDemoInventory ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
