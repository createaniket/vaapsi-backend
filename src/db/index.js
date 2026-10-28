const { Pool } = require('pg');
const crypto = require('crypto');
const { env } = require('../config/env');
const { logger } = require('../config/logger');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => logger.error({ err }, 'Unexpected PG pool error'));

// Numeric (NUMERIC/DECIMAL) comes back as string by default — parse to Number.
const { types } = require('pg');
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // bigint (COUNT)

const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function mapRow(row) {
  if (!row) return row;
  const out = {};
  for (const key of Object.keys(row)) out[snakeToCamel(key)] = row[key];
  return out;
}

/**
 * Run a query. Accepts an optional client (inside a transaction).
 * Returns rows with camelCase keys.
 */
async function query(text, params = [], client = null) {
  const runner = client || pool;
  const res = await runner.query(text, params);
  return { rows: res.rows.map(mapRow), rowCount: res.rowCount };
}

/** Convenience: first row or null. */
async function one(text, params = [], client = null) {
  const { rows } = await query(text, params, client);
  return rows[0] || null;
}

/**
 * Run a function inside a transaction. The callback receives a client that
 * must be passed as the third arg to query()/one() to join the transaction.
 */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Collision-resistant id (cuid-like, url-safe). */
function newId() {
  return 'c' + Date.now().toString(36) + crypto.randomBytes(8).toString('hex');
}

async function connectDb() {
  await pool.query('SELECT 1');
  logger.info('PostgreSQL connected');
}

async function disconnectDb() {
  await pool.end();
}

module.exports = { pool, query, one, transaction, newId, connectDb, disconnectDb };
