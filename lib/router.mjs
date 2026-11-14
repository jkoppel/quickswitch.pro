// Every /api/* call lands here (vercel.json rewrites to api/index.mjs).
import { kpis } from './admin.mjs';
import { digestIfDue, sendDigest } from './digest.mjs';
import { makeContext } from './context.mjs';
import * as discord from './discord.mjs';
import { emailEnabled, startEmail, verifyEmail } from './email.mjs';
import { recordEvents, recordFeedback } from './events.mjs';
import { HttpError, bearer, json, readJson, safeEqual } from './http.mjs';
import { publicKey, runReminders, subscribe, unsubscribe } from './push.mjs';
import { listRuns, upsertRuns } from './runs.mjs';
import { clearSessionCookie } from './session.mjs';
import { boards, createChallenge, getChallenge, profile, submitChallengeResult } from './social.mjs';
import { me, touch, updateUser, validatePatch } from './users.mjs';
import { castVote, tallies } from './votes.mjs';

const RUNS_BODY_CAP = 1024 * 1024;

function requireToken(request, envName) {
  const expected = process.env[envName];
  if (!expected || !safeEqual(bearer(request), expected)) throw new HttpError(401, 'unauthorized');
}

const routes = [
  ['GET', 'health', async () => ({ ok: true, signIn: { discord: discord.discordEnabled(), email: emailEnabled() } })],

  ['POST', 'session', async (ctx) => {
    const existing = await ctx.user();
    const user = existing || await ctx.ensureUser();
    if (existing) await touch(existing.id);
    return { user: await me(user) };
  }],

  ['GET', 'me', async (ctx) => {
    const user = await ctx.user();
    if (user) await touch(user.id);
    return { user: await me(user) };
  }],

  ['PATCH', 'me', async (ctx) => {
    const user = await ctx.user();
    if (!user) throw new HttpError(401, 'no session');
    const set = validatePatch(await readJson(ctx.request));
    return { user: await me(await updateUser(user.id, set)) };
  }],

  ['GET', 'auth/discord/start', (ctx) => discord.start(ctx)],
  ['GET', 'auth/discord/callback', (ctx) => discord.callback(ctx)],
  ['POST', 'auth/email/start', async (ctx) => startEmail(ctx, await readJson(ctx.request, 4 * 1024))],
  ['POST', 'auth/email/verify', async (ctx) => {
    const r = await verifyEmail(ctx, await readJson(ctx.request, 4 * 1024));
    return { user: await me(r.user), merged: r.merged };
  }],
  ['POST', 'auth/logout', async (ctx) => { ctx.cookies.push(clearSessionCookie(ctx.request)); return { ok: true }; }],

  ['POST', 'runs', async (ctx) => {
    const body = await readJson(ctx.request, RUNS_BODY_CAP);
    const user = await ctx.ensureUser();
    return { accepted: await upsertRuns(user.id, body.runs) };
  }],
  ['GET', 'runs', async (ctx) => {
    const user = await ctx.user();
    return { runs: user ? await listRuns(user.id, ctx.url.searchParams.get('since')) : [] };
  }],

  ['GET', 'users/:handle', (ctx) => profile(ctx.params.handle)],

  ['POST', 'challenges', async (ctx) => createChallenge(ctx, await readJson(ctx.request))],
  ['GET', 'challenges/:id', (ctx) => getChallenge(ctx.params.id)],
  ['POST', 'challenges/:id/result', async (ctx) => submitChallengeResult(ctx, ctx.params.id, await readJson(ctx.request))],

  ['GET', 'boards', (ctx) => boards(ctx)],

  ['GET', 'push/key', () => publicKey()],
  ['POST', 'push/subscribe', async (ctx) => subscribe(ctx, await readJson(ctx.request))],
  ['POST', 'push/unsubscribe', async (ctx) => unsubscribe(await readJson(ctx.request))],

  ['POST', 'feedback', async (ctx) => recordFeedback(ctx, await readJson(ctx.request, 16 * 1024))],
  ['POST', 'e', async (ctx) => recordEvents(ctx, await readJson(ctx.request, 128 * 1024))],

  // The hourly tick (24 daily crons in vercel.json): reminders, and the usage report when it is
  // 8 am for its reader.
  ['GET', 'cron/hourly', async (ctx) => {
    requireToken(ctx.request, 'CRON_SECRET');
    const p = ctx.url.searchParams;
    const now = p.get('now') ? new Date(p.get('now')) : new Date();
    if (Number.isNaN(now.getTime())) throw new HttpError(400, 'invalid now');
    const dryRun = p.get('dry') === '1';
    const report = await runReminders({ now, dryRun });
    let digest;
    try { digest = await digestIfDue({ now, dryRun }); } catch (e) { console.error('digest failed:', e.message); digest = { error: e.message }; }
    return { ...report, decisions: report.decisions.length, digest };
  }],
  ['GET', 'cron/digest', async (ctx) => {
    requireToken(ctx.request, 'CRON_SECRET');
    const p = ctx.url.searchParams;
    return sendDigest({ day: p.get('day') || undefined, dryRun: p.get('dry') === '1' });
  }],
  ['GET', 'votes', async (ctx) => { const u = await ctx.user(); return tallies(u && u.id); }],
  ['POST', 'votes', async (ctx) => castVote(ctx, await readJson(ctx.request))],
  ['GET', 'admin/kpis', async (ctx) => { requireToken(ctx.request, 'ADMIN_TOKEN'); return kpis({ tz: ctx.url.searchParams.get('tz') || 'UTC' }); }],
].map(([method, pattern, fn]) => {
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
  return { method, re, names, fn };
});

// The API path without the /api/ prefix. Rewrites pass it as ?__path=; direct hits use the pathname.
export function apiPath(url) {
  const fromRewrite = url.searchParams.get('__path');
  if (fromRewrite !== null) { url.searchParams.delete('__path'); return fromRewrite.replace(/^\/+|\/+$/g, ''); }
  return url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
}

export async function handle(request) {
  const url = new URL(request.url);
  const path = apiPath(url);
  let matchedPath = false;
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    matchedPath = true;
    if (r.method !== request.method) continue;
    const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    const ctx = makeContext(request, url, params);
    try {
      const out = await r.fn(ctx);
      if (out instanceof Response) return out;
      const res = json(out);
      for (const c of ctx.cookies) res.headers.append('set-cookie', c);
      return res;
    } catch (e) {
      if (e instanceof HttpError) {
        const res = json({ error: e.message }, e.status);
        for (const c of ctx.cookies) res.headers.append('set-cookie', c);
        return res;
      }
      console.error(`${request.method} /api/${path} failed:`, e && e.message);
      return json({ error: 'internal error' }, 500);
    }
  }
  return json({ error: matchedPath ? 'method not allowed' : 'not found' }, matchedPath ? 405 : 404);
}
