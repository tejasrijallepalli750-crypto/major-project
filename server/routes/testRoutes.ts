import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { SecurityTestResult } from '../../src/types';

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
    const uniqueImageCount = new Set(products.products.map((product) => product.image)).size;
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
        description: 'Checks product names, categories, prices, stock, local image paths, and image uniqueness.',
        status: validProducts.length === products.total && uniqueImageCount === products.total ? 'passed' : 'failed',
        details: `${validProducts.length}/${products.total} products valid; ${uniqueImageCount} unique image assignments.`,
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
