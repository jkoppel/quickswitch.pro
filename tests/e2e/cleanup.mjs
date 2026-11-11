// Removes users created by an e2e run, and everything that belongs to them. Targets the
// production database (DATABASE_URL), since that is where runs against the live URL write;
// pass --dev for a run against `vercel dev`.
//
//   node --env-file=.env.local tests/e2e/cleanup.mjs [--dev] <created-users.json | user-id...>
import { readFileSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const dev = process.argv.includes('--dev');
const args = process.argv.slice(2).filter(a => a !== '--dev');
const ids = args.length === 1 && existsSync(args[0]) ? JSON.parse(readFileSync(args[0], 'utf8')) : args;
if (!ids.length) { console.log('nothing to remove'); process.exit(0); }
const sql = neon(dev ? process.env.DEV_DATABASE_URL : process.env.DATABASE_URL);
const tables = [
  ['challenge_results', 'user_id = ANY($1) OR challenge_id IN (SELECT id FROM challenges WHERE creator_id = ANY($1))'],
  ['challenges', 'creator_id = ANY($1)'],
  ['friendships', 'a = ANY($1) OR b = ANY($1)'],
  ['user_guilds', 'user_id = ANY($1)'],
  ['push_subscriptions', 'user_id = ANY($1)'],
  ['runs', 'user_id = ANY($1)'],
  ['feedback', 'user_id = ANY($1)'],
  ['events', 'user_id = ANY($1)'],
  ['users', 'id = ANY($1)'],
];
for (const [t, where] of tables) {
  const r = await sql.query(`DELETE FROM ${t} WHERE ${where}`, [ids], { fullResults: true });
  if (r.rowCount) console.log(`${t}: ${r.rowCount}`);
}
console.log(`removed ${ids.length} user(s)`);
