// The guide pages link straight into the trainer: /drill/<id> opens one drill and /play/<id> one
// routine, selected in the picker and one press from playing; a gun page's /drill/<id>?gun=<id>
// also hands you that gun, and a perk page's ?perk=<id> that perk. Every such link must land on
// the drill it names with the right gun and perk, on
// a first visit, and Start must then play it with every sprite and sound loading.
//
//   node tests/e2e/deeplinks.mjs http://localhost:3210 [outDir]      (vercel dev or any static host)
//
// Exits non-zero on any failure or page error.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const out = process.argv[3] || join(here, 'out-deeplinks');
mkdirSync(out, { recursive: true });

function loadChromium() {
  try { return createRequire(import.meta.url)('playwright').chromium; } catch (e) { /* fall through */ }
  const dir = join(homedir(), '.vscode/extensions');
  const dirs = readdirSync(dir).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
  return createRequire(join(dir, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
}

// Every trainer link the guides carry, with the name it shows, read from the generated pages.
const root = join(here, '../..');
const names = new Map();
for (const f of ['guides/how-to-get-better/index.html', 'guides/quickswitch/index.html']) {
  for (const m of readFileSync(join(root, f), 'utf8').matchAll(/href="(\/(?:drill|play)\/[a-z0-9]+)"><b>([^<]+)<\/b>/g)) names.set(m[1], m[2]);
}
// Each gun page's practice link names its drill in the text beside it and its gun in ?gun=.
const guns = new Map();
for (const dir of readdirSync(join(root, 'guns'), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const html = readFileSync(join(root, 'guns', dir.name, 'index.html'), 'utf8');
  const m = /<a class="cta" href="(\/drill\/[a-z]+\?gun=([a-z0-9_]+))">[^<]*<\/a> <span class="muted">([^:]+):/.exec(html);
  if (m) { names.set(m[1], m[3]); guns.set(m[1], m[2]); }
}
// Each perk page's practice link does the same with ?perk=, and some name a gun too.
const perks = new Map();
for (const dir of readdirSync(join(root, 'perks'), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const html = readFileSync(join(root, 'perks', dir.name, 'index.html'), 'utf8');
  const m = /<a class="cta" href="(\/drill\/[a-z]+\?(?:gun=([a-z0-9_]+)&amp;)?perk=([a-z0-9_]+))">[^<]*<\/a> <span class="muted">([^:]+?)(?: with the [^:]+)?:/.exec(html);
  if (!m) continue;
  const link = m[1].replace(/&amp;/g, '&');
  names.set(link, m[4]); perks.set(link, m[3]);
  if (m[2]) guns.set(link, m[2]);
}
const links = new Set(names.keys());

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };
const browser = await loadChromium().launch({ headless: true, executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });

for (const link of [...links].sort()) {
  // A fresh context each time: someone arriving from a guide has never been here before.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('st.noTrack', '1'); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (/failed to load/i.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && /\/vendor\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(base + link);
  await page.waitForTimeout(1500);
  const want = names.get(link).replace(/&#39;/g, "'");
  const shown = await page.evaluate(() => ({ menu: !document.getElementById('menu').classList.contains('hidden'), title: document.getElementById('mode-title').textContent }));
  ok(shown.menu && shown.title === want, `${link} opens the picker on ${want} (shows ${shown.menu ? `"${shown.title}"` : 'no picker'})`);
  if (guns.has(link)) {
    const weapon = await page.evaluate(() => document.getElementById('f-weapon').value);
    ok(weapon === guns.get(link), `${link}: the drill loads the ${guns.get(link)} (has ${weapon})`);
  }
  if (perks.has(link)) {
    const perk = await page.evaluate(() => [...document.querySelectorAll('#f-perks input:checked')].map((x) => x.value).join(','));
    ok(perk === perks.get(link), `${link}: the drill gives you ${perks.get(link)} (has ${perk || 'none'})`);
  }
  await page.click('#btn-start');
  await page.waitForTimeout(800);
  // A first visit gets a one-time briefing on the controls before the drill; start from there.
  if (await page.evaluate(() => !document.getElementById('brief').classList.contains('hidden'))) {
    await page.click('#brief-go');
    await page.waitForTimeout(1500);
  }
  // Playing means the in-game HUD is up and the picker is gone.
  const playing = await page.evaluate(() => !document.getElementById('hud').classList.contains('hidden') && document.getElementById('menu').classList.contains('hidden'));
  ok(playing, `${link}: Start plays it`);
  ok(!errors.length, `${link}: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.screenshot({ path: join(out, link.replace(/\//g, '_') + '.png') });
  await ctx.close();
}
await browser.close();
console.log(failures ? `DEEPLINKS FAILED (${failures})` : `DEEPLINKS PASSED · ${links.size} links`);
process.exit(failures ? 1 : 0);
