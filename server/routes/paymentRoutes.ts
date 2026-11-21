import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { db, getDatabaseErrorStatus, OrderCancellationError } from '../db/database';
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
import { sendOrderConfirmation } from '../email/mailer';
import {
  isDemoModeEnabled,
} from '../config/demoMode';
import { z } from 'zod';
import { safeErrorSummary } from '../utils/safeError';

const router = Router();
const paymentVerificationBodySchema = z.object({
  orderId: z.string().min(1).max(256),
  razorpay_order_id: z.string().min(1).max(256),
  razorpay_payment_id: z.string().min(1).max(256),
  razorpay_signature: z.string().min(1).max(256),
});

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
    email: order.shippingAddress.email || order.user.email,
    phone: order.shippingAddress.phone || order.user.phone,
  },
});

class PaymentRetryRejectedError extends Error {}

interface RazorpayOrderSnapshot {
  id?: string;
  amount?: number | string;
  amount_paid?: number | string;
  amount_due?: number | string;
  currency?: string;
  status?: string;
}

interface RazorpayOrderPayments {
  count?: number;
  items?: RazorpayPayment[];
}

const retryInspections = new Map<string, Promise<void>>();

const matchesPaiseAmount = (value: number | string | undefined, expected: number): boolean =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && Number.isSafeInteger(Number(value))
  && Number(value) === expected;

const inspectRazorpayOrderForRetry = async (
  order: Order,
  keyId: string,
  keySecret: string,
  amountPaise: number,
): Promise<void> => {
  if (!order.razorpayOrderId) {
    throw new PaymentRetryRejectedError(
      'Payment recovery is required because this order has no stored Razorpay order ID. Contact support; do not start a new payment for this order.',
    );
  }

  const razorpay = getGatewayClient(keyId, keySecret);
  const gatewayOrder = await razorpay.orders.fetch(order.razorpayOrderId) as RazorpayOrderSnapshot;
  const paymentResponse = await razorpay.orders.fetchPayments(order.razorpayOrderId) as RazorpayOrderPayments;
  if (gatewayOrder.id !== order.razorpayOrderId
    || !matchesPaiseAmount(gatewayOrder.amount, amountPaise)
    || gatewayOrder.currency !== 'INR'
    || !matchesPaiseAmount(gatewayOrder.amount_paid, 0)
    || !matchesPaiseAmount(gatewayOrder.amount_due, amountPaise)
    || (gatewayOrder.status !== 'created' && gatewayOrder.status !== 'attempted')) {
    throw new PaymentRetryRejectedError(
      'Razorpay could not confirm that this order is safe to retry. The order remains unpaid; contact support if needed.',
    );
  }

  if (!Array.isArray(paymentResponse.items)
    || !Number.isSafeInteger(paymentResponse.count)
    || paymentResponse.count !== paymentResponse.items.length) {
    throw new PaymentRetryRejectedError(
      'Razorpay payment history could not be verified. The order remains unpaid and cannot be retried yet.',
    );
  }

  for (const payment of paymentResponse.items) {
    if (!payment.id
      || !paymentMatchesOrder(payment, {
        orderId: order.razorpayOrderId,
        amountPaise,
        currency: 'INR',
      })
      || payment.status !== 'failed') {
      throw new PaymentRetryRejectedError(
        'A previous payment is captured or still unresolved. This order cannot be retried until its payment status is confirmed.',
      );
    }
  }
};

const verifyRetryIsSafeAtGateway = async (
  order: Order,
  keyId: string,
  keySecret: string,
  amountPaise: number,
): Promise<void> => {
  let inspection = retryInspections.get(order.id);
  if (!inspection) {
    inspection = inspectRazorpayOrderForRetry(order, keyId, keySecret, amountPaise);
    retryInspections.set(order.id, inspection);
  }

  try {
    await inspection;
  } finally {
    if (retryInspections.get(order.id) === inspection) retryInspections.delete(order.id);
  }
};

