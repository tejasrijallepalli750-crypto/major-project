# AURA Retail & Payment Gateway
## Major Academic Project — B.Tech Computer Science Engineering

A complete full-stack E-Commerce web application with official Razorpay Payment Gateway integration (Test Mode), MERN architecture (Mongoose schemas & persistent storage), Kaggle Brazilian E-Commerce dataset analytics, Role-Based Access Control (RBAC), and automated GST PDF invoice generation.

---

### 1. Project Overview & Deliverables
This project is built according to the university guidelines specified for the B.Tech Major Project:
1. **Products & Catalog**: 20+ curated demonstration products in INR with technical specifications, high-fidelity photography, and inventory counters.
2. **Shopping Cart & Checkout**: Dynamic cart with client-side quantity management and authoritative server-side recalculation of prices, stock, and 18% GST.
3. **Database Architecture**: Mongoose schemas (`User.ts`, `Product.ts`, `Order.ts`) with disk-synchronized document persistence in `./data/aura_database.json` and plug-and-play MongoDB Atlas compatibility via `MONGODB_URI`.
4. **Authentication & Authorization**: Bcrypt password hashing (salt rounds 10), JWT token generation, role-based protection for Customer vs Administrator endpoints.
5. **Razorpay Payment Gateway (Test Mode)**:
   - Order creation (`/api/payment/create-order`)
   - Interactive checkout modal with test cards (`4111 1111 1111 1111`), UPI (`success@razorpay`), and NetBanking.
   - Cryptographic signature verification using HMAC-SHA256 (`crypto.createHmac('sha256', secret)`).
   - Atomic stock decrement upon verified payment.
   - Rejection of tampered signatures and repeated callbacks.
6. **Order Confirmation & Invoices**: Instant downloadable PDF tax invoices generated via `jsPDF`, itemizing products, SKUs, GST calculations, and Razorpay transaction IDs.
7. **Kaggle Brazilian E-Commerce Integration**: Pre-integrated statistical dashboard and one-click catalog importer from Olist's 100k Brazilian dataset.
8. **Automated Security Test Suite**: Interactive test runner in the Admin/Docs section verifying 10 critical security invariants.

---

### 2. Quick Evaluation Credentials
For academic evaluators and project viva demonstration:

| Role | Email | Password | Access Rights |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@aura.store` | `Admin@123` | Full Admin Console, Inventory CRUD, Order Fulfillment, Dataset Importer |
| **Customer** | `student@college.edu` | `Customer@123` | Storefront, Shopping Cart, Razorpay Checkout, My Orders, PDF Invoices |

*Note: One-click demo login buttons are also provided directly on the Sign In page.*

---

### 3. Technology Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, jsPDF, Canvas Confetti.
- **Backend**: Node.js, Express.js REST APIs, tsx runner.
- **Authentication**: JSON Web Tokens (jsonwebtoken), bcryptjs (salt factor 10).
- **Payment Gateway**: Razorpay (Test Mode v1 Checkout), Node.js `crypto` for HMAC-SHA256 digests.
- **Database**: Mongoose Models (`/server/models/`) and persistent document storage with atomic sync.

---

### 4. Running the Project Locally in VS Code
1. Clone the repository and install packages:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Start the application:
   ```bash
   npm run dev
   ```
4. Open your browser at `http://localhost:3000`.

---

### 5. Deployment Guide
- **Production Build**:
  ```bash
  npm run build
  npm start
  ```
- **Deploy to Render / Railway / Google Cloud Run**:
  - Environment: Node.js 20+
  - Build Command: `npm run build`
  - Start Command: `npm start`
  - Provide `JWT_SECRET`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET` in service environment settings.
