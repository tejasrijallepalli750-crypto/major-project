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

### Import the Olist product catalog

The Olist product catalog importer reads the original product, order-item, and category-translation CSV files from `dataset/olist_raw/`. It converts average positive historical BRL item prices to indicative INR using the existing 18.81 conversion rate. Generated category-based display titles and shared local category illustrations are used because the source has no product titles or direct image URLs. New products have zero stock because the source has no inventory data.

The command defaults to a dry run and requires a MongoDB URI whose database path and connected database are both exactly `aura_payment_test`:

```powershell
npm run import:olist-products
```

Review the source, eligibility, existing Olist SKU, and skip counts before applying. To insert or update Olist-owned SKUs only, explicitly pass `--apply`:

```powershell
npm run import:olist-products -- --apply
```

The importer does not delete products or modify non-Olist products, users, orders, or payment records. The storefront catalog API returns active products in pages, so imported listings can be browsed through the existing catalog pagination.

### Olist category image mapping

Olist product cards and other `OLIST-` product image views resolve images from the centralized `src/data/olistCategoryImageMap.ts` mapping rather than trusting the stored per-product image URL. This prevents an old or unrelated image assignment from being shown for an anonymous Olist product. The mapping covers all 73 non-empty Olist source categories and uncategorized products. The 10-product ABO sample remains separate.

The offline coverage report reads only the original Olist product and translation CSVs and local image files; it does not connect to MongoDB or modify catalogue data:

```powershell
npm run report:olist-category-images
```

Free photo search is opt-in, sequential, cached, and bounded. It produces category-level review candidates only; it does not approve photos or assign images to Olist SKUs. The default maximum is five categories and zero downloads. To explicitly search all categories and stage up to 73 unique images for human review:

```powershell
npm run search:olist-category-photos -- --search --max-categories 73 --download-limit 73
```

The download limit is capped at 73. Candidates are prioritized round-robin so each searched category's first suitable image is considered before a second candidate for any category. The generated report and provenance manifest are under `data/olist-image-enrichment/category-photo-review/`. Local Pexels candidates were separately compared against official Pexels image previews using source-aligned pHash and dHash checks. Temporary comparisons are opt-in (`npx tsx scripts/compare-local-pexels-images.ts --compare`), limited to 25 unique images, at most 2 MiB per image and 50 MiB total, and stored in the Git-ignored `data/olist-image-enrichment/local-photo-audit/source-comparisons/` directory. The final category and provenance review is `data/olist-image-enrichment/local-photo-audit/report.html`; its manifest records source page, creator, Pexels License, image hashes, comparison outcomes, and individual placement decisions.

The current review verifies 25 unique image identities and approves 24 representative category placements using 22 unique local photos. The other 49 of 73 translated Olist categories retain their illustrations: 42 had no suitable candidate and seven candidates were rejected as weak or too narrow. Uncategorized products retain the general illustration. Only the approved category mappings use local photographs; the images remain category representatives, not exact original Olist product photos. The 20 rejected online-photo pilot images remain unapproved and unused.

### Reconcile the Olist catalogue

The reconciliation command compares every product SKU to the source product IDs in `dataset/olist_raw/olist_products_dataset.csv`. It requires both the MongoDB URI database path and the connected database to be exactly `aura_payment_test`. It defaults to a read-only dry run and reports valid matches, missing source IDs, duplicate matches, out-of-dataset products, order/cart/wishlist references, image assignments, and proposed actions.

```powershell
npm run reconcile:olist-catalogue
```

To preview which unreferenced outside products qualify for optional permanent deletion, without applying changes:

```powershell
npm run reconcile:olist-catalogue -- --delete-unreferenced
```

After reviewing the report, `--apply` updates/inserts eligible Olist product records and deactivates products outside the source set. Unreferenced outside products are still only deactivated unless the separate `--delete-unreferenced` option is also supplied. For permanent deletion, stop the backend first, re-run and review the dry-run report, then explicitly pass both options:

```powershell
npm run reconcile:olist-catalogue -- --apply
npm run reconcile:olist-catalogue -- --apply --delete-unreferenced
```

Products referenced by any order item, saved cart, or wishlist are kept as inactive records. Products in the built-in starter seed are also retained inactive when deletion is enabled, so a later server start cannot recreate them. Payment results are embedded in order records, and invoice rows are generated from the order snapshots; neither is deleted or rewritten. The script updates products only. Keep the backend stopped during permanent deletion to prevent concurrent cart changes.

Olist has no current inventory quantities. Demo inventory is disabled unless explicitly enabled. When enabled, the reconciliation command initializes only marked Olist products with zero stock to 20 simulated units by default; `--demo-stock <quantity>` configures the initial quantity. Existing non-zero stock and already initialized simulated stock are preserved, so rerunning reconciliation does not replenish units sold:

```powershell
npm run reconcile:olist-catalogue -- --enable-demo-inventory
npm run reconcile:olist-catalogue -- --enable-demo-inventory --demo-stock 7
```

These commands are dry runs; apply the inventory initialization only after reviewing the result and passing `--apply`. Simulated quantities are explicitly labeled in the storefront, cart, checkout, and order views, and are not represented as Olist data. Order creation continues to perform server-side availability checks and an atomic stock decrement.

