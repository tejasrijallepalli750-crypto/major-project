import { Router, Request, Response } from 'express';
import { db } from '../db/database';

const router = Router();

router.get('/services-status', async (_req: Request, res: Response) => {
  const mongoUri = (process.env.MONGODB_URI || '').trim();
  const razorpayKey = (process.env.RAZORPAY_KEY_ID || '').trim();
  const razorpaySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const isMongoConfigured = /^mongodb(\+srv)?:\/\//.test(mongoUri)
    && !mongoUri.includes('<username>')
    && !mongoUri.includes('<password>');
  const isMongoConnected = await db.ping();
  const isRazorpayConfigured = razorpayKey.startsWith('rzp_test_')
    && !razorpayKey.includes('YourTestKeyIdHere')
    && razorpaySecret.length >= 12
    && !razorpaySecret.includes('YourRazorpaySecretKeyHere');

  return res.json({
    success: true,
    timestamp: new Date().toISOString(),
    services: {
      database: {
        mode: 'MongoDB Atlas',
        status: isMongoConnected ? 'connected' : 'disconnected',
        isExternalConnected: isMongoConnected,
        mongoConfigured: isMongoConfigured,
        details: isMongoConnected
          ? 'MongoDB ping succeeded.'
          : isMongoConfigured
            ? 'MongoDB is configured but the server cannot complete a database ping.'
            : 'Set a private MONGODB_URI in the local .env file.',
      },
      paymentGateway: {
        provider: 'Razorpay',
        mode: 'TEST',
        isConfigured: isRazorpayConfigured,
        details: isRazorpayConfigured
          ? 'Razorpay Test Mode credentials are present. Checkout still requires a successful test transaction to verify end-to-end connectivity.'
          : 'Razorpay Test Mode is not configured. Add test credentials before enabling checkout.',
      },
    },
  });
});

export default router;
