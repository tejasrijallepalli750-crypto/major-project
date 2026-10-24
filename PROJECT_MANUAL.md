# AURA Store

AURA is a React storefront backed by an Express API and MongoDB Atlas through Mongoose. Products, customer accounts, saved carts and wishlists, orders, and payment state are read from and persisted to MongoDB. The application does not fall back to JSON or in-memory storage when MongoDB is unavailable.

## Requirements

- Node.js 20 or later and npm
- A MongoDB Atlas database and database user
- A private JWT signing secret

## Configure MongoDB Atlas and start the app

1. In Atlas, create a database user and allow this development machine's IP in Network Access.
2. Copy the Atlas **Drivers** connection string. Replace its username, password, and database name with your own values. URL-encode special characters in the password.
3. Create `.env` from the example only when you do not already have one:

   ```powershell
   if (!(Test-Path .env)) { Copy-Item .env.example .env }
   ```

4. Edit `.env` locally and set `MONGODB_URI` and a unique `JWT_SECRET` of at least 32 characters. Never paste the URI into chat, source files, or frontend configuration. Do not commit `.env`.
5. To create the first administrator, optionally set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters before startup. The account is created only when that email is not already present. Remove the password from `.env` after the account has been created. If migrating the existing JSON database, its existing users are retained instead.
6. From the project root, install and start:

   ```powershell
   npm install --legacy-peer-deps
   npm run dev
   ```

   The legacy-peer option is needed for the repository's existing Vite/esbuild peer-version mismatch. MongoDB connection failures are logged; the storefront remains available, but database APIs return HTTP 503 until MongoDB connects.
7. Verify the real connection:

   ```powershell
   Invoke-RestMethod http://localhost:3000/api/health
   ```

   `database.status` is `connected` only after the server completes a MongoDB ping. The health endpoint reports the backend separately and returns HTTP 503 while the database is disconnected.

### Development DNS troubleshooting

MongoDB Atlas `mongodb+srv://` connections require Node.js SRV DNS lookups. If Windows resolves the Atlas SRV record but Node.js fails with `ECONNREFUSED querySrv` (for example, when Node uses a local `127.0.0.1` DNS proxy), first fix the machine/network DNS resolver or ask the network administrator which DNS resolver is approved.

As an opt-in development workaround, add this to the project `.env`:

```env
MONGODB_DNS_SERVERS=8.8.8.8
```

Replace the example with a resolver approved for your network. This changes DNS resolution for the Node.js process, not just MongoDB, and sends DNS queries to that resolver instead of the system resolver. The application rejects this setting when `NODE_ENV=production`. Restart `npm run dev` after changing it, then confirm `database.status` is `connected` at `/api/health`. Do not use a public resolver if organizational policy requires private DNS.

## Move existing JSON data

Migration is explicit; the server never imports the JSON file automatically.

1. Configure and verify `MONGODB_URI` in `.env`.
2. If `data/aura_database.json` exists, run:

   ```powershell
   npm run db:migrate-json
   ```

3. The command creates and verifies a timestamped backup under `data/backups/`, imports users, products, and orders by their existing IDs, and skips existing records rather than updating or deleting them. Legacy product records are retained as inactive pending catalog review; this prevents unverified historical listings and image assignments from appearing in the storefront. It prints imported, existing, and failed counts without printing customer records or credentials.
4. Start the application. If the database has no active catalog, AURA seeds the curated product listings once. Review the import counts and the product image audit before using the storefront.

## Import Olist historical data

The extracted source files belong in `dataset/olist_raw/`. Use only the nine original Olist files described in [dataset/README.md](dataset/README.md); prepared catalog files and sample CSVs are not part of this import. The importer keeps these records in dedicated `aura_olist_history_*` collections, separate from live customers, products, carts, wishlists, orders, and Razorpay payments. It uses insert-only upserts, so repeating the command skips records already imported instead of replacing them.

Open PowerShell in the project root and first check the files without requiring MongoDB:

```powershell
npm run import:olist-history -- --dry-run
```

The report lists source rows, rows that would be imported, duplicate keys, invalid rows, and relationship errors for each data type. Dry-run mode does not contact MongoDB or write records. Resolve missing files or invalid rows before proceeding. To import, privately configure `MONGODB_URI` in `.env`, start the app, and confirm MongoDB is really connected:

```powershell
npm run dev
```

