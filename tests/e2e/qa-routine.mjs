// QA for the habit loop: a Daily 5 shortened to ten seconds per step, played by the demo bot,
// so the "streak started" headline, the save-your-streak prompt and the home streak can be seen.
//
//   node tests/e2e/qa-routine.mjs http://localhost:3210 [outDir]
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installProbe, playStep, readState } from '../../demo/bot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const out = process.argv[3] || join(here, 'out');
mkdirSync(out, { recursive: true });
const dir = join(homedir(), '.vscode/extensions');
const dirs = readdirSync(dir).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
const chromium = createRequire(join(dir, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// patchright does not report page errors; the page records its own.
await ctx.addInitScript(() => {
  const log = (a) => { try { const el = document.documentElement; const arr = JSON.parse(el.dataset.qaErrors || '[]'); arr.push([...a].map(x => x && x.stack ? x.stack.split('\n')[0] : String(x)).join(' ').slice(0, 300)); el.dataset.qaErrors = JSON.stringify(arr); } catch (e) { /* ignore */ } };
  const ce = console.error.bind(console);
  console.error = (...a) => { log(a); ce(...a); };
  addEventListener('error', (e) => log([`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`]));
  addEventListener('unhandledrejection', (e) => log(['unhandled rejection: ', e.reason]));
});
// These scripts test routines and the social screens, not the first run: start on the classic home,
// past the pre-run briefing (onboarding.mjs covers it).
await ctx.addInitScript(() => { try { localStorage.setItem('st.skipOnboarding', 'true'); localStorage.setItem('st.briefed', 'true'); localStorage.setItem('st.noTrack', '1'); } catch (e) { /* ignore */ } });
const page = await ctx.newPage();
const mainWorld = (code) => page.evaluate((c) => { const s = document.createElement('script'); s.textContent = c; document.body.appendChild(s); s.remove(); }, code);

await page.goto(base + '/');
await page.locator('#btn-today').waitFor();
await page.waitForTimeout(1600);
// Yesterday's finished routine, so today extends a streak to 2 and the reminder offer appears.
if (process.env.WITH_YESTERDAY) await mainWorld(`(function(){const t=Date.now()-86400000;ST.history.add({key:'routine:daily',label:'Daily 5',duration:300,score:50,hitsPerSec:1,accuracy:0.8,warmup:false,routineCompleted:true,ts:t,day:ST.history.dayKey(t)});})()`);
await mainWorld(`(function(){const r=ST.ROUTINES.find(x=>x.id==='daily');r.rest=1;r.steps=r.steps.map(s=>typeof s==='string'?{scenario:s,settings:{duration:10}}:{...s,settings:{...(s.settings||{}),duration:10}});})()`);
await page.click('#btn-today');
await page.waitForTimeout(500);
await installProbe(page);
// Steps are clamped to at least 10 s, so the shortened routine takes about a minute and a half.
const until = Date.now() + 180000;
while (Date.now() < until) {
  if (await page.locator('#results').isVisible()) break;
  const st = await readState(page);
  if (st.screen === 'game' && st.time !== undefined) await playStep(page);
  else await page.waitForTimeout(150);
}
await page.locator('#headline').waitFor({ state: 'visible' });
await page.waitForTimeout(400);
await page.screenshot({ path: join(out, 'r1-results.png') });
console.log('headline:', (await page.locator('#headline').innerText()).replace(/\s+/g, ' '));
const save = page.locator('#headline [data-signin]');
if (await save.count()) {
  await save.first().click();
  await page.locator('#overlay').waitFor({ state: 'visible' });
  await page.screenshot({ path: join(out, 'r2-signin.png') });
  await page.click('#overlay-close');
}
await page.click('#btn-menu');
await page.locator('#home').waitFor({ state: 'visible' });
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, 'r3-home-after.png') });
console.log('home:', await page.locator('#free-meta').innerText(), '|', await page.locator('#today-sub').innerText());
await page.click('#btn-profile');
await page.locator('#profile').waitFor({ state: 'visible' });
await page.waitForTimeout(800);
await page.screenshot({ path: join(out, 'r4-progress.png'), fullPage: true });
const errors = JSON.parse(await page.evaluate(() => document.documentElement.dataset.qaErrors || '[]'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
