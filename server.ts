import './server/config/loadEnv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './server/routes/authRoutes';
import productRoutes from './server/routes/productRoutes';
import orderRoutes from './server/routes/orderRoutes';
import paymentRoutes from './server/routes/paymentRoutes';
import adminRoutes from './server/routes/adminRoutes';
import testRoutes from './server/routes/testRoutes';
import statusRoutes from './server/routes/statusRoutes';
import datasetRoutes from './server/routes/datasetRoutes';
import { db } from './server/db/database';
import { formatMongoError } from './server/db/mongo';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buffer) => {
    if (req.url?.split('?')[0] === '/api/payment/webhook') {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/')) console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
  });
  next();
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/system/services-status') return next();
  if (!db.isConnected) {
    return res.status(503).json({
      success: false,
      message: 'MongoDB is disconnected. Configure or restore the database connection and try again.',
    });
  }
  return next();
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/system', statusRoutes);
app.use('/api/dataset', datasetRoutes);

app.get('/api/health', async (_req, res) => {
  const paymentConfigured = (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_')
    && Boolean(process.env.RAZORPAY_KEY_SECRET)
    && !process.env.RAZORPAY_KEY_ID?.includes('YourTestKeyIdHere')
    && !process.env.RAZORPAY_KEY_SECRET?.includes('YourRazorpaySecretKeyHere');
  try {
    const connected = await db.ping();
    let counts: { totalProducts: number; totalOrders: number; totalCustomers: number } | undefined;
    if (connected) {
      const stats = await db.getAdminStats();
      counts = {
        totalProducts: stats.totalProducts,
        totalOrders: stats.totalOrders,
        totalCustomers: stats.totalCustomers,
      };
    }
    return res.status(connected ? 200 : 503).json({
      status: connected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      backend: { status: 'available' },
      environment: process.env.NODE_ENV || 'development',
      database: {
        type: 'MongoDB',
        status: connected
          ? 'connected'
          : db.connectionState === 'connecting' ? 'connecting' : 'disconnected',
        ...(counts || {}),
      },
      paymentGateway: {
        provider: 'Razorpay',
        mode: 'TEST',
        currency: 'INR',
        credentialsConfigured: paymentConfigured,
        hmacSha256Verification: 'Enabled; gateway credentials are never returned by this endpoint.',
      },
    });
  } catch (error) {
    console.error('[Health] Database health check failed:', formatMongoError(error));
    return res.status(503).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      backend: { status: 'available' },
      environment: process.env.NODE_ENV || 'development',
      database: { type: 'MongoDB', status: 'disconnected' },
      paymentGateway: {
        provider: 'Razorpay',
        mode: 'TEST',
        currency: 'INR',
        credentialsConfigured: paymentConfigured,
        hmacSha256Verification: 'Enabled; gateway credentials are never returned by this endpoint.',
      },
    });
  }
});

async function startServer() {
  try {
    await db.connect();
    console.log('[Server] MongoDB ping succeeded.');
  } catch (error) {
    console.error('[Server] MongoDB is unavailable; database-backed APIs will return HTTP 503:', formatMongoError(error));
  }

  if (!db.isConnected && process.env.MONGODB_URI?.startsWith('mongodb')) {
    const retry = setInterval(() => {
      if (!db.isConnected) {
        void db.connect().catch((error: unknown) => {
          console.error('[Server] MongoDB reconnect attempt failed:', error instanceof Error ? error.message : 'Unknown error.');
        });
      }
    }, 15000);
    retry.unref();
  }

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware mounted for development');
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.resolve(distPath, 'index.html')));
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('AURA store server running');
    console.log(`Port: ${PORT}`);
    console.log('Razorpay Test Mode: configure credentials to enable checkout');
    console.log(`MongoDB: ${db.connectionState}`);
  });
  const shutdown = () => {
    server.close(() => {
      void db.disconnect().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer().catch((error) => {
  console.error('[Server] Fatal startup error:', error);
  process.exit(1);
});
