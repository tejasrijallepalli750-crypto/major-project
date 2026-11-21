import { Router, Request, Response } from 'express';
import { db, getDatabaseErrorStatus, InventoryError } from '../db/database';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { isDemoModeEnabled } from '../config/demoMode';
import { reconcileExpiredDemoReservations } from '../payments/demoReservationReconciler';
import { safeErrorSummary } from '../utils/safeError';

const router = Router();

router.post('/demo-inventory/bulk-enable', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production' || !db.isNonProductionDatabase()) {
    return res.status(403).json({
      success: false,
      message: 'Bulk demo inventory is allowed only on a confirmed non-production database.',
    });
  }
  if (!isDemoModeEnabled()) {
    return res.status(503).json({ success: false, message: 'Demonstration inventory mode is disabled by the server.' });
  }

  try {
    const data = await db.bulkEnableAllDemoInventory();
    return res.json({
      success: true,
      message: data.failedCount > 0
        ? 'Bulk demo inventory finished with product-level failures; review the returned details.'
        : 'Bulk demo inventory processing completed.',
      data,
    });
  } catch (error) {
    if (error instanceof InventoryError) {
      return res.status(403).json({ success: false, message: error.message });
    }
    console.error('[Admin] Demo inventory bulk update failed:', safeErrorSummary(error));
    return res.status(getDatabaseErrorStatus(error)).json({
      success: false,
      message: 'Bulk demo inventory could not be completed.',
    });
  }
});

router.post('/demo-inventory/reconcile', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  if (!isDemoModeEnabled()) {
    return res.status(503).json({ success: false, message: 'Demonstration inventory mode is disabled by the server.' });
  }
  try {
    const result = await reconcileExpiredDemoReservations();
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Admin] Demo inventory reconciliation failed:', safeErrorSummary(error));
    return res.status(getDatabaseErrorStatus(error)).json({
      success: false,
      message: 'Expired demonstration reservations could not be reconciled.',
    });
  }
});

router.get('/stats', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: await db.getAdminStats() });
  } catch (error) {
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to retrieve store statistics.' });
  }
});

export default router;
