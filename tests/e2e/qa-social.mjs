// QA for the social screens: a public profile, the challenge landing and rematch (challenge
// endpoints mocked, so it runs before the server accepts the scenario), boards, and seed determinism.
//
//   node tests/e2e/qa-social.mjs http://localhost:3210 [outDir]
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installProbe, playStep } from '../../demo/bot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://localhost:3210').replace(/\/$/, '');
const out = process.argv[3] || join(here, 'out');
mkdirSync(out, { recursive: true });
const dir = join(homedir(), '.vscode/extensions');
const dirs = readdirSync(dir).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
const chromium = createRequire(join(dir, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
const read = async (expr) => { await mainWorld(`document.body.dataset.qa = JSON.stringify(${expr})`); return JSON.parse(await page.evaluate(() => document.body.dataset.qa)); };
const errors = [];
const collect = async (tag) => { errors.push(...JSON.parse(await page.evaluate(() => document.documentElement.dataset.qaErrors || '[]')).map(e => tag + ': ' + e)); };

// 1. Seeds: the same seed gives the same spawns.
await page.goto(base + '/');
await page.locator('#btn-today').waitFor();
await page.waitForTimeout(1500);
const spawns = [];
for (let i = 0; i < 2; i++) {
  await mainWorld(`ST.app.startScenario('staticClick', { seed: 424242 })`);
  await page.waitForTimeout(700);
  spawns.push(await read(`ST.currentGame.enemies.map(e => [Math.round(e.pos.x * 100), Math.round(e.pos.y * 100)])`));
  await mainWorld(`ST.currentGame.finish()`);
  await page.waitForTimeout(300);
}
console.log('seeded spawns equal:', JSON.stringify(spawns[0]) === JSON.stringify(spawns[1]), JSON.stringify(spawns[0]));
await collect('seed');

// 3. Challenge landing and rematch, with the challenge endpoints mocked.
const CH = { id: 'Ab12Cd34', scenario: 'staticClick', key: 'staticClick:v3', seed: 424242, score: 140, creator: { handle: 'sam', displayName: 'Sam', avatarUrl: null }, results: [{ handle: 'kai', displayName: 'Kai', score: 120 }] };
await page.route('**/api/challenges/Ab12Cd34', (r) => r.fulfill({ json: CH }));
await page.route('**/api/challenges/Ab12Cd34/result', (r) => { const s = JSON.parse(r.request().postData()).score; r.fulfill({ json: { beat: s > CH.score, creatorScore: CH.score, yourScore: s, friendshipCreated: true } }); });
await page.goto(base + '/c/Ab12Cd34');
await page.locator('#ch-start:not([disabled])').waitFor();
await page.screenshot({ path: join(out, 's2-challenge-landing.png') });
await page.click('#ch-start');
await page.waitForTimeout(600);
await installProbe(page);
await playStep(page);
await page.locator('#headline .versus').waitFor({ state: 'visible', timeout: 20000 });
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, 's3-challenge-result.png') });
console.log('challenge headline:', (await page.locator('#headline').innerText()).replace(/\s+/g, ' '));
await collect('challenge');

// 4. Boards on the progress page.
await page.goto(base + '/profile');
await page.locator('#pf-boards:not(.hidden)').waitFor({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: join(out, 's4-progress-full.png'), fullPage: true });
await page.evaluate(() => { const el = document.getElementById('profile'); el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, 's4b-progress-bottom.png') });
await collect('profile');

// 5. Public profile of this browser's own user, viewed as a stranger would see it.
const me = await (await page.request.get(base + '/api/me')).json();
if (me.user && me.user.handle) {
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(base + '/u/' + me.user.handle);
  await p2.locator('#profile').waitFor({ state: 'visible' });
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: join(out, 's1-public-profile.png') });
  console.log('public profile title:', await p2.locator('#pf-name').innerText(), '|', await p2.locator('#pf-sub').innerText());
  await ctx2.close();
}

// 6. Sheets: sign-in and feedback.
await page.goto(base + '/');
await page.locator('#btn-account:not(.hidden)').waitFor();
await page.click('#btn-account');
await page.locator('#overlay').waitFor({ state: 'visible' });
await page.screenshot({ path: join(out, 's5-signin.png') });
await page.click('#overlay-close');
await page.locator('#home .feedback-link').click();
await page.locator('#fb-text').waitFor();
await page.screenshot({ path: join(out, 's6-feedback.png') });
await collect('sheets');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
