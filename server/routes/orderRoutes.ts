import { Router, Response } from 'express';
import { db } from '../db/database';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { CartItem } from '../../src/types';

const router = Router();

interface CartValidationRequest {
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

// POST /api/orders/validate-cart
// Server-side validation of cart items, current database prices, stock availability
router.post('/validate-cart', (req, res: Response) => {
  try {
    const { items } = req.body as CartValidationRequest;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty or invalid.' });
    }

    const validatedItems: CartItem[] = [];
    let itemsPrice = 0;
    const errors: string[] = [];

    for (const item of items) {
      const product = db.findProductById(item.productId);
      if (!product) {
        errors.push(`Product with ID ${item.productId} was not found in catalog.`);
        continue;
      }

      if (product.status !== 'active') {
        errors.push(`"${product.name}" is currently unavailable for purchase.`);
        continue;
      }

      const requestedQty = Math.max(1, Math.floor(Number(item.quantity) || 1));
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

    // Standard business rules: Free shipping over ₹2,000; GST 18%
    const shippingPrice = itemsPrice >= 2000 ? 0 : 150;
    const taxPrice = Number((itemsPrice * 0.18).toFixed(2));
    const totalPrice = Number((itemsPrice + shippingPrice + taxPrice).toFixed(2));

    return res.json({
      success: true,
      data: {
        items: validatedItems,
        itemsPrice,
        shippingPrice,
        taxPrice,
        totalPrice,
      },
    });
  } catch (error) {
    console.error('[Orders] Cart validation error:', error);
    return res.status(500).json({ success: false, message: 'Server error during cart validation.' });
  }
});

// POST /api/orders
// Create new pending order with strict server-side price validation
router.post('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { orderItems, shippingAddress, paymentMethod } = req.body;

    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Cannot create order with an empty items list.' });
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.street || !shippingAddress.city || !shippingAddress.postalCode) {
      return res.status(400).json({ success: false, message: 'Please provide complete delivery shipping address information.' });
    }

    // STRICT SERVER-SIDE RE-VERIFICATION OF ALL ITEMS AND PRICING
    let itemsPrice = 0;
    const verifiedOrderItems = [];

    for (const item of orderItems) {
      const product = db.findProductById(item.productId || item.product);
      if (!product) {
        return res.status(400).json({ success: false, message: `Product "${item.name || item.productId}" does not exist.` });
      }

      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
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
      });
    }

    const shippingPrice = itemsPrice >= 2000 ? 0 : 150;
    const taxPrice = Number((itemsPrice * 0.18).toFixed(2));
    const totalPrice = Number((itemsPrice + shippingPrice + taxPrice).toFixed(2));

    const newOrder = db.createOrder({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || shippingAddress.phone || '',
      },
      orderItems: verifiedOrderItems,
      shippingAddress: {
        fullName: shippingAddress.fullName.trim(),
        phone: (shippingAddress.phone || '').trim(),
        street: shippingAddress.street.trim(),
        city: shippingAddress.city.trim(),
        district: (shippingAddress.district || '').trim(),
        state: shippingAddress.state.trim(),
        postalCode: shippingAddress.postalCode.trim(),
        country: (shippingAddress.country || 'India').trim(),
      },
      paymentMethod: paymentMethod || 'Razorpay',
      itemsPrice,
      shippingPrice,
      taxPrice,
      totalPrice,
      isPaid: false,
      isDelivered: false,
      status: 'Pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Order created successfully. Proceed to payment.',
      data: newOrder,
    });
  } catch (error) {
    console.error('[Orders] Order creation error:', error);
    return res.status(500).json({ success: false, message: 'Server error creating order.' });
  }
});

// GET /api/orders/my-orders (Current authenticated customer's orders)
router.get('/my-orders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = db.findOrdersByUser(req.user!.id);
    return res.json({ success: true, data: orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve order history.' });
  }
});

// GET /api/orders/:id (Retrieve single order with ownership authorization check)
router.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = db.findOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Role-Based Access Control: Only owner or admin may view order
    if (order.user.id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to view this order.' });
    }

    return res.json({ success: true, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve order.' });
  }
});

// GET /api/orders (Admin Only - list all orders)
router.get('/', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const orders = db.findAllOrders();
    return res.json({ success: true, data: orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch customer orders.' });
  }
});

// PUT /api/orders/:id/status (Admin Only - update fulfillment status)
router.put('/:id/status', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    const allowed = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const updated = db.updateOrderStatus(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    return res.json({ success: true, message: `Order status updated to ${status}`, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update order status.' });
  }
});

export default router;
