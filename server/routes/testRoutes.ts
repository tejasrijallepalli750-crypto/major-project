import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { SecurityTestResult } from '../../src/types';
import { usesSharedOlistCatalogImage } from '../../src/utils/productPresentation';

const router = Router();

router.post('/run-suite', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  try {
    const [products, stats] = await Promise.all([
      db.findProducts({ status: 'active', limit: 1000 }),
      db.getAdminStats(),
    ]);
    const validProducts = products.products.filter((product) =>
      product.name.trim().length > 0
      && product.category.trim().length > 0
      && Number.isFinite(product.price)
      && product.price > 0
      && Number.isInteger(product.stock)
      && product.stock >= 0
      && product.image.startsWith('/images/'),
    );
    const productsRequiringUniqueImages = products.products.filter((product) =>
      !usesSharedOlistCatalogImage(product.sku, product.image),
    );
    const uniqueImageCount = new Set(productsRequiringUniqueImages.map((product) => product.image)).size;
    const results: SecurityTestResult[] = [
      {
        testId: 'DB-CONNECTION-01',
        category: 'Products',
        title: 'MongoDB-backed active catalogue',
        description: 'Reads active catalog records from the configured MongoDB database.',
        status: db.isConnected && products.total > 0 ? 'passed' : 'failed',
        details: `${products.total} active records returned from MongoDB.`,
        timestamp,
      },
      {
        testId: 'CATALOG-VALIDATION-01',
        category: 'Products',
        title: 'Sellable product data validation',
        description: 'Checks the returned page for valid product data and unique images outside the shared Olist category artwork.',
        status: validProducts.length === products.products.length
          && uniqueImageCount === productsRequiringUniqueImages.length ? 'passed' : 'failed',
        details: `${validProducts.length}/${products.products.length} products on the checked page valid; ${products.total} active records across the catalog; ${uniqueImageCount} unique non-shared image assignments.`,
        timestamp,
      },
      {
        testId: 'ORDERS-READ-01',
        category: 'Cart & Orders',
        title: 'Order storage read',
        description: 'Reads persisted order aggregates from MongoDB.',
        status: Number.isInteger(stats.totalOrders) ? 'passed' : 'failed',
        details: `${stats.totalOrders} order records are stored.`,
        timestamp,
      },
    ];
    const passedCount = results.filter((result) => result.status === 'passed').length;
    return res.json({
      success: true,
      totalTests: results.length,
      passedCount,
      failedCount: results.length - passedCount,
      results,
    });
  } catch (error) {
    console.error('[Tests] Database verification failed:', error);
    return res.status(503).json({ success: false, message: 'Database verification could not complete.' });
  }
});

export default router;
