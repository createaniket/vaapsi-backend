const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const pinoHttp = require('pino-http');
const { logger } = require('./config/logger');
const { env } = require('./config/env');
const { globalLimiter } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const dppRoutes = require('./modules/dpp/dpp.routes');
const productRoutes = require('./modules/products/product.routes');
const listingRoutes = require('./modules/marketplace/listing.routes');
const loyaltyRoutes = require('./modules/loyalty/loyalty.routes');
const cartRoutes = require('./modules/cart/cart.routes');
const supportRoutes = require('./modules/support/ticket.routes');
const adminRoutes = require('./modules/admin/admin.routes');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(','),
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.NODE_ENV !== 'test') app.use(pinoHttp({ logger }));
  app.use(globalLimiter);

  // Health / readiness
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'vaapsi-backend', ts: new Date().toISOString() });
  });

  // API v1
  const v1 = express.Router();
  v1.use('/auth', authRoutes);
  v1.use('/users', userRoutes);
  v1.use('/dpp', dppRoutes);
  v1.use('/products', productRoutes);
  v1.use('/listings', listingRoutes);
  v1.use('/loyalty', loyaltyRoutes);
  v1.use('/cart', cartRoutes);
  v1.use('/support/tickets', supportRoutes);
  v1.use('/admin', adminRoutes);
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
