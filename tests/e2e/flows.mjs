// End-to-end check of the account and social flows against a deployed (or `vercel dev`) URL:
// challenge with a name → a second browser plays it → friendship on the boards → sign-in sheet
// offers email and Discord → survev panel for a real player. Prints the ids of the users it created so
// they can be removed afterwards (tests/e2e/cleanup.mjs).
//
//   node tests/e2e/flows.mjs https://quickswitch.pro [outDir] [survevSlug]
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://localhost:3210').replace(/\/$/, '');
const out = process.argv[3] || join(here, 'out-flows');
const slug = process.argv[4] || '6kat7';
mkdirSync(out, { recursive: true });

function loadChromium() {
  try { return createRequire(import.meta.url)('playwright').chromium; } catch (e) { /* fall through */ }
  const dir = join(homedir(), '.vscode/extensions');
  const dirs = readdirSync(dir).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
  return createRequire(join(dir, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
}
const chromium = loadChromium();
const exe = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });

const CAPTURE = () => {
  const log = (a) => { try { const el = document.documentElement; const arr = JSON.parse(el.dataset.qaErrors || '[]'); arr.push([...a].map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' ') : String(x)).join(' ').slice(0, 500)); el.dataset.qaErrors = JSON.stringify(arr); } catch (e) { /* ignore */ } };
  const ce = console.error.bind(console);
  console.error = (...a) => { log(a); ce(...a); };
  addEventListener('error', (e) => log([`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`]));
  addEventListener('unhandledrejection', (e) => log(['unhandled rejection: ', e.reason]));
};

