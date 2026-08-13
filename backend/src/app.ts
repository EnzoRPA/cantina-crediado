import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';

import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { generalLimiter } from './shared/middlewares/rate-limit';
import { errorHandler } from './shared/middlewares/error-handler';
import { logger } from './shared/utils/logger';
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { studentsRoutes } from './modules/students/students.routes';
import { guardiansRoutes } from './modules/guardians/guardians.routes';
import { categoriesRoutes, productsRoutes } from './modules/products/products.routes';
import { cardsRoutes } from './modules/cards/cards.routes';
import { stockRoutes } from './modules/stock/stock.routes';
import { dailyLimitsRoutes } from './modules/daily-limits/daily-limits.routes';
import { posRoutes } from './modules/pos/pos.routes';
import { paymentsRoutes } from './modules/payments/payments.routes';
import { facialRoutes } from './modules/facial/facial.routes';
import { menuRoutes } from './modules/menu/menu.routes';

const app: express.Express = express();

app.set('trust proxy', 1);

// ---- Security ----
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// Enable CORS for static files (images)
app.use('/uploads', cors({
  origin: config.cors.origins,
  credentials: true,
}));

// ---- Parsing ----
app.use(express.json({ limit: '10mb' })); // 10mb for facial images
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ---- Static Files ----
const uploadsPath = path.join(__dirname, '..', 'uploads');
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(uploadsPath));

// ---- Rate Limiting ----
app.use('/api/', generalLimiter);

// ---- Request Logging ----
app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path }, 'Incoming request');
  next();
});

// ---- Health Check ----
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.env,
    },
  });
});

// ---- API Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/guardians', guardiansRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/daily-limits', dailyLimitsRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/facial', facialRoutes);
app.use('/api/menu', menuRoutes);

// ---- Static Web Frontend (if compiled) ----
const webDistPath = path.join(__dirname, '../../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// ---- 404 Handler ----
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Rota não encontrada',
      },
    });
    return;
  }
  next();
});


// ---- Global Error Handler (must be last) ----
app.use(errorHandler);

export default app;
