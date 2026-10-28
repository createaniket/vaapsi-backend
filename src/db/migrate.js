// Applies src/db/schema.sql — idempotent (CREATE TABLE IF NOT EXISTS everywhere).
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log('✅ Migration complete — schema applied');
  await pool.end();
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
