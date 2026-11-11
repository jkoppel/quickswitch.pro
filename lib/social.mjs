// Public profiles, challenges, friendships and boards.
import { randomBytes } from 'node:crypto';
import { q } from './db.mjs';
import { HttpError, requestOrigin } from './http.mjs';
import { achievements, localNow, streak } from './shared.mjs';
import { allRuns } from './runs.mjs';
import { avatarUrl, getUserByHandle, publicUser } from './users.mjs';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const CHALLENGE_ID = /^[0-9A-Za-z]{8}$/;
const SCENARIO = /^[A-Za-z0-9_-]{1,40}$/;

export function newChallengeId() {
  let s = '';
  for (const b of randomBytes(8)) s += BASE62[b % 62];
  return s;
}

function validScore(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e6;
}

// ---------- profiles ----------

export async function profile(handle) {
  const user = await getUserByHandle(handle);
  if (!user) throw new HttpError(404, 'no such player');
  const runs = await allRuns(user.id);
  const today = localNow(user.tz).day;
  const s = streak.computeStreak(streak.completionDays(runs), today);
  const practiceDays = [...new Set(runs.map(r => r.day).filter(Boolean))].sort();
  const bests = {};
  for (const r of runs) {
    if (r.warmup || r.score === null || r.score === undefined || !r.key) continue;
    if (!(r.key in bests) || r.score > bests[r.key]) bests[r.key] = r.score;
  }
  return {
    user: publicUser(user), streak: s.current, longestStreak: s.longest, practicedToday: s.practicedToday,
    practiceDays, bests, achievements: achievements.evaluate(runs),
  };
}

// ---------- challenges ----------

