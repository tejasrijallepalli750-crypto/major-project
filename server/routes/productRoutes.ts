import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db, getDatabaseErrorStatus } from '../db/database';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { hasEligibleReviewOrder } from '../reviews/reviewRules';
import { z } from 'zod';

const router = Router();
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const reviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(2000),
});
const inventoryBodySchema = z.object({
  stock: z.number().int().min(0).max(1000000),
  confirmPhysicalCount: z.literal(true),
}).strict();

const isLocalProductImage = (image: string): boolean => {
  if (!image.startsWith('/images/') || image.startsWith('//')) return false;
  const target = path.resolve(PUBLIC_DIR, `.${image}`);
  return target.startsWith(`${PUBLIC_DIR}${path.sep}`) && fs.existsSync(target);
};

// GET /api/products
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, category, sort, page, limit } = req.query;

    const result = await db.findProducts({
      search: search ? String(search) : undefined,
      category: category ? String(category) : undefined,
      sort: sort ? String(sort) : undefined,
      status: 'active',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });

    return res.json({
      success: true,
      data: result.products,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (error) {
    console.error('[Products] Fetch error:', error);
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to fetch products.' });
  }
});

// GET /api/products/categories/list
router.get('/categories/list', async (_req: Request, res: Response) => {
  try {
    const categories = await db.getCategories();
    return res.json({ success: true, data: categories });
  } catch (error) {
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to fetch categories.' });
  }
});

router.get('/admin/all', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { search, category, sort, page, limit } = req.query;
    const result = await db.findProducts({
      search: search ? String(search) : undefined,
      category: category ? String(category) : undefined,
      sort: sort ? String(sort) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return res.json({
      success: true,
      data: result.products,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (error) {
    console.error('[Products] Admin catalog fetch error:', error);
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to fetch the product management catalog.' });
  }
});

// GET /api/products/:id/reviews
router.get('/:id/reviews', async (req: Request, res: Response) => {
  try {
    const product = await db.findProductById(req.params.id);
    if (!product || product.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    const reviews = await db.findProductReviews(product.id);
    return res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('[Products] Review fetch error:', error);
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to fetch product reviews.' });
  }
});

// POST /api/products/:id/reviews
router.post('/:id/reviews', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const bodyResult = reviewBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ success: false, message: 'Rating must be a whole number from 1 to 5 and comment must be 1 to 2000 characters.' });
  }

  try {
    const product = await db.findProductById(req.params.id);
    if (!product || product.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const orders = await db.findOrdersByUser(req.user!.id);
    if (!hasEligibleReviewOrder(orders, product.id)) {
      return res.status(403).json({ success: false, message: 'You can review this product only after a paid or delivered order containing it.' });
    }

    const created = await db.createProductReview({
      productId: product.id,
      userId: req.user!.id,
      userName: req.user!.name,
      rating: bodyResult.data.rating,
      comment: bodyResult.data.comment,
    });
    return res.status(201).json({
      success: true,
      data: created.review,
      productRating: { rating: created.rating, numReviews: created.numReviews },
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ success: false, message: 'You have already reviewed this product.' });
    }
    console.error('[Products] Review creation error:', error);
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to submit product review.' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await db.findProductById(req.params.id);
    if (!product || product.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.json({ success: true, data: product });
  } catch (error) {
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to retrieve product details.' });
  }
});

// POST /api/products (Admin Only)
router.post('/', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, price, category, image, stock, sku, brand, features, status } = req.body;

    if (
      typeof name !== 'string' || !name.trim()
      || typeof description !== 'string' || !description.trim()
      || price === undefined
      || typeof category !== 'string' || !category.trim()
      || stock === undefined
      || typeof image !== 'string' || !image
      || typeof sku !== 'string' || !sku.trim()
    ) {
      return res.status(400).json({ success: false, message: 'Please provide all required product fields.' });
    }

    if (!Number.isFinite(Number(price)) || Number(price) <= 0
      || typeof stock !== 'number' || stock !== 0) {
      return res.status(400).json({
        success: false,
        message: 'New products must start with zero stock. Record a physically verified quantity using inventory management.',
      });
    }
    if (!isLocalProductImage(String(image))) {
      return res.status(400).json({ success: false, message: 'Choose a valid product image stored under public/images/.' });
    }
    if (status !== undefined && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Product status must be active or inactive.' });
    }

    const created = await db.createProduct({
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      category: category.trim(),
      image,
      stock: 0,
      sku: sku.trim(),
      status: status || 'active',
      inventoryStatus: 'unverified',
      rating: 0,
      numReviews: 0,
      brand: brand || 'AURA Signature',
      features: Array.isArray(features) ? features : [],
    });

    return res.status(201).json({ success: true, message: 'Product created successfully', data: created });
  } catch (error) {
    console.error('[Products] Creation error:', error);
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ success: false, message: 'That SKU or image is already assigned to another product.' });
    }
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to create product.' });
  }
});