const verifyRazorpayOrderExpiredAtGateway = async (
  order: Order,
  keyId: string,
  keySecret: string,
  amountPaise: number,
): Promise<void> => {
  if (!order.razorpayOrderId) {
    throw new PaymentRetryRejectedError(
      'Payment recovery is required because a missing Razorpay order ID could represent an orphaned provider order. The order and reservation remain unchanged.',
    );
  }

  const razorpay = getGatewayClient(keyId, keySecret);
  const [gatewayOrder, paymentResponse] = await Promise.all([
    razorpay.orders.fetch(order.razorpayOrderId) as Promise<RazorpayOrderSnapshot>,
    razorpay.orders.fetchPayments(order.razorpayOrderId) as Promise<RazorpayOrderPayments>,
  ]);
  if (gatewayOrder.id !== order.razorpayOrderId
    || !matchesPaiseAmount(gatewayOrder.amount, amountPaise)
    || gatewayOrder.currency !== 'INR'
    || !matchesPaiseAmount(gatewayOrder.amount_paid, 0)
    || !matchesPaiseAmount(gatewayOrder.amount_due, amountPaise)
    || gatewayOrder.status !== 'expired') {
    throw new PaymentRetryRejectedError(
      'Razorpay has not confirmed that this order can no longer accept payment. The order and any reservation remain unchanged.',
    );
  }

  if (!Array.isArray(paymentResponse.items)
    || !Number.isSafeInteger(paymentResponse.count)
    || paymentResponse.count !== paymentResponse.items.length) {
    throw new PaymentRetryRejectedError(
      'Razorpay payment history could not be verified. The order and any reservation remain unchanged.',
    );
  }

  for (const payment of paymentResponse.items) {
    if (!payment.id
      || !paymentMatchesOrder(payment, {
        orderId: order.razorpayOrderId,
        amountPaise,
        currency: 'INR',
      })
      || payment.status !== 'failed') {
      throw new PaymentRetryRejectedError(
        'A payment attempt is captured or unresolved. The order and any reservation remain unchanged pending manual payment recovery.',
      );
    }
  }
};

type CancellationEligibility =
  | { canCancel: true }
  | { canCancel: false; status: 409 | 502 | 503 | 504; message: string };

const getCancellationEligibility = async (order: Order): Promise<CancellationEligibility> => {
  if (order.isPaid || order.status !== 'Pending') {
    return { canCancel: false, status: 409, message: 'Only unpaid pending orders can be cancelled.' };
  }
  if (order.demoPaymentAttempts?.some((attempt) => attempt.outcome === 'success')) {
    return {
      canCancel: false,
      status: 409,
      message: 'A successful payment attempt prevents cancellation; payment verification is required.',
    };
  }
  if (order.paymentResult && order.paymentResult.status !== 'failed') {
    return {
      canCancel: false,
      status: 409,
      message: 'Payment verification is unresolved. The order and any reservation remain unchanged.',
    };
  }

  if (order.paymentMethod === 'Razorpay') {
    if (!order.razorpayOrderId) {
      return {
        canCancel: false,
        status: 409,
        message: 'Payment recovery is required because a missing Razorpay order ID could represent an orphaned provider order. The order and reservation remain unchanged.',
      };
    }
    if (order.purchaseMode === 'demo' && order.demoReservationStatus !== 'reserved') {
      return {
        canCancel: false,
        status: 409,
        message: 'The demonstration reservation is not currently reserved; payment recovery is required before cancellation.',
      };
    }

    const config = getRazorpayConfig();
    if (!config.isConfigured) {
      return {
        canCancel: false,
        status: 503,
        message: 'Payment recovery is required because Razorpay could not verify the provider order. The order and reservation remain unchanged.',
      };
    }
    const amountPaise = toRazorpayAmountPaise(order.totalPrice);
    if (amountPaise === undefined) {
      return {
        canCancel: false,
        status: 409,
        message: 'The order amount is invalid for Razorpay payment recovery.',
      };
    }
    try {
      await verifyRazorpayOrderExpiredAtGateway(order, config.keyId, config.keySecret, amountPaise);
      return { canCancel: true };
    } catch (error) {
      if (error instanceof PaymentRetryRejectedError) {
        return { canCancel: false, status: 409, message: error.message };
      }
      const timedOut = isGatewayTimeout(error);
      console.error(`[Payment] Razorpay cancellation verification ${timedOut ? 'timed out' : 'failed'}.`);
      return {
        canCancel: false,
        status: timedOut ? 504 : 502,
        message: 'Razorpay payment status could not be verified. The order and reservation remain unchanged; contact support for payment recovery.',
      };
    }
  }

  if (order.paymentMethod === 'Local Demo' || order.paymentMethod === 'Cash on Delivery') {
    if (order.razorpayOrderId || order.paymentResult) {
      return {
        canCancel: false,
        status: 409,
        message: 'Payment recovery is required because the order may have an unresolved provider payment. The order and reservation remain unchanged.',
      };
    }
    return { canCancel: true };
  }

  return {
    canCancel: false,
    status: 409,
    message: 'Payment recovery is required because this payment method cannot be safely reconciled. The order and any reservation remain unchanged.',
  };
};

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

