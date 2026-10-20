# Dataset Directory

Place your CSV or JSON dataset files directly into this `/dataset/` folder.

### Supported File Formats:
1. **CSV Files** (`.csv`):
   - Example columns: `name`, `description`, `price`, `category`, `stock`, `image`, `sku`, `brand`
   - Or standard e-commerce dataset columns like `product_id`, `product_category_name`, `price`, etc.
2. **JSON Files** (`.json`):
   - Array of product objects: `[{ "name": "...", "price": 1999, "category": "...", "stock": 10 }]`

### How It Works:
- The backend automatically watches and scans this `/dataset/` directory.
- In the **Admin Dashboard** (`/admin`), you can view detected files and click **"Sync Dataset to Storefront"** to import them into the live catalog.
- Products imported from this folder immediately appear on the storefront catalog with full search, filtering, and checkout capabilities!
