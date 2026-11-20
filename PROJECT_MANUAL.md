# AURA Store

AURA is a React storefront backed by an Express API and MongoDB Atlas through Mongoose. Products, customer accounts, saved carts and wishlists, orders, and payment state are read from and persisted to MongoDB. The application does not fall back to JSON or in-memory storage when MongoDB is unavailable.

## Requirements

- Node.js 20.19+ or 22.12+ and npm. Render is pinned to Node 24.22.1 in `.node-version`.
- A MongoDB Atlas database and database user
- A private JWT signing secret

## Academic submission readiness audit

This audit distinguishes code-level checks from integrations that were not exercised. It does not claim that deployment, email delivery, a Razorpay transaction, or an Olist history import succeeded.

### Implemented and locally verified

- React/Vite storefront, Express API, MongoDB-backed users/products/carts/wishlists/orders, password hashing, JWT authentication, and admin-only endpoints.
- Product reviews require a paid or delivered order containing the product; product rating totals are recalculated when a review is created.
- Server-side price checks, transactional stock reservation, checkout idempotency, Razorpay signature and provider-status checks, signed payment-specific webhooks, and invoice PDF generation.
- Optional SMTP order email, Helmet/CSP, CORS allowlisting, API rate limits, Zod request-body validation, Render configuration, and production build settings.
- Tests and builds are local only. See the final verification commands below.

### Partial, not externally verified, or still incomplete

- Read-only Atlas inspection found 32,951 active Olist catalog products and 27 inactive curated products (32,978 total). Seven of eight existing AURA orders reference non-Olist SKUs, so the inactive products and all order snapshots must be retained. No catalog rewrite or database update was made.
- The Olist products have indicative prices derived from historical BRL order-item averages, generated display titles, and no source-provided inventory. They are marked as estimates in customer and order views. All existing stock values without a physical verification marker are now treated as unverified and cannot be purchased. The admin product search can page through the full catalog and record a physical available-to-sell count. There is no bulk verification or stock migration.
- The inventory metadata is additive and backward-compatible: missing `inventoryStatus` means `unverified`; no Atlas migration is required. The current verification metadata stores the latest verifier and timestamp, not a full adjustment ledger. Physical inventory remains restricted to verified stock. Demo reservations use separate fields and an expiry/reconciliation path; no product is automatically selected for demo purchases.
- Olist historical records are not imported. The nine source CSVs are present and validated by a no-database dry run; see the report and approval gate below.
- Olist has no original product photographs. Product views render the existing mapped Pexels category photos or local illustrations; these category-level images are not original Olist product photos. The 27 curated seed-image records have not all been supplied with individually verified creator/source/license metadata, so those records are not fully provenance-documented.
- Atlas connectivity and metadata were checked read-only; application CRUD, rollback, SMTP delivery, Razorpay Test Mode transactions/webhook delivery, Render health, and deployed behavior have not been tested end-to-end.
- Order cancellation/refund reconciliation for Razorpay is intentionally conservative: paid orders require refund verification, and orders with an active Razorpay order ID require payment-state reconciliation before cancellation. A customer-facing cancellation endpoint and automatic stale-order release are not implemented.

### Required remaining actions

1. Physically count and record available-to-sell stock before enabling sales for any product. A demo or imported quantity is not evidence of physical stock.
2. Do not run the Olist history importer against Atlas until the owner reviews the storage/backup plan below and explicitly approves the write.
3. Complete per-image attribution metadata for the curated images if they are retained or redistributed; do not describe category images as exact Olist product photos.
4. With permission, run a Razorpay Test Mode transaction and verify the configured payment-specific webhooks on a reachable test endpoint. Do not use live credentials.
5. Capture original screenshots of the catalog, product/reviews, verified and unverified inventory states, order history, and invoice for the academic report. No screenshots or live user data were generated for this audit.

## Configure MongoDB Atlas and start the app

1. In Atlas, create a database user and allow this development machine's IP in Network Access.
2. Copy the Atlas **Drivers** connection string. Replace its username, password, and database name with your own values. URL-encode special characters in the password.
3. Create `.env` from the example only when you do not already have one:

   ```powershell
   if (!(Test-Path .env)) { Copy-Item .env.example .env }
   ```

