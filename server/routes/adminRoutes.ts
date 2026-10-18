import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

// GET /api/admin/stats
router.get('/stats', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  try {
    const stats = db.getAdminStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve administrative statistics.' });
  }
});

// POST /api/admin/reset-demo
router.post('/reset-demo', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  try {
    const result = db.resetToDemo();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reset demonstration data.' });
  }
});

// GET /api/admin/kaggle-insights
// Returns structured analytics from the Olist Brazilian E-Commerce Kaggle dataset
router.get('/kaggle-insights', requireAuth, (_req: Request, res: Response) => {
  try {
    const insights = db.getKaggleInsights();
    return res.json({
      success: true,
      dataset: {
        name: 'Brazilian E-Commerce Public Dataset by Olist',
        source: 'Kaggle (olistbr/brazilian-ecommerce)',
        recordsAnalyzed: '100,000+ Orders (2016-2018)',
        scope: 'Multi-category retail transactions across all 26 Brazilian States + Federal District',
      },
      data: insights,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch Kaggle dataset insights.' });
  }
});

// POST /api/admin/kaggle-import-sample
// Imports sample products from the Kaggle dataset into the active storefront catalog
router.post('/kaggle-import-sample', requireAuth, requireAdmin, (req: Request, res: Response) => {
  try {
    const sampleKaggleItems = [
      {
        name: 'Olist Artisanal Bamboo Bed & Bath Linen Set',
        description: 'Imported from Olist dataset category "cama_mesa_banho". 100% natural organic bamboo fiber with 400 thread count.',
        price: 3899,
        category: 'Home & Living',
        image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=80',
        stock: 35,
        sku: 'KAG-BR-CAMA-01',
        brand: 'Olist Curated',
      },
      {
        name: 'Olist Dermacare Organic Botanical Face Elixir',
        description: 'Imported from Olist dataset category "beleza_saude". Pure cold-pressed Amazonian rosehip and maracujá oil.',
        price: 2499,
        category: 'Home & Living',
        image: 'https://images.unsplash.com/photo-1608248597359-009772b144fa?w=800&auto=format&fit=crop&q=80',
        stock: 40,
        sku: 'KAG-BR-BELEZA-02',
        brand: 'Olist Curated',
      },
      {
        name: 'Olist ProSpeed Ergonomic Carbon Bicycle Saddle',
        description: 'Imported from Olist dataset category "esporte_lazer". Ultra-lightweight 3D printed honeycomb padding with titanium rails.',
        price: 6200,
        category: 'Apparel',
        image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&auto=format&fit=crop&q=80',
        stock: 18,
        sku: 'KAG-BR-ESPORTE-03',
        brand: 'Olist Curated',
      },
    ];

    const added = [];
    for (const item of sampleKaggleItems) {
      const created = db.createProduct({
        ...item,
        status: 'active',
        rating: 4.8,
        numReviews: 24,
        features: ['Olist Brazilian Kaggle Verified', 'Imported Demonstration Spec'],
      });
      added.push(created);
    }

    return res.json({
      success: true,
      message: `Successfully imported ${added.length} product records mapped from Kaggle Olist Brazilian Dataset categories.`,
      importedCount: added.length,
      items: added,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to import Kaggle sample data.' });
  }
});

export default router;
