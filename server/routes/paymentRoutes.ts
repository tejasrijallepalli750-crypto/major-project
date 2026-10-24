import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { db, getDatabaseErrorStatus } from '../db/database';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { DemoPaymentAttempt, Order, PaymentResult } from '../../src/types';
import {
  getRazorpayConfig,
  getGatewayPaymentStatus,
  getWebhookPaymentStatus,
  canAccessPaymentOrder,
  isVerifiedPaymentReplay,
  paymentMatchesOrder,
  shouldMarkOrderPaid,
  toRazorpayAmountPaise,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  RazorpayPayment,
} from '../payments/razorpay';

const router = Router();

const isDemoOutcome = (value: unknown): value is DemoPaymentAttempt['outcome'] =>
  value === 'success' || value === 'failure' || value === 'cancelled';

type OrderAccess =
  | { order: Order }
  | { error: string; status: 403 | 404 };

const verifyOrderOwnership = async (
  orderId: string,
  user: NonNullable<AuthenticatedRequest['user']>,
): Promise<OrderAccess> => {
  const order = await db.findOrderById(orderId);
  if (!order) return { error: 'Order not found.', status: 404 };
  if (!canAccessPaymentOrder(order.user.id, user.id, user.role)) {
    return { error: 'Unauthorized access to this order.', status: 403 };
  }
  return { order };
};

const getGatewayClient = (keyId: string, keySecret: string): Razorpay =>
  new Razorpay({ key_id: keyId, key_secret: keySecret });

const isGatewayTimeout = (error: unknown): boolean =>
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED');

const paymentData = (order: Order, razorpayOrderId: string, keyId: string) => ({
  orderId: order.id,
  orderNumber: order.orderNumber,
  razorpayOrderId,
  amount: Math.round(order.totalPrice * 100),
  currency: 'INR',
  keyId,
  customer: {
    name: order.user.name,
    email: order.user.email,
    phone: order.user.phone || order.shippingAddress.phone,
  },
});

const paymentResult = (
  order: Order,
  payment: RazorpayPayment,
  status: PaymentResult['status'],
): PaymentResult => ({
  id: payment.id!,
  status,
  razorpay_order_id: payment.order_id,
  razorpay_payment_id: payment.id,
  verifiedAt: new Date().toISOString(),
  method: payment.method || 'Razorpay Test Mode',
  amount: order.totalPrice,
  currency: 'INR',
});

router.get('/config', (_req: Request, res: Response) => {
  const config = getRazorpayConfig();
  return res.json({
    success: true,
    isConfigured: config.isConfigured,
    demoModeAvailable: process.env.NODE_ENV !== 'production',
    keyId: config.isConfigured ? config.keyId : undefined,
    currency: 'INR',
    mode: 'TEST',
    message: config.isConfigured
      ? 'Razorpay Test Mode is configured.'
      : 'Razorpay Test Mode needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before checkout can be enabled.',
  });
});

router.post('/demo/complete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'Local Demo Payment is available only in development.' });
  }

  try {
    const body: unknown = req.body;
    const { orderId, attemptId, outcome } = body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    if (typeof orderId !== 'string' || !orderId.trim()
      || typeof attemptId !== 'string' || !/^[\da-f-]{16,100}$/i.test(attemptId)
      || !isDemoOutcome(outcome)) {
      return res.status(400).json({ success: false, message: 'A valid order, demo attempt ID, and outcome are required.' });
    }

    const access = await verifyOrderOwnership(orderId, req.user!);
    if ('error' in access) return res.status(access.status).json({ success: false, message: access.error });
    const order = access.order;
    if (order.paymentMethod !== 'Local Demo' || order.razorpayOrderId || order.paymentResult) {
      return res.status(409).json({ success: false, message: 'This order is not eligible for Local Demo Payment.' });
    }

    const existingAttempt = order.demoPaymentAttempts?.find((attempt) => attempt.attemptId === attemptId);
    if (existingAttempt) {
      if (existingAttempt.outcome !== outcome) {
        return res.status(409).json({ success: false, message: 'This demo attempt was already recorded with a different outcome.' });
      }
      return res.json({
        success: true,
        message: 'This Local Demo outcome was already recorded.',
        order,
        outcome: existingAttempt.outcome,
      });
    }

    if (order.demoPaymentAttempts?.some((attempt) => attempt.outcome === 'success')) {
      return res.status(409).json({ success: false, message: 'A successful Local Demo outcome has already been recorded for this order.' });
    }
    if (order.isPaid || order.status !== 'Pending') {
      return res.status(409).json({ success: false, message: 'This order is no longer available for a demo payment attempt.' });
    }

    const updatedOrder = await db.recordDemoPaymentAttempt(order.id, req.user!.id, {
      attemptId,
      outcome,
    });
    const recordedAttempt = updatedOrder?.demoPaymentAttempts?.find((attempt) => attempt.attemptId === attemptId);
    if (!updatedOrder || !recordedAttempt) {
      return res.status(409).json({ success: false, message: 'The Local Demo outcome could not be recorded for this order.' });
    }
    if (recordedAttempt.outcome !== outcome) {
      return res.status(409).json({ success: false, message: 'This demo attempt was already recorded with a different outcome.' });
    }

    return res.json({
      success: true,
      message: outcome === 'success'
        ? 'Local Demo success recorded. No real payment was collected and this order remains unpaid.'
        : outcome === 'failure'
          ? 'Local Demo failure recorded. The order remains unpaid and you may retry.'
          : 'Local Demo cancellation recorded. The order was cancelled and reserved inventory restored.',
      order: updatedOrder,
      outcome,
    });
  } catch (error) {
    console.error('[Payment] Local Demo processing error:', error instanceof Error ? error.name : 'Unknown error.');
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Unable to record the Local Demo outcome.' });
  }
});

