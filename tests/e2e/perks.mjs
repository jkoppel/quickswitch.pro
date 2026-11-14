// Perks: the perk pages' links open a drill with the perk picked, and each perk does what survev's
// source says once the drill starts. Effects are checked by calling the running game directly, in
// one synchronous page script so the game loop can't move anything in between.
//
//   node tests/e2e/perks.mjs http://localhost:3210 [outDir]      (vercel dev; /drill/ needs api/page)
//
// Exits non-zero on any failure or page error.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const out = process.argv[3] || join(here, 'out-perks');
mkdirSync(out, { recursive: true });

function loadChromium() {
  try { return createRequire(import.meta.url)('playwright').chromium; } catch (e) { /* fall through */ }
  const dir = join(homedir(), '.vscode/extensions');
  const dirs = readdirSync(dir).filter(d => d.startsWith('danielsanmedium.dscodegpt-')).sort();
  return createRequire(join(dir, dirs[dirs.length - 1], 'standalone') + '/')('patchright').chromium;
}

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const browser = await loadChromium().launch({ headless: true, executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 750 } });
await ctx.addInitScript(() => { try { localStorage.setItem('st.noTrack', '1'); localStorage.setItem('st.briefed', 'true'); } catch (e) { /* ignore */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// patchright's evaluate runs in an isolated world: run `body` in the page and read back its result.
async function inPage(body) {
  await page.evaluate((src) => {
    const s = document.createElement('script');
    s.textContent = `(function(){ let r; try { r = (function(){ ${src} })(); } catch (e) { r = { error: String(e) }; } document.body.dataset.out = JSON.stringify(r); })();`;
    document.body.appendChild(s);
  }, body);
  return JSON.parse(await page.evaluate(() => document.body.dataset.out));
}
async function open(path) {
  await page.goto(base + path);
  await page.waitForTimeout(1500);
}
async function start(path) {
  await open(path);
  await page.click('#btn-start');
  await page.waitForTimeout(600);
}

const checked = () => page.evaluate(() => [...document.querySelectorAll('#f-perks input:checked')].map((x) => x.value).sort().join(','));

// 1. The link picks the perk and the gun, and says so; a gun link afterwards clears it.
await open('/drill/duel?gun=mp5&perk=bonus_9mm');
ok(await checked() === 'bonus_9mm', 'a perk link selects the perk');
ok(await page.inputValue('#f-weapon') === 'mp5', 'and the gun it names');
ok((await page.textContent('#preset-line')).includes('9mm Overpressure'), 'the drill line names the perk');
await open('/drill/duel?gun=ak47');
ok(await checked() === '', 'a gun link without a perk clears it');
ok(await page.evaluate(() => document.querySelector('#f-perks input[value="bonus_9mm"]').parentNode.classList.contains('idle')), 'a 9mm perk greys out with the AK-47');
await open('/drill/duel?gun=mp5&perk=bonus_9mm,treat_9mm&perk=splinter');
ok(await checked() === 'bonus_9mm,splinter,treat_9mm', `a link can give several perks (${await checked()})`);
ok(/9mm Overpressure.*Candy Corn|Candy Corn.*9mm Overpressure/.test(await page.textContent('#preset-line')), 'the drill line names them all');

// 2. Gun perks change the gun the drill hands you.
await start('/drill/duel?gun=mp5&perk=bonus_9mm');
let r = await inPage(`const d = ST.currentGame.player.weapons[0].def, w = ST.WEAPONS.mp5;
  return { dmg: d.dmg / w.dmg, speed: d.speed / w.speed, range: d.range / w.range, spread: d.spread / w.spread };`);
ok(near(r.dmg, 1.12) && near(r.speed, 1.2) && near(r.range, 1.2) && near(r.spread, 1.1), `9mm Overpressure: MP5 damage ×1.12, speed ×1.2, range ×1.2, spread ×1.1 (${JSON.stringify(r)})`);

await start('/drill/duel?perk=firepower');
r = await inPage(`const g = ST.currentGame.player.weapons[0]; return { mag: g.def.mag, ammo: g.ammo, ext: ST.WEAPONS.ak47.extendedClip };`);
ok(r.mag === r.ext && r.ammo === r.ext && r.ext > 30, `Firepower: the AK-47 holds ${r.ext} (${JSON.stringify(r)})`);

await start('/drill/duel?perk=splinter');
r = await inPage(`const g = ST.currentGame, made = [];
  const mk = g.makeBullet.bind(g);
  g.makeBullet = function (...a) { const b = mk(...a); if (a[4] === 'player') made.push(b.dmg); return b; };
  g.fireGun(g.player, g.player.weapons[0].def, 0, false, 'player', { firstShot: true, toMouseLen: 10, gun: g.player.weapons[0] });
  g.makeBullet = mk;
  return { made, base: ST.WEAPONS.ak47.dmg };`);
ok(r.made.length === 3 && near(r.made[0], r.base * 0.6) && near(r.made[1], r.base * 0.3), `Splinter: one AK round becomes 3, at 60% and 30% damage (${JSON.stringify(r)})`);

await start('/drill/duel?gun=mosin&perk=chambered');
r = await inPage(`const g = ST.currentGame, made = [];
  const mk = g.makeBullet.bind(g);
  g.makeBullet = function (...a) { const b = mk(...a); if (a[4] === 'player') made.push(b.dmg); return b; };
  const gun = g.player.weapons[0];
  for (const ammo of [5, 3, 1]) { gun.ammo = ammo - 1; g.fireGun(g.player, gun.def, 0, false, 'player', { firstShot: true, toMouseLen: 10, gun }); }
  g.makeBullet = mk;
  return { made, base: ST.WEAPONS.mosin.dmg };`);
ok(near(r.made[0], r.base * 1.25) && near(r.made[1], r.base) && near(r.made[2], r.base * 1.25), `One in the Chamber: the Mosin's first and last rounds do ×1.25 (${JSON.stringify(r)})`);

await start('/drill/duel?perk=explosive');
r = await inPage(`const g = ST.currentGame, e = g.enemies[0], blasts = [];
  const ex = g.explode.bind(g);
  g.explode = function (q) { blasts.push(q.effect); return ex(q); };
  const b = g.makeBullet(e.pos.x - 2, e.pos.y, 0, g.player.weapons[0].def, 'player', {});
  g.bullets.push(b);
  for (let i = 0; i < 10 && !b.dead; i++) g.updateBullets(0.02);
  g.explode = ex;
  return { blasts };`);
ok(r.blasts.includes('rounds'), `Explosive Rounds: a round that hits the bot bursts (${JSON.stringify(r)})`);

await start('/drill/duel?gun=mp5&perk=bonus_9mm,treat_9mm,splinter,high_velocity');
r = await inPage(`const g = ST.currentGame, made = [];
  const mk = g.makeBullet.bind(g);
  g.makeBullet = function (...a) { const b = mk(...a); if (a[4] === 'player') made.push(b.dmg); return b; };
  g.fireGun(g.player, g.player.weapons[0].def, 0, false, 'player', { firstShot: true, toMouseLen: 10, gun: g.player.weapons[0] });
  g.makeBullet = mk;
  const d = g.player.weapons[0].def, w = ST.WEAPONS.mp5;
  return { made, base: w.dmg, speed: d.speed / w.speed, range: d.range / w.range };`);
ok(r.made.length === 3 && near(r.made[0], r.base * 1.12 * 1.12 * 0.6) && near(r.speed, 1.2 * 1.4) && near(r.range, 1.2 * 1.3),
  `perks stack: two 9mm perks ×1.12 each, Splinter, and Overpressure with High-Velocity (${JSON.stringify(r)})`);

// 3. Body perks: size, damage taken, reflections, haste and health.
await start('/drill/dodge?perk=steelskin');
r = await inPage(`const g = ST.currentGame, p = g.player, R = ST.GC.player.radius;
  const rnd = Math.random; Math.random = () => 0.99;           // no headshot
  const b = g.makeBullet(p.pos.x - 1, p.pos.y, 0, ST.WEAPONS.ak47, 'enemy', {});
  p.hp = 100; g.damagePlayer(b, p.pos.x, p.pos.y);
  const taken = 100 - p.hp, full = g.rollDamage(b).dmg;
  Math.random = rnd;
  p.hp = 100;
  const before = g.bullets.length;
  const shot = g.makeBullet(p.pos.x - p.radius - 0.5, p.pos.y, 0, ST.WEAPONS.ak47, 'enemy', {});
  g.bullets.push(shot);
  for (let i = 0; i < 5 && !shot.dead; i++) g.updateBullets(0.01);
  const back = g.bullets.find((x) => x.reflectCount === 1 && x.owner === 'enemy' && x.dx < 0);
  return { radius: p.radius / R, taken, full, reflected: !!back };`);
ok(near(r.radius, 1.4), `Cast Ironskin: you are 1.4× the size (${r.radius})`);
ok(near(r.taken, r.full * 0.55), `Cast Ironskin: a ${r.full} round takes ${r.taken} (45% off)`);
ok(r.reflected, 'Cast Ironskin: a round that hits you bounces back');

await start('/drill/cook?perk=flak_jacket');
r = await inPage(`const g = ST.currentGame, p = g.player;
  p.hp = 100; g.damagePlayer({ dmg: 50, dx: 1, dy: 0, source: 'explosion', owner: 'player' }, p.pos.x, p.pos.y);
  const blast = 100 - p.hp;
  p.hp = 100; const rnd = Math.random; Math.random = () => 0.99;
  const b = g.makeBullet(p.pos.x - 1, p.pos.y, 0, ST.WEAPONS.ak47, 'enemy', {});
  const full = g.rollDamage(b).dmg; g.damagePlayer(b, p.pos.x, p.pos.y); Math.random = rnd;
  return { blast, bullet: 100 - p.hp, full };`);
ok(near(r.blast, 5), `Flak Jacket: a 50-damage blast takes ${r.blast}`);
ok(near(r.bullet, r.full * 0.9), `Flak Jacket: a ${r.full} round takes ${r.bullet} (10% off)`);

await start('/drill/dodge?perk=windwalk');
r = await inPage(`const g = ST.currentGame, p = g.player;
  p.hasteT = 0; p.hasteType = '';
  const b = g.makeBullet(p.pos.x - 4, p.pos.y + 3, 0, ST.WEAPONS.ak47, 'enemy', {});
  g.bullets.push(b); g.updateBullets(0.001);
  return { type: p.hasteType, t: p.hasteT };`);
ok(r.type === 'windwalk' && r.t > 2.9, `Windwalk: a round passing within 5 units gives 3 s of haste (${JSON.stringify(r)})`);

await start('/drill/duel?perk=takedown');
r = await inPage(`const g = ST.currentGame, p = g.player, e = g.enemies[0];
  p.hp = 50;
  g.damageEnemy(e, { dmg: 1000, dx: 1, dy: 0, source: 'explosion', owner: 'player' }, e.pos.x, e.pos.y);
  return { hp: p.hp, type: p.hasteType, kills: g.stats.kills };`);
ok(r.hp === 75 && r.type === 'takedown' && r.kills === 1, `Takedown: a kill heals 25 and gives haste (${JSON.stringify(r)})`);

await start('/drill/chase?perk=gotw');   // a bot that doesn't shoot back, so health only climbs
r = await inPage(`const p = ST.currentGame.player; p.hp = 50; return { scale: p.scale };`);
await page.waitForTimeout(2000);
const hp = (await inPage(`return ST.currentGame.player.hp;`));
ok(near(r.scale, 1.2) && hp > 51, `Gift of the Woods: 1.2× size, and health climbs from 50 to ${hp.toFixed(1)} in 2 s`);

await start('/drill/chase?perk=small_arms');
r = await inPage(`return { scale: ST.currentGame.player.scale };`);
ok(near(r.scale, 0.75), `Small Arms: 0.75× size (${r.scale})`);

await start('/drill/dodge?perk=steelskin,flak_jacket,gotw');
r = await inPage(`const g = ST.currentGame, p = g.player;
  const rnd = Math.random; Math.random = () => 0.99;
  const b = g.makeBullet(p.pos.x - 1, p.pos.y, 0, ST.WEAPONS.ak47, 'enemy', {});
  const full = g.rollDamage(b).dmg;
  p.hp = 100; g.damagePlayer(b, p.pos.x, p.pos.y); Math.random = rnd;
  return { taken: 100 - p.hp, full, scale: p.scale };`);
ok(near(r.taken, r.full * 0.9 * 0.55) && near(r.scale, 1.7), `body perks stack: Flak Jacket then Ironskin take ${r.taken} of ${r.full}; their sizes add up to ${r.scale}× the size`);
const icons = await page.evaluate(() => [...document.querySelectorAll('#hud-perks img')].map((i) => (i.naturalWidth > 0 ? '' : '!') + i.alt).join(', '));
ok(icons === 'Cast Ironskin, Flak Jacket, Gift of the Woods', `the HUD shows your perks' icons (${icons})`);
const tile = (await page.$$('#hud-perks .perk'))[0];
const tb = await tile.boundingBox();
await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
await page.waitForTimeout(200);
const tip = await page.evaluate(() => { const t = document.querySelector('#hud-perks .tooltip-text'); const r = t.getBoundingClientRect(); return { vis: getComputedStyle(t).visibility, left: r.left, text: t.innerText }; });
ok(tip.vis === 'visible' && tip.left >= 0 && tip.text === 'Cast Ironskin\nTake reduced damage and reflect enemy bullets.\nIncreased size.',
  `hovering a perk shows survev's tooltip, on screen (${JSON.stringify(tip)})`);
await page.screenshot({ path: join(out, 'perks.png') });

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures ? `PERKS FAILED (${failures})` : 'PERKS PASSED');
process.exit(failures ? 1 : 0);