```powershell
npm run reconcile:olist-catalogue -- --apply --enable-demo-inventory
npm run reconcile:olist-catalogue -- --apply --enable-demo-inventory --demo-stock 7
```

Olist historical BRL-to-INR prices are estimates from historical order-item averages, not current market prices. Product photography uses a small curated subset of existing local images only for matching categories; otherwise it falls back to category illustrations. Neither is an original Olist product photo. No images are generated or copied during reconciliation.

### Enrich Olist product images

The Olist products CSV contains category and measurement metadata, but no original product names, product photos, image URLs, or exact product identities. This pipeline searches for openly licensed raster photographs and treats each one as a representative category match, never as a verified image of the Olist product. No icons, SVGs, illustrations, generated visuals, paid APIs, or image-generation providers are used.

The default command is offline and dry-run only. It reads the source CSV and ignored staging files, reports missing pilot entries, cached searches, and eligible local-photo provenance, and does not make network requests or connect to MongoDB:

```powershell
npm run enrich:olist-images
```

The pilot is fixed at 50 category-diverse Olist SKUs. Openverse is searched first; Wikimedia Commons is a fallback only where qualified Openverse results do not suffice. Network searching and photo downloads happen only after explicitly running:

```powershell
npm run enrich:olist-images -- --pilot-search
```

The API clients use HTTPS, a descriptive User-Agent, a one-second minimum interval, bounded retries, and `Retry-After` handling. Search results are cached for 30 days. Only CC0, Public Domain Mark, CC BY, and CC BY-SA results are accepted; NonCommercial and NoDerivatives licenses are rejected. Each staged image must have creator, source URL, license and attribution metadata, pass raster and size checks, and have a unique SHA-256 hash. Downloaded photos are optimized to WebP. No local photograph is eligible unless a verified record is supplied in the ignored `data/olist-image-enrichment/pilot-free-photos/local-photo-provenance.json`; captions alone are not licensing evidence.

Each optional local-photo provenance record must be manually verified against the original source and license and include `category`, `filename` (an existing `pexels-<id>.jpg` in `public/images/products/`), `caption`, `description`, `creator`, `sourceUrl`, `license`, `licenseVersion`, `licenseUrl`, and `attribution`. Optional `tags` may describe visible image content. The pipeline still requires category words to match the caption, description, or tags. Do not infer authorship or license from a filename or photo-review caption.

All images are labeled `representative-category-match` and `needs-human-review`. The manifest and reports preserve provider, creator, source links, license version and URL, attribution, match confidence, validation status, dimensions, and content hash. The source dataset cannot substantiate exact identity matches.

The pilot output is written only under the Git-ignored staging directory `data/olist-image-enrichment/pilot-free-photos/`:

```text
data/olist-image-enrichment/pilot-free-photos/contact-sheet.jpg
data/olist-image-enrichment/pilot-free-photos/report.html
data/olist-image-enrichment/pilot-free-photos/report.csv
data/olist-image-enrichment/pilot-free-photos/manifest.json
data/olist-image-enrichment/pilot-free-photos/search-cache/
```

Open `report.html` in a browser to inspect large previews and per-SKU source, creator, licensing, attribution, and confidence. The pipeline processes no more than 50 products, does not modify source assets or product data, never connects to MongoDB, and contains no database-update option. An incomplete search should be reported as a shortfall; it must not be filled with unrelated images or symbolic placeholders. Before production reuse, verify the original source page and current license terms; API metadata is provenance evidence, not a legal determination.

### Amazon Berkeley Objects sample catalogue

The separate **ABO sample** navigation page contains ten read-only product listings. It is supplemental to Olist and does not add items to the sellable catalog, cart, wishlist, checkout, or order history. The sample IDs use the ABO listing ID and marketplace domain; no Olist product ID or Olist history record is reused.

Each local image was selected from the listing's `main_image_id` in the official ABO listing metadata and is stored under `public/images/abo-sample/`. The sample manifest and provenance fields live in `src/data/aboSampleCatalog.ts`; they include the marketplace listing URL, ABO metadata source, main image ID, source image URL, license, attribution, image dimensions, byte length, SHA-256, and CDN processing details. The images are 500-pixel Amazon CDN JPEG derivatives copied without further local image modifications.

The ABO dataset and images are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is displayed on the sample page and for each sample record: Amazon.com; dataset compilation by Matthieu Guillaumin (Amazon.com), Thomas Dideriksen (Amazon.com), Kenan Deng (Amazon.com), Himanshu Arora (Amazon.com), Jasmine Collins (UC Berkeley), and Jitendra Malik (UC Berkeley). The page states that Amazon does not endorse AURA. Review the [official ABO dataset](https://amazon-berkeley-objects.s3.amazonaws.com/) and license before redistributing this sample.

This sample is static and read-only. It does not connect to MongoDB and is not consumed by the Olist importer, catalogue reconciliation, cart, checkout, payment, or order routes. The existing 20 questionable free-photo pilot assets remain in their ignored staging directory and are not approved or used by this page.

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
