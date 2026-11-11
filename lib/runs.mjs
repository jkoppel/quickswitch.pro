// Run history sync. Entries are the trainer's own history records; `id` makes re-sync idempotent.
import { randomUUID } from 'node:crypto';
import { q } from './db.mjs';
import { HttpError } from './http.mjs';

export const MAX_RUNS_PER_POST = 200;
const MAX_ENTRY_BYTES = 16 * 1024;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST = Date.UTC(2024, 0, 1);

const str = (v, max) => typeof v === 'string' && v.length >= 1 && v.length <= max ? v : null;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

// Returns a row for the runs table, or null if the entry is unusable.
export function validateRun(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const clientId = str(entry.id, 64);
  const key = str(entry.key, 120);
  if (!clientId || !key) return null;
  const ts = typeof entry.ts === 'number' ? entry.ts : Date.parse(entry.ts);
  if (!Number.isFinite(ts) || ts < EARLIEST || ts > now + 2 * 86400000) return null;
  const day = typeof entry.day === 'string' && DAY.test(entry.day) ? entry.day : new Date(ts).toISOString().slice(0, 10);
  const data = JSON.stringify(entry);
  if (data.length > MAX_ENTRY_BYTES) return null;
  const score = entry.score === null || entry.score === undefined ? null : num(entry.score, -1e7, 1e7);
  if (score === null && entry.score !== null && entry.score !== undefined) return null;
  return {
    clientId, ts: new Date(ts).toISOString(), day, key,
    label: typeof entry.label === 'string' ? entry.label.slice(0, 120) : null,
    score, duration: num(entry.duration, 0, 7200),
    warmup: entry.warmup === true, benchmark: entry.benchmark === true, routineCompleted: entry.routineCompleted === true,
    data,
  };
}

export async function upsertRuns(userId, entries) {
  if (!Array.isArray(entries)) throw new HttpError(400, 'runs must be an array');
  if (entries.length > MAX_RUNS_PER_POST) throw new HttpError(413, `at most ${MAX_RUNS_PER_POST} runs per request`);
  const rows = [];
  const seen = new Set();
  for (const e of entries) {
    const r = validateRun(e);
    if (r && !seen.has(r.clientId)) { seen.add(r.clientId); rows.push(r); }
  }
  if (!rows.length) return 0;
  const col = (f) => rows.map(f);
  await q(
    `INSERT INTO runs (id, user_id, client_id, ts, day, key, label, score, duration, warmup, benchmark, routine_completed, data)
     SELECT u.id, $1, u.client_id, u.ts, u.day, u.key, u.label, u.score, u.duration, u.warmup, u.benchmark, u.rc, u.data
     FROM unnest($2::uuid[], $3::text[], $4::timestamptz[], $5::date[], $6::text[], $7::text[], $8::real[], $9::real[],
                 $10::bool[], $11::bool[], $12::bool[], $13::jsonb[])
       AS u(id, client_id, ts, day, key, label, score, duration, warmup, benchmark, rc, data)
     ON CONFLICT (user_id, client_id) DO UPDATE SET
       ts = EXCLUDED.ts, day = EXCLUDED.day, key = EXCLUDED.key, label = EXCLUDED.label, score = EXCLUDED.score,
       duration = EXCLUDED.duration, warmup = EXCLUDED.warmup, benchmark = EXCLUDED.benchmark,
       routine_completed = EXCLUDED.routine_completed, data = EXCLUDED.data`,
    [userId, col(() => randomUUID()), col(r => r.clientId), col(r => r.ts), col(r => r.day), col(r => r.key),
      col(r => r.label), col(r => r.score), col(r => r.duration), col(r => r.warmup), col(r => r.benchmark),
      col(r => r.routineCompleted), col(r => r.data)]);
  return rows.length;
}

export async function listRuns(userId, since) {
  let sinceIso = null;
  if (since) {
    const t = Date.parse(since);
    if (!Number.isFinite(t)) throw new HttpError(400, 'since must be an ISO date');
    sinceIso = new Date(t).toISOString();
  }
  const rows = await q(
    `SELECT data FROM runs WHERE user_id = $1 AND ($2::timestamptz IS NULL OR ts > $2) ORDER BY ts LIMIT 5000`,
    [userId, sinceIso]);
  return rows.map(r => r.data);
}

// All of a user's runs as history entries, for profiles and achievements.
export async function allRuns(userId) {
  const rows = await q('SELECT data FROM runs WHERE user_id = $1 ORDER BY ts LIMIT 5000', [userId]);
  return rows.map(r => r.data);
}
