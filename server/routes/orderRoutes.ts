import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/database';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { CartItem, ShippingAddress } from '../../src/types';
import { calculateOrderTotals } from '../../src/utils/orderPricing';
import { getDatabaseErrorStatus, IdempotencyConflictError, InventoryError, OrderCancellationError } from '../db/database';
import { isDemoModeEnabled } from '../config/demoMode';
import { getRazorpayConfig } from '../payments/razorpay';
import { z } from 'zod';

const router = Router();

const orderBodySchema = z.object({
  orderItems: z.array(z.object({
    productId: z.string().optional(),
    product: z.string().optional(),
    quantity: z.number().int().min(1).max(99),
  }).refine((item) => (item.productId !== undefined ? item.productId : item.product || '').trim().length > 0))
    .min(1),
  shippingAddress: z.object({
    fullName: z.string().trim().min(1),
    phone: z.string(),
    email: z.string().trim().email().max(254),
    street: z.string().trim().min(1),
    city: z.string().trim().min(1),
    district: z.string().optional(),
    state: z.string().trim().min(1),
    postalCode: z.string().trim().min(1),
    country: z.string().optional(),
  }),
  paymentMethod: z.enum(['Razorpay', 'Local Demo']),
});

const getOrderBodyValidationMessage = (issue: z.ZodIssue | undefined): string => {
  if (issue?.path[0] === 'orderItems') {
    return issue.path.length > 1
      ? 'Each item must include a valid product and quantity.'
      : 'Cannot create order with an empty items list.';
  }
  if (issue?.path[0] === 'shippingAddress') {
    return 'Please provide complete delivery shipping address information.';
  }
  if (issue?.path[0] === 'paymentMethod') {
    return 'Choose Razorpay Test Mode or Local Demo payment.';
  }
  return 'Please provide valid order details.';
};

interface CartValidationRequest {
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

// POST /api/orders/validate-cart
// Server-side validation of cart items, current database prices, stock availability
router.post('/validate-cart', async (req, res: Response) => {
  try {
    const items: unknown = req.body?.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty or invalid.' });
    }

    const validatedItems: CartItem[] = [];
    const purchaseModes = new Set<'physical' | 'demo'>();
    let itemsPrice = 0;
    const errors: string[] = [];

    for (const value of items) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push('Each cart item must have a valid product ID and a quantity from 1 to 99.');
        continue;
      }
      const item = value as CartValidationRequest['items'][number];
      if (typeof item.productId !== 'string' || !item.productId.trim()
        || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        errors.push('Each cart item must have a valid product ID and a quantity from 1 to 99.');
        continue;
      }
      const product = await db.findProductById(item.productId);
      if (!product) {
        errors.push(`Product with ID ${item.productId} was not found in catalog.`);
        continue;
      }

      if (product.status !== 'active') {
        errors.push(`"${product.name}" is currently unavailable for purchase.`);
        continue;
      }
      const purchaseMode = isDemoModeEnabled() && product.demoEligible ? 'demo' : 'physical';
      purchaseModes.add(purchaseMode);
      if (purchaseMode === 'demo' && !getRazorpayConfig().isConfigured) {
        errors.push('Demonstration checkout requires valid Razorpay TEST credentials on the server.');
        continue;
      }
      const availableStock = purchaseMode === 'demo'
        ? product.demoStock || 0
        : product.stock;
      if (purchaseMode === 'physical' && product.inventoryStatus !== 'verified') {
        errors.push(`"${product.name}" is unavailable because its inventory has not been physically verified.`);
        continue;
      }

      if (purchaseModes.size > 1) {
        errors.push('Physical and demonstration inventory cannot be mixed in one order.');
      }

      const requestedQty = item.quantity;
      if (availableStock < requestedQty) {
        errors.push(purchaseMode === 'demo'
          ? `Only ${availableStock} demonstration unit(s) are available for "${product.name}" (requested ${requestedQty}).`
          : `Only ${availableStock} units available for "${product.name}" (requested ${requestedQty}).`);
      }

      const itemTotal = product.price * requestedQty;
      itemsPrice += itemTotal;

      validatedItems.push({
        productId: product.id,
        name: product.name,
        price: product.price, // STRICT DB PRICE
        image: product.image,
        category: product.category,
        quantity: requestedQty,
        stock: availableStock,
        sku: product.sku,
        inventoryMode: product.inventoryMode,
        inventoryStatus: product.inventoryStatus,
        demoModeEnabled: isDemoModeEnabled(),
        demoPurchasingAvailable: isDemoModeEnabled() && getRazorpayConfig().isConfigured,
        demoEligible: purchaseMode === 'demo',
        demoStock: product.demoStock || 0,
        purchaseMode,
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart validation failed. Please review stock warnings.',
        errors,
        validatedItems,
      });
    }

