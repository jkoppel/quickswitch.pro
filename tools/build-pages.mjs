// Builds the static guide pages and sitemap.xml from survev's own definitions in vendor/survev/defs,
// so every number on them is survev's. Run it after refreshing the defs:
//
//   node tools/build-pages.mjs
//
// tests/unit/pages.test.mjs fails if the committed pages differ from what this script produces.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://quickswitch.pro';
const defs = (f) => JSON.parse(readFileSync(path.join(ROOT, 'vendor/survev/defs', f), 'utf8'));
const GUNS = defs('gunDefs.json');
const BULLETS = defs('bulletDefs.json');
// gameConfig.js assigns one object literal to window.SURVEV_GAME_CONFIG.
const GC = JSON.parse(/=\s*(\{[\s\S]*\});?\s*$/.exec(readFileSync(path.join(ROOT, 'vendor/survev/defs/gameConfig.js'), 'utf8'))[1]);
const SWITCH = GC.player.baseSwitchDelay;
const FREE_EVERY = GC.player.freeSwitchCooldown;
const HP = GC.player.health;
const HEADSHOT = GC.player.headshotChance;

const AMMO = {
  '9mm': '9mm', '762mm': '7.62mm', '556mm': '5.56mm', '12gauge': '12 gauge', '45acp': '.45 ACP',
  '308sub': '.308 Subsonic', '50AE': '.50 AE',
};
const AMMO_ORDER = Object.keys(AMMO);

// Guns a player can pick up in a normal match: event-only variants (potato, winter, flare) and the
// dual-wield forms of pistols are left out; a pistol's page mentions its dual form.
const PAGE_IDS = Object.keys(GUNS).filter((id) => {
  const g = GUNS[id];
  return !g.noDrop && !g.isDual && AMMO[g.ammo] && !/_winter$/.test(id);
});

const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;
const s = (x) => `${Math.round(x * 1000) / 1000} s`;   // 0.025 s burst gaps keep their third digit
const andList = (xs) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const perSecond = FREE_EVERY === 1 ? 'once a second' : `once every ${FREE_EVERY} s`;
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function stats(id) {
  const g = GUNS[id];
  const b = BULLETS[g.bulletType];
  const pellets = g.bulletCount || 1;
  const burst = g.fireMode === 'burst' ? g.burstCount : 1;
  // survev's weaponManager: a burst queues burstCount shots burstDelay apart, and each shot resets
  // the cooldown to fireDelay, so the next burst comes fireDelay after the last shot of this one.
  const cycle = burst > 1 ? (burst - 1) * g.burstDelay + g.fireDelay : g.fireDelay;
  const perShot = b.damage * pellets;
  const dps = (perShot * burst) / cycle;
  // Shot times from the first trigger pull until 100 damage lands, every pellet hitting the body.
  const times = [];
  for (let t = 0, n = 0; n * perShot < HP; t += cycle) {
    for (let i = 0; i < burst && n * perShot < HP; i++, n++) times.push(t + i * (g.burstDelay || 0));
  }
  return {
    id, name: g.name, ammo: AMMO[g.ammo], ammoKey: g.ammo, fireMode: g.fireMode,
    damage: b.damage, pellets, perShot, burst, cycle, dps,
    shotsToKill: times.length, ttk: times[times.length - 1], needsReload: times.length > g.maxClip,
    headshotMult: g.headshotMult, avgMult: 1 + HEADSHOT * (g.headshotMult - 1),
    range: b.distance, speed: b.speed, falloff: b.falloff === undefined ? 1 : b.falloff,
    shotSpread: g.shotSpread, moveSpread: g.moveSpread,
    switchDelay: g.switchDelay, deployGroup: g.deployGroup,
    clip: g.maxClip, extClip: g.extendedClip, reloadTime: g.reloadTime, reloadEach: g.maxReload < g.maxClip,
    dual: GUNS[id + '_dual'] ? GUNS[id + '_dual'].name : null,
  };
}

