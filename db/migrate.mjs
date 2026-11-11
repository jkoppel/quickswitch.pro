// Applies db/schema.sql. Idempotent: run it as often as you like.
//   npm run migrate          the development database (DEV_DATABASE_URL from .env.local)
//   npm run migrate -- --prod  the production database (DATABASE_URL)
import { readFile } from 'node:fs/promises';
import { Pool } from '@neondatabase/serverless';

const prod = process.argv.includes('--prod');
const url = prod
  ? process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  : process.env.DEV_DATABASE_URL_UNPOOLED || process.env.DEV_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }

const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const pool = new Pool({ connectionString: url });
try {
  await pool.query(sql);
  const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`);
  console.log('schema applied:', rows.map(r => r.table_name).join(', '));
} finally {
  await pool.end();
}
