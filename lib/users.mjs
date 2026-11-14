// Users: anonymous rows created lazily, members once a verified email or Discord is attached.
import { randomBytes, randomUUID } from 'node:crypto';
import { q, tx } from './db.mjs';
import { HttpError } from './http.mjs';
import { validTimeZone } from './shared.mjs';

export const HANDLE = /^[a-z0-9_]{3,20}$/;
export const SURVEV_SLUG = /^[A-Za-z0-9_-]{1,40}$/;
const AUTO_HANDLE = /^p_[a-z0-9]{8}$/;

export function randomHandle() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(8);
  let s = 'p_';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

export function avatarUrl(row) {
  return row && row.discord_id && row.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${row.discord_id}/${row.discord_avatar}.png?size=128`
    : null;
}

// A guest's handle is random (p_xxxx), so it never stands in for a name on pages or cards.
export function displayNameOf(row, fallback = 'A player') {
  if (!row) return fallback;
  if (row.display_name) return row.display_name;
  return row.handle && !/^p_/.test(row.handle) ? row.handle : fallback;
}

export function publicUser(row) {
  return { handle: row.handle, displayName: row.display_name, avatarUrl: avatarUrl(row), survevSlug: row.survev_slug };
}

export async function getUser(id) {
  if (!id) return null;
  const rows = await q('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function getUserByHandle(handle) {
  if (typeof handle !== 'string' || !HANDLE.test(handle.toLowerCase())) return null;
  const rows = await q('SELECT * FROM users WHERE handle = $1', [handle.toLowerCase()]);
  return rows[0] || null;
}

export async function createUser({ kind = 'anon', discordId = null, discordAvatar = null, displayName = null } = {}) {
  for (let i = 0; i < 5; i++) {
    const rows = await q(
      `INSERT INTO users (id, kind, handle, display_name, discord_id, discord_avatar)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (handle) DO NOTHING RETURNING *`,
      [randomUUID(), kind, randomHandle(), displayName, discordId, discordAvatar]);
    if (rows[0]) return rows[0];
  }
  throw new Error('could not allocate a handle');
}

export async function me(row) {
  if (!row) return null;
  return {
    id: row.id, kind: row.kind, handle: row.handle, displayName: row.display_name, avatarUrl: avatarUrl(row),
    survevSlug: row.survev_slug, tz: row.tz, remindHour: row.remind_hour,
    email: row.email || null, emailVerified: !!row.email_verified_at, pendingEmail: row.pending_email || null,
    plan: row.plan || null,
    signIn: { discord: !!row.discord_id, email: !!row.email_verified_at },
  };
}

export async function touch(id) {
  await q('UPDATE users SET last_seen_at = now() WHERE id = $1', [id]);
}

// Validates a PATCH /api/me body into column updates.
export function validatePatch(body) {
  const set = {};
  if (body.handle !== undefined) {
    const h = typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : '';
    if (!HANDLE.test(h)) throw new HttpError(400, 'handle must be 3–20 characters: a–z, 0–9 or _');
    set.handle = h;
  }
  if (body.displayName !== undefined) {
    if (body.displayName === null || body.displayName === '') set.display_name = null;
    else if (typeof body.displayName === 'string' && body.displayName.trim().length <= 40) set.display_name = body.displayName.trim().replace(/[\u0000-\u001f\u007f]/g, '') || null;
    else throw new HttpError(400, 'displayName must be at most 40 characters');
  }
  if (body.survevSlug !== undefined) {
    if (body.survevSlug === null || body.survevSlug === '') set.survev_slug = null;
    else if (typeof body.survevSlug === 'string' && SURVEV_SLUG.test(body.survevSlug.trim())) set.survev_slug = body.survevSlug.trim();
    else throw new HttpError(400, 'survevSlug is not a valid survev username');
  }
  if (body.tz !== undefined) {
    if (body.tz === null) set.tz = null;
    else if (validTimeZone(body.tz)) set.tz = body.tz;
    else throw new HttpError(400, 'tz must be an IANA time zone');
  }
  if (body.plan !== undefined) {
    // The week plan is the browser's (platform/shared/plan.js); the server keeps it so it follows
    // the player to another device and so reminders can name the day's routine.
    if (body.plan === null) set.plan = null;
    else if (validPlan(body.plan)) set.plan = JSON.stringify(body.plan);
    else throw new HttpError(400, 'plan is not a week plan');
  }
  if (body.remindHour !== undefined) {
    if (body.remindHour === null) set.remind_hour = null;
    else if (Number.isInteger(body.remindHour) && body.remindHour >= 0 && body.remindHour <= 23) set.remind_hour = body.remindHour;
    else throw new HttpError(400, 'remindHour must be an integer 0–23');
  }
  return set;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ROUTINE_ID = /^[a-z0-9_-]{1,30}$/;
export function validPlan(p) {
  if (!p || typeof p !== 'object' || !DAY.test(p.startDay || '') || !Array.isArray(p.days)) return false;
  if (p.days.length < 1 || p.days.length > 14 || JSON.stringify(p).length > 4000) return false;
  return p.days.every(d => d && DAY.test(d.day || '') && ROUTINE_ID.test(d.routine || ''));
}

export async function updateUser(id, set) {
  const cols = Object.keys(set);
  if (!cols.length) return getUser(id);
  const assignments = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  try {
    const rows = await q(`UPDATE users SET ${assignments} WHERE id = $1 RETURNING *`, [id, ...cols.map(c => set[c])]);
    return rows[0] || null;
  } catch (e) {
    if (e && e.code === '23505') throw new HttpError(409, /email/.test(e.constraint || e.message || '') ? 'that email belongs to another account' : 'that handle is taken');
    throw e;
  }
}

// After a Discord sign-in, replace an auto-generated handle with the Discord username if it fits.
export async function adoptHandle(row, candidate) {
  if (!AUTO_HANDLE.test(row.handle || '')) return row;
  const h = String(candidate || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  if (!HANDLE.test(h)) return row;
  const rows = await q('UPDATE users SET handle = $2 WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM users WHERE handle = $2) RETURNING *', [row.id, h]);
  return rows[0] || row;
}

// Moves everything an anonymous user owns onto `targetId`, then deletes the anonymous user.
// Runs the target already has (same client_id) win; duplicate challenge results keep the higher score.
export async function mergeUsers(anonId, targetId) {
  if (!anonId || !targetId || anonId === targetId) return false;
  await tx([
    [`UPDATE runs SET user_id = $2 WHERE user_id = $1
        AND client_id NOT IN (SELECT client_id FROM runs WHERE user_id = $2)`, [anonId, targetId]],
    [`UPDATE challenges SET creator_id = $2 WHERE creator_id = $1`, [anonId, targetId]],
    [`INSERT INTO challenge_results (challenge_id, user_id, score, created_at)
        SELECT challenge_id, $2, score, created_at FROM challenge_results WHERE user_id = $1
        ON CONFLICT (challenge_id, user_id) DO UPDATE SET score = GREATEST(challenge_results.score, EXCLUDED.score)`, [anonId, targetId]],
    [`INSERT INTO friendships (a, b, created_at)
        SELECT LEAST(o, $2::uuid), GREATEST(o, $2::uuid), created_at FROM (
          SELECT CASE WHEN a = $1 THEN b ELSE a END AS o, created_at FROM friendships WHERE a = $1 OR b = $1
        ) f WHERE o <> $2
        ON CONFLICT DO NOTHING`, [anonId, targetId]],
    [`INSERT INTO user_guilds (user_id, guild_id, guild_name, guild_icon)
        SELECT $2, guild_id, guild_name, guild_icon FROM user_guilds WHERE user_id = $1
        ON CONFLICT DO NOTHING`, [anonId, targetId]],
    [`UPDATE push_subscriptions SET user_id = $2 WHERE user_id = $1`, [anonId, targetId]],
    [`UPDATE feedback SET user_id = $2 WHERE user_id = $1`, [anonId, targetId]],
    [`UPDATE events SET user_id = $2 WHERE user_id = $1`, [anonId, targetId]],
    [`UPDATE tier_lists SET user_id = $2 WHERE user_id = $1`, [anonId, targetId]],
    [`INSERT INTO tier_list_votes (list_id, user_id, vote, ip_hash, updated_at)
        SELECT list_id, $2, vote, ip_hash, updated_at FROM tier_list_votes WHERE user_id = $1
        ON CONFLICT (list_id, user_id) DO NOTHING`, [anonId, targetId]],
    [`UPDATE users t SET survev_slug = COALESCE(t.survev_slug, a.survev_slug), tz = COALESCE(t.tz, a.tz),
        remind_hour = COALESCE(t.remind_hour, a.remind_hour), plan = COALESCE(t.plan, a.plan)
        FROM users a WHERE t.id = $2 AND a.id = $1`, [anonId, targetId]],
    [`DELETE FROM users WHERE id = $1 AND kind = 'anon'`, [anonId]],
  ]);
  return true;
}
