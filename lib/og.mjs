// 1200×630 share cards in the DESIGN.md palette: night floor, moss panel, one tracer-yellow accent.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from '@vercel/og';
import { q } from './db.mjs';
import { HttpError, json } from './http.mjs';
import { achievements, localNow, streak } from './shared.mjs';
import { allRuns } from './runs.mjs';
import { HANDLE, displayNameOf } from './users.mjs';
import { CHALLENGE_ID } from './social.mjs';
import { prettyScenario } from './page.mjs';

const C = { floor: '#1a1f16', panel: '#23291f', line: '#3c4634', yellow: '#ffd35c', ink: '#eeeeee', sage: '#9fb48c' };
let fonts = null;

async function loadFonts() {
  if (fonts) return fonts;
  const dir = path.join(process.cwd(), 'lib', 'fonts');
  const [regular, bold] = await Promise.all([
    readFile(path.join(dir, 'roboto-condensed-400.ttf')), readFile(path.join(dir, 'roboto-condensed-700.ttf')),
  ]);
  fonts = [
    { name: 'Roboto Condensed', data: regular, weight: 400, style: 'normal' },
    { name: 'Roboto Condensed', data: bold, weight: 700, style: 'normal' },
  ];
  return fonts;
}

const h = (type, style, ...children) => ({ type, props: { style, children: children.length === 1 ? children[0] : children } });
const row = (style, ...c) => h('div', { display: 'flex', ...style }, ...c);
const col = (style, ...c) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...c);

function card(kicker, main, footer) {
  return row({ width: 1200, height: 630, background: C.floor, padding: 48, fontFamily: 'Roboto Condensed' },
    col({ flex: 1, background: C.panel, border: `2px solid ${C.line}`, borderRadius: 12, padding: '44px 56px', justifyContent: 'space-between' },
      row({ justifyContent: 'space-between', alignItems: 'center' },
        row({ fontSize: 34, fontWeight: 700, letterSpacing: 3, color: C.ink },
          h('span', {}, 'QUICKSWITCH'), h('span', { color: C.yellow }, '.'), h('span', {}, 'PRO')),
        h('div', { fontSize: 26, color: C.sage, letterSpacing: 2, textTransform: 'uppercase' }, kicker)),
      main,
      h('div', { fontSize: 26, color: C.sage }, footer)));
}

const nameOf = (u) => displayNameOf(u);
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function userByHandle(handle) {
  if (!HANDLE.test(String(handle || '').toLowerCase())) throw new HttpError(404, 'no such player');
  const u = (await q('SELECT * FROM users WHERE handle = $1', [String(handle).toLowerCase()]))[0];
  if (!u) throw new HttpError(404, 'no such player');
  return u;
}

async function profileCard(handle) {
  const u = await userByHandle(handle);
  const runs = await allRuns(u.id);
  const s = streak.computeStreak(streak.completionDays(runs), localNow(u.tz).day);
  const practiceDays = new Set(runs.map(r => r.day).filter(Boolean)).size;
  return card('Practice log',
    col({ gap: 8 },
      h('div', { fontSize: 64, fontWeight: 700, color: C.ink }, clip(nameOf(u), 28)),
      row({ alignItems: 'flex-end', gap: 20 },
        h('div', { fontSize: 180, fontWeight: 700, color: C.yellow, lineHeight: 1 }, String(s.current)),
        h('div', { fontSize: 52, color: C.ink, paddingBottom: 22 }, 'day streak'))),
    `Longest streak ${s.longest} · ${practiceDays} practice day${practiceDays === 1 ? '' : 's'}`);
}

async function achievementCard(handle, id) {
  const def = achievements.DEFS[id];
  if (!def) throw new HttpError(404, 'no such achievement');
  const u = await userByHandle(handle);
  const earned = achievements.evaluate(await allRuns(u.id)).some(a => a.id === id);
  if (!earned) throw new HttpError(404, 'not earned');
  return card('Achievement',
    col({ gap: 18 },
      h('div', { fontSize: 120, fontWeight: 700, color: C.yellow, lineHeight: 1.05 }, clip(def.title, 22)),
      h('div', { fontSize: 44, color: C.ink }, clip(def.desc, 70))),
    `Unlocked by ${clip(nameOf(u), 30)}`);
}

async function challengeCard(id) {
  if (!CHALLENGE_ID.test(String(id || ''))) throw new HttpError(404, 'no such challenge');
  const c = (await q('SELECT c.*, u.handle, u.display_name FROM challenges c JOIN users u ON u.id = c.creator_id WHERE c.id = $1', [id]))[0];
  if (!c) throw new HttpError(404, 'no such challenge');
  return card('Challenge',
    col({ gap: 6 },
      h('div', { fontSize: 52, color: C.ink }, `${clip(nameOf(c), 26)} challenges you`),
      row({ alignItems: 'flex-end', gap: 24 },
        h('div', { fontSize: 60, color: C.ink, paddingBottom: 26 }, 'Beat'),
        h('div', { fontSize: 190, fontWeight: 700, color: C.yellow, lineHeight: 1 }, Math.round(c.score).toLocaleString('en-US'))),
      h('div', { fontSize: 52, color: C.ink }, `on ${clip(prettyScenario(c.scenario), 30)}`)),
    'Same scenario, same seed');
}

// The site's own card, for the home page's link preview.
function siteCard() {
  return card('Aim trainer',
    col({ gap: 18 },
      h('div', { fontSize: 96, fontWeight: 700, color: C.yellow, lineHeight: 1.05 }, 'Train the aim survev needs'),
      h('div', { fontSize: 44, color: C.ink }, 'Top-down drills on survev’s own guns, bullets and spread.')),
    'Free, in the browser, 30 seconds to your first score');
}

export async function renderCard(request) {
  const p = new URL(request.url).searchParams;
  try {
    const kind = p.get('kind');
    const el = kind === 'profile' ? await profileCard(p.get('handle'))
      : kind === 'achievement' ? await achievementCard(p.get('handle'), p.get('id'))
      : kind === 'challenge' ? await challengeCard(p.get('id'))
      : kind === 'site' ? siteCard()
      : null;
    if (!el) throw new HttpError(400, 'kind must be site, profile, achievement or challenge');
    return new ImageResponse(el, {
      width: 1200, height: 630, fonts: await loadFonts(),
      headers: { 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' },
    });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('share card failed:', e && e.message);
    return json({ error: 'internal error' }, 500);
  }
}