    const totals = calculateOrderTotals(itemsPrice);

    return res.json({
      success: true,
      data: {
        items: validatedItems,
        ...totals,
      },
    });
  } catch (error) {
    console.error('[Orders] Cart validation error:', error);
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Server error during cart validation.' });
  }
});

// POST /api/orders
// Create new pending order with strict server-side price validation
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const bodyResult = orderBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({
        success: false,
        message: getOrderBodyValidationMessage(bodyResult.error.issues[0]),
      });
    }
    const { orderItems, shippingAddress, paymentMethod } = bodyResult.data;
    const idempotencyKey = req.get('Idempotency-Key')?.trim() || '';
    if (!/^[\da-f-]{16,100}$/i.test(idempotencyKey)) {
      return res.status(400).json({ success: false, message: 'A valid checkout idempotency key is required.' });
    }

    const cleanPhone = shippingAddress.phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Contact phone number must be exactly 10 digits.' });
    }

    const normalizedAddress: ShippingAddress = {
      fullName: shippingAddress.fullName,
      phone: shippingAddress.phone.trim(),
      email: shippingAddress.email,
      street: shippingAddress.street,
      city: shippingAddress.city,
      district: shippingAddress.district?.trim() || '',
      state: shippingAddress.state,
      postalCode: shippingAddress.postalCode,
      country: shippingAddress.country?.trim() || 'India',
    };
    const normalizedItems = orderItems.map((value) => {
      const productId = (value.productId !== undefined ? value.productId : value.product || '').trim();
      return productId ? { productId, quantity: value.quantity } : undefined;
    });
    if (normalizedItems.some((item) => !item)) {
      return res.status(400).json({ success: false, message: 'Each item must include a valid product and quantity.' });
    }
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({
      items: normalizedItems,
      shippingAddress: normalizedAddress,
      paymentMethod,
    })).digest('hex');
    const existingOrder = await db.findOrderByCheckoutRequest(user.id, idempotencyKey, requestHash);
    if (existingOrder) {
      return res.json({ success: true, message: 'Existing checkout order returned.', data: existingOrder });
    }

    // STRICT SERVER-SIDE RE-VERIFICATION OF ALL ITEMS AND PRICING
    let itemsPrice = 0;
    const verifiedOrderItems: Array<{
      product: string;
      name: string;
      price: number;
      quantity: number;
      image: string;
      sku: string;
      category: string;
      inventoryMode?: 'simulated-demo';
      inventoryStatus?: 'verified' | 'unverified';
      purchaseMode: 'physical' | 'demo';
    }> = [];
    let orderPurchaseMode: 'physical' | 'demo' | undefined;

    for (const item of normalizedItems as Array<{ productId: string; quantity: number }>) {
      const product = await db.findProductById(item.productId);
      if (!product) {
        return res.status(400).json({ success: false, message: `Product "${item.productId}" does not exist.` });
      }
      if (product.status !== 'active') {
        return res.status(400).json({ success: false, message: `"${product.name}" is not available for purchase.` });
      }
      const purchaseMode = isDemoModeEnabled() && product.demoEligible ? 'demo' : 'physical';
      const availableStock = purchaseMode === 'demo'
        ? product.demoStock || 0
        : product.stock;
      if (purchaseMode === 'physical' && product.inventoryStatus !== 'verified') {
        return res.status(409).json({
          success: false,
          message: `"${product.name}" cannot be purchased until an administrator physically verifies its inventory.`,
        });
      }

      const qty = item.quantity;
      if (availableStock < qty) {
        return res.status(400).json({
          success: false,
          message: purchaseMode === 'demo'
            ? `Insufficient demonstration inventory for "${product.name}". Available: ${availableStock}, Requested: ${qty}.`
            : `Insufficient inventory for "${product.name}". Available: ${availableStock}, Requested: ${qty}.`,
        });
      }

      if (orderPurchaseMode && orderPurchaseMode !== purchaseMode) {
        return res.status(400).json({
          success: false,
          message: 'Physical and demonstration inventory cannot be mixed in one order.',
        });
      }
      orderPurchaseMode = purchaseMode;
      itemsPrice += product.price * qty;
      verifiedOrderItems.push({
        product: product.id,
        name: product.name,
        price: product.price, // ALWAYS USE DB PRICE
        quantity: qty,
        image: product.image,
        sku: product.sku,
        category: product.category,
        inventoryMode: product.inventoryMode,
        inventoryStatus: product.inventoryStatus,
        purchaseMode,
      });
    }

    if (orderPurchaseMode === 'demo') {
      if (!isDemoModeEnabled()) {
        return res.status(503).json({ success: false, message: 'Demonstration purchasing is disabled by the server.' });
      }
      if (paymentMethod !== 'Razorpay' || !getRazorpayConfig().isConfigured) {
        return res.status(503).json({
          success: false,
          message: 'Demonstration orders require valid Razorpay TEST credentials and Razorpay Test Mode.',
        });
      }
    }

    const totals = calculateOrderTotals(itemsPrice);

    const newOrder = await db.createOrder({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || normalizedAddress.phone,
      },
      orderItems: verifiedOrderItems,
      purchaseMode: orderPurchaseMode || 'physical',
      shippingAddress: normalizedAddress,
      paymentMethod,
      ...totals,
      isPaid: false,
      isDelivered: false,
      status: 'Pending',
    }, idempotencyKey, requestHash);

    return res.status(201).json({
      success: true,
      message: 'Order created successfully. Proceed to payment.',
      data: newOrder,
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    console.error('[Orders] Order creation error:', error);
    if (error instanceof InventoryError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Server error creating order.' });
  }
});

