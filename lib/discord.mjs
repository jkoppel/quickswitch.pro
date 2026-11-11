// Discord OAuth (scopes: identify guilds). Off unless DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are set.
import { randomBytes } from 'node:crypto';
import { q } from './db.mjs';
import { HttpError, cookie, isSecureOrigin, parseCookies, redirect, requestOrigin, safeEqual } from './http.mjs';
import { hmac } from './session.mjs';
import { adoptHandle, createUser, getUser, mergeUsers, updateUser } from './users.mjs';

const OAUTH_COOKIE = 'st_oauth';
const STATE_TTL_MS = 10 * 60 * 1000;
const API = 'https://discord.com/api/v10';

export function discordEnabled() {
  return !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

// Only same-site relative paths; anything else falls back to the home page.
export function safeReturn(path) {
  return typeof path === 'string' && /^\/(?![/\\])[^\s]*$/.test(path) && path.length <= 300 ? path : '/';
}

function redirectUri(request) {
  return `${requestOrigin(request)}/api/auth/discord/callback`;
}

export function signState(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${hmac('discord-state:' + payload)}`;
}

export function verifyState(state, now = Date.now()) {
  if (typeof state !== 'string') return null;
  const [payload, sig] = state.split('.');
  if (!payload || !sig || !safeEqual(sig, hmac('discord-state:' + payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return now - data.t <= STATE_TTL_MS && now >= data.t - 60000 ? data : null;
  } catch { return null; }
}

export function start(ctx) {
  if (!discordEnabled()) throw new HttpError(404, 'Discord sign-in is not configured');
  const nonce = randomBytes(16).toString('base64url');
  const state = signState({ r: safeReturn(ctx.url.searchParams.get('return')), n: nonce, t: Date.now() });
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID);
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', redirectUri(ctx.request));
  const secure = isSecureOrigin(requestOrigin(ctx.request));
  return redirect(url.toString(), [cookie(OAUTH_COOKIE, nonce, { maxAge: 600, secure })]);
}

async function discordFetch(path, token) {
  const r = await fetch(API + path, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Discord ${path} answered ${r.status}`);
  return r.json();
}

export async function callback(ctx) {
  const secure = isSecureOrigin(requestOrigin(ctx.request));
  const clear = cookie(OAUTH_COOKIE, '', { maxAge: 0, secure });
  const state = verifyState(ctx.url.searchParams.get('state'));
  const back = (path, outcome) => {
    const sep = path.includes('?') ? '&' : '?';
    return redirect(`${path}${sep}signin=${outcome}`, [clear, ...ctx.cookies]);
  };
  if (!discordEnabled()) return back('/', 'discord-unavailable');
  if (!state) return back('/', 'discord-failed');
  const nonce = parseCookies(ctx.request)[OAUTH_COOKIE];
  if (!nonce || !safeEqual(nonce, state.n)) return back(state.r, 'discord-failed');
  const code = ctx.url.searchParams.get('code');
  if (!code || code.length > 200) return back(state.r, 'discord-cancelled');

  let profile, guilds;
  try {
    const tokenRes = await fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri(ctx.request),
        client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange answered ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();
    profile = await discordFetch('/users/@me', access_token);
    guilds = await discordFetch('/users/@me/guilds', access_token).catch(() => []);
  } catch (e) {
    console.error('discord sign-in failed:', e.message);
    return back(state.r, 'discord-failed');
  }

  await signInWithDiscord(ctx, profile, Array.isArray(guilds) ? guilds : []);
  return back(state.r, 'discord');
}

// Attaches a Discord identity to the session (or switches to the user who already owns it).
export async function signInWithDiscord(ctx, profile, guilds) {
  const discordId = String(profile.id);
  const name = profile.global_name || profile.username || null;
  const existing = (await q('SELECT * FROM users WHERE discord_id = $1', [discordId]))[0];
  const current = await ctx.user();
  let user;
  if (existing) {
    if (current && current.id !== existing.id && current.kind === 'anon') await mergeUsers(current.id, existing.id);
    user = await updateUser(existing.id, { discord_avatar: profile.avatar || null, kind: 'member' });
  } else if (current && !current.discord_id) {
    user = await updateUser(current.id, { discord_id: discordId, discord_avatar: profile.avatar || null, kind: 'member' });
  } else {
    user = await createUser({ kind: 'member', discordId, discordAvatar: profile.avatar || null });
  }
  if (!user.display_name && name) user = await updateUser(user.id, { display_name: String(name).slice(0, 40) });
  user = await adoptHandle(user, profile.username);
  await storeGuilds(user.id, guilds);
  ctx.setSession(user.id);
  ctx._user = await getUser(user.id);
  return ctx._user;
}

export async function storeGuilds(userId, guilds) {
  const list = guilds.filter(g => g && /^\d{1,25}$/.test(String(g.id))).slice(0, 200);
  await q('DELETE FROM user_guilds WHERE user_id = $1', [userId]);
  if (!list.length) return;
  await q(
    `INSERT INTO user_guilds (user_id, guild_id, guild_name, guild_icon)
     SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[]) ON CONFLICT DO NOTHING`,
    [userId, list.map(g => String(g.id)), list.map(g => String(g.name || '').slice(0, 100)), list.map(g => g.icon ? String(g.icon).slice(0, 64) : null)]);
}
