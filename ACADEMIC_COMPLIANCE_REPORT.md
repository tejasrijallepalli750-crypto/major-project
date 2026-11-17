# AURA E-Commerce Website with Payment Gateway

## Academic project compliance and verification report

**Review date:** 14 November 2026
**Project state:** Existing application reviewed; changes remain local and uncommitted. No deployment, payment, Olist import, or Atlas write was performed for this review.

## Executive summary

AURA is an existing React/Vite storefront with an Express/TypeScript API, MongoDB Atlas persistence, Razorpay Test Mode integration, catalog/order administration, and invoice generation. The implementation and local tests are suitable for continued academic demonstration, with important operational limitations: product inventory is now fail-closed until physically verified, the historical Olist records have not been imported, external integrations were not exercised end-to-end, and startup can mutate catalog/admin records when connected to MongoDB.

The intent of the inventory safeguard is to prevent accidental sales against simulated or unverified quantities. This also means existing catalog products without a recorded physical verification cannot be purchased until an administrator records a count.

## Requirement-wise findings

| Area | Finding | Status |
| --- | --- | --- |
| Storefront, API, authentication and administration | React/Vite and Express routes are present. Password hashing, JWT authentication, and server-side admin checks are implemented. The API tests use isolated stubs; no live customer data was changed. | Implemented; locally tested |
| Product creation and stock controls | Admin-created products start with zero stock and `unverified` inventory. Regular product updates reject stock changes. An admin-only inventory route requires an explicit physical-count confirmation and records the verifier and time. | Implemented; route tests added |
| Cart and checkout | Client controls block unverified/out-of-stock items. Server cart validation and order creation independently reject unverified inventory. Prices are recalculated from database products; order creation uses an idempotency key and atomic stock reservation. | Implemented; isolated route tests |
| Orders and invoices | Order authorization, status transitions, cancellation safeguards, inventory restoration for permitted cancellations, payment summaries, and multi-page invoice generation are covered by local tests. The generated document labels itself “Not a tax invoice.” | Implemented with limitations |
| Reviews | Public review retrieval and paid/delivered-order eligibility are implemented; duplicate-user/product and rating-summary behavior have tests. | Implemented; local tests |
| Razorpay | The code checks Test Mode configuration, amount/currency/order matching, Checkout signature, provider payment status, raw-body webhook signature, and captured-only payment completion. | Code-level tests; no real Test Mode transaction or webhook delivery |
| Olist history | All nine original CSVs are present. A dry run validated 1,550,922 rows, found 1,289,091 eligible unique records, deduplicated 261,831 repeated geolocation rows, and found zero invalid rows or relationship errors. | Validated; **not imported** |
| Olist catalog and current AURA orders | A prior read-only Atlas audit found 32,951 active Olist products, 27 inactive curated products, and seven of eight AURA orders referencing non-Olist SKUs. The curated records and historical AURA orders were preserved. | Reviewed read-only; no catalog rewrite |
| Product images | Local coverage maps all 32,951 Olist product records. Twenty-four category placements use approved representative Pexels photos; 49 translated categories plus uncategorized products use local illustrations. The 27 curated product image paths served successfully in a local static check, but attribution metadata is incomplete for some curated images. | Local files checked; provenance incomplete for curated set |
| MongoDB Atlas | A prior read-only inspection observed Atlas data. No live CRUD, migration, import, payment write, or health request was performed for this verification. | Not end-to-end verified |
| Render deployment | `render.yaml` selects the Node runtime, npm build, `npm start`, and `/api/health`. `tsx` is a production dependency. `.node-version` pins Node 24.22.1, matching the current Render default and the local verification runtime. | Configuration/build compatible; deployed service not tested |
| Privacy and dependency safety | Root `.env` exists, is ignored and not tracked. No files are staged. Olist CSVs under `dataset/olist_raw/` are not tracked. Dependency audit found zero vulnerabilities. | Checked locally |

## Risk review of the uncommitted changes

1. **Sales availability is intentionally reduced until stock verification.** Missing inventory status is interpreted as `unverified`; a verified physical count is required before cart/order allocation. This is the safe behavior, but it blocks sales for existing products until counted.
2. **Inventory updates are absolute available-to-sell quantities.** Administrators must count stock after accounting for units already reserved by pending orders. Metadata stores the latest verifier/time, not a complete adjustment history.
3. **Application startup has database side effects.** `db.connect()` can create an admin if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, deactivate generated/unsafe active products, and seed any missing starter products. Do not point an unreviewed deployment at the existing Atlas database; inspect these effects and use the intended database before starting or deploying.
4. **Pending Razorpay orders can hold inventory.** There is no automatic expiry/reconciliation worker. Cancellation is intentionally blocked for orders with an active Razorpay order ID until payment state is reconciled.
5. **Webhook idempotency is order-state based, not an event ledger.** A repeated captured event is harmless after the order is paid, but the application does not persist Razorpay's unique event ID. The handler processes `payment.authorized`, `payment.failed`, and `payment.captured`; it does not process `order.paid`.
6. **Render Node was previously unpinned.** `.node-version` now pins 24.22.1. A `NODE_VERSION` override set directly in the Render Dashboard can take precedence; check it manually.
7. **Invoice output is a receipt, not a tax invoice.** It shows GST as a single 18% total, not a jurisdiction-specific CGST/SGST tax breakdown. Do not present it as a tax-compliant invoice.
8. **npm installation refreshed compatible lockfile patch versions.** `body-parser`, `follow-redirects`, `mongoose`, and `mquery` changed to the versions recorded in `package-lock.json`; `npm audit` reported zero vulnerabilities.