const ALL = PAGE_IDS.map(stats).sort((a, b) => AMMO_ORDER.indexOf(a.ammoKey) - AMMO_ORDER.indexOf(b.ammoKey) || a.name.localeCompare(b.name));
// Guns whose own cycle is long enough that switching away beats waiting for the next shot.
const SLOW = ALL.filter((x) => x.cycle > SWITCH * 2).sort((a, b) => b.cycle - a.cycle);
const SHARED = ALL.filter((x) => x.deployGroup !== undefined);

function page({ urlPath, title, description, crumbs, body, jsonLd }) {
  const nav = crumbs.map(([label, href]) => href ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`).join(' <span class="sep">/</span> ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${ORIGIN}${urlPath}">
<meta property="og:site_name" content="Quickswitch">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${ORIGIN}${urlPath}">
<meta property="og:image" content="${ORIGIN}/api/og?kind=site">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/platform/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/guides/pages.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n` : ''}</head>
<body>
<main class="doc">
<header class="doc-head">
<a class="logo-link" href="/"><span class="logo">QUICKSWITCH<span class="dot">.</span>PRO</span></a>
<nav class="crumbs" aria-label="Breadcrumb">${nav}</nav>
</header>
${body}
<footer class="doc-foot">
<p><a class="cta" href="/">Train it in the browser</a></p>
<p class="muted">Every number on this page comes from survev's source (<code>gunDefs.ts</code>, <code>bulletDefs.ts</code>, <code>gameConfig.ts</code>). Quickswitch is a fan project, not affiliated with survev.io, Kongregate or surviv.io.</p>
</footer>
</main>
</body>
</html>
`;
}

const table = (head, rows, cls = '') => `<table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map((h) => `<th${h.n ? ' class="n"' : ''}>${h.t}</th>`).join('')}</tr></thead>
<tbody>
${rows.map((r) => `<tr>${r.map((c, i) => `<td${head[i].n ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody></table>`;
const gunLink = (x) => `<a href="/guns/${x.id}/">${esc(x.name)}</a>`;

function quickswitchPage() {
  const m870 = stats('m870');
  const mp5 = stats('mp5');
  const sharedNames = andList(SHARED.map((x) => x.name));
  const body = `<article>
<h1>How to quickswitch in survev.io</h1>
<p class="lead">After a slow shot, switch guns instead of waiting. survev lets you fire your other gun ${s(SWITCH)} after switching, ${perSecond}, so an ${m870.name} shot can be followed by ${mp5.name} fire long before the pump comes back.</p>

<h2>The rule, from survev's weapon code</h2>
<ul>
<li><b>A switch normally costs the new gun's switch delay.</b> The ${mp5.name}'s is ${s(mp5.switchDelay)}; the ${m870.name}'s is ${s(m870.switchDelay)}.</li>
<li><b>One switch ${FREE_EVERY === 1 ? 'a second' : `every ${FREE_EVERY} s`} is quick.</b> It costs ${s(SWITCH)} (<code>baseSwitchDelay</code>) whatever the gun. Another switch within ${FREE_EVERY === 1 ? 'that second' : `those ${FREE_EVERY} s`} pays the full delay.</li>
<li><b>Guns in the same deploy group can't skip each other's cycle.</b> If the gun you leave is still cycling and shares a deploy group with the one you pick up, you pay the full switch delay. In survev the ${sharedNames} share one group, so two pump shotguns don't quickswitch. Pair a pump shotgun with a gun from any other class.</li>
</ul>

<h2>Which guns gain most</h2>
<p>A quickswitch is worth it when the gun's own cycle is much longer than ${s(SWITCH)}. The table lists every gun whose next shot takes more than twice that long, slowest first.</p>
${table([{ t: 'Gun' }, { t: 'Ammo' }, { t: 'Next shot, waiting', n: 1 }, { t: 'Next shot, quickswitching', n: 1 }, { t: 'Time saved', n: 1 }],
    SLOW.map((x) => [gunLink(x), esc(x.ammo), s(x.cycle), s(SWITCH), s(x.cycle - SWITCH)]))}

<h2>How to practice it</h2>
<ol>
<li>Fire the slow gun.</li>
<li>Press the other slot's key (or Q, or right click) straight after the shot, not after you've started waiting.</li>
<li>Fire the second gun as soon as it's up. The next quick switch is ready ${FREE_EVERY === 1 ? 'a second' : `${FREE_EVERY} s`} after the last one.</li>
</ol>
<p>Quickswitch's <b>Quick Switch</b> and <b>Shotgun Rush</b> drills give you two guns with survev's exact switch rule, and the results screen counts how many of your shots beat the first gun's own cycle.</p>
</article>`;
  return page({
    urlPath: '/guides/quickswitch/',
    title: 'How to quickswitch in survev.io: the exact rule and the best guns · Quickswitch',
    description: `survev's quickswitch rule from its source: one switch ${perSecond} costs ${SWITCH} s, pump shotguns share a deploy group, and the guns that gain most from switching.`,
    crumbs: [['Guides', '/guides/'], ['Quickswitching']],
    body,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: 'How to quickswitch in survev.io', url: `${ORIGIN}/guides/quickswitch/` },
  });
}

