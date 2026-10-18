import React, { useState, useEffect } from 'react';
import { Database, Download, ExternalLink, ArrowRight, BarChart2, Check, RefreshCw, Layers, ShieldCheck, FileSpreadsheet, FileUp, X, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { KaggleInsight } from '../types';

export const KaggleDatasetPage: React.FC = () => {
  const [insights, setInsights] = useState<KaggleInsight | null>(null);
  const [datasetMeta, setDatasetMeta] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Client-side CSV Inspector State
  const [inspectedFile, setInspectedFile] = useState<{
    name: string;
    headers: string[];
    rows: string[][];
    totalRows: number;
  } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  useEffect(() => {
    const fetchKaggle = async () => {
      setIsLoading(true);
      try {
        const res = await api.getKaggleInsights();
        setInsights(res.data);
        setDatasetMeta(res.dataset);
      } catch (err) {
        console.error('Failed to load Kaggle dataset insights', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchKaggle();
  }, []);

  const handleImportSample = async () => {
    setIsImporting(true);
    setImportStatus(null);
    try {
      const res = await api.importKaggleSample();
      setImportStatus(res.message);
    } catch (err: any) {
      setImportStatus(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    if (!file.name.endsWith('.csv')) {
      setCsvError('Please select a valid CSV file (e.g. olist_products_dataset.csv).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string;
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setCsvError('CSV file has fewer than 2 rows.');
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
        const rows: string[][] = [];

        // Preview first 5 rows
        for (let i = 1; i < Math.min(6, lines.length); i++) {
          const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
          rows.push(values.slice(0, headers.length));
        }

        setInspectedFile({
          name: file.name,
          headers,
          rows,
          totalRows: lines.length - 1,
        });
      } catch (err: any) {
        setCsvError('Failed to parse CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Page Header */}
      <div className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase font-bold tracking-wider text-indigo-700 mb-1">
            Kaggle Public Dataset Integration
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Brazilian E-Commerce Dataset by Olist
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Statistical analysis of 100,000 real-world commercial orders (2016-2018) from Brazilian marketplaces, integrated for e-commerce academic benchmarking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <span>Kaggle Dataset Source</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Dataset Architecture Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        <div>
          <span className="font-bold text-slate-900 block mb-1">Dataset Origin &amp; Integrity</span>
          <p className="text-slate-600 leading-relaxed">
            Provided by Olist, the largest department store in Brazilian marketplaces. Connects small businesses to sales channels with real logistics telemetry.
          </p>
        </div>
        <div>
          <span className="font-bold text-slate-900 block mb-1">Data Separation Rule</span>
          <p className="text-slate-600 leading-relaxed">
            Historical dataset records are stored in a dedicated analytical collection separate from live customer transactions, preventing contamination of real order flow.
          </p>
        </div>
        <div>
          <span className="font-bold text-slate-900 block mb-1">One-Click Catalog Mapper</span>
          <p className="text-slate-600 leading-relaxed">
            Import sanitized sample catalog items mapped directly from Brazilian categories into the active store with INR pricing.
          </p>
          <button
            onClick={handleImportSample}
            disabled={isImporting}
            className="mt-2 text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>{isImporting ? 'Mapping Records...' : 'Import Olist Sample Products'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {importStatus && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{importStatus}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mb-3 text-slate-600" />
          <p className="text-xs">Processing Kaggle dataset analytics...</p>
        </div>
      ) : insights ? (
        <div className="space-y-8">
          {/* Historical Metrics KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl space-y-1 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Historical Orders Analyzed</span>
              <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                {insights.totalOrders.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-400">Recorded across 2016-2018</p>
            </div>

            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl space-y-1 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Gross Merchandise Volume</span>
              <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                R$ {(insights.totalRevenueBRL / 1000000).toFixed(2)}M
              </div>
              <p className="text-[11px] text-slate-400">~₹240,000,000 INR equivalent</p>
            </div>

            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl space-y-1 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Dominant Payment Method</span>
              <div className="text-2xl font-bold text-slate-900">
                Credit Card (73.9%)
              </div>
              <p className="text-[11px] text-slate-400">Followed by Boleto Bancário (19%)</p>
            </div>

            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl space-y-1 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Top Category Volume</span>
              <div className="text-2xl font-bold text-slate-900">
                Bed, Bath &amp; Table
              </div>
              <p className="text-[11px] text-slate-400">9,417 recorded shipments</p>
            </div>
          </div>

          {/* Visual Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Top Categories Table */}
            <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Top Product Categories by Volume
                </h3>
                <span className="text-[11px] text-slate-400">Olist Historical Records</span>
              </div>

              <div className="divide-y divide-slate-100">
                {insights.topCategories.map((cat, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                    <span className="font-medium text-slate-800">{cat.category}</span>
                    <div className="flex items-center gap-4 text-right">
                      <span className="font-mono text-slate-500">{cat.orderCount.toLocaleString()} orders</span>
                      <span className="font-mono font-bold text-slate-900">Avg R$ {cat.avgTicket}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Method Distribution */}
            <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Customer Payment Method Split
                </h3>
                <span className="text-[11px] text-slate-400">100k Orders</span>
              </div>

              <div className="space-y-4">
                {insights.paymentDistribution.map((pay, idx) => (
                  <div key={idx} className="space-y-1 text-xs">
                    <div className="flex justify-between font-medium">
                      <span className="text-slate-800">{pay.method}</span>
                      <span className="font-mono font-bold text-slate-900">
                        {pay.percentage}% ({pay.count.toLocaleString()})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full"
                        style={{ width: `${pay.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                Notice: For live purchases, AURA uses Razorpay's Indian banking gateway with INR, while Olist Brazilian historical records predominantly utilized Boleto Bancário and local installment credit cards.
              </div>
            </div>
          </div>

          {/* Interactive CSV Inspector Tool */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  <span>Kaggle CSV File Structure Inspector &amp; Schema Parser</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Select any downloaded CSV file from the Olist Brazilian dataset to inspect its columns, types, and raw records.
                </p>
              </div>

              <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer self-start sm:self-auto shrink-0">
                <FileUp className="w-4 h-4" />
                <span>Upload Kaggle CSV File</span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {csvError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{csvError}</span>
              </div>
            )}

            {inspectedFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-slate-900">{inspectedFile.name}</span>
                    <span className="text-slate-500">({inspectedFile.totalRows.toLocaleString()} data records parsed)</span>
                  </div>
                  <button
                    onClick={() => setInspectedFile(null)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Parsed Schema Columns */}
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                    Detected Column Headers ({inspectedFile.headers.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {inspectedFile.headers.map((h, i) => (
                      <span key={i} className="text-[11px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Preview Table */}
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        {inspectedFile.headers.map((h, i) => (
                          <th key={i} className="p-2.5 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                      {inspectedFile.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50">
                          {row.map((val, cIdx) => (
                            <td key={cIdx} className="p-2.5 whitespace-nowrap max-w-[200px] truncate">{val}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-6 border border-dashed border-slate-300 rounded-xl text-center text-slate-400 space-y-1">
                <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">No raw CSV file selected yet</p>
                <p className="text-[11px] text-slate-400">
                  Upload <code className="font-mono text-slate-600">product_category_name_translation.csv</code> or <code className="font-mono text-slate-600">olist_products_dataset.csv</code> to inspect table headers live.
                </p>
              </div>
            )}
          </div>

          {/* Kaggle Schema & File Manifest Reference */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Kaggle CSV Files Schema Documentation
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              If running locally in VS Code or extending the data pipeline, download the following 9 official CSV files from Kaggle and place them in the <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-[11px]">/data/kaggle/</code> directory:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">olist_orders_dataset.csv</span>
                <span className="text-slate-500 text-[11px]">order_id, customer_id, order_status, order_purchase_timestamp</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">olist_order_items_dataset.csv</span>
                <span className="text-slate-500 text-[11px]">order_id, order_item_id, product_id, seller_id, price, freight_value</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">olist_products_dataset.csv</span>
                <span className="text-slate-500 text-[11px]">product_id, product_category_name, product_name_lenght, product_weight_g</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">olist_order_payments_dataset.csv</span>
                <span className="text-slate-500 text-[11px]">order_id, payment_sequential, payment_type, payment_installments, payment_value</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">olist_customers_dataset.csv</span>
                <span className="text-slate-500 text-[11px]">customer_id, customer_unique_id, customer_zip_code_prefix, customer_city</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">product_category_name_translation.csv</span>
                <span className="text-slate-500 text-[11px]">product_category_name (Portuguese), product_category_name_english</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
