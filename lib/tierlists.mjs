// Player-made tier lists for guns and perks, and up/down votes on them and on the community's
// published lists (guides/community-tierlists.json). Lists are public: anyone can read one by id.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { q } from './db.mjs';
import { HttpError, addressHash } from './http.mjs';

export const TIERS = ['S', 'A', 'B', 'C', 'D'];
const LIST_ID = /^[a-z0-9]{8}$/;
const COMMUNITY_ID = /^c-[a-z0-9-]{1,60}$/;
// One address can save at most this many lists a day, and vote from at most this many accounts.
export const LISTS_PER_ADDRESS_PER_DAY = 20;
export const VOTERS_PER_ADDRESS_PER_DAY = 25;

const read = (rel) => JSON.parse(readFileSync(path.join(process.cwd(), rel), 'utf8'));
let items = null;
// The ids a list of each kind may contain: the guns and perks that have guide pages.
export function itemIds(kind) {
  if (!items) {
    const guns = read('vendor/survev/defs/gunDefs.json');
    const perks = read('vendor/survev/defs/perkDefs.json').perks;
    items = {
      guns: new Set(Object.keys(guns).filter((id) => !guns[id].noDrop && !guns[id].isDual && !/_winter$|^potato_|^flare_gun/.test(id))),
      perks: new Set(Object.keys(perks)),
    };
  }
  return items[kind] || null;
}
let community = null;
export function communityIds() {
  if (!community) community = new Set(read('guides/community-tierlists.json').map((l) => l.id));
  return community;
}

// Titles and names are shown to everyone: one line, no control characters, trimmed to length.
function cleanText(v, max) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new HttpError(400, 'text fields must be strings');
  return v.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function validateList(body) {
  const kind = body && body.kind;
  const allowed = itemIds(kind);
  if (!allowed) throw new HttpError(400, 'kind must be guns or perks');
  const tiers = body.tiers;
  if (!tiers || typeof tiers !== 'object' || Array.isArray(tiers)) throw new HttpError(400, 'tiers must be an object');
  const seen = new Set();
  const out = {};
  for (const t of TIERS) {
    const ids = tiers[t] === undefined ? [] : tiers[t];
    if (!Array.isArray(ids)) throw new HttpError(400, `tier ${t} must be a list`);
    for (const id of ids) {
      if (typeof id !== 'string' || !allowed.has(id)) throw new HttpError(400, `unknown ${kind === 'guns' ? 'gun' : 'perk'}: ${String(id).slice(0, 30)}`);
      if (seen.has(id)) throw new HttpError(400, `${id} is in two tiers`);
      seen.add(id);
    }
    out[t] = ids;
  }
  if (Object.keys(tiers).some((t) => !TIERS.includes(t))) throw new HttpError(400, 'tiers are S, A, B, C and D');
  if (seen.size < 3) throw new HttpError(400, 'place at least three before saving');
  return { kind, tiers: out, title: cleanText(body.title, 60), by: cleanText(body.by, 24) };
}

const tallySql = `SELECT list_id, count(*) FILTER (WHERE vote = 1)::int AS up, count(*) FILTER (WHERE vote = -1)::int AS down
  FROM tier_list_votes WHERE list_id = ANY($1::text[]) GROUP BY list_id`;

async function withVotes(lists, userId) {
  const ids = lists.map((l) => l.id);
  const t = Object.fromEntries((await q(tallySql, [ids])).map((r) => [r.list_id, r]));
  const mine = userId ? Object.fromEntries((await q('SELECT list_id, vote FROM tier_list_votes WHERE user_id = $1 AND list_id = ANY($2::text[])', [userId, ids])).map((r) => [r.list_id, r.vote])) : {};
  return lists.map((l) => ({ ...l, up: t[l.id] ? t[l.id].up : 0, down: t[l.id] ? t[l.id].down : 0, mine: mine[l.id] || 0 }));
}

const publicCols = 'id, kind, title, by_name AS by, tiers, created_at';