In a second PowerShell window, from the project root:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
npm run import:olist-history
```

The database import runs only after the central MongoDB connection completes a successful ping. It will not fall back to the legacy JSON file. A timestamped, PII-minimized report is saved in the ignored `data/olist-import-reports/` folder. Olist payment rows are historical source records and are never considered actual AURA/Razorpay transactions.

## Product catalog and images

The default sellable catalog is defined in `server/catalog/catalogSeed.ts`. Each SKU maps to one distinct local image in `public/images/products/`; prices are explicit INR store prices, not historical-price estimates. Product cards, details, cart, checkout, and orders use the product price returned by the backend. Product creation requires an existing local image and both SKU and image paths are unique in MongoDB.

The selected product photographs are already bundled locally in the project and identified in `public/photo-review.html`. They are Pexels-sourced assets; review the [Pexels license](https://www.pexels.com/license/) before redistribution or deployment. No customer-facing product image relies on an external URL.

Run the image check while the app is running:

```powershell
npm run catalog:audit-images
```

When the live database is available, it audits every product returned by the API. If it is unavailable, the command checks the curated seed mapping and local image endpoints instead; that fallback does not prove that MongoDB contains the catalog.

Administrators can import catalog CSV/JSON files from the protected administration area. Each sellable row must provide a meaningful name, category, positive store price, non-negative integer stock, unique SKU, and an existing local `/images/...` path. Historical records without these attributes are not made into live product listings.

## Payment setup

Razorpay checkout is disabled until valid Test Mode credentials are set in the server-only `.env` file:

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=optional_webhook_secret
```

Use only credentials from Razorpay Dashboard **Test Mode**. The server rejects live key IDs; the test key ID is public to the checkout page, but the key secret and webhook secret must remain in the server-only `.env`. The backend calculates the order amount from its MongoDB order, reuses an associated Razorpay order on retries, verifies Checkout signatures against the stored Razorpay order ID, and fetches the payment from Razorpay before marking an order paid. Only a matching captured INR payment settles the order; authorized, failed, and pending states remain unpaid. Signed `payment.authorized`, `payment.failed`, and `payment.captured`/`order.paid` webhooks are handled from the raw request body. No real Razorpay payment is simulated.

To configure Test Mode, enter the values privately in `.env` and restart the backend. Do not paste credentials into chat, source code, or frontend files. A configured key pair enables checkout but does not prove end-to-end connectivity; a sandbox payment still needs to be completed. A webhook also requires a reachable HTTPS endpoint registered in the Razorpay Test Mode Dashboard and its separate webhook secret.

### Local Demo Payment

When the server is not running with `NODE_ENV=production`, checkout offers **Local Demo Payment** independently of Razorpay credentials. It can record simulated success, failure, or cancellation for development and presentations. These outcomes are stored in `demoPaymentAttempts`, separate from Razorpay `paymentResult` records. A demo success explicitly leaves `isPaid` false and is never counted as a collected payment. A demo cancellation marks the order cancelled and restores its reserved inventory in the same MongoDB transaction. Demo payment is disabled in production.

Checkout submissions use a per-user idempotency key and payload hash. Retrying the same submission returns its existing pending order; reusing the key with different order details is rejected. Cancelled checkout requests require a new key.

## Production Deployment and Scalability

This repository documents how to run the app; it does not provision or deploy infrastructure to a hosting provider. Choose a Node.js 20+ host and a MongoDB Atlas cluster for the deployment environment, then:

1. Build the frontend with `npm run build` and run the server with `npm start` and `NODE_ENV=production`. Do not run the Vite development server in production.
2. Configure `MONGODB_URI` and a randomly generated `JWT_SECRET` of at least 32 characters in the host's secret manager. This integration accepts Razorpay TEST credentials only; do not configure live credentials or represent the app as ready for real-money payments.
3. Put the app behind HTTPS and a reverse proxy/load balancer. Restrict database network access to the application and operators that need it. Set appropriate request-size limits, rate limits, monitoring, and alerting at the host or proxy.
4. Keep MongoDB Atlas backups and a tested restore procedure. Multi-document inventory/order operations use MongoDB transactions, so the target database must support transactions (Atlas replica sets do).
5. For multiple application instances, keep session/cart/order state in MongoDB and use the same JWT signing secret across instances. Keep static product images identical across releases or move them to shared object storage/CDN. The current dataset-upload staging area is local to one app instance and is not shared storage.
6. Review database indexes, Atlas capacity, connection-pool sizing, and application health under expected load before increasing instance count. The included app is not load-tested and does not automatically scale infrastructure.

Actual deployment, restore drills, and capacity/scalability tests have not been performed by this project.

## Useful commands

```powershell
npm run lint
npm test
npm run build
npm run catalog:audit-images
```
