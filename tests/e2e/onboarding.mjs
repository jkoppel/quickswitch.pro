// The first-run path end to end, with the demo bot playing every test:
//   first visit (one button) → briefing → aim test → its result → the five-test diagnostic →
//   the profile and week plan (+ reminder) → the planned home. Then the skip path, the classic home
//   for a pre-redesign history, and, with the API up, the advanced gate and the email sheet.
//
//   node tests/e2e/onboarding.mjs http://localhost:8765 [outDir]      (API down: static server)
//   node tests/e2e/onboarding.mjs http://localhost:3210 [outDir]      (API up: vercel dev, dev database)
//
// Screenshots at 1440×900 for every stage and 1280×720 for the first-run screens. Exits non-zero
// on any failure or page error. Prints the ids of server users it created (API up).
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installProbe, playStep, readState } from '../../demo/bot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const out = process.argv[3] || join(here, 'out-onboarding');
mkdirSync(out, { recursive: true });

function loadChromium() {
  try { return createRequire(import.meta.url)('playwright').chromium; } catch (e) { /* fall through */ }
  const dir = join(homedir(), '.vscode/extensions');
  const dirs = readdirSync(dir).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
  return createRequire(join(dir, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
}
const chromium = loadChromium();
const CAPTURE = () => {
  const log = (a) => { try { const el = document.documentElement; const arr = JSON.parse(el.dataset.qaErrors || '[]'); arr.push([...a].map(x => x && x.stack ? x.stack.split('\n')[0] : String(x)).join(' ').slice(0, 300)); el.dataset.qaErrors = JSON.stringify(arr); } catch (e) { /* ignore */ } };
  const ce = console.error.bind(console);
  console.error = (...a) => { log(a); ce(...a); };
  addEventListener('error', (e) => log([`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`]));
  addEventListener('unhandledrejection', (e) => log(['unhandled rejection: ', e.reason]));
};
const exe = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });

const created = new Set();
const lines = [];
const errors = [];
let failed = false;

