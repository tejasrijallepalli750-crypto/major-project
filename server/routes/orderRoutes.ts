import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/database';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { CartItem, ShippingAddress } from '../../src/types';
import { calculateOrderTotals } from '../../src/utils/orderPricing';
import { getDatabaseErrorStatus, IdempotencyConflictError, InventoryError, OrderCancellationError } from '../db/database';

const router = Router();

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

      const requestedQty = item.quantity;
      if (product.stock < requestedQty) {
        errors.push(`Only ${product.stock} units available for "${product.name}" (requested ${requestedQty}).`);
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
        stock: product.stock,
        sku: product.sku,
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
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ success: false, message: 'Please provide valid order details.' });
    }
    const { orderItems, shippingAddress, paymentMethod } = body as Record<string, unknown>;
    const idempotencyKey = req.get('Idempotency-Key')?.trim() || '';
    if (!/^[\da-f-]{16,100}$/i.test(idempotencyKey)) {
      return res.status(400).json({ success: false, message: 'A valid checkout idempotency key is required.' });
    }

    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Cannot create order with an empty items list.' });
    }

    if (!shippingAddress || typeof shippingAddress !== 'object' || Array.isArray(shippingAddress)) {
      return res.status(400).json({ success: false, message: 'Please provide complete delivery shipping address information.' });
    }
    const address = shippingAddress as Record<string, unknown>;
    const addressFields = ['fullName', 'phone', 'street', 'city', 'state', 'postalCode'] as const;
    if (addressFields.some((field) => typeof address[field] !== 'string' || !(address[field] as string).trim())) {
      return res.status(400).json({ success: false, message: 'Please provide complete delivery shipping address information.' });
    }

    const cleanPhone = (address.phone as string).replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Contact phone number must be exactly 10 digits.' });
    }

    if (paymentMethod !== 'Razorpay' && paymentMethod !== 'Local Demo') {
      return res.status(400).json({ success: false, message: 'Choose Razorpay Test Mode or Local Demo payment.' });
    }

    const normalizedAddress: ShippingAddress = {
      fullName: (address.fullName as string).trim(),
      phone: (address.phone as string).trim(),
      street: (address.street as string).trim(),
      city: (address.city as string).trim(),
      district: typeof address.district === 'string' ? address.district.trim() : '',
      state: (address.state as string).trim(),
      postalCode: (address.postalCode as string).trim(),
      country: typeof address.country === 'string' && address.country.trim() ? address.country.trim() : 'India',
    };
    const normalizedItems = orderItems.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const item = value as Record<string, unknown>;
      const productId = typeof item.productId === 'string'
        ? item.productId.trim()
        : typeof item.product === 'string' ? item.product.trim() : '';
      if (!productId || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 99) {
        return undefined;
      }
      return { productId, quantity: Number(item.quantity) };
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
    const verifiedOrderItems = [];

    for (const item of normalizedItems as Array<{ productId: string; quantity: number }>) {
      const product = await db.findProductById(item.productId);
      if (!product) {
        return res.status(400).json({ success: false, message: `Product "${item.productId}" does not exist.` });
      }
      if (product.status !== 'active') {
        return res.status(400).json({ success: false, message: `"${product.name}" is not available for purchase.` });
      }

      const qty = item.quantity;
      if (product.stock < qty) {
        return res.status(400).json({
          success: false,
          message: `Insufficient inventory for "${product.name}". Available: ${product.stock}, Requested: ${qty}.`,
        });
      }

      itemsPrice += product.price * qty;
      verifiedOrderItems.push({
        product: product.id,
        name: product.name,
        price: product.price, // ALWAYS USE DB PRICE
        quantity: qty,
        image: product.image,
        sku: product.sku,
        category: product.category,
      });
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
