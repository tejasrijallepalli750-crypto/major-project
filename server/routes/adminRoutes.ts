import { Router, Request, Response } from 'express';
import { db, getDatabaseErrorStatus } from '../db/database';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/stats', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: await db.getAdminStats() });
  } catch (error) {
    return res.status(getDatabaseErrorStatus(error)).json({ success: false, message: 'Failed to retrieve store statistics.' });
  }
});

export default router;
