const { AppError } = require('../utils/errors');
const { logger } = require('../config/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details || undefined },
    });
  }

  // PostgreSQL error codes
  if (err && err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'Resource already exists', details: err.detail },
    });
  }
  if (err && err.code === '23503') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Referenced resource does not exist' },
    });
  }

  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
}

function notFoundHandler(_req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

module.exports = { errorHandler, notFoundHandler };
