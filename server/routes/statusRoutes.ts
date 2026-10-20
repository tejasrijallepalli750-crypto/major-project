import { Router, Request, Response } from 'express';

const router = Router();

router.get('/services-status', (_req: Request, res: Response) => {
  const mongoUri = (process.env.MONGODB_URI || '').trim();
  const razorpayKey = (process.env.RAZORPAY_KEY_ID || '').trim();
  const razorpaySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const isMongoConfigured = /^mongodb(\+srv)?:\/\//.test(mongoUri) && !mongoUri.includes('<username>');
  const isRazorpayConfigured = razorpayKey.startsWith('rzp_test_')
    && !razorpayKey.includes('YourTestKeyIdHere')
    && razorpaySecret.length >= 12
    && !razorpaySecret.includes('YourRazorpaySecretKeyHere');

  return res.json({
    success: true,
    timestamp: new Date().toISOString(),
    services: {
      database: {
        mode: 'Local persistent document store',
        status: 'working_persistent',
        isExternalConnected: false,
        mongoConfigured: isMongoConfigured,
        details: isMongoConfigured
          ? 'A MongoDB URI is present, but MongoDB integration is not implemented; this build uses its local persistent store.'
          : 'Using persistent JSON storage in ./data/aura_database.json.',
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
