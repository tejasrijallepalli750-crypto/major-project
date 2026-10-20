# AURA Store

AURA is a full-stack e-commerce application for a curated catalogue of everyday essentials. It includes customer accounts, shopping cart and checkout flows, product and order administration, and invoice downloads.

## Included features

- Product catalogue with categories, search, sorting, product details, images, stock, and cart
- Customer registration, login, profile updates, protected order history, and downloadable PDF invoices
- Role-protected store administration for product management, inventory updates, order fulfilment, and sales summaries
- Server-side price and stock validation before orders are created
- Razorpay Test Mode checkout integration and server-side HMAC-SHA256 payment-signature verification
- Responsive React and Tailwind interface with an Express API and persistent local document storage

## Local development

1. Install dependencies with `bun install`.
2. Copy `.env.example` to `.env`.
3. Set a long, unique `JWT_SECRET`.
4. Run `bun run dev`.

On a fresh local data store, the application seeds a small sample catalogue and a local administrator account (`admin@aura.store`, password `Admin@123`). Change the administrator password before exposing the application outside local development. Customers can register through the storefront, and administrators can add, edit, or remove products in the protected dashboard.

## Payment setup

Razorpay checkout remains disabled until valid Test Mode credentials are supplied. The storefront does not simulate successful payments.

To enable Test Mode checkout, set the following server-side values in `.env` and restart the server:

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=optional_webhook_secret
```

With valid credentials, the server requests Razorpay orders through Razorpay's API. The browser uses Razorpay Checkout and sends its payment response back to the server. The server marks an order paid only after a constant-time HMAC-SHA256 signature comparison succeeds. Configuring keys alone does not confirm connectivity; complete a successful Test Mode transaction to verify the integration.

## Storage

The current build uses persistent local storage at `data/aura_database.json`. MongoDB is not connected or used by this build, so no MongoDB credentials are needed. A MongoDB URI alone will not enable MongoDB; a persistence adapter must be implemented first.