4. Edit `.env` locally and set `MONGODB_URI` and a unique `JWT_SECRET` of at least 32 characters. Never paste the URI into chat, source files, or frontend configuration. Do not commit `.env`.
5. To create the administrator, use the explicit bootstrap command below; normal server startup never creates or promotes an administrator. The command inserts only a missing `admin@aura.store` account in a confirmed non-production database. It will not promote an existing customer or reset an existing admin password.
6. From the project root, install and start:

   ```powershell
   npm install --legacy-peer-deps
   npm run dev
   ```

   The legacy-peer option is needed for the repository's existing Vite/esbuild peer-version mismatch. MongoDB connection failures are logged; the storefront remains available, but database APIs return HTTP 503 until MongoDB connects. On an existing Atlas database, review the startup seed/deactivation behavior before launching a local server; use the existing deployed service for read-only health checks rather than starting an unreviewed local instance.
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

### Bootstrap the first administrator

The explicit bootstrap command uses the same `MONGODB_URI` as the application, disables Mongoose collection/index creation, and only inserts the administrator document. It refuses production mode, requires the confirmed database name to match the URI, and permits only database names marked `test`, `development`, `staging`, or `local`. It never promotes existing customers and never resets an existing account's password.

In PowerShell, set the target email and enter the password without placing it in command history:

```powershell
$env:ADMIN_EMAIL = 'admin@aura.store'
$securePassword = Read-Host 'Choose a unique administrator password (12+ characters)' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
npm run admin:bootstrap -- --confirm-database aura_payment_test
Remove-Item Env:ADMIN_PASSWORD
Remove-Item Env:ADMIN_EMAIL
Remove-Variable securePassword
```

Use the database name shown by your own `MONGODB_URI` in place of `aura_payment_test`; do not run this command against production. The command is repeatable: an existing admin is reported without changes. If the email already belongs to a customer, stop and use an explicitly authorized recovery procedure; the command will not change that role. After successful creation, sign in with the password you entered and remove any temporary `ADMIN_EMAIL`/`ADMIN_PASSWORD` values from `.env`.

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

The source is the [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce). The nine original CSVs belong in `dataset/olist_raw/` and are present in this checkout:

- `olist_customers_dataset.csv`
- `olist_geolocation_dataset.csv`
- `olist_order_items_dataset.csv`
- `olist_order_payments_dataset.csv`
- `olist_order_reviews_dataset.csv`
- `olist_orders_dataset.csv`
- `olist_products_dataset.csv`
- `olist_sellers_dataset.csv`
- `product_category_name_translation.csv`

The importer preserves the source IDs and relationships in nine dedicated `aura_olist_history_*` collections, separate from live AURA customers, products, carts, wishlists, orders, and Razorpay payments. It uses insert-only upserts and tags records with `source: "olist"`; existing documents are not replaced.

Open PowerShell in the project root and first check the files without requiring MongoDB:

```powershell
npm run import:olist-history -- --dry-run
```

The dry run completed without contacting MongoDB or writing records. It validated 1,550,922 CSV rows, found 1,289,091 valid unique records eligible to insert, deduplicated 261,831 repeated geolocation rows, and found zero invalid rows or relationship errors. Thirteen product categories have no translation in the source translation file; their original category values remain preserved.

The nine CSVs occupy 126,186,995 bytes (120.34 MiB). The dry-run BSON size estimate for the 1,289,091 candidate documents is 387,978,280 bytes (about 370.0 MiB), excluding secondary indexes and operational overhead. Use 775,956,560 bytes (about 740.0 MiB) only as a conservative 2x planning allowance, not a guarantee of Atlas storage consumption. Confirm available Atlas capacity and take a recoverable Atlas snapshot before any import.

The collections are `aura_olist_history_category_translations`, `aura_olist_history_customers`, `aura_olist_history_sellers`, `aura_olist_history_products`, `aura_olist_history_orders`, `aura_olist_history_order_items`, `aura_olist_history_payments`, `aura_olist_history_reviews`, and `aura_olist_history_geolocation`. MongoDB's `_id` index is automatic; the importer also creates relationship/category indexes. Olist payment values are historical BRL source values, never AURA or Razorpay transactions.