router.post('/create-order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId) return res.status(400).json({ success: false, message: 'Internal order ID is required.' });

    const access = await verifyOrderOwnership(orderId, req.user!);
    if ('error' in access) return res.status(access.status).json({ success: false, message: access.error });
    if (access.order.isPaid || access.order.status !== 'Pending') {
      return res.status(409).json({ success: false, message: 'This order is no longer available for payment.' });
    }
    if (access.order.paymentMethod !== 'Razorpay' || access.order.demoPaymentAttempts?.length) {
      return res.status(409).json({ success: false, message: 'This order was not created for Razorpay Test Mode.' });
    }

    const config = getRazorpayConfig();
    if (!config.isConfigured) {
      return res.status(503).json({
        success: false,
        message: 'Razorpay Test Mode is not configured. Add valid test credentials to the server environment before taking payments.',
      });
    }

    const amount = toRazorpayAmountPaise(access.order.totalPrice);
    if (amount === undefined) {
      return res.status(400).json({ success: false, message: 'The order amount is invalid for Razorpay checkout.' });
    }

    if (access.order.razorpayOrderId) {
      return res.json({
        success: true,
        data: paymentData(access.order, access.order.razorpayOrderId, config.keyId),
      });
    }

    let gatewayOrder: { id?: string; amount?: number | string; currency?: string };
    try {
      gatewayOrder = await getGatewayClient(config.keyId, config.keySecret).orders.create({
        amount,
        currency: 'INR',
        receipt: access.order.orderNumber.slice(0, 40),
        notes: { internalOrderId: access.order.id, orderNumber: access.order.orderNumber },
      });
    } catch (error) {
      const timedOut = isGatewayTimeout(error);
      console.error(`[Payment] Razorpay order request ${timedOut ? 'timed out' : 'failed'}.`);
      return res.status(timedOut ? 504 : 502).json({
        success: false,
        message: timedOut
          ? 'Razorpay did not respond in time. You can safely retry checkout.'
          : 'Unable to reach Razorpay. Please try again.',
      });
    }

    if (!gatewayOrder.id
      || !/^order_[A-Za-z0-9]+$/.test(gatewayOrder.id)
      || !Number.isSafeInteger(Number(gatewayOrder.amount))
      || Number(gatewayOrder.amount) !== amount
      || gatewayOrder.currency !== 'INR') {
      console.error('[Payment] Razorpay order response did not match the requested amount and currency.');
      return res.status(502).json({ success: false, message: 'Razorpay could not create the payment order.' });
    }

    const updatedOrder = await db.updateOrderRazorpayId(access.order.id, gatewayOrder.id);
    if (!updatedOrder?.razorpayOrderId) {
      return res.status(409).json({ success: false, message: 'Unable to associate the payment with this order.' });
    }
    return res.json({
      success: true,
      data: paymentData(updatedOrder, updatedOrder.razorpayOrderId, config.keyId),
    });
  } catch (error) {
    console.error('[Payment] Create order error:', error instanceof Error ? error.name : 'Unknown error.');
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Unable to start the Razorpay checkout.' });
  }
});

