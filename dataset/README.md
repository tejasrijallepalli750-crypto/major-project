# Private product-import files

This folder is a backend-only staging area. Files placed directly in this folder are not imported at startup and are never served as customer-facing content.

## Historical Olist CSV import

Put the nine original Olist CSV files in `dataset/olist_raw/` (the directory is ignored by Git). The importer requires the original file names, including `olist_order_payments_dataset.csv` and `product_category_name_translation.csv`. It validates the headers, row values, and order/customer/product/seller relationships before reporting errors.

From the project root, validate the files without a database connection:

```powershell
npm run import:olist-history -- --dry-run
```

To persist historical records, configure `MONGODB_URI` privately in the root `.env` file, confirm `GET http://localhost:3000/api/health` reports `database.status` as `connected`, then run:

```powershell
npm run import:olist-history
```

This writes only to separate `aura_olist_history_*` MongoDB collections. It never imports Olist records into live catalog, account, cart, order, or Razorpay collections. Existing historical documents are insert-only and are not overwritten or deleted. Database runs write a report under the ignored `data/olist-import-reports/` directory, including a partial report if a file or database write fails. In dry-run mode, `wouldImport` counts valid unique records eligible for insertion and `imported` remains zero because no database writes occur. A partial report identifies any batch whose outcome was unconfirmed after a connection failure; reruns are safe because writes use insert-only upserts. Invalid rows are reported by source row number without logging customer values; any invalid row makes the command exit with an error code.

An administrator can run the protected import action from the management area. A sellable catalog row must include:

- A meaningful `name` and `category`
- An explicit positive `price` in INR and a non-negative whole-number `stock`
- A unique `sku`
- A unique local `image` path under `/images/` that exists in `public/`

Rows that do not meet these requirements are skipped and included in the import error counts. Imported historical price or category records are not treated as current selling prices, stock, customer accounts, orders, or gateway payments. The legacy Olist demonstration CSV is not accepted as a source of live products.

Raw data, private configuration, and database backups should remain local and are excluded from Git. To migrate the existing local JSON store to MongoDB, follow the explicit backup-and-import procedure in [PROJECT_MANUAL.md](../PROJECT_MANUAL.md).