const sendOrderConfirmationSafely = async (order: Order, userEmail: string): Promise<void> => {
  try {
    await sendOrderConfirmation(order, userEmail);
  } catch (error) {
    console.error('[Mailer] Order confirmation email failed:', safeErrorSummary(error));
  }
};

type PaymentRefreshState = 'retry-ready' | 'verification-pending' | 'paid' | 'expired' | 'recovery';

interface PaymentRefreshResult {
  state: PaymentRefreshState;
  order: Order;
  message: string;
}

const paymentRefreshes = new Map<string, Promise<PaymentRefreshResult>>();

const getUnresolvedPaymentMessage = (payments: RazorpayPayment[]): string => {
  const counts = new Map<string, number>();
  for (const payment of payments) {
    const rawStatus = typeof payment.status === 'string' ? payment.status.toLowerCase() : '';
    const status = ['created', 'authorized', 'pending'].includes(rawStatus) ? rawStatus : 'unresolved';
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  const summary = [...counts.entries()]
    .map(([status, count]) => `${count} ${status} payment attempt${count === 1 ? '' : 's'}`)
    .join(', ');
  return summary || 'an unresolved payment attempt';
};

const refreshExistingRazorpayOrder = async (
  order: Order,
  keyId: string,
  keySecret: string,
): Promise<PaymentRefreshResult> => {
  if (!order.razorpayOrderId) {
    return {
      state: 'recovery',
      order,
      message: 'Manual payment recovery required because no Razorpay order ID is stored. No new payment order will be created; contact support.',
    };
  }
  const amountPaise = toRazorpayAmountPaise(order.totalPrice);
  if (amountPaise === undefined) {
    return {
      state: 'recovery',
      order,
      message: 'Payment recovery is required because the order amount cannot be verified.',
    };
  }

  const razorpay = getGatewayClient(keyId, keySecret);
  const [gatewayOrder, paymentHistory] = await Promise.all([
    razorpay.orders.fetch(order.razorpayOrderId) as Promise<RazorpayOrderSnapshot>,
    razorpay.orders.fetchPayments(order.razorpayOrderId) as Promise<RazorpayOrderPayments>,
  ]);
  if (gatewayOrder.id !== order.razorpayOrderId
    || !matchesPaiseAmount(gatewayOrder.amount, amountPaise)
    || gatewayOrder.currency !== 'INR') {
    return {
      state: 'recovery',
      order,
      message: 'Payment recovery is required because the stored Razorpay order does not match this order amount and currency.',
    };
  }
  if (!Array.isArray(paymentHistory.items)
    || !Number.isSafeInteger(paymentHistory.count)
    || paymentHistory.count !== paymentHistory.items.length) {
    return {
      state: 'verification-pending',
      order,
      message: 'Razorpay payment history is incomplete. The previous payment remains unresolved, so Pay Again is blocked until its status can be confirmed.',
    };
  }

  for (const payment of paymentHistory.items) {
    if (!payment.id
      || !paymentMatchesOrder(payment, {
        orderId: order.razorpayOrderId,
        amountPaise,
        currency: 'INR',
      })) {
      return {
        state: 'recovery',
        order,
        message: 'Payment recovery is required because a Razorpay payment attempt could not be matched to this order.',
      };
    }
  }

  const reservationExpiry = order.demoReservationExpiresAt
    ? new Date(order.demoReservationExpiresAt).getTime()
    : NaN;
  const demoReservationUnavailable = order.purchaseMode === 'demo'
    && (process.env.NODE_ENV === 'production'
      || !isDemoModeEnabled()
      || order.demoReservationStatus !== 'reserved'
      || !Number.isFinite(reservationExpiry)
      || reservationExpiry <= Date.now());

  const capturedPayment = paymentHistory.items.find((payment) => payment.status === 'captured');
  if (capturedPayment?.id) {
    const verifiedPayment = await razorpay.payments.fetch(capturedPayment.id) as RazorpayPayment;
    if (verifiedPayment.id !== capturedPayment.id
      || verifiedPayment.status !== 'captured'
      || !paymentMatchesOrder(verifiedPayment, {
        orderId: order.razorpayOrderId,
        amountPaise,
        currency: 'INR',
      })) {
      return {
        state: 'verification-pending',
        order,
        message: 'Razorpay reports a captured payment attempt, but its status could not yet be verified by AURA. Pay Again is blocked until server-side verification succeeds.',
      };
    }
    const updatedOrder = await db.updateOrderPayment(order.id, paymentResult(order, verifiedPayment, 'captured'));
    if (updatedOrder?.isPaid) {
      await sendOrderConfirmationSafely(updatedOrder, order.user.email);
      return { state: 'paid', order: updatedOrder, message: 'Payment successful.' };
    }
    const currentOrder = await db.findOrderById(order.id);
    if (currentOrder?.isPaid
      && currentOrder.paymentResult?.razorpay_payment_id === verifiedPayment.id) {
      return { state: 'paid', order: currentOrder, message: 'Payment successful.' };
    }
    return {
      state: 'recovery',
      order: currentOrder || order,
      message: 'Razorpay confirmed payment, but the order could not be updated. Contact support; do not retry payment.',
    };
  }

  if (order.paymentResult?.status === 'captured') {
    return {
      state: 'verification-pending',
      order,
      message: 'Checking your previous payment. Pay Again will be available once its status is confirmed.',
    };
  }

  const unresolvedPayments = paymentHistory.items.filter((payment) => payment.status !== 'failed');
  if (gatewayOrder.status === 'expired' && unresolvedPayments.length) {
    return {
      state: 'verification-pending',
      order,
      message: `Payment recovery is required because the Razorpay order has expired and cannot accept another payment. Razorpay still reports ${getUnresolvedPaymentMessage(unresolvedPayments)}; payment is not confirmed failed.`,
    };
  }
  if (unresolvedPayments.length) {
    return {
      state: 'verification-pending',
      order,
      message: `Razorpay reports ${getUnresolvedPaymentMessage(unresolvedPayments)}. Pay Again is blocked until every attempt is confirmed failed.${demoReservationUnavailable ? ' The demo reservation has expired or is unavailable, so payment recovery will still be required and checkout cannot be reopened.' : ''}`,
    };
  }

  const latestFailedPayment = [...paymentHistory.items]
    .sort((left, right) => (right.created_at || 0) - (left.created_at || 0))[0];
  let currentOrder = order;
  if (latestFailedPayment) {
    const updatedOrder = await db.updateOrderPayment(
      order.id,
      paymentResult(order, latestFailedPayment, 'failed'),
    );
    if (!updatedOrder) {
      currentOrder = await db.findOrderById(order.id) || order;
      if (currentOrder.isPaid) {
        return { state: 'paid', order: currentOrder, message: 'Payment successful.' };
      }
      return {
        state: 'recovery',
        order: currentOrder,
        message: 'Payment recovery is required because the order changed while payment status was being updated.',
      };
    }
    currentOrder = updatedOrder;
  }

  if (gatewayOrder.status === 'expired') {
    return {
      state: 'expired',
      order: currentOrder,
      message: 'Payment recovery is required because the Razorpay order expired. Do not start another checkout for this order.',
    };
  }
  if ((gatewayOrder.status !== 'created' && gatewayOrder.status !== 'attempted')
    || !matchesPaiseAmount(gatewayOrder.amount_paid, 0)
    || !matchesPaiseAmount(gatewayOrder.amount_due, amountPaise)) {
    return {
      state: 'recovery',
      order: currentOrder,
      message: 'Payment recovery is required because Razorpay has not confirmed that this order can accept another payment attempt.',
    };
  }
  if (order.paymentResult?.status && !latestFailedPayment) {
    return {
      state: 'verification-pending',
      order: currentOrder,
      message: 'Checking your previous payment. Pay Again will be available once its status is confirmed.',
    };
  }
  if (demoReservationUnavailable) {
    return {
      state: 'recovery',
      order: currentOrder,
      message: 'Payment recovery is required because the demo reservation is expired or unavailable. No new inventory will be reserved.',
    };
  }

  return {
    state: 'retry-ready',
    order: currentOrder,
    message: latestFailedPayment ? 'Payment failed. You can try again.' : '',
  };
};

router.get('/config', (_req: Request, res: Response) => {
  const config = getRazorpayConfig();
  return res.json({
    success: true,
    isConfigured: config.isConfigured,
    demoModeAvailable: process.env.NODE_ENV !== 'production',
    demoModeEnabled: isDemoModeEnabled(),
    demoPurchasingAvailable: isDemoModeEnabled() && config.isConfigured,
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
    if (outcome === 'success') {
      await sendOrderConfirmationSafely(updatedOrder, req.user!.email);
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
    console.error('[Payment] Local Demo processing error:', safeErrorSummary(error));
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Unable to record the Local Demo outcome.' });
  }
});

router.post('/refresh-order-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId) return res.status(400).json({ success: false, message: 'Internal order ID is required.' });

    const order = await db.findOrderById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.user.id !== req.user!.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to this order.' });
    }
    if (order.isPaid) {
      return res.json({ success: true, state: 'paid', order, message: 'Payment successful.' });
    }
    if (order.status !== 'Pending' || order.paymentMethod !== 'Razorpay' || order.demoPaymentAttempts?.length) {
      return res.json({
        success: true,
        state: 'recovery',
        order,
        message: 'Payment recovery is required because this order is not eligible for Razorpay payment retry.',
      });
    }

    const config = getRazorpayConfig();
    if (!config.isConfigured) {
      return res.status(503).json({
        success: false,
        state: 'verification-pending',
        message: 'Checking your previous payment. Pay Again will be available once its status is confirmed.',
      });
    }
    let refresh = paymentRefreshes.get(order.id);
    if (!refresh) {
      refresh = refreshExistingRazorpayOrder(order, config.keyId, config.keySecret);
      paymentRefreshes.set(order.id, refresh);
    }
    try {
      const result = await refresh;
      return res.json({ success: true, ...result });
    } catch (error) {
      const timedOut = isGatewayTimeout(error);
      console.error(`[Payment] Razorpay status refresh ${timedOut ? 'timed out' : 'failed'}.`);
      return res.status(timedOut ? 504 : 502).json({
        success: false,
        state: 'verification-pending',
        message: 'Checking your previous payment. Pay Again will be available once its status is confirmed.',
      });
    } finally {
      if (paymentRefreshes.get(order.id) === refresh) paymentRefreshes.delete(order.id);
    }
  } catch (error) {
    console.error('[Payment] Order payment status refresh failed:', safeErrorSummary(error));
    return res.status(getDatabaseErrorStatus(error)).json({
      success: false,
      state: 'verification-pending',
      message: 'Checking your previous payment. Pay Again will be available once its status is confirmed.',
    });
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
    if (access.order.purchaseMode === 'demo' && !isDemoModeEnabled()) {
      return res.status(503).json({ success: false, message: 'Demonstration purchasing is disabled by the server.' });
    }
    if (access.order.purchaseMode === 'demo'
      && (access.order.demoReservationStatus !== 'reserved'
        || !access.order.demoReservationExpiresAt
        || !Number.isFinite(new Date(access.order.demoReservationExpiresAt).getTime())
        || new Date(access.order.demoReservationExpiresAt).getTime() <= Date.now())) {
      return res.status(409).json({ success: false, message: 'This demonstration checkout has expired. Please start checkout again.' });
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

    const gatewayOrderRequest = {
      amount,
      currency: 'INR',
      receipt: access.order.orderNumber.slice(0, 40),
      notes: { internalOrderId: access.order.id, orderNumber: access.order.orderNumber },
    };
    let gatewayOrder: { id?: string; amount?: number | string; currency?: string };
    try {
      // Razorpay Orders API does not support expire_by; reservations stay held unless a verifiable provider expiry exists.
      gatewayOrder = await getGatewayClient(config.keyId, config.keySecret).orders.create(gatewayOrderRequest);
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
    console.error('[Payment] Create order error:', safeErrorSummary(error));
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Unable to start the Razorpay checkout.' });
  }
});

router.post('/retry-order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId) return res.status(400).json({ success: false, message: 'Internal order ID is required.' });

    const order = await db.findOrderById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.user.id !== req.user!.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to this order.' });
    }
    if (order.isPaid
      || order.status !== 'Pending'
      || order.paymentMethod !== 'Razorpay'
      || order.demoPaymentAttempts?.length) {
      return res.status(409).json({ success: false, message: 'This order is no longer eligible for payment retry.' });
    }
    if (order.demoReservationStatus === 'released') {
      return res.status(409).json({ success: false, message: 'This order reservation has been released and cannot be retried.' });
    }
    if (!order.razorpayOrderId) {
      return res.status(409).json({
        success: false,
        message: 'Payment recovery is required because this order has no stored Razorpay order ID. Contact support; do not start a new payment for this order.',
      });
    }
    if (order.paymentResult?.status === 'captured') {
      return res.status(409).json({
        success: false,
        message: 'A previous payment is being reconciled. This order cannot be retried until its status is confirmed.',
      });
    }
    if (order.purchaseMode === 'demo') {
      if (process.env.NODE_ENV === 'production' || !isDemoModeEnabled()) {
        return res.status(503).json({ success: false, message: 'Demonstration payments are disabled by the server.' });
      }
      if (order.demoReservationStatus !== 'reserved'
        || !order.demoReservationExpiresAt
        || !Number.isFinite(new Date(order.demoReservationExpiresAt).getTime())
        || new Date(order.demoReservationExpiresAt).getTime() <= Date.now()) {
        return res.status(409).json({ success: false, message: 'This demonstration reservation has expired or is no longer available.' });
      }
    }

    const config = getRazorpayConfig();
    if (!config.isConfigured) {
      return res.status(503).json({ success: false, message: 'Razorpay Test Mode is not configured.' });
    }
    const amountPaise = toRazorpayAmountPaise(order.totalPrice);
    if (amountPaise === undefined) {
      return res.status(400).json({ success: false, message: 'The order amount is invalid for Razorpay checkout.' });
    }

    try {
      await verifyRetryIsSafeAtGateway(order, config.keyId, config.keySecret, amountPaise);
    } catch (error) {
      if (error instanceof PaymentRetryRejectedError) {
        return res.status(409).json({ success: false, message: error.message });
      }
      const timedOut = isGatewayTimeout(error);
      console.error(`[Payment] Razorpay retry verification ${timedOut ? 'timed out' : 'failed'}.`);
      return res.status(timedOut ? 504 : 502).json({
        success: false,
        message: 'Razorpay could not verify this order for retry. The order remains unpaid; try again later or contact support.',
      });
    }

    return res.json({
      success: true,
      data: paymentData(order, order.razorpayOrderId, config.keyId),
    });
  } catch (error) {
    console.error('[Payment] Retry order error:', safeErrorSummary(error));
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Unable to verify this order for payment retry.' });
  }
});

