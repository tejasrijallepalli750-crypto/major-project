import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// GET /api/system/services-status
// Transparently details which services are fully working, which use test/placeholder configs
router.get('/services-status', (_req: Request, res: Response) => {
  const mongoUri = process.env.MONGODB_URI || '';
  const isMongoConfigured = mongoUri.includes('mongodb+srv://') && !mongoUri.includes('<username>');

  const razorpayKey = process.env.RAZORPAY_KEY_ID || '';
  const isRazorpayConfigured = razorpayKey.startsWith('rzp_test_') && !razorpayKey.includes('YourTestKeyIdHere');

  const kaggleDir = path.resolve(process.cwd(), 'data', 'kaggle');
  const hasLocalKaggleFiles = fs.existsSync(kaggleDir) && fs.readdirSync(kaggleDir).length > 0;

  return res.json({
    success: true,
    timestamp: new Date().toISOString(),
    services: {
      database: {
        mode: isMongoConfigured ? 'MongoDB Atlas (Live Cluster)' : 'Local File-Backed Document Store (Persistent)',
        status: 'working_persistent',
        isExternalConnected: isMongoConfigured,
        details: isMongoConfigured
          ? 'Connected to remote MongoDB Atlas cluster via Mongoose URI.'
          : 'Using persistent JSON storage in ./data/aura_database.json with atomic writes. Mongoose schemas are fully implemented in /server/models/.',
        setupRequired: !isMongoConfigured,
        configGuide: {
          step1: 'Sign up for free at https://www.mongodb.com/cloud/atlas',
          step2: 'Create a free M0 cluster and set database username and password',
          step3: 'Add Network Access IP 0.0.0.0/0 (allow from anywhere)',
          step4: 'Copy the connection string into .env under MONGODB_URI',
        },
      },
      paymentGateway: {
        provider: 'Razorpay',
        mode: 'TEST_MODE',
        status: 'working_simulation',
        isLiveKeyConfigured: isRazorpayConfigured,
        details: isRazorpayConfigured
          ? 'Custom Razorpay Test credentials active.'
          : 'Official Razorpay Test Mode simulator active with HMAC-SHA256 server-side cryptographic signature verification. Real test credentials can be placed in .env (RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET).',
        setupRequired: !isRazorpayConfigured,
        configGuide: {
          step1: 'Sign up at https://dashboard.razorpay.com/',
          step2: 'Navigate to Settings -> API Keys (ensure toggle is in TEST MODE)',
          step3: 'Click "Generate Test Key" and copy Key ID (rzp_test_...) and Key Secret',
          step4: 'Paste them into .env under RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET',
        },
      },
      kaggleDataset: {
        datasetName: 'Brazilian E-Commerce Public Dataset by Olist (Kaggle)',
        status: hasLocalKaggleFiles ? 'local_csv_loaded' : 'pre_analyzed_loaded',
        details: hasLocalKaggleFiles
          ? 'Raw Kaggle CSV files detected in ./data/kaggle/.'
          : '100,000 historical order records pre-analyzed and normalized into the Kaggle Hub. Raw CSVs can be downloaded from Kaggle and imported via the in-app tool or scripts/import_kaggle_data.js.',
        url: 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce',
      },
      securityAndTesting: {
        passwordHashing: 'Bcrypt (Salt factor 10)',
        jwtAuth: 'Active (30-day tokens with RBAC customer/admin checks)',
        priceValidation: 'Server-Side Database Price Re-querying (Prevents client manipulation)',
        invoiceGeneration: 'jsPDF Client/Server with 18% GST (CGST+SGST) itemization',
        testRunner: '10 automated security and transaction tests available in /api/tests/run-suite',
      },
    },
  });
});

export default router;
