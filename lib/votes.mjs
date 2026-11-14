// Gun ratings for /guns/tier-list/ and the gun pages: one up or down vote per user per gun.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { q } from './db.mjs';
import { HttpError } from './http.mjs';

// The guns a player can rate: the same ones the guide pages list (tools/build-pages.mjs).
let guns = null;
export function ratableGuns() {
  if (!guns) {
    const defs = JSON.parse(readFileSync(path.join(process.cwd(), 'vendor/survev/defs/gunDefs.json'), 'utf8'));
    guns = new Set(Object.keys(defs).filter((id) => !defs[id].noDrop && !defs[id].isDual && !/_winter$|^potato_|^flare_gun/.test(id)));
  }
  return guns;
}

// One address may vote from at most this many accounts a day; past that, its new voters are refused.
export const VOTERS_PER_ADDRESS_PER_DAY = 25;

export function addressHash(request) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
  if (!ip) return null;
  return createHmac('sha256', process.env.SESSION_SECRET || 'dev').update(ip).digest('base64url').slice(0, 22);
}

export async function tallies(userId) {
  const rows = await q(`SELECT gun, count(*) FILTER (WHERE vote = 1)::int AS up, count(*) FILTER (WHERE vote = -1)::int AS down
    FROM gun_votes GROUP BY gun`);
  const out = { tallies: Object.fromEntries(rows.map((r) => [r.gun, { up: r.up, down: r.down }])), mine: {} };
  if (userId) for (const r of await q('SELECT gun, vote FROM gun_votes WHERE user_id = $1', [userId])) out.mine[r.gun] = r.vote;
  return out;
}

// vote: 1, -1, or 0 to take a vote back.
export async function castVote(ctx, body) {
  const gun = body && body.gun;
  const vote = body && body.vote;
  if (typeof gun !== 'string' || !ratableGuns().has(gun)) throw new HttpError(400, 'unknown gun');
  if (![1, -1, 0].includes(vote)) throw new HttpError(400, 'vote must be 1, -1 or 0');
  const ip = addressHash(ctx.request);
  const existing = await ctx.user();
  if (ip && vote !== 0) {
    const [r] = await q(`SELECT count(DISTINCT user_id)::int AS voters,
        bool_or(user_id = $2) AS known FROM gun_votes WHERE ip_hash = $1 AND updated_at > now() - interval '1 day'`, [ip, existing ? existing.id : null]);
    if (r.voters >= VOTERS_PER_ADDRESS_PER_DAY && !r.known) throw new HttpError(429, 'too many voters from this address today');
  }
  const user = await ctx.ensureUser();
  if (vote === 0) await q('DELETE FROM gun_votes WHERE user_id = $1 AND gun = $2', [user.id, gun]);
  else await q(`INSERT INTO gun_votes (user_id, gun, vote, ip_hash) VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, gun) DO UPDATE SET vote = EXCLUDED.vote, ip_hash = EXCLUDED.ip_hash, updated_at = now()`, [user.id, gun, vote, ip]);
  const [t] = await q(`SELECT count(*) FILTER (WHERE vote = 1)::int AS up, count(*) FILTER (WHERE vote = -1)::int AS down
    FROM gun_votes WHERE gun = $1`, [gun]);
  return { gun, up: t.up, down: t.down, mine: vote };
}