router.get('/cancellation-status/:orderId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = typeof req.params.orderId === 'string' ? req.params.orderId.trim() : '';
    if (!orderId) return res.status(400).json({ success: false, message: 'Internal order ID is required.' });
    const order = await db.findOrderById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.user.id !== req.user!.id) {
      return res.status(403).json({ success: false, message: 'Only the order owner can cancel this order.' });
    }
    const eligibility = await getCancellationEligibility(order);
    return res.json({
      success: true,
      canCancel: eligibility.canCancel,
      message: eligibility.canCancel ? undefined : eligibility.message,
    });
  } catch (error) {
    console.error('[Payment] Order cancellation eligibility check failed:', safeErrorSummary(error));
    return res.status(getDatabaseErrorStatus(error)).json({
      success: false,
      message: 'Unable to verify whether this order can be safely cancelled.',
    });
  }
});

router.post('/cancel-order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId) return res.status(400).json({ success: false, message: 'Internal order ID is required.' });

    const order = await db.findOrderById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.user.id !== req.user!.id) {
      return res.status(403).json({ success: false, message: 'Only the order owner can cancel this order.' });
    }
    const eligibility = await getCancellationEligibility(order);
    if (!eligibility.canCancel) {
      return res.status(eligibility.status).json({ success: false, message: eligibility.message });
    }

    let updatedOrder: Order | undefined;
    if (order.paymentMethod === 'Razorpay' && order.razorpayOrderId) {
      updatedOrder = await db.cancelOrderAfterVerifiedGatewayExpiry(
        order.id,
        req.user!.id,
        order.razorpayOrderId,
      );
    } else if (order.paymentMethod === 'Local Demo' || order.paymentMethod === 'Cash on Delivery') {
      updatedOrder = await db.cancelUnpaidOrderWithoutGateway(
        order.id,
        req.user!.id,
        order.paymentMethod,
      );
    } else {
      return res.status(409).json({
        success: false,
        message: 'Payment recovery is required because the order state changed. The order and any reservation remain unchanged.',
      });
    }
    if (!updatedOrder) {
      return res.status(409).json({
        success: false,
        message: 'The order changed while cancellation was being checked. Refresh your order history; any reservation remains unchanged.',
      });
    }
    return res.json({ success: true, data: updatedOrder, message: 'Order cancelled.' });
  } catch (error) {
    if (error instanceof OrderCancellationError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    console.error('[Payment] Order cancellation failed:', safeErrorSummary(error));
    return res.status(getDatabaseErrorStatus(error)).json({
      success: false,
      message: 'Unable to safely cancel this order. The order and any reservation remain unchanged.',
    });
  }
});

