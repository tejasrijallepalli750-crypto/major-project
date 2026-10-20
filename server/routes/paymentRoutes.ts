import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/database';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { Order } from '../../src/types';

const router = Router();

const getRazorpayConfig = () => {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const isConfigured = keyId.startsWith('rzp_test_')
    && !keyId.includes('YourTestKeyIdHere')
    && keySecret.length >= 12
    && !keySecret.includes('YourRazorpaySecretKeyHere');

  return {
    keyId,
    keySecret,
    webhookSecret: webhookSecret.includes('YourRazorpayWebhookSecretHere') ? '' : webhookSecret,
    isConfigured,
  };
};

type OrderAccess =
  | { order: Order }
  | { error: string; status: 403 | 404 };

const verifyOrderOwnership = (
  orderId: string,
  user: NonNullable<AuthenticatedRequest['user']>,
): OrderAccess => {
  const order = db.findOrderById(orderId);
  if (!order) return { error: 'Order not found.', status: 404 };
  if (order.user.id !== user.id && user.role !== 'admin') {
    return { error: 'Unauthorized access to this order.', status: 403 };
  }
  return { order };
};

router.get('/config', (_req: Request, res: Response) => {
  const config = getRazorpayConfig();
  return res.json({
    success: true,
    isConfigured: config.isConfigured,
    keyId: config.isConfigured ? config.keyId : undefined,
    currency: 'INR',
    mode: 'TEST',
    message: config.isConfigured
      ? 'Razorpay Test Mode is configured.'
      : 'Razorpay Test Mode needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before checkout can be enabled.',
  });
});

// Create the Razorpay Test Mode order on Razorpay's API. Order totals are
// calculated on the server from the stored order; the browser never sets them.
router.post('/create-order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'Internal order ID is required.' });

    const access = verifyOrderOwnership(orderId, req.user!);
    if ('error' in access) return res.status(access.status).json({ success: false, message: access.error });
    if (access.order.isPaid) return res.status(400).json({ success: false, message: 'This order has already been paid.' });

    const config = getRazorpayConfig();
    if (!config.isConfigured) {
      return res.status(503).json({
        success: false,
        message: 'Razorpay Test Mode is not configured. Add valid test credentials to the server environment before taking payments.',
      });
    }

    const amount = Math.round(access.order.totalPrice * 100);
    const authorization = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;
    const gatewayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: access.order.orderNumber.slice(0, 40),
        notes: { internalOrderId: access.order.id, orderNumber: access.order.orderNumber },
      }),
    });
    const gatewayData = await gatewayResponse.json() as { id?: string; error?: { description?: string } };

    if (!gatewayResponse.ok || !gatewayData.id) {
      console.error('[Payment] Razorpay order creation failed:', gatewayData);
      return res.status(502).json({ success: false, message: gatewayData.error?.description || 'Razorpay could not create the payment order.' });
    }

    const updatedOrder = db.updateOrderRazorpayId(access.order.id, gatewayData.id);
    if (!updatedOrder) {
      return res.status(409).json({ success: false, message: 'Unable to associate the payment with this order.' });
    }

    return res.json({
      success: true,
      data: {
        orderId: access.order.id,
        orderNumber: access.order.orderNumber,
        razorpayOrderId: gatewayData.id,
        amount,
        currency: 'INR',
        keyId: config.keyId,
        customer: {
          name: access.order.user.name,
          email: access.order.user.email,
          phone: access.order.user.phone || access.order.shippingAddress.phone,
        },
      },
    });
  } catch (error) {
    console.error('[Payment] Create order error:', error);
    return res.status(500).json({ success: false, message: 'Unable to start the Razorpay checkout.' });
  }
});

// Verify the signature supplied by Razorpay's Checkout SDK before marking an
// order paid. A payment response is never trusted without this HMAC check.
router.post('/verify', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'The payment response is incomplete.' });
    }

    const access = verifyOrderOwnership(orderId, req.user!);
    if ('error' in access) return res.status(access.status).json({ success: false, message: access.error });
    if (access.order.isPaid) return res.json({ success: true, message: 'Order was already verified.', order: access.order });
    if (access.order.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'The payment does not match the Razorpay order created for this purchase.' });
    }

    const config = getRazorpayConfig();
    if (!config.isConfigured) return res.status(503).json({ success: false, message: 'Razorpay Test Mode is not configured.' });

    const expectedSignature = crypto
      .createHmac('sha256', config.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const provided = Buffer.from(razorpay_signature, 'utf8');
    const expected = Buffer.from(expectedSignature, 'utf8');
    const isValid = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
    if (!isValid) return res.status(400).json({ success: false, message: 'Payment verification failed. The gateway signature did not match.' });

    const updatedOrder = db.updateOrderPayment(access.order.id, {
      id: razorpay_payment_id,
      status: 'captured',
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      verifiedAt: new Date().toISOString(),
      method: 'Razorpay Test Mode',
      amount: access.order.totalPrice,
      currency: 'INR',
    });

    return res.json({ success: true, message: 'Payment verified successfully.', order: updatedOrder });
  } catch (error) {
    console.error('[Payment] Verification error:', error);
    return res.status(500).json({ success: false, message: 'Unable to verify payment.' });
  }
});

router.post('/webhook', (req: Request, res: Response) => {
  const config = getRazorpayConfig();
  if (!config.webhookSecret) return res.status(503).json({ status: 'webhook_not_configured' });

  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) return res.status(400).json({ status: 'raw_body_missing' });
    const signature = req.headers['x-razorpay-signature'];
    const receivedSignature = Array.isArray(signature) ? signature[0] : signature;
    const expectedSignature = crypto.createHmac('sha256', config.webhookSecret).update(rawBody).digest('hex');
    if (!receivedSignature || receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))) {
      return res.status(400).json({ status: 'invalid_signature' });
    }

    const orderEntity = req.body.payload?.order?.entity;
    const paymentEntity = req.body.payload?.payment?.entity;
    if ((req.body.event === 'payment.captured' || req.body.event === 'order.paid') && orderEntity?.notes?.internalOrderId) {
      const order = db.findOrderById(orderEntity.notes.internalOrderId);
      if (!order || order.razorpayOrderId !== orderEntity.id) {
        return res.status(400).json({ status: 'order_mismatch' });
      }
      db.updateOrderPayment(orderEntity.notes.internalOrderId, {
        id: paymentEntity?.id || `pay_${Date.now()}`,
        status: 'captured',
        razorpay_order_id: orderEntity.id,
        razorpay_payment_id: paymentEntity?.id,
        amount: (paymentEntity?.amount || 0) / 100,
        currency: paymentEntity?.currency || 'INR',
        verifiedAt: new Date().toISOString(),
        method: 'Razorpay webhook',
      });
    }
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('[Payment] Webhook error:', error);
    return res.status(500).json({ status: 'error' });
  }
});

export default router;
