// Postgres access over Neon's HTTP driver. One lazily created client per function instance.
import { neon } from '@neondatabase/serverless';

let client = null;

// Local development (vercel dev, unit tests) gets its own database: the development environment
// carries DEV_DATABASE_URL, which production never has, so QA can never write to production.
export function databaseUrl() {
  return process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
}

export function sql() {
  if (!client) {
    if (!databaseUrl()) throw new Error('DATABASE_URL is not set');
    client = neon(databaseUrl());
  }
  return client;
}

// Parameterized query; returns rows.
export function q(text, params = []) {
  return sql().query(text, params);
}

// Several statements in one transaction. Each item is [text, params].
export function tx(statements) {
  const s = sql();
  return s.transaction(statements.map(([text, params]) => s.query(text, params || [])));
}