**Import has not been run. Do not execute the write command without the owner's explicit approval.** The current Atlas inspection found no `aura_olist_history_*` collections. After approval, first record a backup/snapshot and pre-import counts, then run `npm run import:olist-history` with a private, confirmed Atlas connection. The importer writes insert-only records and produces a timestamped report under the ignored `data/olist-import-reports/` folder. If rollback is approved later, use a separately reviewed, collection-scoped deletion of documents tagged `source: "olist"` in only these nine history collections, compare deleted counts with the import report, and never drop the database or touch live AURA collections. No rollback has been executed or staged.

Dry-run mode is safe to repeat, reports source file sizes and estimated BSON document sizes, and saves a PII-minimized JSON report under `data/olist-import-reports/`. Existing Atlas counts cannot be inferred by dry run because it deliberately does not connect to MongoDB.

## Product catalog and images

`server/catalog/catalogSeed.ts` contains 27 curated starter products. In the read-only Atlas snapshot, all 27 are inactive and the active sellable catalog consists of 32,951 Olist SKUs. The curated records remain stored because existing AURA order items reference them; do not delete or rewrite those products or historical orders. Olist display names are generated because the source has no product names. Olist INR prices are historical BRL order-item averages multiplied by the documented conversion rate, not current or original source prices. Product cards, details, cart, checkout, order views, email, and invoices label Olist prices as estimates.

