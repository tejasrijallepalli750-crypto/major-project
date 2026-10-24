import crypto from 'node:crypto';

export interface RazorpayConfiguration {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  isConfigured: boolean;
}

export interface RazorpayPayment {
  id?: string;
  order_id?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  method?: string;
}

export type GatewayPaymentStatus = 'captured' | 'authorized' | 'failed' | 'pending';

export const toRazorpayAmountPaise = (amountInRupees: number): number | undefined => {
  if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) return undefined;
  const amountInPaise = Math.round(amountInRupees * 100);
  return Number.isSafeInteger(amountInPaise) && amountInPaise > 0 ? amountInPaise : undefined;
};

export const getRazorpayConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): RazorpayConfiguration => {
  const keyId = (environment.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (environment.RAZORPAY_KEY_SECRET || '').trim();
  const configuredWebhookSecret = (environment.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const webhookSecret = configuredWebhookSecret.includes('YourRazorpayWebhookSecretHere')
    ? ''
    : configuredWebhookSecret;
  const isConfigured = keyId.startsWith('rzp_test_')
    && !keyId.includes('YourTestKeyIdHere')
    && keySecret.length >= 12
    && !keySecret.includes('YourRazorpaySecretKeyHere');

  return { keyId, keySecret, webhookSecret, isConfigured };
};

const safeEqualHex = (expectedHex: string, providedHex: string): boolean => {
  if (!/^[\da-f]{64}$/i.test(providedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
};

export const verifyCheckoutSignature = (
  trustedRazorpayOrderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean => {
  if (!trustedRazorpayOrderId || !paymentId || !keySecret) return false;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${trustedRazorpayOrderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
};

export const verifyWebhookSignature = (
  rawBody: Buffer,
  signature: string,
  webhookSecret: string,
): boolean => {
  if (!webhookSecret) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
};

export const paymentMatchesOrder = (
  payment: RazorpayPayment,
  expected: { orderId: string; amountPaise: number; currency: 'INR' },
): boolean =>
  payment.order_id === expected.orderId
  && Number.isSafeInteger(Number(payment.amount))
  && Number(payment.amount) === expected.amountPaise
  && payment.currency === expected.currency;

export const getGatewayPaymentStatus = (status: string | undefined): GatewayPaymentStatus =>
  status === 'captured' || status === 'authorized' || status === 'failed'
    ? status
    : 'pending';

export const shouldMarkOrderPaid = (status: GatewayPaymentStatus): boolean => status === 'captured';

export type WebhookPaymentStatus = Exclude<GatewayPaymentStatus, 'pending'>;

export const getWebhookPaymentStatus = (event: string | undefined): WebhookPaymentStatus | undefined =>
  event === 'payment.captured'
    ? 'captured'
    : event === 'payment.authorized'
      ? 'authorized'
      : event === 'payment.failed'
        ? 'failed'
        : undefined;

export const canAccessPaymentOrder = (
  orderUserId: string,
  requestUserId: string,
  requestUserRole: string,
): boolean => orderUserId === requestUserId || requestUserRole === 'admin';

export const isVerifiedPaymentReplay = (
  isPaid: boolean,
  storedOrderId: string | undefined,
  storedPaymentId: string | undefined,
  incomingOrderId: string,
  incomingPaymentId: string,
): boolean =>
  isPaid
  && storedOrderId === incomingOrderId
  && storedPaymentId === incomingPaymentId;
