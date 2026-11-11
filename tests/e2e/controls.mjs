// End-to-end check of rebindable controls: open the dialog from the drills menu, rebind keys and
// a mouse button, see a stolen key move between actions, then play a drill and check the new key
// moves the player and the old one no longer does. Runs against a static server or `vercel dev`.
//
//   node tests/e2e/controls.mjs http://localhost:8765 [outDir]
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const out = process.argv[3] || join(here, 'out-controls');
mkdirSync(out, { recursive: true });

function loadChromium() {
  try { return createRequire(import.meta.url)('playwright').chromium; } catch (e) { /* fall through */ }
  const dir = join(homedir(), '.vscode/extensions');
  const dirs = readdirSync(dir).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
  return createRequire(join(dir, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
}
const CAPTURE = () => {
  const log = (a) => { try { const el = document.documentElement; const arr = JSON.parse(el.dataset.qaErrors || '[]'); arr.push([...a].map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' ') : String(x)).join(' ').slice(0, 500)); el.dataset.qaErrors = JSON.stringify(arr); } catch (e) { /* ignore */ } };
  const ce = console.error.bind(console);
  console.error = (...a) => { log(a); ce(...a); };
  addEventListener('error', (e) => log([`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`]));
  addEventListener('unhandledrejection', (e) => log(['unhandled rejection: ', e.reason]));
};

const browser = await loadChromium().launch({ headless: true, executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(CAPTURE);
await ctx.addInitScript(() => { try { localStorage.setItem('st.noTrack', '1'); localStorage.setItem('st.briefed', 'true'); } catch (e) { /* ignore */ } });
const page = await ctx.newPage();
const mainWorld = (code) => page.evaluate((c) => { const s = document.createElement('script'); s.textContent = c; document.body.appendChild(s); s.remove(); }, code);
// Page globals are invisible from patchright's isolated world; a main-world script copies them out.
const peek = async (expr) => { await mainWorld(`document.body.dataset.peek = JSON.stringify(${expr})`); return JSON.parse(await page.evaluate(() => document.body.dataset.peek || 'null')); };
const bind = (action, slot) => page.locator(`#controls .bind[data-action="${action}"][data-slot="${slot}"]`);
const listen = (action, slot) => bind(action, slot).click();

let failures = 0;
const ok = (m) => console.log(`ok   ${m}`);
const fail = (m) => { failures++; console.log(`FAIL ${m}`); };
const expect = (cond, m) => (cond ? ok(m) : fail(m));

try {
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.locator('[data-skip]').first().click();
  await page.locator('#menu').waitFor({ state: 'visible' });
  await page.click('#btn-controls');
  await page.locator('#controls').waitFor({ state: 'visible' });
  expect(await bind('up', 0).textContent() === 'W' && await bind('swap', 1).textContent() === 'Right click', 'dialog opens with survev defaults');

  await listen('up', 0);
  expect((await bind('up', 0).textContent()).startsWith('Press a key'), 'a binding waits for input');
  await page.keyboard.press('i');
  expect(await bind('up', 0).textContent() === 'I', 'Move up rebound to I');

  await listen('up', 0);
  await page.keyboard.press('Escape');
  expect(await bind('up', 0).textContent() === 'I' && await page.locator('#controls').isVisible(), 'Esc cancels a waiting binding without closing');

  await listen('shoot', 1);
  await bind('shoot', 1).click({ button: 'middle' });
  expect(await bind('shoot', 1).textContent() === 'Middle click', 'a mouse button binds over the box');

  await listen('reload', 1);
  await page.keyboard.press('q');
  expect(await bind('reload', 1).textContent() === 'Q' && await bind('swap', 0).textContent() === 'Right click', 'a taken key moves to the new action');
  expect(/Q moved from Last weapon/.test(await page.textContent('#controls-note')), 'the move is explained');

  await listen('primary', 0);
  await page.keyboard.press('Backspace');
  expect(await bind('primary', 0).textContent() === '—' && /Not bound: Primary weapon/.test(await page.textContent('#controls-note')), 'Backspace clears and the note names the unbound action');
  await listen('primary', 0);
  await page.keyboard.press('1');

  await page.screenshot({ path: join(out, '01-controls.png') });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('st.controls')).binds);
  expect(saved.up.join() === 'KeyI,ArrowUp' && saved.shoot[1] === 'Mouse1' && saved.reload.includes('KeyQ') && !saved.swap.includes('KeyQ'), 'bindings saved');

  await page.keyboard.press('Escape');
  expect(!(await page.locator('#controls').isVisible()) && await page.locator('#menu').isVisible(), 'Esc closes the dialog and stays on the menu');
  expect(/\(2 \/ Right click\)/.test(await page.textContent('#f-secondary').then(() => page.locator('[data-keys="secondary,swap"]').textContent())), 'form labels follow the bindings');

  await page.reload({ waitUntil: 'load' });
  expect((await peek('ST.controls.bindings().up'))[0] === 'KeyI', 'bindings survive a reload');

  // Play a drill that allows movement and compare the player's position across key presses.
  await page.waitForTimeout(1000);
  if (!(await page.locator('#menu').isVisible())) await page.locator('[data-skip]:visible').first().click();
  await page.locator('#menu').waitFor({ state: 'visible' });
  await page.click('#btn-start');
  await page.waitForFunction(() => document.getElementById('menu').classList.contains('hidden'));
  await page.waitForTimeout(1500);
  expect(/^I A S D move · LMB\/MMB shoot · RMB swap · R\/Q reload · 1\/2\/4 slots · Esc pause$/.test(await page.textContent('#hud-hint')), `HUD hint shows the bindings: ${await page.textContent('#hud-hint')}`);
  const y0 = (await peek('ST.currentGame.player.pos')).y;
  await page.keyboard.down('i'); await page.waitForTimeout(500); await page.keyboard.up('i');
  const y1 = (await peek('ST.currentGame.player.pos')).y;
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  const y2 = (await peek('ST.currentGame.player.pos')).y;
  expect(y1 < y0 - 2, `I moves the player up (${y0.toFixed(1)} → ${y1.toFixed(1)})`);
  expect(Math.abs(y2 - y1) < 0.01, `W no longer moves (${y1.toFixed(1)} → ${y2.toFixed(1)})`);

  // Controls from the pause screen; Esc in the dialog closes it rather than resuming.
  await page.keyboard.press('Escape');
  await page.locator('#pause').waitFor({ state: 'visible' });
  await page.click('#btn-pause-controls');
  await page.locator('#controls').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  expect(!(await page.locator('#controls').isVisible()) && await page.locator('#pause').isVisible(), 'Esc in the dialog leaves the run paused');
  await page.screenshot({ path: join(out, '02-paused.png') });

  const errs = JSON.parse(await page.evaluate(() => document.documentElement.dataset.qaErrors || '[]'));
  expect(!errs.length, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
} catch (e) {
  fail(`threw: ${e.message}`);
  await page.screenshot({ path: join(out, 'fail.png') }).catch(() => {});
}
await browser.close();
console.log(failures ? `CONTROLS FAILED (${failures})` : `CONTROLS PASSED · screenshots in ${out}`);
process.exit(failures ? 1 : 0);