export async function createList(ctx, body) {
  const list = validateList(body);
  const ip = addressHash(ctx.request);
  if (ip) {
    const [r] = await q(`SELECT count(*)::int AS n FROM tier_lists WHERE ip_hash = $1 AND created_at > now() - interval '1 day'`, [ip]);
    if (r.n >= LISTS_PER_ADDRESS_PER_DAY) throw new HttpError(429, 'too many tier lists from this address today');
  }
  const user = await ctx.ensureUser();
  const id = randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(8, '0').slice(0, 8);
  await q(`INSERT INTO tier_lists (id, kind, title, by_name, tiers, user_id, ip_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, list.kind, list.title, list.by, JSON.stringify(list.tiers), user.id, ip]);
  return { id };
}

export async function getList(ctx, id) {
  if (!LIST_ID.test(id)) throw new HttpError(404, 'no such tier list');
  const [row] = await q(`SELECT ${publicCols} FROM tier_lists WHERE id = $1 AND NOT hidden`, [id]);
  if (!row) throw new HttpError(404, 'no such tier list');
  const user = await ctx.user();
  return { list: (await withVotes([row], user && user.id))[0] };
}

// The gallery: players' lists of one kind (best voted first, or newest), plus vote tallies for the
// community lists, which the page itself renders.
export async function gallery(ctx, kind, sort) {
  if (!itemIds(kind)) throw new HttpError(400, 'kind must be guns or perks');
  const user = await ctx.user();
  const rows = await q(`SELECT ${publicCols},
      (SELECT coalesce(sum(vote), 0)::int FROM tier_list_votes v WHERE v.list_id = l.id) AS net
    FROM tier_lists l WHERE kind = $1 AND NOT hidden
    ORDER BY ${sort === 'new' ? 'created_at DESC' : 'net DESC, created_at DESC'} LIMIT 30`, [kind]);
  const lists = await withVotes(rows.map(({ net, ...l }) => l), user && user.id);
  const communityLists = await withVotes([...communityIds()].map((id) => ({ id })), user && user.id);
  return { lists, community: Object.fromEntries(communityLists.map((l) => [l.id, { up: l.up, down: l.down, mine: l.mine }])) };
}

// vote: 1, -1, or 0 to take a vote back.
export async function voteList(ctx, id, body) {
  const vote = body && body.vote;
  if (![1, -1, 0].includes(vote)) throw new HttpError(400, 'vote must be 1, -1 or 0');
  const isCommunity = COMMUNITY_ID.test(id) && communityIds().has(id);
  if (!isCommunity) {
    if (!LIST_ID.test(id) || !(await q('SELECT 1 FROM tier_lists WHERE id = $1 AND NOT hidden', [id])).length) throw new HttpError(404, 'no such tier list');
  }
  const ip = addressHash(ctx.request);
  const existing = await ctx.user();
  if (ip && vote !== 0) {
    const [r] = await q(`SELECT count(DISTINCT user_id)::int AS voters, bool_or(user_id = $2) AS known
      FROM tier_list_votes WHERE ip_hash = $1 AND updated_at > now() - interval '1 day'`, [ip, existing ? existing.id : null]);
    if (r.voters >= VOTERS_PER_ADDRESS_PER_DAY && !r.known) throw new HttpError(429, 'too many voters from this address today');
  }
  const user = await ctx.ensureUser();
  if (vote === 0) await q('DELETE FROM tier_list_votes WHERE user_id = $1 AND list_id = $2', [user.id, id]);
  else await q(`INSERT INTO tier_list_votes (list_id, user_id, vote, ip_hash) VALUES ($1, $2, $3, $4)
      ON CONFLICT (list_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, ip_hash = EXCLUDED.ip_hash, updated_at = now()`, [id, user.id, vote, ip]);
  const [t] = await q(tallySql, [[id]]);
  return { id, up: t ? t.up : 0, down: t ? t.down : 0, mine: vote };
}

// Admin: the newest lists, hidden ones included, and a switch to hide or show one.
export async function adminLists() {
  return { lists: await q(`SELECT ${publicCols}, hidden FROM tier_lists ORDER BY created_at DESC LIMIT 100`) };
}
export async function setHidden(id, hidden) {
  if (!LIST_ID.test(id)) throw new HttpError(404, 'no such tier list');
  const rows = await q('UPDATE tier_lists SET hidden = $2 WHERE id = $1 RETURNING id, hidden', [id, !!hidden]);
  if (!rows.length) throw new HttpError(404, 'no such tier list');
  return rows[0];
}