router.post('/verify', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
    if (![orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature].every((value) =>
      typeof value === 'string' && value.length > 0 && value.length <= 256)) {
      return res.status(400).json({ success: false, message: 'The payment response is incomplete or invalid.' });
    }

    const access = await verifyOrderOwnership(orderId, req.user!);
    if ('error' in access) return res.status(access.status).json({ success: false, message: access.error });
    const order = access.order;
    if (order.status !== 'Pending') {
      return res.status(409).json({ success: false, message: 'This order is no longer available for payment verification.' });
    }
    if (order.paymentMethod !== 'Razorpay' || order.demoPaymentAttempts?.length) {
      return res.status(409).json({ success: false, message: 'This order was not created for Razorpay Test Mode.' });
    }

    if (order.isPaid) {
      if (isVerifiedPaymentReplay(
        order.isPaid,
        order.paymentResult?.razorpay_order_id,
        order.paymentResult?.razorpay_payment_id,
        order.razorpayOrderId || '',
        razorpay_payment_id,
      )) {
        return res.json({ success: true, message: 'Order was already verified.', order });
      }
      return res.status(409).json({ success: false, message: 'This order has already been paid with a different payment.' });
    }
    if (!order.razorpayOrderId || order.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'The payment does not match the Razorpay order created for this purchase.' });
    }

    const config = getRazorpayConfig();
    if (!config.isConfigured) return res.status(503).json({ success: false, message: 'Razorpay Test Mode is not configured.' });
    if (!verifyCheckoutSignature(order.razorpayOrderId, razorpay_payment_id, razorpay_signature, config.keySecret)) {
      return res.status(400).json({ success: false, message: 'Payment verification failed. The gateway signature did not match.' });
    }

    let payment: RazorpayPayment;
    try {
      payment = await getGatewayClient(config.keyId, config.keySecret).payments.fetch(razorpay_payment_id);
    } catch (error) {
      const timedOut = isGatewayTimeout(error);
      console.error(`[Payment] Razorpay payment lookup ${timedOut ? 'timed out' : 'failed'}.`);
      return res.status(timedOut ? 504 : 502).json({
        success: false,
        message: 'Payment could not be confirmed with Razorpay. Please retry verification.',
      });
    }

    const amountPaise = toRazorpayAmountPaise(order.totalPrice);
    if (amountPaise === undefined
      || payment.id !== razorpay_payment_id
      || !paymentMatchesOrder(payment, { orderId: order.razorpayOrderId, amountPaise, currency: 'INR' })) {
      return res.status(400).json({ success: false, message: 'The Razorpay payment does not match this order amount or currency.' });
    }

    const state = getGatewayPaymentStatus(payment.status);
    if (state === 'pending') {
      return res.status(202).json({
        success: false,
        pending: true,
        message: 'Razorpay has not completed this payment yet. The order remains unpaid.',
      });
    }

    const updatedOrder = await db.updateOrderPayment(order.id, paymentResult(order, payment, state));
    if (!shouldMarkOrderPaid(state)) {
      return res.status(state === 'failed' ? 402 : 202).json({
        success: false,
        pending: state === 'authorized',
        message: state === 'failed'
          ? 'Razorpay reports that this payment failed. The order remains unpaid.'
          : 'Razorpay has authorized but not captured this payment. The order remains unpaid.',
      });
    }

    if (updatedOrder?.isPaid) {
      return res.json({ success: true, message: 'Payment verified successfully.', order: updatedOrder });
    }
    const currentOrder = await db.findOrderById(order.id);
    if (currentOrder?.isPaid && currentOrder.paymentResult?.razorpay_payment_id === razorpay_payment_id) {
      return res.json({ success: true, message: 'Payment was already verified.', order: currentOrder });
    }
    return res.status(409).json({ success: false, message: 'Payment was captured but the order state could not be updated. Please contact support.' });
  } catch (error) {
    console.error('[Payment] Verification error:', error instanceof Error ? error.name : 'Unknown error.');
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Unable to verify payment.' });
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  const config = getRazorpayConfig();
  if (!config.isConfigured || !config.webhookSecret) {
    return res.status(503).json({ status: 'webhook_not_configured' });
  }

  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) return res.status(400).json({ status: 'raw_body_missing' });
    const signatureHeader = req.headers['x-razorpay-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!signature || !verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
      return res.status(400).json({ status: 'invalid_signature' });
    }

    const eventStatus = getWebhookPaymentStatus(req.body?.event);
    if (!eventStatus) {
      return res.json({ status: 'ignored' });
    }

    const payment = req.body?.payload?.payment?.entity as RazorpayPayment | undefined;
    if (!payment?.id
      || !payment.order_id
      || !Number.isSafeInteger(payment.amount)
      || payment.status !== eventStatus) {
      return res.status(400).json({ status: 'payment_payload_invalid' });
    }

    const order = await db.findOrderByRazorpayId(payment.order_id);
    if (!order) return res.status(404).json({ status: 'order_not_found' });
    const amountPaise = toRazorpayAmountPaise(order.totalPrice);
    if (amountPaise === undefined) return res.status(400).json({ status: 'payment_order_mismatch' });
    if (!paymentMatchesOrder(payment, {
      orderId: order.razorpayOrderId || '',
      amountPaise,
      currency: 'INR',
    })) {
      return res.status(400).json({ status: 'payment_order_mismatch' });
    }
    if (order.isPaid) return res.json({ status: 'already_processed' });

    const updatedOrder = await db.updateOrderPayment(order.id, paymentResult(order, payment, eventStatus));
    if (eventStatus !== 'captured') return res.json({ status: eventStatus });
    if (updatedOrder?.isPaid) return res.json({ status: 'ok' });
    const currentOrder = await db.findOrderByRazorpayId(payment.order_id);
    if (currentOrder?.isPaid && currentOrder.paymentResult?.razorpay_payment_id === payment.id) {
      return res.json({ status: 'already_processed' });
    }
    return res.status(409).json({ status: 'order_update_conflict' });
  } catch (error) {
    console.error('[Payment] Webhook processing error:', error instanceof Error ? error.name : 'Unknown error.');
    return res.status(getDatabaseErrorStatus(error)).json({ status: 'error' });
  }
});

export default router;
