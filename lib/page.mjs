// index.html with Open Graph tags for shared profile and challenge links.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { q } from './db.mjs';
import { requestOrigin } from './http.mjs';
import { localNow, streak } from './shared.mjs';
import { HANDLE, displayNameOf } from './users.mjs';
import { CHALLENGE_ID } from './social.mjs';

const SITE = 'Quickswitch';
let template = null;

async function indexHtml() {
  if (!template) template = await readFile(path.join(process.cwd(), 'index.html'), 'utf8');
  return template;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Scenario names as the app shows them (js/benchmark.js); the fallback splits an unknown id.
export const SCENARIO_NAMES = {
  warmup: 'Warm-up tracking', staticClick: 'Static clicking', precisionClick: 'Precision clicking',
  dynamicClick: 'Dynamic clicking', preciseTrack: 'Precise tracking', reactiveTrack: 'Reactive tracking',
  speedSwitch: 'Speed switching', evasiveSwitch: 'Evasive switching', chase: 'Chase', dodge: 'Dodge under fire',
  quickSwitch: 'Quick switching', fragLob: 'Frag lobbing', bankShot: 'Bank shots', spinDodge: 'Spin dodge',
};
export function prettyScenario(id) {
  if (SCENARIO_NAMES[id]) return SCENARIO_NAMES[id];
  return String(id).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

// Tags for a page; `meta` is null when the target does not exist (the app shows its own not-found).
export async function metaFor({ handle, challenge }) {
  if (handle && HANDLE.test(handle.toLowerCase())) {
    const u = (await q('SELECT id, handle, display_name, tz FROM users WHERE handle = $1', [handle.toLowerCase()]))[0];
    if (!u) return null;
    const days = await q('SELECT DISTINCT day::text AS day FROM runs WHERE user_id = $1 AND routine_completed', [u.id]);
    const s = streak.computeStreak(days.map(d => d.day), localNow(u.tz).day);
    const name = displayNameOf(u);
    return {
      title: `${name} on ${SITE}`,
      description: s.current > 0 ? `${s.current}-day practice streak. Top-down aim drills on survev's own weapon rules.` : `Top-down aim drills on survev's own weapon rules.`,
      image: `/api/og?kind=profile&handle=${encodeURIComponent(u.handle)}`,
    };
  }
  if (challenge && CHALLENGE_ID.test(challenge)) {
    const c = (await q(`SELECT c.id, c.scenario, c.score, u.handle, u.display_name FROM challenges c JOIN users u ON u.id = c.creator_id WHERE c.id = $1`, [challenge]))[0];
    if (!c) return null;
    const name = displayNameOf(c, 'A friend');
    return {
      title: `${name} challenges you: beat ${Math.round(c.score).toLocaleString('en-US')} on ${prettyScenario(c.scenario)}`,
      description: `Same scenario, same seed. ${SITE}: top-down aim drills on survev's own weapon rules.`,
      image: `/api/og?kind=challenge&id=${c.id}`,
      noindex: true,   // a challenge is a link for one friend, not a page for search
    };
  }
  return null;
}

export function inject(html, origin, meta, pageUrl) {
  let head = '<base href="/">';
  if (meta) {
    // The template carries the site's own card; a profile or challenge page replaces it.
    html = html.replace(/[ \t]*<meta (?:property="og:|name="twitter:)[^>]*>\n?/g, '');
    // The template names the home page as canonical; a profile is its own page.
    html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(pageUrl)}">`);
    const img = origin + meta.image;
    head += [
      meta.noindex ? `<meta name="robots" content="noindex">` : '',
      `<meta property="og:site_name" content="${escapeHtml(SITE)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
      `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
      `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
      `<meta property="og:image" content="${escapeHtml(img)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${escapeHtml(meta.title)}">`,
      `<meta name="twitter:image" content="${escapeHtml(img)}">`,
    ].join('');
  }
  // Base first, so relative stylesheet and script URLs resolve from the root under /u/ and /c/.
  return html.replace(/<head>/i, `<head>${head}`);
}

export async function renderPage(request) {
  const url = new URL(request.url);
  let handle = url.searchParams.get('u');
  let challenge = url.searchParams.get('c');
  const m = /^\/(u|c)\/([^/]+)\/?$/.exec(url.pathname);
  if (m && !handle && !challenge) { if (m[1] === 'u') handle = decodeURIComponent(m[2]); else challenge = decodeURIComponent(m[2]); }
  const origin = requestOrigin(request);
  let meta = null;
  try { meta = await metaFor({ handle, challenge }); } catch (e) { console.error('page meta failed:', e.message); }
  const pagePath = handle ? `/u/${encodeURIComponent(handle)}` : challenge ? `/c/${encodeURIComponent(challenge)}` : '/';
  const html = inject(await indexHtml(), origin, meta, origin + pagePath);
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600' },
  });
}