async function newPlayer() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(CAPTURE);
  // The pre-run briefing has its own e2e (onboarding.mjs); skip it so a challenge starts at once.
  await ctx.addInitScript(() => { try { localStorage.setItem('st.noTrack', '1'); localStorage.setItem('st.briefed', 'true'); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  const mainWorld = (code) => page.evaluate((c) => { const s = document.createElement('script'); s.textContent = c; document.body.appendChild(s); s.remove(); }, code);
  const api = (method, path, body) => page.evaluate(async ([m, p, b]) => {
    const r = await fetch(p, { method: m, credentials: 'include', headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [method, path, body]);
  const errors = async () => JSON.parse(await page.evaluate(() => document.documentElement.dataset.qaErrors || '[]'));
  return { ctx, page, mainWorld, api, errors };
}

const created = new Set();
const log = [];
const ok = (m) => { log.push(`ok   ${m}`); console.log(`ok   ${m}`); };
const fail = (m) => { log.push(`FAIL ${m}`); console.log(`FAIL ${m}`); throw new Error(m); };
const visible = (page, sel, timeout = 15000) => page.locator(sel).first().waitFor({ state: 'visible', timeout });

let exitCode = 0;
try {
  // ---------- A: a Benchmark result becomes a named challenge ----------
  const A = await newPlayer();
  await A.page.goto(base + '/', { waitUntil: 'load' });
  await visible(A.page, '#home');
  await A.page.waitForTimeout(1500);
  await A.mainWorld(`(() => {
    const r = ST.history.add({ key: 'staticClick:v' + ST.BENCHMARK_VERSION, label: 'Static clicking', scenario: 'staticClick',
      seed: 424242, score: 57, duration: 30, hitsPerSec: 0.6, accuracy: 0.9, warmup: false, benchmark: true });
    document.body.dataset.qaRun = r.id;
  })()`);
  const runId = await A.page.evaluate(() => document.body.dataset.qaRun);
  await A.mainWorld(`ST.challenge.create(${JSON.stringify(runId)})`);
  await visible(A.page, '#ch-name');
  await A.page.fill('#ch-name', 'QA Alpha');
  await A.page.click('[data-act="copy"]');
  await A.page.waitForTimeout(1200);
  const link = await A.page.inputValue('#ch-link');
  const meA = (await A.api('GET', '/api/me')).json.user;
  created.add(meA.id);
  if (meA.displayName !== 'QA Alpha') fail(`challenge name not saved (${meA.displayName})`);
  if (!/\/c\/[0-9A-Za-z]{8}$/.test(link)) fail(`bad challenge link ${link}`);
  await A.page.screenshot({ path: join(out, '01-challenge-sheet.png') });
  ok(`challenge created with a name: ${link}`);

  // ---------- B: a stranger opens the link and plays it ----------
  const B = await newPlayer();
  await B.page.goto(link, { waitUntil: 'load' });
  await visible(B.page, '#ch-start');
  await B.page.waitForFunction(() => !document.getElementById('ch-start').disabled, null, { timeout: 15000 });
  const sub = await B.page.textContent('#ch-sub');
  if (!/QA Alpha/.test(sub)) fail(`landing does not name the challenger: ${sub}`);
  await B.page.screenshot({ path: join(out, '02-landing.png') });
  ok('landing names the challenger');
  await B.page.click('#ch-start');
  await visible(B.page, '#results', 60000);
  await B.page.waitForTimeout(2500);
  await B.page.screenshot({ path: join(out, '03-challenge-results.png') });
  const meB = (await B.api('GET', '/api/me')).json.user;
  if (!meB) fail('challenger B has no server user after playing');
  created.add(meB.id);
  const boardsB = (await B.api('GET', '/api/boards')).json;
  const friendNames = (boardsB.friends.streak || []).map(r => r.displayName);
  if (!friendNames.includes('QA Alpha')) fail(`B's friends board lacks QA Alpha: ${JSON.stringify(boardsB.friends)}`);
  ok('playing the challenge made them friends');
  const ch = (await B.api('GET', '/api/challenges/' + link.split('/').pop())).json;
  if (!ch.results || !ch.results.length) fail('challenge has no results');
  ok(`challenge results recorded (${ch.results.length})`);

  // ---------- A: the sign-in sheet offers email and Discord, nothing else ----------
  await A.page.goto(base + '/', { waitUntil: 'load' });
  await A.page.waitForTimeout(1500);
  await A.page.click('#btn-account');
  await visible(A.page, '#overlay [data-act="email"]');
  const acts = await A.page.$$eval('#overlay-body [data-act]', (bs) => bs.map(b => b.dataset.act));
  if (acts.join() !== 'discord,email') fail(`sign-in sheet offers ${acts.join()}, want discord,email`);
  await A.page.screenshot({ path: join(out, '03b-sign-in-sheet.png') });
  await A.page.click('#overlay-close');
  const meA2 = (await A.api('GET', '/api/me')).json.user;
  if (!meA2.tz) fail('time zone never reached the server');
  ok('sign-in sheet offers Discord and email only');

  // ---------- A: survev panel with a real player ----------
  await A.page.goto(base + '/profile', { waitUntil: 'load' });
  await visible(A.page, '[data-survev-form] input');
  await A.page.fill('[data-survev-form] input', slug);
  await A.page.click('[data-survev-form] button');
  await A.page.waitForTimeout(6000);
  const panel = await A.page.textContent('#pf-survev-body');
  await A.page.locator('#pf-survev-body').scrollIntoViewIfNeeded();
  await A.page.screenshot({ path: join(out, '04-survev-panel.png') });
  if (!/damage|game/i.test(panel)) fail(`survev panel did not load matches: ${panel.slice(0, 200)}`);
  ok('survev panel shows real matches');
  await A.page.locator('#pf-name').scrollIntoViewIfNeeded();
  await A.page.screenshot({ path: join(out, '05-profile-top.png') });

  for (const [who, p] of [['A', A], ['B', B]]) {
    const errs = await p.errors();
    if (errs.length) fail(`${who} page errors: ${errs.join(' | ')}`);
  }
  ok('no page errors');
} catch (e) {
  exitCode = 1;
  if (!log.some(l => l.startsWith('FAIL'))) console.log(`FAIL ${e.message}`);
} finally {
  writeFileSync(join(out, 'created-users.json'), JSON.stringify([...created]));
  console.log(`created users: ${[...created].join(' ')}`);
  await browser.close();
  process.exit(exitCode);
}