## Render environment configuration

Set values privately in Render; never place secret values in Git or this report.

**Required for the deployed application:**

- `NODE_ENV=production`
- `MONGODB_URI` — private URI for the approved Atlas database
- `JWT_SECRET` — private, random value of at least 32 characters
- `RAZORPAY_KEY_ID` — Test Mode key ID (`rzp_test_...`)
- `RAZORPAY_KEY_SECRET` — matching Test Mode secret
- `CORS_ORIGINS` — comma-separated browser origins, with no path or trailing slash (for example, the deployed storefront origin)

**Required only when enabling webhook delivery:**

- `RAZORPAY_WEBHOOK_SECRET` — the separate secret configured for that Razorpay Test Mode webhook endpoint

**Optional order email:**

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_USER` — sender Gmail account
- `SMTP_PASS` — Gmail App Password, never the account password
- `MAIL_FROM` — sender label/address

Render supplies `PORT`; do not set a fixed port. `.node-version` specifies Node 24.22.1 unless a higher-precedence Render Dashboard `NODE_VERSION` overrides it. `ADMIN_EMAIL`/`ADMIN_PASSWORD` are optional bootstrap settings with startup side effects; do not set them on an existing database unless admin creation is intended. `MONGODB_DNS_SERVERS` is development-only and rejected in production.

## Razorpay manual verification

The complete staging-only procedure, including supported webhook events, Test Mode card instructions, failure/retry behavior, and cleanup cautions, is in [RAZORPAY_TEST_MODE_GUIDE.md](./RAZORPAY_TEST_MODE_GUIDE.md). It was prepared from Razorpay's current [webhook setup](https://razorpay.com/docs/webhooks/setup-edit-payments/), [webhook validation](https://razorpay.com/docs/webhooks/validate-test/), and [Test Card Details](https://razorpay.com/docs/payments/payments/test-card-details/) documentation. **No payment was initiated as part of this audit.**

## Verification results

- `npm install --include=dev --legacy-peer-deps`: completed; lockfile is consistent with the installed manifest and npm reported zero vulnerabilities.
- `npm run lint`: passed (`tsc --noEmit`, exit code 0).
- `npm test`: passed; 94 tests passed, zero failed, skipped, or cancelled.
- `npm run build`: passed on Node 24.22.1 and produced `dist/`. Vite reports the existing `__dirname` config-loader deprecation and an 852.71 kB minified JavaScript chunk warning; neither prevented the build. An earlier Windows run intermittently failed to clear `dist/assets` with `EPERM`, but this final sequential build completed without that error.
- `npm audit --audit-level=high`: passed; zero vulnerabilities reported.
- Product image check: 27/27 curated images served successfully from a local static preview; no broken or duplicate image paths were reported.
- Olist dry run: completed without contacting MongoDB; the timestamped, PII-minimized report is saved under ignored `data/olist-import-reports/`.
- Git checks: `git diff --check` passed; `.env` is ignored and untracked; no Olist source CSVs are tracked; no changes are staged. The added-diff scan found no actual credentials or secret values; its only secret-pattern match was a temporary test-only `JWT_SECRET` value.

## Manual checklist before final submission

- [ ] Confirm the Render Dashboard does not override `NODE_VERSION` with an incompatible version.
- [ ] Review startup admin/catalog side effects before any service is pointed at the existing Atlas database.
- [ ] Physically count inventory and have an administrator record available-to-sell quantities before enabling checkout.
- [ ] Keep historical Olist import disabled until storage, backup, target-database, and owner-approval checks are complete.
- [ ] Complete curated-image attribution review; label all category photos as representative, not exact Olist product photos.
- [ ] If authorized, use a staging-only Atlas database and complete the Razorpay Test Mode procedure; do not test against production customer/order data.
- [ ] Configure the Test Mode webhook with only the three events the handler supports and verify delivery/signature logs.
- [ ] Check the Render `/api/health` endpoint after an explicitly approved deployment; confirm the intended Atlas database and service health.
- [ ] Capture original, non-sensitive screenshots for product, stock verification, cart, checkout, orders, reviews, admin, and invoice evidence.
- [ ] Review the final staged diff, then commit and push only after explicit authorization.

## Change-control status

The working branch is `main`. Changes are not staged, committed, pushed, or deployed. Atlas was not modified and Olist history was not imported.
