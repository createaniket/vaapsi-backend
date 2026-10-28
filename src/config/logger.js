const pino = require('pino');
const { env, isProd } = require('./env');

const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug',
  base: { env: env.NODE_ENV },
  redact: ['req.headers.authorization', '*.passwordHash', '*.codeHash', '*.tokenHash'],
});

module.exports = { logger };
