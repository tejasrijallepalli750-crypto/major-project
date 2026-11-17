# Private product-import files

This folder is a backend-only staging area. Files placed directly in this folder are not imported at startup and are never served as customer-facing content.

## Historical Olist CSV import

The source is the [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce). Preserve the original CSVs in `dataset/olist_raw/` (the directory is ignored by Git). All nine expected files are present in this checkout:

- `olist_customers_dataset.csv`
- `olist_geolocation_dataset.csv`
- `olist_order_items_dataset.csv`
- `olist_order_payments_dataset.csv`
- `olist_order_reviews_dataset.csv`
- `olist_orders_dataset.csv`
- `olist_products_dataset.csv`
- `olist_sellers_dataset.csv`
- `product_category_name_translation.csv`

The importer validates headers, row values, and order/customer/product/seller relationships. Original source IDs are preserved as record keys; repeated geolocation rows are deduplicated by a stable content hash.

From the project root, validate the files without a database connection:

```powershell
npm run import:olist-history -- --dry-run
```

The completed no-database dry run found 1,289,091 valid unique records eligible for insertion, deduplicated 261,831 repeated geolocation rows, and found zero invalid rows or relationship errors. The source files total 126,186,995 bytes (120.34 MiB); the estimated BSON payload is 387,978,280 bytes (about 370 MiB), with a 2x planning allowance of 775,956,560 bytes (about 740 MiB) for indexes/overhead. This is an estimate, not a MongoDB storage guarantee.

**No historical import has been performed. Do not run the write command without explicit owner approval**, after an Atlas backup/snapshot and storage-capacity review. If approved, configure `MONGODB_URI` privately in the root `.env`, verify the target database, then run:

```powershell
npm run import:olist-history
```

This writes only to the nine dedicated `aura_olist_history_*` MongoDB collections. It never imports Olist records into live catalog, account, cart, order, or Razorpay collections. Existing historical documents are insert-only and are not overwritten or deleted. Dry-run, import, and partial-failure reports are saved under the ignored `data/olist-import-reports/` directory. In dry-run mode, `wouldImport` counts valid unique records eligible for insertion and `imported` remains zero because no database writes occur. A partial report identifies any batch whose outcome was unconfirmed after a connection failure; reruns are safe because writes use insert-only upserts. Invalid rows are reported by source row number without logging customer values; any invalid row makes the command exit with an error code. If a rollback is later approved, delete only `source: "olist"` documents from those dedicated collections after reconciling counts to the report; do not drop the database or modify live AURA collections.

An administrator can run the protected import action from the management area. A sellable catalog row must include:

- A meaningful `name` and `category`
- An explicit positive `price` in INR and a non-negative whole-number `stock` value
- A unique `sku`
- A unique local `image` path under `/images/` that exists in `public/`

Rows that do not meet these requirements are skipped and included in the import error counts. A CSV stock value is unverified source data, not evidence of physical stock; it cannot be sold until an administrator records a physical available-to-sell count in the inventory management workflow. Imported historical prices are estimates and are not current selling prices. Historical customer/order/payment records are never copied into live AURA or Razorpay collections. The legacy Olist demonstration CSV is not accepted as a source of live products.

Raw data, private configuration, and database backups should remain local and are excluded from Git. To migrate the existing local JSON store to MongoDB, follow the explicit backup-and-import procedure in [PROJECT_MANUAL.md](../PROJECT_MANUAL.md).
