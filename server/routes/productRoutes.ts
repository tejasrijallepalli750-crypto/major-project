import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

// GET /api/products
router.get('/', (req: Request, res: Response) => {
  try {
    const { search, category, sort, status, page, limit } = req.query;

    const result = db.findProducts({
      search: search ? String(search) : undefined,
      category: category ? String(category) : undefined,
      sort: sort ? String(sort) : undefined,
      status: status ? String(status) : 'active',
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
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
});

// GET /api/products/categories/list
router.get('/categories/list', (_req: Request, res: Response) => {
  try {
    const categories = db.getCategories();
    return res.json({ success: true, data: categories });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
  }
});

// GET /api/products/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const product = db.findProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.json({ success: true, data: product });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve product details.' });
  }
});

// POST /api/products (Admin Only)
router.post('/', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const { name, description, price, category, image, stock, sku, brand, features } = req.body;

    if (!name || !description || price === undefined || !category || stock === undefined) {
      return res.status(400).json({ success: false, message: 'Please provide all required product fields.' });
    }

    if (Number(price) < 0 || Number(stock) < 0) {
      return res.status(400).json({ success: false, message: 'Price and stock quantity must be non-negative.' });
    }

    const created = db.createProduct({
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      category: category.trim(),
      image: image || '/src/assets/images/product_headphones_matte_1792292817977.jpg',
      stock: Number(stock),
      sku: sku || `SKU-${Date.now().toString().slice(-6)}`,
      status: 'active',
      rating: 5.0,
      numReviews: 0,
      brand: brand || 'AURA Signature',
      features: Array.isArray(features) ? features : [],
    });

    return res.status(201).json({ success: true, message: 'Product created successfully', data: created });
  } catch (error) {
    console.error('[Products] Creation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create product.' });
  }
});

// PUT /api/products/:id (Admin Only)
router.put('/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const { name, description, price, category, image, stock, sku, status, brand, features } = req.body;
    const updates: Record<string, unknown> = {};

    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (price !== undefined) updates.price = Number(price);
    if (category !== undefined) updates.category = category.trim();
    if (image !== undefined) updates.image = image;
    if (stock !== undefined) updates.stock = Number(stock);
    if (sku !== undefined) updates.sku = sku.trim();
    if (status !== undefined) updates.status = status;
    if (brand !== undefined) updates.brand = brand.trim();
    if (features !== undefined) updates.features = features;

    const updated = db.updateProduct(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.json({ success: true, message: 'Product updated successfully', data: updated });
  } catch (error) {
    console.error('[Products] Update error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update product.' });
  }
});

// DELETE /api/products/:id (Admin Only)
router.delete('/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const success = db.deleteProduct(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.json({ success: true, message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('[Products] Deletion error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete product.' });
  }
});

export default router;