function gunsIndexPage() {
  const groups = AMMO_ORDER.filter((a) => ALL.some((x) => x.ammoKey === a));
  const body = `<article>
<h1>survev.io gun stats</h1>
<p class="lead">Damage, fire rate and switch delay for all ${ALL.length} guns that drop in a normal survev match, straight from the game's source. Damage per second assumes every round hits the body at close range, with no armor and no headshots.</p>
${groups.map((a) => `<h2>${esc(AMMO[a])}</h2>
${table([{ t: 'Gun' }, { t: 'Damage per shot', n: 1 }, { t: 'Shots per second', n: 1 }, { t: 'Damage per second', n: 1 }, { t: 'Range', n: 1 }, { t: 'Switch delay', n: 1 }],
    ALL.filter((x) => x.ammoKey === a).map((x) => [gunLink(x), x.pellets > 1 ? `${r1(x.perShot)} <span class="muted">${x.pellets}×${r1(x.damage)}</span>` : r1(x.perShot), r1(x.burst / x.cycle), Math.round(x.dps), x.range, s(x.switchDelay)]))}`).join('\n')}
</article>`;
  return page({
    urlPath: '/guns/',
    title: 'survev.io gun stats: damage, fire rate and switch delay for every gun · Quickswitch',
    description: `Damage, fire rate, damage per second, range and switch delay for all ${ALL.length} survev.io guns, taken from the game's source code.`,
    crumbs: [['Guides', '/guides/'], ['Guns']],
    body,
  });
}

