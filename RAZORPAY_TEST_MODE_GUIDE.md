# Razorpay Test Mode manual verification

This is a manual procedure only. No transaction or webhook was triggered while preparing it. **Do not use Live Mode or real payment credentials.**

## Safety prerequisites

1. Use a staging deployment connected to a dedicated non-production MongoDB database. Do not point the test deployment at the live AURA database: checkout creates orders and reserves stock, while server startup can create an admin, deactivate some products, and seed missing catalog entries.
2. Confirm staging uses `NODE_ENV=production` so the development-only Local Demo endpoint is unavailable.
3. Use only a Razorpay Test Mode key ID beginning with `rzp_test_` and its matching key secret. The key secret must remain server-side.
4. Use a test customer account and non-sensitive test contact/address details. Do not use a customer's real personal information.
5. Before checkout, use only a genuine product with a physically verified available-to-sell quantity. Do not mark invented/demo stock as verified. If no suitable product is available, stop rather than bypassing inventory validation.
6. To test webhooks, configure a publicly reachable HTTPS staging endpoint. Test webhooks cannot be delivered directly to localhost.

The configured Render service and Atlas contents were not changed for this guide.

## Successful payment

1. In the Razorpay Dashboard, switch to **Test Mode** and obtain the Test Mode API key pair. Keep the key secret private.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the staging service's private environment. Confirm the application payment configuration reports Test Mode.
3. Sign in as the staging test customer, add a physically verified product to the cart, and proceed through delivery and checkout.
4. Confirm the amount shown in Checkout matches the trusted order total. The backend creates or reuses the Razorpay order and converts the amount to paise; do not alter the amount in browser tools.
5. In Razorpay Checkout, select **Card** and use the official [Razorpay Test Card Details](https://razorpay.com/docs/payments/payments/test-card-details/). For example, the documented Indian Visa test card is `4100 2800 0000 1007`. Use a random CVV and a future expiry date. On the simulated bank page, enter a random OTP of 4–10 digits for success.
6. Verify that the app reports success only after server verification. In the staging order record, confirm the expected order/payment IDs, INR amount, captured status, and `isPaid: true`. Confirm the stock was reserved once, not again on retries.
7. If SMTP is configured in staging, verify the confirmation reaches a test mailbox and does not contain secrets. Otherwise, the application should log that optional email was skipped without failing payment.

## Failed payment and retry

1. Start a separate staging checkout. To exercise a declined/insufficient-funds case, use an official error-scenario card from the Razorpay test-card documentation and choose **Failure** on the simulated bank page.
2. Confirm the attempt is not reported as paid. A failed or authorized payment must not set the order to paid; only a matching captured payment can do that.
3. Retry using the same pending checkout where appropriate. The app associates retries with the existing order and Razorpay order ID; check that a retry does not reserve the same items a second time.
4. **Known limitation:** failed or abandoned Razorpay orders can retain reserved stock. There is no automatic expiration/reconciliation job. Do not cancel an order with an active Razorpay order ID through the admin UI; the backend rejects that action until its payment state is reconciled. Use a disposable staging database or an explicitly approved cleanup plan.

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