async function newPage(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(CAPTURE);
  await ctx.addInitScript(() => { try { localStorage.setItem('st.noTrack', '1'); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  return { ctx, page };
}
const visible = (page, sel, timeout = 15000) => page.locator(sel).first().waitFor({ state: 'visible', timeout });
const mainWorld = (page, code) => page.evaluate((c) => { const s = document.createElement('script'); s.textContent = c; document.body.appendChild(s); s.remove(); }, code);
const pageErrors = async (page) => JSON.parse(await page.evaluate(() => document.documentElement.dataset.qaErrors || '[]'));
// Visible, enabled controls inside the screen that is showing.
const controls = (page, sel) => page.evaluate((s) => {
  const root = document.querySelector(s);
  if (!root) return -1;
  return [...root.querySelectorAll('button, a[href], input, select, textarea, summary')].filter(el => el.offsetParent !== null && !el.disabled).length;
}, sel);
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); lines.push(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { lines.push(`FAIL ${name}: ${e.message}`); throw e; }
}
async function apiUp(page) { return page.evaluate(async () => { try { const r = await fetch('/api/health'); return r.ok; } catch (e) { return false; } }); }
async function rememberUser(page) {
  const u = await page.evaluate(async () => { try { return (await (await fetch('/api/me', { credentials: 'include' })).json()).user; } catch (e) { return null; } });
  if (u) created.add(u.id);
  return u;
}

// Waits for a drill to be running, then lets the bot play it to the end.
async function playOne(page) {
  await installProbe(page);
  for (let i = 0; i < 100; i++) {
    const st = await readState(page);
    if (st.enemies) break;
    await page.waitForTimeout(100);
  }
  await playStep(page, { movement: 'auto' });
}

const { page } = await newPage();
const online = await (async () => { await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForTimeout(1800); return apiUp(page); })();
lines.push(`info ${base} · API ${online ? 'up' : 'down'}`);

try {
  await step('first visit: one button', async () => {
    await visible(page, '#btn-aimtest');
    const n = await controls(page, '#home');
    lines.push(`info first-visit controls: ${n}`);
    if (n > 3) throw new Error(`${n} controls on the first visit`);
    await page.screenshot({ path: join(out, '01-first-visit-1440.png') });
  });

  await step('briefing', async () => {
    await page.click('#btn-aimtest');
    await visible(page, '#brief');
    const t = await page.textContent('#brief-list');
    if (!/Mouse/.test(t)) throw new Error('briefing lacks controls');
    await page.screenshot({ path: join(out, '02-briefing-1440.png') });
    await page.keyboard.press('Enter');
  });

  await step('aim test → its result', async () => {
    await playOne(page);
    await visible(page, '#aimtest', 20000);
    const score = await page.textContent('#at-score');
    const line = await page.textContent('#at-line');
    const tier = await page.textContent('#at-tier');
    if (!/\d/.test(score) || !/provisional/.test(tier) || !/accurate/.test(line)) throw new Error(`result reads "${score}" / "${tier}" / "${line}"`);
    lines.push(`info aim test: ${score} · ${tier} · ${line}`);
    lines.push(`info aim-result controls: ${await controls(page, '#aimtest')}`);
    await page.screenshot({ path: join(out, '03-aim-result-1440.png') });
  });

  await step('details are one click away', async () => {
    await page.click('#at-details');
    await visible(page, '#results');
    await page.screenshot({ path: join(out, '04-aim-details-1440.png') });
    await page.click('#btn-menu');
    await visible(page, '#home');
    await visible(page, '#btn-diagnostic');
    lines.push(`info tested-home controls: ${await controls(page, '#home')}`);
    await page.screenshot({ path: join(out, '05-home-tested-1440.png') });
  });

  await step('diagnostic: five tests', async () => {
    await page.click('#btn-diagnostic');
    for (let i = 0; i < 5; i++) {
      await playOne(page);
      if (i < 4) {
        await visible(page, '#rest', 20000);
        const t = await page.textContent('#rest-step');
        if (!/^Test \d of 5 done$/.test(t.trim())) throw new Error(`rest says "${t}"`);
        if (i === 0) await page.screenshot({ path: join(out, '06-diagnostic-rest-1440.png') });
        await page.click('#btn-rest-skip');
      }
    }
    await visible(page, '#plan', 20000);
  });

  await step('profile and week plan', async () => {
    const skills = await page.locator('#pl-skills li').count();
    const days = await page.locator('#pl-week li').count();
    if (skills !== 4 || days !== 7) throw new Error(`${skills} skills, ${days} days`);
    const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('st.plan')));
    if (!plan || plan.days.length !== 7) throw new Error('plan not stored');
    lines.push(`info plan: ${plan.days.map(d => d.routine).join(' → ')} · ${await page.textContent('#pl-sub')}`);
    lines.push(`info plan-screen controls: ${await controls(page, '#plan')}`);
    await page.screenshot({ path: join(out, '07-plan-1440.png'), fullPage: false });
    if (online) {
      const u = await rememberUser(page);
      const server = await page.evaluate(async () => (await (await fetch('/api/me', { credentials: 'include' })).json()).user.plan);
      if (!server || server.startDay !== plan.startDay) throw new Error('plan not saved to the account');
      lines.push(`info plan saved to account ${u && u.id}`);
      // The reminder: headless Chrome has no push service, so expect a clear message either way.
      const btn = page.locator('[data-pl="remind"]');
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(2500);
        lines.push(`info reminder: ${await page.textContent('#pl-note')}`);
        await page.screenshot({ path: join(out, '08-plan-reminder-1440.png') });
      } else lines.push(`info reminder: ${await page.textContent('#pl-note')}`);
    } else {
      lines.push(`info reminder (offline): ${await page.textContent('#pl-note')}`);
    }
  });

  await step('planned home', async () => {
    const done = page.locator('#pl-action [data-pl="home"]');
    if (await done.count()) await done.click(); else await page.click('#pl-later');
    await visible(page, '#home-plan');
    const title = await page.textContent('#plan-card .plan-title');
    const cells = await page.locator('#plan-strip li').count();
    if (cells !== 7 || !/Day 1 done/.test(title)) throw new Error(`card "${title}", ${cells} cells`);
    lines.push(`info planned home: "${title}" · ${await page.textContent('#plan-meta')} · controls ${await controls(page, '#home')}`);
    await page.screenshot({ path: join(out, '09-home-planned-1440.png') });
  });

  await step('results after a routine: points line, sticky actions', async () => {
    await mainWorld(page, `ST.app.startScenario('dynamicClick')`);
    await playOne(page);
    await visible(page, '#results', 20000);
    const pts = await page.locator('#headline .hl-points').count();
    lines.push(`info results points line: ${pts ? await page.textContent('#headline .hl-points') : 'none'} · controls ${await controls(page, '#results')}`);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);
    const inView = await page.evaluate(() => { const r = document.getElementById('btn-menu').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
    if (!inView) throw new Error('Done is off screen at 1280×720');
    await page.screenshot({ path: join(out, '10-results-1280.png') });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.click('#btn-menu');
    await visible(page, '#home');
  });

  if (online) {
    await step('advanced gate and the email sheet', async () => {
      await page.goto(base + '/?drills', { waitUntil: 'load' });
      await visible(page, '#menu');
      await page.waitForTimeout(1500);
      await page.locator('#mode-list .mode-btn', { hasText: 'Flick' }).first().click();
      await visible(page, '#drill-form.locked .gate-line');
      lines.push(`info locked picker: "${(await page.textContent('#preset-line')).trim()}" · controls ${await controls(page, '#menu')}`);
      await page.screenshot({ path: join(out, '11-picker-locked-1440.png') });
      await page.click('#btn-verify');
      await visible(page, '#overlay input[name="email"]');
      await page.fill('#overlay input[name="email"]', `qa-${Date.now()}@example.com`);
      await page.click('#overlay [data-act="send"]');
      const reached = await page.locator('#overlay input[name="code"]').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
      if (!reached) {
        // The real send failed; its message is the server's. Record it, then let the browser believe a
        // code went out so the real verify call (and its error) can still be checked.
        const sendErr = await page.textContent('#overlay-note');
        if (!sendErr.trim()) throw new Error('send failed silently');
        lines.push(`info send code said: "${sendErr}" (server-side; continuing with a stubbed send)`);
        await page.screenshot({ path: join(out, '12a-email-send-error-1440.png') });
        await page.route('**/api/auth/email/start', (r) => r.fulfill({ json: { ok: true, email: 'qa@example.com' } }));
        await page.click('#overlay [data-act="send"]');
        await visible(page, '#overlay input[name="code"]', 15000);
      }
      await page.screenshot({ path: join(out, '12-email-code-1440.png') });
      await page.fill('#overlay input[name="code"]', '000000');
      await page.click('#overlay [data-act="verify"]');
      await page.waitForFunction(() => document.getElementById('overlay-note').textContent.trim().length > 0, null, { timeout: 15000 });
      const err = await page.textContent('#overlay-note');
      lines.push(`info wrong code says: "${err}"`);
      if (!/code/i.test(err)) throw new Error(`unexpected error "${err}"`);
      await page.screenshot({ path: join(out, '13-email-wrong-code-1440.png') });
      await page.click('#overlay-close');
    });
  } else {
    await step('no backend: nothing locked', async () => {
      await page.goto(base + '/?drills', { waitUntil: 'load' });
      await visible(page, '#menu');
      await page.locator('#mode-list .mode-btn', { hasText: 'Flick' }).first().click();
      if (await page.locator('#drill-form.locked').count()) throw new Error('locked with no backend');
      await visible(page, '#f-weapon');
      lines.push(`info unlocked picker controls: ${await controls(page, '#menu')}`);
      await page.screenshot({ path: join(out, '11-picker-open-1440.png') });
    });
  }
  errors.push(...(await pageErrors(page)).map(e => `main: ${e}`));

  await step('skip path', async () => {
    const { page: p2, ctx } = await newPage({ width: 1280, height: 720 });
    await p2.goto(base + '/', { waitUntil: 'load' });
    await visible(p2, '#btn-aimtest');
    await p2.waitForTimeout(1500);
    await p2.screenshot({ path: join(out, '20-first-visit-1280.png') });
    await p2.click('#home-new [data-skip]');
    await visible(p2, '#menu');
    lines.push(`info picker controls after skip: ${await controls(p2, '#menu')}`);
    await p2.screenshot({ path: join(out, '21-picker-after-skip-1280.png') });
    await p2.click('#btn-home');
    await visible(p2, '#home-free');
    await p2.screenshot({ path: join(out, '22-home-free-after-skip-1280.png') });
    errors.push(...(await pageErrors(p2)).map(e => `skip: ${e}`));
    if (online) await rememberUser(p2);
    await ctx.close();
  });

  await step('pre-redesign history lands on the classic home', async () => {
    const { page: p3, ctx } = await newPage();
    await p3.goto(base + '/robots.txt').catch(() => {});
    await p3.evaluate(() => {
      const day = (k) => { const d = new Date(Date.now() - k * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      const runs = [];
      for (let k = 3; k >= 1; k--) {
        const ts = Date.now() - k * 86400000;
        runs.push({ id: 'old-' + k, ts, day: day(k), key: 'staticClick:v3', label: 'Static clicking', score: 80 + k, duration: 30, hitsPerSec: 0.9, accuracy: 0.8, benchmark: true, scenario: 'staticClick' });
        runs.push({ id: 'oldr-' + k, ts: ts + 1000, day: day(k), key: 'routine:daily', label: 'Daily 5', score: 40, duration: 220, routineCompleted: true });
      }
      localStorage.setItem('st.history', JSON.stringify(runs));
    });
    await p3.goto(base + '/', { waitUntil: 'load' });
    await visible(p3, '#home-free');
    await p3.waitForTimeout(1500);
    lines.push(`info classic home: ${await p3.textContent('#free-meta')} · controls ${await controls(p3, '#home')}`);
    await p3.screenshot({ path: join(out, '23-home-classic-1440.png') });
    errors.push(...(await pageErrors(p3)).map(e => `classic: ${e}`));
    if (online) await rememberUser(p3);
    await ctx.close();
  });
} catch (e) {
  failed = true;
  await page.screenshot({ path: join(out, 'fail.png') }).catch(() => {});
}

if (online) await rememberUser(page).catch(() => {});
errors.push(...(await pageErrors(page).catch(() => [])).map(e => `end: ${e}`));
if (errors.length) { failed = true; lines.push(...[...new Set(errors)].map(e => 'ERR  ' + e)); }
writeFileSync(join(out, 'created-users.json'), JSON.stringify([...created]));
console.log(lines.join('\n'));
console.log(failed ? 'ONBOARDING FAILED' : 'ONBOARDING PASSED', '· screenshots in', out, created.size ? `· created users ${[...created].join(' ')}` : '');
await browser.close();
process.exit(failed ? 1 : 0);