function gunPage(x) {
  const g = GUNS[x.id];
  const peers = ALL.filter((y) => y.ammoKey === x.ammoKey && y.id !== x.id);
  const facts = [];
  facts.push(x.shotsToKill === 1
    ? `One shot deals <b>${Math.round(x.perShot)} damage</b>${x.pellets > 1 ? ' if every pellet hits' : ''}, enough for ${HP} at point blank.`
    : `It takes <b>${x.shotsToKill} ${x.burst > 1 ? 'rounds' : 'shots'}</b> to deal ${HP} damage${x.pellets > 1 ? ' if every pellet hits' : ''}, which takes <b>${s(x.ttk)}</b> from the first trigger pull${x.needsReload ? `, longer than one ${x.clip}-round magazine lasts` : ''}.`);
  facts.push(`A headshot does ×${x.headshotMult} damage, and ${Math.round(HEADSHOT * 100)}% of hits are headshots, so the average hit does ${r2(x.avgMult)}× its listed damage.`);
  if (x.falloff < 1) facts.push(`Damage falls off with distance: a round that travels its full ${x.range} units does ${Math.round(x.falloff * 100)}% of its damage.`);
  if (x.cycle > SWITCH * 2) facts.push(`Its next shot comes ${s(x.cycle)} after the last, so <a href="/guides/quickswitch/">quickswitching</a> to your other gun (${s(SWITCH)}) saves ${s(x.cycle - SWITCH)} per shot.`);
  if (x.deployGroup !== undefined) {
    const mates = andList(SHARED.filter((y) => y.deployGroup === x.deployGroup && y.id !== x.id).map(gunLink));
    facts.push(`It shares a deploy group with the ${mates}, so switching between them while it cycles costs the full switch delay.`);
  }
  if (x.dual) facts.push(`Picking up a second one gives you the ${esc(x.dual)}.`);
  const rows = [
    ['Ammo', esc(x.ammo)],
    ['Fire mode', x.burst > 1 ? `${x.burst}-round burst` : x.fireMode === 'auto' ? 'automatic' : 'single shot'],
    ['Damage per shot', x.pellets > 1 ? `${r1(x.perShot)} (${x.pellets} pellets × ${r1(x.damage)})` : r1(x.perShot)],
    ['Time between shots', x.burst > 1 ? `${s(g.burstDelay)} inside a burst, ${s(g.fireDelay)} between bursts` : s(x.cycle)],
    ['Damage per second', `${Math.round(x.dps)}`],
    ['Headshot multiplier', `×${x.headshotMult}`],
    ['Range', `${x.range} units`],
    ['Bullet speed', `${x.speed} units/s`],
    ['Spread, standing / moving', `${x.shotSpread}° / ${x.shotSpread + x.moveSpread}°`],
    ['Magazine', x.extClip && x.extClip !== x.clip ? `${x.clip} (${x.extClip} extended)` : `${x.clip}`],
    ['Reload', x.reloadEach ? `${s(x.reloadTime)} per ${g.maxReload === 1 ? 'round' : `${g.maxReload} rounds`}` : s(x.reloadTime)],
    ['Switch delay', s(x.switchDelay)],
  ];
  const body = `<article>
<h1>${esc(x.name)} stats in survev.io</h1>
<p class="lead">The ${esc(x.name)} fires ${esc(x.ammo)} and deals about ${Math.round(x.dps)} damage per second at close range.</p>
<ul class="facts">
${facts.map((f) => `<li>${f}</li>`).join('\n')}
</ul>
${table([{ t: 'Stat' }, { t: 'Value', n: 1 }], rows, 'stats')}
${peers.length ? `<h2>Other ${esc(x.ammo)} guns</h2>
<p class="peers">${peers.map(gunLink).join(' · ')}</p>` : ''}
<p class="muted">Close-range numbers assume every round hits the body, with no armor. Spread moving adds survev's <code>moveSpread</code> to the gun's <code>shotSpread</code>.</p>
</article>`;
  return page({
    urlPath: `/guns/${x.id}/`,
    title: `${x.name} stats in survev.io: damage, fire rate, switch delay · Quickswitch`,
    description: `${x.name} in survev.io: ${r1(x.perShot)} damage per shot, ${Math.round(x.dps)} damage per second, ${x.shotsToKill} shots to deal ${HP} damage, ${s(x.switchDelay)} switch delay. From the game's source.`,
    crumbs: [['Guides', '/guides/'], ['Guns', '/guns/'], [x.name]],
    body,
  });
}

function guidesIndexPage() {
  const body = `<article>
<h1>survev.io guides</h1>
<p class="lead">Mechanics guides built from survev's source code, so the numbers match the game.</p>
<ul class="guide-list">
<li><a href="/guides/quickswitch/"><b>How to quickswitch</b></a>: the exact switch rule, and the ${SLOW.length} guns that gain most from it.</li>
<li><a href="/guns/"><b>Gun stats</b></a>: damage, fire rate and switch delay for all ${ALL.length} guns.</li>
</ul>
</article>`;
  return page({
    urlPath: '/guides/',
    title: 'survev.io guides: quickswitching and gun stats · Quickswitch',
    description: 'survev.io mechanics guides built from the game\'s source: how quickswitching works, and stats for every gun.',
    crumbs: [['Guides']],
    body,
  });
}

function sitemap(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${ORIGIN}${p}</loc></url>`).join('\n')}
</urlset>
`;
}

// Every generated file, keyed by its path from the repository root.
export function buildPages() {
  const files = {
    'guides/index.html': guidesIndexPage(),
    'guides/quickswitch/index.html': quickswitchPage(),
    'guns/index.html': gunsIndexPage(),
  };
  for (const x of ALL) files[`guns/${x.id}/index.html`] = gunPage(x);
  files['sitemap.xml'] = sitemap(['/', ...Object.keys(files).map((f) => '/' + f.replace(/index\.html$/, ''))]);
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = buildPages();
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
    writeFileSync(path.join(ROOT, rel), text);
  }
  console.log(`wrote ${Object.keys(files).length} files`);
}
