// Smoke test for the trainer against any base URL: the first visit's one button → the briefing →
// the 30-second aim test played by the demo bot → its result → the full results → progress page →
// (if the API answers) a challenge link. tests/e2e/onboarding.mjs walks the rest of the first run.
//
//   node tests/e2e/smoke.mjs http://localhost:8765 [outDir]
//
// Uses patchright + the system Chrome, as demo/record.mjs does. Exits non-zero on any failure or
// on an unexpected console error.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installProbe, playStep } from '../../demo/bot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const out = process.argv[3] || join(here, 'out');
mkdirSync(out, { recursive: true });

function loadChromium() {
  try { return createRequire(import.meta.url)('playwright').chromium; } catch (e) { /* fall through */ }
  const dir = join(homedir(), '.vscode/extensions');
  const dirs = readdirSync(dir).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
  return createRequire(join(dir, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
}
const chromium = loadChromium();
// Runs first in every page: records uncaught errors, rejections and console.error into the DOM.
const CAPTURE = () => {
  const log = (a) => { try { const el = document.documentElement; const arr = JSON.parse(el.dataset.qaErrors || '[]'); arr.push([...a].map(x => x && x.stack ? x.stack.split('\n')[0] : String(x)).join(' ').slice(0, 300)); el.dataset.qaErrors = JSON.stringify(arr); } catch (e) { /* ignore */ } };
  const ce = console.error.bind(console);
  console.error = (...a) => { log(a); ce(...a); };
  addEventListener('error', (e) => log([`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`]));
  addEventListener('unhandledrejection', (e) => log(['unhandled rejection: ', e.reason]));
};
const exe = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// patchright does not report the page's console or uncaught errors, so the page records its own.
await ctx.addInitScript(CAPTURE);
await ctx.addInitScript(() => { try { localStorage.setItem('st.noTrack', '1'); } catch (e) { /* ignore */ } });
const page = await ctx.newPage();
const errors = [];
const pageErrors = async () => JSON.parse(await page.evaluate(() => document.documentElement.dataset.qaErrors || '[]'));

const steps = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    await fn();
    steps.push(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    // Collect per step: a navigation would wipe the page's record.
    errors.push(...(await pageErrors().catch(() => [])).map(e => `${name}: ${e}`));
    await page.evaluate(() => { document.documentElement.dataset.qaErrors = '[]'; }).catch(() => {});
  }
  catch (e) { steps.push(`FAIL ${name}: ${e.message}`); await page.screenshot({ path: join(out, `fail-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {}); throw e; }
};
const visible = (sel) => page.locator(sel).first().waitFor({ state: 'visible', timeout: 15000 });
// Runs code in the page's main world (patchright evaluates in an isolated one).
const mainWorld = (code) => page.evaluate((c) => { const s = document.createElement('script'); s.textContent = c; document.body.appendChild(s); s.remove(); }, code);
const apiUp = async () => page.evaluate(async () => { try { return (await fetch('/api/health')).ok; } catch (e) { return false; } });

let failed = false;
try {
  await step('landing', async () => {
    await page.goto(base + '/', { waitUntil: 'load' });
    await visible('#home');
    await visible('#btn-aimtest');
    await page.waitForTimeout(1800);   // health check settles
    await page.screenshot({ path: join(out, '01-home.png') });
  });
  const online = await apiUp();
  steps.push(`info API ${online ? 'up' : 'down'}`);

  await step('aim test', async () => {
    await page.click('#btn-aimtest');
    await visible('#brief');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await installProbe(page);
    await playStep(page);
    await visible('#aimtest');
    steps.push(`info aim test: ${await page.textContent('#at-score')} · ${await page.textContent('#at-line')}`);
  });

  await step('results headline', async () => {
    await page.click('#at-details');
    await visible('#headline');
    const t = await page.locator('#headline .hl-title').innerText();
    if (!t.trim()) throw new Error('empty headline');
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('st.history') || '[]').length);
    if (n < 1) throw new Error('run not recorded');
    steps.push(`info headline: ${t.trim()} · ${n} run(s) recorded`);
    await page.screenshot({ path: join(out, '02-results.png') });
  });

  await step('progress page', async () => {
    await page.click('#btn-menu');
    await visible('#home');
    await mainWorld(`ST.router.go('/profile')`);
    await visible('#profile');
    await page.waitForTimeout(500);
    const drawn = await page.evaluate(() => { const c = document.getElementById('pf-calendar'); return c.width > 0 && c.height > 0; });
    if (!drawn) throw new Error('calendar not drawn');
    await page.screenshot({ path: join(out, '03-progress.png'), fullPage: true });
    await page.goBack();
    await visible('#home');
  });

  if (online) {
    await step('challenge create', async () => {
      await mainWorld(`ST.app.startScenario('staticClick')`);
      await page.waitForTimeout(600);
      await installProbe(page);
      await playStep(page);
      await visible('#results');
      await page.locator('#headline [data-challenge]').first().click();
      await visible('#ch-link');
      const url = await page.inputValue('#ch-link');
      if (!/\/c\/[A-Za-z0-9]+$/.test(url)) throw new Error('bad challenge url ' + url);
      steps.push('info challenge ' + url);
      await page.screenshot({ path: join(out, '04-challenge-link.png') });
      await page.click('#overlay-close');
      errors.push(...(await pageErrors()).map(e => `challenge create: ${e}`));
      await page.goto(url);
      await visible('#challenge');
      await page.locator('#ch-start:not([disabled])').waitFor({ timeout: 10000 });
      await page.screenshot({ path: join(out, '05-challenge-landing.png') });
    });
  }
} catch (e) { failed = true; }

errors.push(...await pageErrors().catch(() => []));
if (errors.length) { failed = true; steps.push(...errors.map(e => 'ERR  ' + e)); }
console.log(steps.join('\n'));
console.log(failed ? 'SMOKE FAILED' : 'SMOKE PASSED', '· screenshots in', out);
// The server user this run created, for tests/e2e/cleanup.mjs.
const me = await page.evaluate(async () => { try { const r = await fetch('/api/me', { credentials: 'include' }); return (await r.json()).user; } catch (e) { return null; } }).catch(() => null);
writeFileSync(join(out, 'created-users.json'), JSON.stringify(me ? [me.id] : []));
await browser.close();
process.exit(failed ? 1 : 0);
