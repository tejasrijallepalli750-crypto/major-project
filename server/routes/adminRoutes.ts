import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/stats', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: db.getAdminStats() });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to retrieve store statistics.' });
  }
});

export default router;
