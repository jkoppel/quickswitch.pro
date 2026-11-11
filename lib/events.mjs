// Analytics events and player feedback.
import { q } from './db.mjs';
import { HttpError } from './http.mjs';

const NAME = /^[a-z_]{1,40}$/;
const MAX_EVENTS = 50;

function smallJson(v, maxBytes) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return undefined;
  const s = JSON.stringify(v);
  return s.length <= maxBytes ? s : undefined;
}

function anon(v) {
  return typeof v === 'string' && v.length >= 1 && v.length <= 64 ? v : null;
}

export async function recordEvents(ctx, body, now = Date.now()) {
  const list = body && body.events;
  if (!Array.isArray(list)) throw new HttpError(400, 'events must be an array');
  if (list.length > MAX_EVENTS) throw new HttpError(413, `at most ${MAX_EVENTS} events per request`);
  const anonId = anon(body.anonId);
  const user = await ctx.user();
  const rows = [];
  for (const e of list) {
    if (!e || typeof e.name !== 'string' || !NAME.test(e.name)) continue;
    const props = smallJson(e.props, 2048);
    if (props === undefined) continue;
    const ts = typeof e.ts === 'number' && Math.abs(e.ts - now) < 7 * 86400000 ? e.ts : now;
    rows.push({ name: e.name, props, ts: new Date(ts).toISOString() });
  }
  if (rows.length) {
    await q(
      `INSERT INTO events (anon_id, user_id, name, props, ts)
       SELECT $1, $2, * FROM unnest($3::text[], $4::jsonb[], $5::timestamptz[])`,
      [anonId, user ? user.id : null, rows.map(r => r.name), rows.map(r => r.props), rows.map(r => r.ts)]);
  }
  return { ok: true, accepted: rows.length };
}

export async function recordFeedback(ctx, body) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 1 || text.length > 4000) throw new HttpError(400, 'feedback must be 1–4000 characters');
  const context = smallJson(body.context, 4096);
  if (context === undefined) throw new HttpError(400, 'context must be a small object');
  const user = await ctx.user();
  const anonId = anon(body.anonId) || (body.context && anon(body.context.anonId)) || null;
  await q('INSERT INTO feedback (user_id, anon_id, text, context) VALUES ($1, $2, $3, $4)',
    [user ? user.id : null, anonId, text, context]);
  return { ok: true };
}
