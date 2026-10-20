import 'dotenv/config';
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
import { db } from './server/db/database';

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

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/system', statusRoutes);

app.get('/api/health', (_req, res) => {
  const stats = db.getAdminStats();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    database: {
      type: 'Persistent file-backed document store',
      status: 'available',
      activeProducts: stats.totalProducts,
      ordersStored: stats.totalOrders,
      registeredUsers: stats.totalCustomers + 1,
    },
    paymentGateway: {
      provider: 'Razorpay',
      mode: 'TEST',
      currency: 'INR',
      hmacSha256Verification: 'Enabled when Razorpay Test Mode credentials are configured',
    },
  });
});

async function startServer() {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log('AURA store server running');
    console.log(`Port: ${PORT}`);
    console.log('Razorpay Test Mode: configure credentials to enable checkout');
    console.log('Database: local persistent document store');
  });
}

startServer().catch((error) => {
  console.error('[Server] Fatal startup error:', error);
  process.exit(1);
});