// PUT /api/products/:id/inventory (Admin Only)
router.put('/:id/inventory', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const bodyResult = inventoryBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({
      success: false,
      message: 'Provide a whole-number physical count and confirm that it was verified.',
    });
  }
  try {
    const updated = await db.updateProductInventory(
      req.params.id,
      bodyResult.data.stock,
      req.user!.id,
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.json({ success: true, message: 'Verified inventory quantity saved.', data: updated });
  } catch (error) {
    console.error('[Products] Inventory update error:', error);
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to save verified inventory.' });
  }
});

// PUT /api/products/:id (Admin Only)
router.put('/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, price, category, image, stock, sku, status, brand, features } = req.body;
    if (stock !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'Stock can only be changed through the verified inventory management endpoint.',
      });
    }
    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Product name must be a non-empty string.' });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ success: false, message: 'Product description must be a non-empty string.' });
      }
      updates.description = description.trim();
    }
    if (price !== undefined) updates.price = Number(price);
    if (category !== undefined) {
      if (typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({ success: false, message: 'Product category must be a non-empty string.' });
      }
      updates.category = category.trim();
    }
    if (image !== undefined) updates.image = image;
    if (sku !== undefined) {
      if (typeof sku !== 'string' || !sku.trim()) {
        return res.status(400).json({ success: false, message: 'Product SKU must be a non-empty string.' });
      }
      updates.sku = sku.trim();
    }
    if (status !== undefined) updates.status = status;
    if (brand !== undefined) {
      if (typeof brand !== 'string') {
        return res.status(400).json({ success: false, message: 'Product brand must be a string.' });
      }
      updates.brand = brand.trim();
    }
    if (image !== undefined && typeof image !== 'string') {
      return res.status(400).json({ success: false, message: 'Product image must be a local image path.' });
    }
    if (features !== undefined && !Array.isArray(features)) {
      return res.status(400).json({ success: false, message: 'Product features must be an array.' });
    }
    if (features !== undefined) updates.features = features;

    if (updates.image !== undefined && (typeof updates.image !== 'string' || !isLocalProductImage(updates.image))) {
      return res.status(400).json({ success: false, message: 'Choose a valid product image stored under public/images/.' });
    }
    if (updates.price !== undefined && (!Number.isFinite(Number(updates.price)) || Number(updates.price) <= 0)) {
      return res.status(400).json({ success: false, message: 'Price must be greater than zero.' });
    }
    if (updates.status !== undefined && !['active', 'inactive'].includes(String(updates.status))) {
      return res.status(400).json({ success: false, message: 'Product status must be active or inactive.' });
    }

    const updated = await db.updateProduct(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.json({ success: true, message: 'Product updated successfully', data: updated });
  } catch (error) {
    console.error('[Products] Update error:', error);
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ success: false, message: 'That SKU or image is already assigned to another product.' });
    }
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to update product.' });
  }
});

// DELETE /api/products/:id (Admin Only)
router.delete('/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const success = await db.deleteProduct(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.json({ success: true, message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('[Products] Deletion error:', error);
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to deactivate product.' });
  }
});

export default router;