// GET /api/orders/my-orders (Current authenticated customer's orders)
router.get('/my-orders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = await db.findOrdersByUser(req.user!.id);
    return res.json({ success: true, data: orders });
  } catch (error) {
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to retrieve order history.' });
  }
});

// DELETE /api/orders/:id/customer-history (Hide an owner's cancelled unpaid order)
router.delete('/:id/customer-history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await db.removeCancelledOrderFromCustomerHistory(req.params.id, req.user!.id);
    if (result === 'not-found') {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (result === 'forbidden') {
      return res.status(403).json({ success: false, message: 'You can only remove your own order from your history.' });
    }
    if (result === 'not-cancelled') {
      return res.status(409).json({ success: false, message: 'Only cancelled, unpaid orders can be removed from your order history.' });
    }
    return res.json({ success: true, message: 'Order removed from your order history.' });
  } catch (error) {
    console.error('[Orders] Customer order history removal failed:', error);
    return res.status(getDatabaseErrorStatus(error)).json({
      success: false,
      message: 'Failed to remove the order from your history.',
    });
  }
});

// GET /api/orders/:id (Retrieve single order with ownership authorization check)
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await db.findOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Role-Based Access Control: Only owner or admin may view order
    if (order.user.id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to view this order.' });
    }

    return res.json({ success: true, data: order });
  } catch (error) {
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to retrieve order.' });
  }
});

// GET /api/orders (Admin Only - list all orders)
router.get('/', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = await db.findAllOrders();
    return res.json({ success: true, data: orders });
  } catch (error) {
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to fetch customer orders.' });
  }
});

// PUT /api/orders/:id/status (Admin Only - update fulfillment status)
router.put('/:id/status', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    const allowed = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const updated = await db.updateOrderStatus(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    return res.json({ success: true, message: `Order status updated to ${status}`, data: updated });
  } catch (error) {
    if (error instanceof OrderCancellationError) {
      return res.status(409).json({ success: false, message: error.message });
    }
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to update order status.' });
  }
});

export default router;
