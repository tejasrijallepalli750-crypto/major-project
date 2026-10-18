import React, { useState } from 'react';
import {
  FileText,
  ShieldCheck,
  Terminal,
  Database,
  Code,
  CheckCircle,
  AlertTriangle,
  Play,
  RefreshCw,
  Copy,
  Check,
  Server,
  Layers,
  HelpCircle
} from 'lucide-react';
import { api } from '../services/api';
import { SecurityTestResult } from '../types';

export const ProjectDocsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'tests' | 'architecture' | 'api' | 'schemas' | 'viva' | 'deploy'>('tests');

  // Automated Test Suite State
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<SecurityTestResult[] | null>(null);
  const [testSummary, setTestSummary] = useState<{ total: number; passed: number; failed: number } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleRunSecuritySuite = async () => {
    setIsRunningTests(true);
    try {
      const res = await api.runSecuritySuite();
      setTestResults(res.results);
      setTestSummary({ total: res.totalTests, passed: res.passedCount, failed: res.failedCount });
    } catch (err) {
      console.error('Failed to execute test suite', err);
    } finally {
      setIsRunningTests(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="border-b border-slate-200 pb-6">
        <div className="text-xs uppercase font-bold tracking-wider text-slate-500 mb-1">
          B.Tech Major Academic Project Deliverables
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Project Manual, API Documentation &amp; Live Security Tests
        </h1>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
          Comprehensive academic documentation covering MERN architecture, Razorpay test payment HMAC signature verification, database schemas, and live test suite execution.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 text-xs font-semibold scrollbar-none">
        <button
          onClick={() => setActiveSection('tests')}
          className={`px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'tests' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Automated Test Runner</span>
        </button>
        <button
          onClick={() => setActiveSection('architecture')}
          className={`px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'architecture' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>System Architecture</span>
        </button>
        <button
          onClick={() => setActiveSection('api')}
          className={`px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'api' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>REST API Reference</span>
        </button>
        <button
          onClick={() => setActiveSection('schemas')}
          className={`px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'schemas' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Database Schemas (ERD)</span>
        </button>
        <button
          onClick={() => setActiveSection('viva')}
          className={`px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'viva' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <HelpCircle className="w-4 h-4 text-amber-500" />
          <span>Viva Voce Q&amp;A Guide</span>
        </button>
        <button
          onClick={() => setActiveSection('deploy')}
          className={`px-4 py-2 rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'deploy' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Run in VS Code &amp; Deploy</span>
        </button>
      </div>

      {/* SECTION 1: AUTOMATED SECURITY & TRANSACTION TEST RUNNER */}
      {activeSection === 'tests' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Live Security, Integrity &amp; Payment Gateway Test Runner
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Executes automated test cases directly against the active Node.js server and database.
                </p>
              </div>

              <button
                onClick={handleRunSecuritySuite}
                disabled={isRunningTests}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isRunningTests ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Test Cases...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run Full Automated Test Suite</span>
                  </>
                )}
              </button>
            </div>

            {testSummary && (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-center">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-500">Total Test Cases</span>
                  <div className="text-xl font-bold font-mono text-slate-900">{testSummary.total}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <span className="text-xs text-emerald-700">Passed</span>
                  <div className="text-xl font-bold font-mono text-emerald-700">{testSummary.passed}</div>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl">
                  <span className="text-xs text-rose-700">Failed</span>
                  <div className="text-xl font-bold font-mono text-rose-700">{testSummary.failed}</div>
                </div>
              </div>
            )}
          </div>

          {/* Test Case Cards */}
          {testResults ? (
            <div className="space-y-3">
              {testResults.map((t) => (
                <div
                  key={t.testId}
                  className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-400">{t.testId}</span>
                      <span className="text-xs font-semibold text-slate-500">[{t.category}]</span>
                      <h4 className="text-xs font-bold text-slate-900">{t.title}</h4>
                    </div>
                    <p className="text-xs text-slate-600">{t.description}</p>
                    <p className="text-[11px] text-slate-500 font-mono bg-slate-50 p-2 rounded-lg mt-2">
                      {t.details}
                    </p>
                  </div>

                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shrink-0 self-start sm:self-center ${
                      t.status === 'passed'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {t.status === 'passed' ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white border border-dashed border-slate-300 rounded-2xl text-slate-400 space-y-2">
              <ShieldCheck className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-xs font-semibold text-slate-700">Test suite ready to execute</p>
              <p className="text-xs text-slate-400">
                Click "Run Full Automated Test Suite" above to verify bcrypt, HMAC-SHA256, RBAC, and IDOR defenses.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: SYSTEM ARCHITECTURE */}
      {activeSection === 'architecture' && (
        <div className="space-y-6 bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xs text-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-2">3-Tier Full-Stack Architecture</h3>
            <p className="text-slate-600 leading-relaxed">
              The project is structured according to production standards with strict separation of concerns across presentation, business logic, and persistent storage layers:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">Tier 1: Frontend SPA</span>
              <ul className="text-slate-600 space-y-1 list-disc list-inside">
                <li>React 19 with TypeScript</li>
                <li>Tailwind CSS v4 &amp; Lucide Icons</li>
                <li>Zero-pill typographic hierarchy</li>
                <li>JWT session storage &amp; client cart state</li>
                <li>Client-side PDF invoice generation (jsPDF)</li>
              </ul>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">Tier 2: Backend REST APIs</span>
              <ul className="text-slate-600 space-y-1 list-disc list-inside">
                <li>Node.js + Express.js runtime</li>
                <li>Bcrypt password hashing (Salt factor 10)</li>
                <li>JWT authentication &amp; RBAC middleware</li>
                <li>Razorpay HMAC-SHA256 signature verification</li>
                <li>Strict server-side price &amp; inventory validation</li>
              </ul>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">Tier 3: Database &amp; Data Hub</span>
              <ul className="text-slate-600 space-y-1 list-disc list-inside">
                <li>MongoDB Atlas / Mongoose Schema models</li>
                <li>Persistent file-backed document engine</li>
                <li>Atomic stock decrement on order placement</li>
                <li>Kaggle Olist Brazilian E-Commerce dataset</li>
                <li>Separation of live vs historical collections</li>
              </ul>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h4 className="font-bold text-slate-900 mb-2">Folder Structure Convention:</h4>
            <pre className="p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-[11px] overflow-x-auto leading-relaxed">
{`aura-ecommerce-project/
├── server.ts                  # Main Express entry point with Vite middleware
├── server/
│   ├── db/database.ts         # Persistent document store with disk sync & MongoDB bridge
│   ├── middleware/auth.ts     # JWT verify & RBAC role checks
│   ├── models/                # Mongoose Schema definitions (User, Product, Order)
│   └── routes/                # REST endpoints (auth, products, orders, payment, admin, tests)
├── src/
│   ├── components/            # Navbar, Footer, ProductCard, CartDrawer, RazorpayModal
│   ├── context/               # AuthContext, CartContext
│   ├── data/seedData.ts       # ~20 verified products catalog with INR pricing
│   ├── pages/                 # Home, Catalog, ProductDetail, Cart, Checkout, Admin, Kaggle
│   ├── services/api.ts        # Centralized typed fetch client
│   ├── types/index.ts         # TypeScript models
│   └── utils/invoiceGenerator.ts # Professional PDF tax invoice generator
├── data/                      # Persistent database JSON and Kaggle datasets
├── package.json
└── .env.example               # Environment variables template`}
            </pre>
          </div>
        </div>
      )}

      {/* SECTION 3: REST API REFERENCE */}
      {activeSection === 'api' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">RESTful API Endpoints Specification</h3>
            <p className="text-xs text-slate-500">
              All responses follow standard JSON envelopes: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">{"{ success: boolean, data?: any, message?: string }"}</code>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Method</th>
                  <th className="p-3">Endpoint</th>
                  <th className="p-3">Auth / Role</th>
                  <th className="p-3">Description &amp; Behavior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-3 font-mono font-bold text-blue-700">POST</td>
                  <td className="p-3 font-mono">/api/auth/register</td>
                  <td className="p-3 text-slate-500">Public</td>
                  <td className="p-3">Creates customer account with bcrypt password hash (Salt=10).</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-blue-700">POST</td>
                  <td className="p-3 font-mono">/api/auth/login</td>
                  <td className="p-3 text-slate-500">Public</td>
                  <td className="p-3">Verifies credentials and returns 30-day signed JWT token.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-emerald-700">GET</td>
                  <td className="p-3 font-mono">/api/products</td>
                  <td className="p-3 text-slate-500">Public</td>
                  <td className="p-3">Lists active products with search, category filtering, and price sorting.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-blue-700">POST</td>
                  <td className="p-3 font-mono">/api/orders/validate-cart</td>
                  <td className="p-3 text-slate-500">Public</td>
                  <td className="p-3">Authoritative backend recalculation of item prices, stock, and 18% GST.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-blue-700">POST</td>
                  <td className="p-3 font-mono">/api/orders</td>
                  <td className="p-3 text-amber-700 font-semibold">User (JWT)</td>
                  <td className="p-3">Creates pending order and atomically decrements inventory stock.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-blue-700">POST</td>
                  <td className="p-3 font-mono">/api/payment/create-order</td>
                  <td className="p-3 text-amber-700 font-semibold">User (JWT)</td>
                  <td className="p-3">Generates official Razorpay Order ID for specified pending order.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-blue-700">POST</td>
                  <td className="p-3 font-mono">/api/payment/verify</td>
                  <td className="p-3 text-amber-700 font-semibold">User (JWT)</td>
                  <td className="p-3">Verifies HMAC-SHA256 signature; updates order status to PAID.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-emerald-700">GET</td>
                  <td className="p-3 font-mono">/api/orders/my-orders</td>
                  <td className="p-3 text-amber-700 font-semibold">User (JWT)</td>
                  <td className="p-3">Retrieves current customer's order history with IDOR authorization.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-rose-700">POST</td>
                  <td className="p-3 font-mono">/api/products</td>
                  <td className="p-3 text-rose-700 font-semibold">Admin Only</td>
                  <td className="p-3">Creates new product in catalog with input validation.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-emerald-700">GET</td>
                  <td className="p-3 font-mono">/api/admin/stats</td>
                  <td className="p-3 text-rose-700 font-semibold">Admin Only</td>
                  <td className="p-3">Returns sales revenue, low stock counts, and category distributions.</td>
                </tr>
                <tr>
                  <td className="p-3 font-mono font-bold text-blue-700">POST</td>
                  <td className="p-3 font-mono">/api/tests/run-suite</td>
                  <td className="p-3 text-slate-500">Public / Admin</td>
                  <td className="p-3">Executes automated security checks against live server.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 4: DATABASE SCHEMAS (ERD) */}
      {activeSection === 'schemas' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs text-xs">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Database Design &amp; Relationships</h3>
            <p className="text-slate-600">
              The project uses document-based collections with relational references and embedded snapshots to guarantee purchase price immutability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">1. Users Collection</span>
              <pre className="font-mono text-[11px] text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
{`{
  _id: ObjectId / string,
  name: string,
  email: string (unique index),
  passwordHash: string (bcrypt),
  role: 'customer' | 'admin',
  phone: string,
  address: { street, city, state, postalCode },
  createdAt: ISODate,
  updatedAt: ISODate
}`}
              </pre>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">2. Products Collection</span>
              <pre className="font-mono text-[11px] text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
{`{
  _id: ObjectId / string,
  name: string,
  description: string,
  price: number (INR),
  category: string (index),
  image: string,
  stock: number,
  sku: string (unique),
  status: 'active' | 'inactive',
  rating: number,
  numReviews: number,
  brand: string
}`}
              </pre>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 md:col-span-2">
              <span className="font-bold text-slate-900 block text-xs">3. Orders Collection (with snapshot immutability)</span>
              <pre className="font-mono text-[11px] text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
{`{
  _id: ObjectId / string,
  orderNumber: string (unique e.g. 'AURA-2026-1001'),
  user: { id, name, email, phone },
  orderItems: [{ product, name, price, quantity, sku, image }], // SNAPSHOT at purchase time
  shippingAddress: { fullName, phone, street, city, state, postalCode, country },
  paymentMethod: 'Razorpay',
  paymentResult: {
    id: string,
    status: 'captured',
    razorpay_order_id: string,
    razorpay_payment_id: string,
    razorpay_signature: string (HMAC SHA-256),
    verifiedAt: ISODate
  },
  itemsPrice: number,
  shippingPrice: number,
  taxPrice: number (18% GST),
  totalPrice: number,
  isPaid: boolean,
  paidAt: ISODate,
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered'
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: VIVA VOCE Q&A GUIDE */}
      {activeSection === 'viva' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs text-xs">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">B.Tech Examiner Viva Voce Questions &amp; Answers</h3>
            <p className="text-slate-600">
              Prepare for your academic evaluation with these comprehensive technical answers directly mapping to project code:
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-900 text-xs">
                Q1: How does Razorpay Payment Signature Verification work and why is HMAC-SHA256 used?
              </h4>
              <p className="text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">Answer: </span>
                When a payment is captured on the client, Razorpay returns a <code className="bg-white px-1 py-0.5 rounded font-mono">razorpay_order_id</code>, <code className="bg-white px-1 py-0.5 rounded font-mono">razorpay_payment_id</code>, and a cryptographic <code className="bg-white px-1 py-0.5 rounded font-mono">razorpay_signature</code>. To prevent man-in-the-middle attacks and fake payment confirmations, the server computes:
                <br />
                <code className="bg-slate-900 text-emerald-400 px-2 py-1 rounded font-mono inline-block my-1">
                  expected = crypto.createHmac('sha256', secret).update(order_id + '|' + payment_id).digest('hex')
                </code>
                <br />
                Because the secret key is stored exclusively on the server and never revealed to the browser, any tampering with the payment ID or order ID will cause a signature mismatch, and the transaction is immediately rejected with HTTP 400.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-900 text-xs">
                Q2: How does the application protect against Client-Side Price Manipulation?
              </h4>
              <p className="text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">Answer: </span>
                The backend NEVER trusts product prices, discounts, or subtotal sums submitted by the frontend request payload. When <code className="bg-white px-1 py-0.5 rounded font-mono">POST /api/orders</code> is called, the server extracts only the product IDs and requested quantities. It looks up each product in the database, extracts the authoritative database price, verifies available stock, computes 18% GST and shipping rules, and writes the snapshot to the database. Manipulated prices sent by an attacker are discarded.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-900 text-xs">
                Q3: Why are purchased item prices stored as snapshots inside the Order document?
              </h4>
              <p className="text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">Answer: </span>
                If an administrator modifies a product's price from ₹18,999 to ₹22,000 next month, historical orders must still retain the original price paid for legal, accounting, and GST tax invoice generation. Storing an embedded snapshot of the product name, SKU, and unit price in <code className="bg-white px-1 py-0.5 rounded font-mono">orderItems</code> guarantees immutable financial auditing.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-900 text-xs">
                Q4: How is the Olist Brazilian E-Commerce Kaggle dataset integrated into this project?
              </h4>
              <p className="text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">Answer: </span>
                The Olist Brazilian E-Commerce public dataset consists of 100k real-world orders across 2016-2018. We pre-analyzed and normalized its category frequencies (e.g. <code className="bg-white px-1 py-0.5 rounded font-mono">cama_mesa_banho</code>, <code className="bg-white px-1 py-0.5 rounded font-mono">beleza_saude</code>), ticket averages, and payment distributions in the Kaggle Dataset Hub. Crucially, the historical Kaggle data is isolated from the live transactional collections to avoid polluting customer checkout flow while providing rich analytics.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: LOCAL RUN & DEPLOYMENT */}
      {activeSection === 'deploy' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs text-xs">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Local VS Code Execution &amp; Cloud Deployment</h3>
            <p className="text-slate-600">
              Step-by-step instructions for running the project on your laptop in Visual Studio Code or deploying to cloud platforms:
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">Step 1: Clone &amp; Install Dependencies</span>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] overflow-x-auto">
{`git clone <your-repository-url>
cd aura-ecommerce-project
npm install`}
              </pre>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">Step 2: Configure Environment Variables</span>
              <p className="text-slate-600">Create a <code className="bg-white px-1 py-0.5 rounded font-mono">.env</code> file based on <code className="bg-white px-1 py-0.5 rounded font-mono">.env.example</code>:</p>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] overflow-x-auto">
{`PORT=3000
NODE_ENV=development
JWT_SECRET=academic_project_super_secure_jwt_secret_key_2026
RAZORPAY_KEY_ID=rzp_test_YourTestKeyIdHere
RAZORPAY_KEY_SECRET=YourRazorpaySecretKeyHere
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/aura_ecommerce`}
              </pre>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">Step 3: Start Development Server</span>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] overflow-x-auto">
{`npm run dev`}
              </pre>
              <p className="text-slate-600">
                Open <code className="bg-white px-1 py-0.5 rounded font-mono">http://localhost:3000</code> in your browser. The Express server will automatically mount Vite middleware and initialize the persistent database in <code className="bg-white px-1 py-0.5 rounded font-mono">./data/aura_database.json</code>.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-xs">Step 4: Cloud Deployment (Render / Railway / Cloud Run)</span>
              <p className="text-slate-600">
                Build command: <code className="bg-white px-1 py-0.5 rounded font-mono">npm run build</code>
                <br />
                Start command: <code className="bg-white px-1 py-0.5 rounded font-mono">npm start</code> (Runs <code className="bg-white px-1 py-0.5 rounded font-mono">tsx server.ts</code> serving static assets and Express APIs).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
