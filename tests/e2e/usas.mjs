// The USAS-12 is survev's toMouseHit gun: each explosive slug flies only to the cursor and bursts
// there (weaponManager.ts, bullet.ts). This plays its Quick Switch drill and checks the blasts land
// on the cursor, both with the cursor on the bot and on an empty spot 8 units out, and that a blast
// on the bot hurts it.
//
//   node tests/e2e/usas.mjs http://localhost:3210 [outDir]      (vercel dev or any static host)
//
// Exits non-zero on any failure or page error.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const out = process.argv[3] || join(here, 'out-usas');
mkdirSync(out, { recursive: true });

function loadChromium() {
  try { return createRequire(import.meta.url)('playwright').chromium; } catch (e) { /* fall through */ }
  const dir = join(homedir(), '.vscode/extensions');
  const dirs = readdirSync(dir).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
  return createRequire(join(dir, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
}

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };
const browser = await loadChromium().launch({ headless: true, executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 750 } });
await ctx.addInitScript(() => { try { localStorage.setItem('st.noTrack', '1'); localStorage.setItem('st.briefed', 'true'); } catch (e) { /* ignore */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '/drill/quickswitch?gun=usas');
await page.waitForTimeout(2000);
await page.click('#btn-start');
await page.waitForTimeout(800);

// patchright's evaluate runs in an isolated world, so a page script records each blast on the DOM.
await page.evaluate(() => {
  const s = document.createElement('script');
  s.textContent = `(function(){
    const g = ST.currentGame, log = [];
    const explode = g.explode.bind(g);
    g.explode = function (q) {
      const m = g.mouseWorld(), e = g.enemies[0], ehp = e ? e.hp : null;
      const r = explode(q);
      if (q.round) log.push({ toCursor: Math.hypot(q.x - m.x, q.y - m.y), toBot: e ? Math.hypot(q.x - e.pos.x, q.y - e.pos.y) : null, botDmg: e ? ehp - e.hp : 0 });
      document.body.dataset.blasts = JSON.stringify(log);
      return r;
    };
    (function tick() {
      const e = g.enemies[0];
      if (e) document.body.dataset.bot = JSON.stringify(g.worldToScreen(e.pos.x, e.pos.y));
      document.body.dataset.ppu = g.ppu;
      requestAnimationFrame(tick);
    })();
  })();`;
  document.body.appendChild(s);
});
const blasts = async () => JSON.parse(await page.evaluate(() => document.body.dataset.blasts || '[]'));

// 1. Cursor on the bot.
await page.mouse.down();
for (let i = 0; i < 60; i++) {
  const b = JSON.parse(await page.evaluate(() => document.body.dataset.bot || '{"x":600,"y":375}'));
  await page.mouse.move(b.x, b.y);
  await page.waitForTimeout(40);
}
await page.mouse.up();
const onBot = (await blasts()).filter((x) => x.toBot !== null && x.toBot < 3);
ok(onBot.length > 0, `slugs fired at the bot burst on it (${onBot.length})`);
ok(onBot.every((x) => x.toCursor < 2.5), 'each burst on the bot is at the cursor');
ok(onBot.some((x) => x.botDmg > 0), 'a burst on the bot hurts it');

// 2. Cursor on an empty spot 8 units out: the slug must stop there, not fly its full 24 units.
const before = (await blasts()).length;
const ppu = Number(await page.evaluate(() => document.body.dataset.ppu));
await page.mouse.move(600 + 8 * ppu, 375);
await page.mouse.down();
await page.waitForTimeout(1200);
await page.mouse.up();
const spot = (await blasts()).slice(before);
ok(spot.length > 0 && spot.every((x) => x.toCursor < 2.5), `slugs aimed 8 units out burst at the cursor (${spot.map((x) => x.toCursor.toFixed(1)).join(', ')} units off)`);
ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await page.screenshot({ path: join(out, 'usas.png') });
await browser.close();
console.log(failures ? `USAS FAILED (${failures})` : 'USAS PASSED');
process.exit(failures ? 1 : 0);
