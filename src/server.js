const { createApp } = require('./app');
const { env } = require('./config/env');
const { logger } = require('./config/logger');
const { connectDb, disconnectDb } = require('./db');

async function bootstrap() {
  await connectDb();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`Vaapsi backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