Olist source products contain no original product photographs or image URLs. Customer product views use the existing category image mapping and fallback behavior; category photographs and illustrations are not original Olist product photos. Approved Pexels category-photo source, creator, license, attribution, and hash metadata remain in the category map. The curated seed image review is in `public/photo-review.html`; individual creator/source/license metadata for every curated image is not yet complete. Review the [Pexels license](https://www.pexels.com/license/) before redistribution or deployment.

Run the image check while the app is running:

```powershell
npm run catalog:audit-images
```

When the live database is available, it audits every product returned by the API. If it is unavailable, the command checks the curated seed mapping and local image endpoints instead; that fallback does not prove that MongoDB contains the catalog.

Administrators can import catalog CSV/JSON files from the protected administration area. A row's supplied stock value is unverified and is never sellable by itself. New products start at zero stock; an administrator must use the separate inventory workflow to enter a physically counted available-to-sell quantity. Prices and stock are validated by the backend. Product images must resolve to a local `/images/...` asset.

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

Olist product cards and other `OLIST-` product image views resolve images from the centralized `src/data/olistCategoryImageMap.ts` mapping rather than trusting the stored per-product image URL. The mapping covers all 73 non-empty Olist source categories and uncategorized products; these category-level images are not original Olist product photos. The 10-product ABO collection remains separate.

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

The reconciliation `--apply` and `--delete-unreferenced` options write to or delete Atlas data and require explicit owner approval after reviewing a dry-run report. Neither option was run during this audit. Preserve the 27 inactive curated product documents because existing AURA orders reference them.

Olist has no current inventory quantities. The Olist catalogue reconciliation command can initialize explicitly simulated `inventoryMode`/`stock` values for display, but those values are not sellable and do not enroll products in the separate demo-purchase mode. Existing non-zero stock and already initialized simulated stock are preserved:

```powershell
npm run reconcile:olist-catalogue -- --enable-demo-inventory
npm run reconcile:olist-catalogue -- --enable-demo-inventory --demo-stock 7
```

These commands are dry runs; apply the inventory initialization only after reviewing the result and receiving explicit approval. Simulated quantities are labeled, treated as unverified, and cannot pass physical cart/order validation or the physical stock-allocation predicate. Do not use them for a real sale.

```powershell
npm run reconcile:olist-catalogue -- --apply --enable-demo-inventory
npm run reconcile:olist-catalogue -- --apply --enable-demo-inventory --demo-stock 7
```

Olist historical BRL-to-INR prices are estimates from historical order-item averages, not current market prices. Product records retain a small curated subset of local category images and illustrations; neither are original Olist product photos. No images are generated or copied during reconciliation.

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

The ten read-only ABO product records appear under **More products** in the storefront. They are supplemental to Olist and do not add items to the sellable catalog, cart, wishlist, checkout, or order history. The sample IDs use the ABO listing ID and marketplace domain; no Olist product ID or Olist history record is reused. Source, license, attribution, and image-provenance records remain in `src/data/aboSampleCatalog.ts`.

Each local image was selected from the listing's `main_image_id` in the official ABO listing metadata and is stored under `public/images/abo-sample/`. The sample manifest and provenance fields live in `src/data/aboSampleCatalog.ts`; they include the marketplace listing URL, ABO metadata source, main image ID, source image URL, license, attribution, image dimensions, byte length, SHA-256, and CDN processing details. The images are 500-pixel Amazon CDN JPEG derivatives copied without further local image modifications.

The ABO dataset and images are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is displayed on the sample page and for each sample record: Amazon.com; dataset compilation by Matthieu Guillaumin (Amazon.com), Thomas Dideriksen (Amazon.com), Kenan Deng (Amazon.com), Himanshu Arora (Amazon.com), Jasmine Collins (UC Berkeley), and Jitendra Malik (UC Berkeley). The page states that Amazon does not endorse AURA. Review the [official ABO dataset](https://amazon-berkeley-objects.s3.amazonaws.com/) and license before redistributing this sample.

This sample is static and read-only. It does not connect to MongoDB and is not consumed by the Olist importer, catalogue reconciliation, cart, checkout, payment, or order routes. The existing 20 questionable free-photo pilot assets remain in their ignored staging directory and are not approved or used by this page.

## Payment setup

Razorpay checkout is disabled until valid Test Mode credentials are set in the server-only `.env` file. For physical purchases, products still require verified physical inventory. For a separate, local/non-production demo flow using admin-selected demo inventory, set `DEMO_MODE_ENABLED=true`; this flag is ignored when `NODE_ENV=production`. Read the [Razorpay Test Mode manual guide](./RAZORPAY_TEST_MODE_GUIDE.md) before testing either flow.

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=optional_webhook_secret
```

Use only credentials from Razorpay Dashboard **Test Mode**. The server rejects live key IDs; the test key ID is public to the checkout page, but the key secret and webhook secret must remain in the server-only `.env`. The backend calculates the order amount from its MongoDB order, reuses an associated Razorpay order on retries, verifies Checkout signatures against the stored Razorpay order ID, and fetches the payment from Razorpay before marking an order paid. Only a matching captured INR payment settles the order; authorized, failed, and pending states remain unpaid. Signed `payment.authorized`, `payment.failed`, and `payment.captured` webhooks are handled from the raw request body. `order.paid` is not handled; configure the payment-specific events instead. No end-to-end Razorpay Test Mode transaction was performed during this audit.

To configure Test Mode, enter the values privately in `.env` and restart the backend. Do not paste credentials into chat, source code, or frontend files. A configured key pair enables checkout but does not prove end-to-end connectivity; a sandbox payment still needs to be completed. A webhook also requires a reachable HTTPS endpoint registered in the Razorpay Test Mode Dashboard and its separate webhook secret.

### Separate demonstration inventory

Demo inventory is an opt-in demonstration path and is not physical inventory. Use only a dedicated, non-production database and Razorpay Test Mode credentials:

1. Keep `NODE_ENV=development` (or another non-production value), set `DEMO_MODE_ENABLED=true`, and configure a valid `rzp_test_` key pair in the server-only environment. The demo mode is always disabled when `NODE_ENV=production`; do not enable this flow on the live Render service.
2. Sign in with an administrator account. In **Admin Dashboard → Demo Inventory**, find a small set of existing products and explicitly mark only those products eligible with a separate demo quantity. For an isolated non-production demonstration database only, the administrator may instead use **Enable All Products with Random Demo Stock (1–100)** after reviewing its product count and confirmation. This bulk action skips products with active demo reservations and reports any skipped or failed products. Both options change only `demoEligible` and `demoStock`; they do not change physical `stock`, inventory verification, product prices, or imagery. No product is selected by default.
3. Use a customer account and a demo-eligible product to test Add to Cart, Buy Now, checkout, and Razorpay Test Mode. Demo and physical inventory cannot be mixed in one order. The server verifies payment signatures, gateway payment status, INR amount, and currency before marking an order paid.
4. Demo quantities are reserved atomically when an order is created. The internal reservation expires after 20 minutes; the Razorpay order expires after 16 minutes. The server reconciles an expired reservation only after the provider confirms the exact Razorpay order expiry and verifies there is no captured, authorized, or otherwise unresolved payment. If provider status is unavailable or ambiguous, stock is retained; an administrator can use the reconciliation control to retry.
5. Disable the flag when testing is complete. Demo orders are identified separately in administration and are not evidence of physical sales or inventory.

No products have been selected or modified in Atlas for demo purchases during this code change. A successful sandbox transaction and webhook delivery still require a human-operated test environment and are not claimed as verified here.

### Order confirmation email

Order confirmation emails are optional. Without a complete SMTP configuration, the server logs a warning and skips email without interrupting payment or checkout. For Gmail, enable 2-Step Verification and create an App Password for the account; use that App Password instead of the account password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-16-character-app-password
MAIL_FROM="AURA Store <your-account@gmail.com>"
```

Set these values privately in the server `.env` and restart the backend. Keep the App Password secret and do not commit it. An order confirmation is sent after a captured Razorpay payment (via checkout verification or webhook) and after a successful Local Demo attempt. Local Demo remains simulated and does not collect payment.

### Local Demo Payment

When the server is not running with `NODE_ENV=production`, the development-only `POST /api/payment/demo/complete` endpoint can record simulated success, failure, or cancellation. The current checkout page does not offer Local Demo Payment as a customer-facing option. These outcomes are stored in `demoPaymentAttempts`, separate from Razorpay `paymentResult` records. A demo success explicitly leaves `isPaid` false and is never counted as a collected payment. A demo cancellation marks the order cancelled and restores its reserved inventory in the same MongoDB transaction. The endpoint is disabled in production.

Checkout submissions use a per-user idempotency key and payload hash. Retrying the same submission returns its existing pending order; reusing the key with different order details is rejected. Cancelled checkout requests require a new key.

## Deploy to Render with MongoDB Atlas

1. Push the project to a Git provider supported by Render. Create a MongoDB Atlas database and a dedicated database user. In Atlas **Network Access**, allow the outbound IP ranges for the Render service; if the selected Render plan does not provide fixed outbound IPs, use an appropriately secured Atlas network policy and a strong, unique database password.
2. In Render, choose **New + → Blueprint**, select the repository, and deploy the `render.yaml` blueprint. It creates the `aura-store` web service. The configured build command is `npm install --include=dev --legacy-peer-deps && npm run build`; the start command is `npm start`; and the health check is `/api/health`. `tsx` is a production dependency because `npm start` runs the TypeScript server.
3. In the Render service's **Environment** settings, add the following values. Variables marked `sync: false` in `render.yaml` must be entered in Render and are intentionally not stored in the repository.

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | Atlas connection string, including the application database name |
   | `JWT_SECRET` | Private random value of at least 32 characters |
   | `RAZORPAY_KEY_ID` | Razorpay **Test Mode** key ID (`rzp_test_...`) |
   | `RAZORPAY_KEY_SECRET` | Razorpay **Test Mode** key secret |
   | `CORS_ORIGINS` | The deployed storefront origin, e.g. `https://aura-store.onrender.com` (no path or trailing slash) |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | Gmail account used to send confirmations |
   | `SMTP_PASS` | Gmail App Password (not the account password) |
   | `MAIL_FROM` | Sender label and address, e.g. `AURA Store <store@gmail.com>` |

   Generate a JWT secret locally, for example with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`, and paste it directly into Render's private environment settings. Enable Gmail 2-Step Verification and create an App Password before setting `SMTP_PASS`. SMTP settings are optional for the application; without them, order emails are skipped with a warning.

   If you configure Razorpay webhooks, also set the optional `RAZORPAY_WEBHOOK_SECRET` in Render and register the deployed URL ending in `/api/payment/webhook` in the Razorpay Test Mode Dashboard.
4. Confirm the Atlas URI and network access settings, then trigger a deploy. Render supplies `PORT`; the server binds to that port, serves the built `dist/` storefront in production, and serves the API from the same web service. Do not set a fixed `PORT`.
5. Open `https://<your-render-service>.onrender.com/api/health`. Confirm the response reports `database.status` as `connected`; the health check returns HTTP 503 until MongoDB is reachable. Then open the service root to verify the storefront and test its API-backed flows.

The included `Dockerfile` also builds a production image in two stages. To build and run it locally with your private `.env`, use:

```powershell
docker build -t aura-store .
docker run --rm --env-file .env -p 3000:3000 -e PORT=3000 aura-store
```

The `.dockerignore` excludes local dependencies, generated data, source datasets, Git metadata, and environment files from the build context.

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