router.post('/verify', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bodyResult = paymentVerificationBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({ success: false, message: 'The payment response is incomplete or invalid.' });
    }
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = bodyResult.data;

    const access = await verifyOrderOwnership(orderId, req.user!);
    if ('error' in access) return res.status(access.status).json({ success: false, message: access.error });
    const order = access.order;
    if (order.status !== 'Pending') {
      return res.status(409).json({ success: false, message: 'This order is no longer available for payment verification.' });
    }
    if (order.paymentMethod !== 'Razorpay' || order.demoPaymentAttempts?.length) {
      return res.status(409).json({ success: false, message: 'This order was not created for Razorpay Test Mode.' });
    }
    if (order.purchaseMode === 'demo' && !isDemoModeEnabled()) {
      return res.status(503).json({ success: false, message: 'Demonstration payment verification is disabled by the server.' });
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
      await sendOrderConfirmationSafely(updatedOrder, order.user.email);
      return res.json({ success: true, message: 'Payment verified successfully.', order: updatedOrder });
    }
    const currentOrder = await db.findOrderById(order.id);
    if (currentOrder?.isPaid && currentOrder.paymentResult?.razorpay_payment_id === razorpay_payment_id) {
      return res.json({ success: true, message: 'Payment was already verified.', order: currentOrder });
    }
    return res.status(409).json({ success: false, message: 'Payment was captured but the order state could not be updated. Please contact support.' });
  } catch (error) {
    console.error('[Payment] Verification error:', safeErrorSummary(error));
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
    if (order.purchaseMode === 'demo' && !isDemoModeEnabled()) {
      return res.status(503).json({ status: 'demo_mode_disabled' });
    }
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
    if (updatedOrder?.isPaid) {
      await sendOrderConfirmationSafely(updatedOrder, order.user.email);
      return res.json({ status: 'ok' });
    }
    const currentOrder = await db.findOrderByRazorpayId(payment.order_id);
    if (currentOrder?.isPaid && currentOrder.paymentResult?.razorpay_payment_id === payment.id) {
      return res.json({ status: 'already_processed' });
    }
    return res.status(409).json({ status: 'order_update_conflict' });
  } catch (error) {
    console.error('[Payment] Webhook processing error:', safeErrorSummary(error));
    return res.status(getDatabaseErrorStatus(error)).json({ status: 'error' });
  }
});

export default router;