export async function createChallenge(ctx, body) {
  const user = await ctx.ensureUser();
  const { scenario, key, seed, score } = body || {};
  if (typeof scenario !== 'string' || !SCENARIO.test(scenario)) throw new HttpError(400, 'invalid scenario');
  if (typeof key !== 'string' || key.length < 1 || key.length > 120) throw new HttpError(400, 'invalid key');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new HttpError(400, 'seed must be a 32-bit unsigned integer');
  if (!validScore(score)) throw new HttpError(400, 'invalid score');
  for (let i = 0; i < 5; i++) {
    const id = newChallengeId();
    const rows = await q(
      `INSERT INTO challenges (id, creator_id, scenario, key, seed, score) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, user.id, scenario, key, seed, score]);
    if (rows[0]) return { id, url: `${requestOrigin(ctx.request)}/c/${id}` };
  }
  throw new Error('could not allocate a challenge id');
}

export async function getChallenge(id) {
  if (!CHALLENGE_ID.test(id || '')) throw new HttpError(404, 'no such challenge');
  const rows = await q(
    `SELECT c.*, u.handle, u.display_name, u.discord_id, u.discord_avatar
     FROM challenges c JOIN users u ON u.id = c.creator_id WHERE c.id = $1`, [id]);
  const c = rows[0];
  if (!c) throw new HttpError(404, 'no such challenge');
  const results = await q(
    `SELECT u.handle, u.display_name, r.score FROM challenge_results r JOIN users u ON u.id = r.user_id
     WHERE r.challenge_id = $1 ORDER BY r.score DESC LIMIT 50`, [id]);
  return {
    id: c.id, scenario: c.scenario, key: c.key, seed: Number(c.seed), score: c.score,
    creator: { handle: c.handle, displayName: c.display_name, avatarUrl: avatarUrl(c) },
    results: results.map(r => ({ handle: r.handle, displayName: r.display_name, score: r.score })),
  };
}

export async function submitChallengeResult(ctx, id, body) {
  if (!CHALLENGE_ID.test(id || '')) throw new HttpError(404, 'no such challenge');
  if (!validScore(body && body.score)) throw new HttpError(400, 'invalid score');
  const rows = await q('SELECT creator_id, score FROM challenges WHERE id = $1', [id]);
  const c = rows[0];
  if (!c) throw new HttpError(404, 'no such challenge');
  const user = await ctx.ensureUser();
  await q(
    `INSERT INTO challenge_results (challenge_id, user_id, score) VALUES ($1, $2, $3)
     ON CONFLICT (challenge_id, user_id) DO UPDATE SET score = GREATEST(challenge_results.score, EXCLUDED.score)`,
    [id, user.id, body.score]);
  let friendshipCreated = false;
  if (user.id !== c.creator_id) friendshipCreated = await befriend(user.id, c.creator_id);
  return { beat: body.score > c.score, creatorScore: c.score, yourScore: body.score, friendshipCreated };
}

export async function befriend(x, y) {
  if (x === y) return false;
  const rows = await q(
    'INSERT INTO friendships (a, b) VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid)) ON CONFLICT DO NOTHING RETURNING a',
    [x, y]);
  return rows.length > 0;
}

// ---------- boards ----------

async function friendIds(userId) {
  const rows = await q('SELECT CASE WHEN a = $1 THEN b ELSE a END AS id FROM friendships WHERE a = $1 OR b = $1', [userId]);
  return rows.map(r => r.id);
}

// Streak and Benchmark-best rankings over a set of users.
export async function board(userIds, meId) {
  const ids = [...new Set(userIds)];
  const empty = { streak: [], benchmark: {} };
  if (!ids.length) return empty;
  const [users, days, bests] = await Promise.all([
    q('SELECT * FROM users WHERE id = ANY($1::uuid[])', [ids]),
    q(`SELECT user_id, array_agg(DISTINCT day::text) AS days FROM runs
       WHERE user_id = ANY($1::uuid[]) AND routine_completed GROUP BY user_id`, [ids]),
    q(`SELECT user_id, key, max(score) AS best FROM runs
       WHERE user_id = ANY($1::uuid[]) AND benchmark AND NOT warmup AND score IS NOT NULL
       GROUP BY user_id, key`, [ids]),
  ]);
  const byId = new Map(users.map(u => [u.id, u]));
  const daysOf = new Map(days.map(d => [d.user_id, d.days]));
  const entry = (u, value) => ({ handle: u.handle, displayName: u.display_name, avatarUrl: avatarUrl(u), value, you: u.id === meId });
  const streakRows = users.map(u => entry(u, streak.computeStreak(daysOf.get(u.id) || [], localNow(u.tz).day).current));
  streakRows.sort((a, b) => b.value - a.value || a.handle.localeCompare(b.handle));
  const benchmark = {};
  for (const b of bests) {
    const u = byId.get(b.user_id);
    if (!u) continue;
    (benchmark[b.key] ||= []).push(entry(u, b.best));
  }
  for (const k of Object.keys(benchmark)) benchmark[k].sort((a, b) => b.value - a.value);
  return { streak: streakRows, benchmark };
}

export async function boards(ctx) {
  const user = await ctx.user();
  if (!user) return { friends: { streak: [], benchmark: {} }, guilds: [] };
  const friends = await board([user.id, ...(await friendIds(user.id))], user.id);
  const shared = await q(
    `SELECT g.guild_id, max(g.guild_name) AS name, max(g.guild_icon) AS icon, count(*)::int AS members
     FROM user_guilds g
     WHERE g.guild_id IN (SELECT guild_id FROM user_guilds WHERE user_id = $1)
     GROUP BY g.guild_id HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 20`, [user.id]);
  const guilds = [];
  for (const g of shared) {
    const members = await q('SELECT user_id FROM user_guilds WHERE guild_id = $1 LIMIT 200', [g.guild_id]);
    guilds.push({
      id: g.guild_id, name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.guild_id}/${g.icon}.png?size=64` : null,
      board: await board(members.map(m => m.user_id), user.id),
    });
  }
  return { friends, guilds };
}
