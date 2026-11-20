# Razorpay Test Mode manual verification

This is a manual procedure only. No transaction or webhook was triggered while preparing it. **Do not use Live Mode or real payment credentials.**

## Safety prerequisites

1. Use a dedicated non-production MongoDB database. Do not point a test deployment at the live AURA database: checkout creates orders and reserves inventory, while server startup can create an admin, deactivate some products, and seed missing catalog entries.
2. For a real-inventory Test Mode check, use a non-production staging deployment and a product with physically verified available-to-sell stock. Do not mark invented/demo stock as verified.
3. The separate demonstration-inventory flow is available only when `DEMO_MODE_ENABLED=true` and `NODE_ENV` is not `production`. Use a local or isolated non-production environment, and explicitly select a small product set and separate demo quantities through **Admin Dashboard → Demo Inventory**. Its administrator-only bulk action can enable all existing products with random demo quantities from 1 to 100; use it only after confirming the product count on a dedicated non-production database. Products with active demo reservations are skipped and reported. Demo quantities never establish physical inventory.
4. Use only a Razorpay Test Mode key ID beginning with `rzp_test_` and its matching key secret. The key secret must remain server-side.
5. Use a test customer account and non-sensitive test contact/address details. Do not use a customer's real personal information.
6. To test webhooks, configure a publicly reachable HTTPS test endpoint. Test webhooks cannot be delivered directly to localhost.

The configured Render service and Atlas contents were not changed for this guide.

## Successful payment

1. In the Razorpay Dashboard, switch to **Test Mode** and obtain the Test Mode API key pair. Keep the key secret private.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the staging service's private environment. Confirm the application payment configuration reports Test Mode.
3. Sign in as the test customer, add a physically verified product (or an explicitly selected demo-inventory product in the isolated demo flow) to the cart, and proceed through delivery and checkout. A single order cannot mix physical and demo inventory.
4. Confirm the amount shown in Checkout matches the trusted order total. The backend creates or reuses the Razorpay order and converts the amount to paise; do not alter the amount in browser tools.
5. In Razorpay Checkout, select **Card** and use the official [Razorpay Test Card Details](https://razorpay.com/docs/payments/payments/test-card-details/). For example, the documented Indian Visa test card is `4100 2800 0000 1007`. Use a random CVV and a future expiry date. On the simulated bank page, enter a random OTP of 4–10 digits for success.
6. Card networks, netbanking banks, wallets, and UPI options are supplied by Razorpay Checkout according to the Test Mode account configuration and current sandbox support. A method appearing in Checkout does not guarantee that the provider supports a successful test for it; use only the current official test instruments and provider guidance.
7. Verify that the app reports success only after server verification. In the test order record, confirm the expected order/payment IDs, INR amount, captured status, and `isPaid: true`. Confirm that only the appropriate inventory field was reserved once (physical `stock` or separate `demoStock`), not again on retries.
8. If SMTP is configured in staging, verify the confirmation reaches a test mailbox and does not contain secrets. Otherwise, the application should log that optional email was skipped without failing payment.

## Failed payment and retry

1. Start a separate staging checkout. To exercise a declined/insufficient-funds case, use an official error-scenario card from the Razorpay test-card documentation and choose **Failure** on the simulated bank page.
2. Confirm the attempt is not reported as paid. A failed or authorized payment must not set the order to paid; only a matching captured payment can do that.
3. From **My Orders**, use **Retry Payment** for an eligible pending order. The server verifies ownership and checks the existing Razorpay order amount, currency, order status, and prior payment statuses before returning the same order ID to Checkout. It never creates a replacement internal or Razorpay order for a retry. If the stored Razorpay order ID is missing or the provider status is ambiguous, payment recovery is required and the reservation remains held.
4. Demo Razorpay orders expire after 16 minutes; their separate inventory reservations expire after 20 minutes. Expired demo reservations are released only after the server confirms the provider order's recorded expiry and verifies there is no captured, authorized, or otherwise unresolved payment. If the provider is unavailable or its state is ambiguous, the reservation is retained for a later reconciliation attempt.
5. Physical-inventory order expiration is unchanged by the demo feature. Use an isolated test database or an explicitly approved cleanup plan for physical-order tests.

## Configure a Test Mode webhook

1. Choose the staging service's public HTTPS URL, for example `https://<staging-service>.onrender.com/api/payment/webhook`. Razorpay requires a public URL and ports 80 or 443; localhost is not supported.
2. In the Razorpay Dashboard, remain in **Test Mode**, then open **Account & Settings → Webhooks → Add New Webhook**.
3. Enter the staging URL. Generate a strong webhook secret and store the exact same value privately as `RAZORPAY_WEBHOOK_SECRET` in the staging service. This is a separate secret from `RAZORPAY_KEY_SECRET`.
4. Subscribe only to the event names the current handler processes:
   - `payment.authorized`
   - `payment.failed`
   - `payment.captured`

   Do not rely on `order.paid`: this server does not process that event or its order-entity payload. Checkout success and webhook notifications are separate flows; a Checkout callback is not a webhook.
5. Save/enable the endpoint. If the Dashboard prompts for the documented Test Mode confirmation OTP, follow the current Razorpay Dashboard prompt. Keep webhook secret values out of screenshots, logs, source control, and reports.
6. Complete a staging Test Mode payment and inspect the Razorpay webhook delivery status and staging server logs. A valid request must pass HMAC-SHA256 verification over the unmodified raw body. Expect only a captured event to mark the order paid; authorized/failed events leave it unpaid.
7. Verify duplicate delivery is harmless at the order level and that event ordering does not downgrade an already-paid order. Razorpay may retry failed deliveries and events are not guaranteed to arrive in order; endpoint failures must be investigated in the Dashboard. The application does not persist Razorpay's event ID as a separate event ledger.
8. If rotating the webhook secret, account for Razorpay retries of older events: those retries may still require the previous secret for signature verification. Follow Razorpay's current [webhook validation and testing guidance](https://razorpay.com/docs/webhooks/validate-test/) before rotating.

Razorpay references: [About Webhooks](https://razorpay.com/docs/webhooks/), [Set Up and Edit Payment Webhooks](https://razorpay.com/docs/webhooks/setup-edit-payments/), [Validate and Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/), and [Test Card Details](https://razorpay.com/docs/payments/payments/test-card-details/).
