// Builds the static guide pages and sitemap.xml from survev's own definitions in vendor/survev/defs,
// so every number on them is survev's. Run it after refreshing the defs:
//
//   node tools/build-pages.mjs
//
// tests/unit/pages.test.mjs fails if the committed pages differ from what this script produces.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVAN, QUOTES, TIER_LISTS } from './community.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://quickswitch.pro';
const defs = (f) => JSON.parse(readFileSync(path.join(ROOT, 'vendor/survev/defs', f), 'utf8'));
const GUNS = defs('gunDefs.json');
const BULLETS = defs('bulletDefs.json');
const PERKS = defs('perkDefs.json');
// explosionDefs.js assigns one object literal to window.SURVEV_EXPLOSION_DEFS.
const EXPLOSIONS = JSON.parse(/=\s*(\{[\s\S]*\});?\s*$/.exec(readFileSync(path.join(ROOT, 'vendor/survev/defs/explosionDefs.js'), 'utf8'))[1]);
const PUZZLES = defs('puzzles.json');
const ROOMS = defs('puzzleRooms.json');   // tools/extract-puzzle-rooms.mjs
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
export const PAGE_IDS = Object.keys(GUNS).filter((id) => {
  const g = GUNS[id];
  return !g.noDrop && !g.isDual && AMMO[g.ammo] && !/_winter$/.test(id);
});

const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;
const s = (x) => `${Math.round(x * 1000) / 1000} s`;   // 0.025 s burst gaps keep their third digit
const andList = (xs) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const perSecond = FREE_EVERY === 1 ? 'once a second' : `once every ${FREE_EVERY} s`;
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// survev gives two guns the name "Vector" (9mm and .45 ACP); pages name them apart by ammo.
const NAME_COUNT = {};
for (const id of PAGE_IDS) NAME_COUNT[GUNS[id].name] = (NAME_COUNT[GUNS[id].name] || 0) + 1;

export function stats(id) {
  const g = GUNS[id];
  const b = BULLETS[g.bulletType];
  const pellets = g.bulletCount || 1;
  // Explosive rounds (the USAS-12's) also blow up on hit; a point-blank target takes the explosion's
  // full damage, which applies out to rad.min. Its shrapnel flies in random directions and isn't counted.
  if (b.onHit && !EXPLOSIONS[b.onHit]) throw new Error(`${id}: explosion ${b.onHit} is missing from explosionDefs.js`);
  const blast = b.onHit ? EXPLOSIONS[b.onHit].damage : 0;
  const burst = g.fireMode === 'burst' ? g.burstCount : 1;
  // survev's weaponManager: a burst queues burstCount shots burstDelay apart, and each shot resets
  // the cooldown to fireDelay, so the next burst comes fireDelay after the last shot of this one.
  const cycle = burst > 1 ? (burst - 1) * g.burstDelay + g.fireDelay : g.fireDelay;
  const perShot = (b.damage + blast) * pellets;
  const dps = (perShot * burst) / cycle;
  // Averaged over a full magazine and its reload: shotguns that load shell by shell reload maxReload
  // rounds per reloadTime.
  const reloadAll = g.maxReload < g.maxClip ? g.reloadTime * Math.ceil(g.maxClip / g.maxReload) : g.reloadTime;
  const sustained = (perShot * g.maxClip) / (Math.ceil(g.maxClip / burst) * cycle + reloadAll);
  // Shot times from the first trigger pull until 100 damage lands, every pellet hitting the body.
  const times = [];
  for (let t = 0, n = 0; n * perShot < HP; t += cycle) {
    for (let i = 0; i < burst && n * perShot < HP; i++, n++) times.push(t + i * (g.burstDelay || 0));
  }
  return {
    id, name: NAME_COUNT[g.name] > 1 ? `${g.name} (${AMMO[g.ammo]})` : g.name, ammo: AMMO[g.ammo], ammoKey: g.ammo, fireMode: g.fireMode,
    damage: b.damage, blast, pellets, perShot, burst, cycle, dps, sustained, reloadAll,
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

const SOURCE_NOTE = 'Every number on this page comes from survev\'s source (<code>gunDefs.ts</code>, <code>bulletDefs.ts</code>, <code>gameConfig.ts</code>).';

function page({ urlPath, title, description, crumbs, body, jsonLd, scripts = [], note = SOURCE_NOTE }) {
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
<p class="muted">${note} Quickswitch is a fan project, not affiliated with survev.io, Kongregate or surviv.io.</p>
</footer>
</main>
${scripts.map((src) => `<script src="${src}" defer></script>\n`).join('')}</body>
</html>
`;
}

const table = (head, rows, cls = '') => `<table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map((h) => `<th${h.n ? ' class="n"' : ''}>${h.t}</th>`).join('')}</tr></thead>
<tbody>
${rows.map((r) => `<tr>${r.map((c, i) => `<td${head[i].n ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody></table>`;
const gunLink = (x) => `<a href="/guns/${x.id}/">${esc(x.name)}</a>`;
const TIERS_ORDER = ['S', 'A', 'B', 'C', 'D'];
// The arrows on vote buttons, drawn rather than typed.
const CHEVRON = (dir) => `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="${dir === 'up' ? 'M2.5 7.5 6 4l3.5 3.5' : 'M2.5 4.5 6 8l3.5-3.5'}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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
<h1>surviv.io and survev.io gun stats</h1>
<p class="lead">Damage, fire rate and switch delay for all ${ALL.length} guns that drop in a normal survev match, straight from the game's source. Damage per second assumes every round hits the body at close range, with no armor and no headshots; "with reloads" averages it over a full magazine and its reload.</p>
<p>Which is best? <a href="/guns/tier-list/">Make your own tier list</a>, or see <a href="/guns/community-tier-lists/">what other players ranked</a>.</p>
${groups.map((a) => `<h2>${esc(AMMO[a])}</h2>
${table([{ t: 'Gun' }, { t: 'Damage per shot', n: 1 }, { t: 'Shots per second', n: 1 }, { t: 'Damage per second', n: 1 }, { t: 'With reloads', n: 1 }, { t: 'Range', n: 1 }, { t: 'Switch delay', n: 1 }],
    ALL.filter((x) => x.ammoKey === a).map((x) => [gunLink(x), x.pellets > 1 ? `${r1(x.perShot)} <span class="muted">${x.pellets}×${r1(x.damage + x.blast)}</span>` : r1(x.perShot), r1(x.burst / x.cycle), Math.round(x.dps), Math.round(x.sustained), x.range, s(x.switchDelay)]))}`).join('\n')}
</article>`;
  return page({
    urlPath: '/guns/',
    title: 'surviv.io and survev.io gun stats: damage, fire rate and switch delay for every gun · Quickswitch',
    description: `Damage, fire rate, damage per second, range and switch delay for all ${ALL.length} surviv.io and survev.io guns, taken from the game's source code.`,
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
    ['Damage per shot', x.pellets > 1 ? `${r1(x.perShot)} (${x.pellets} pellets × ${r1(x.damage + x.blast)})` : x.blast ? `${r1(x.perShot)} (${r1(x.damage)} bullet + ${r1(x.blast)} explosion)` : r1(x.perShot)],
    ['Time between shots', x.burst > 1 ? `${s(g.burstDelay)} inside a burst, ${s(g.fireDelay)} between bursts` : s(x.cycle)],
    ['Damage per second', `${Math.round(x.dps)}`],
    ['Damage per second with reloads', `${Math.round(x.sustained)}`],
    ['Headshot multiplier', `×${x.headshotMult}`],
    ['Range', `${x.range} units`],
    ['Bullet speed', `${x.speed} units/s`],
    ['Spread, standing / moving', `${x.shotSpread}° / ${x.shotSpread + x.moveSpread}°`],
    ['Magazine', x.extClip && x.extClip !== x.clip ? `${x.clip} (${x.extClip} extended)` : `${x.clip}`],
    ['Reload', x.reloadEach ? `${s(x.reloadTime)} per ${g.maxReload === 1 ? 'round' : `${g.maxReload} rounds`} (${s(x.reloadAll)} from empty)` : s(x.reloadTime)],
    ['Switch delay', s(x.switchDelay)],
  ];
  const body = `<article>
<h1>${esc(x.name)} stats in survev.io and surviv.io</h1>
<p class="lead">The ${esc(x.name)} fires ${esc(x.ammo)}. At close range it deals ${Math.round(x.dps)} damage per second while its magazine lasts, or ${Math.round(x.sustained)} averaged over reloads.</p>
<p class="tl-link"><a href="/guns/tier-list/">Rank the ${esc(x.name)} in your own tier list</a></p>
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
    title: `${x.name} stats in surviv.io and survev.io: damage, fire rate, switch delay · Quickswitch`,
    description: `${x.name} in surviv.io and survev.io: ${r1(x.perShot)} damage per shot, ${Math.round(x.dps)} damage per second, ${x.shotsToKill} shots to deal ${HP} damage, ${s(x.switchDelay)} switch delay. From the game's source.`,
    crumbs: [['Guides', '/guides/'], ['Guns', '/guns/'], [x.name]],
    body,
  });
}

function guidesIndexPage() {
  const body = `<article>
<h1>survev.io and surviv.io guides</h1>
<ul class="guide-list">
<li><a href="/guides/how-to-get-better/"><b>The five drills to help you become a pro</b></a></li>
<li><a href="/guides/quickswitch/"><b>How to quickswitch</b></a>: the exact switch rule, and the ${SLOW.length} guns that gain most from it.</li>
<li><a href="/guides/bunker-codes/"><b>All bunker codes</b></a>: every puzzle door's code, in one page.</li>
<li><a href="/guns/tier-list/"><b>Make a gun tier list</b></a>: rank every gun, share it, and vote on players' and the community's lists.</li>
<li><a href="/perks/tier-list/"><b>Make a perk tier list</b></a>: the same for all ${PERK_IDS.length} perks.</li>
<li><a href="/guns/community-tier-lists/"><b>Community tier lists</b></a>: ${TIER_LISTS.length} published rankings and what they put on top.</li>
<li><a href="/guns/"><b>Gun stats</b></a>: damage, fire rate and switch delay for all ${ALL.length} guns.</li>
<li><a href="/perks/"><b>Perks</b></a>: what all ${PERK_IDS.length} perks do and where to get them.</li>
</ul>
</article>`;
  return page({
    urlPath: '/guides/',
    title: 'survev.io and surviv.io guides: tips, bunker codes, guns and perks · Quickswitch',
    description: 'survev.io and surviv.io guides built from the game\'s source: how to get better, quickswitching, every bunker code, a gun tier list, gun stats and perks.',
    crumbs: [['Guides']],
    body,
  });
}

// ---------- gun tier list (votes) and the community's published lists ----------

// "By the numbers" tiers: damage per second at close range averaged over reloads, so a two-shell
// MP220 doesn't outrank everything on one volley. The cutoffs are printed on the page.
const DPS_TIERS = [['S', 100], ['A', 85], ['B', 70], ['C', 50], ['D', 0]];
// Full rankings that name a top gun (single-class lists, loadouts and discussions left out).
const FULL_LISTS = TIER_LISTS.filter((l) => l.top && !l.note);
const AWM_TOP = FULL_LISTS.filter((l) => l.top.includes('AWM-S')).length;

// ---------- make your own tier list (guns and perks), and vote on others' ----------

const COMMUNITY_LISTS = JSON.parse(readFileSync(path.join(ROOT, 'guides/community-tierlists.json'), 'utf8'));
// The community lists keep each author's own gun names; these find the page a name belongs to.
const norm = (n) => n.toLowerCase().replace(/^single\s+/, '').replace(/[^a-z0-9]/g, '');
const GUN_BY_NAME = Object.fromEntries(ALL.map((x) => [norm(GUNS[x.id].name), x.id]));
Object.assign(GUN_BY_NAME, { deserteagle: 'deagle', mk20ssr: 'scarssr', glock18c: 'glock', hk416: 'hk416', mosinnagant: 'mosin', m110: 'm1100', m39r: 'm93r', m9cursed: null, vector: 'vector', vector9mm: 'vector', vector45acp: 'vector45' });
const nameLink = (name) => { const id = GUN_BY_NAME[norm(name)]; return id ? `<a href="/guns/${id}/">${esc(name)}</a>` : esc(name); };

const voteControls = (id, label) => `<span class="vote" data-list="${esc(id)}"><button type="button" data-v="1" aria-label="Upvote ${esc(label)}">${CHEVRON('up')}<span class="up">·</span></button><button type="button" data-v="-1" aria-label="Downvote ${esc(label)}">${CHEVRON('down')}<span class="down">·</span></button></span>`;

function communityListHtml(l) {
  const body = l.shape === 'ranking'
    ? `<ol class="tl-ranking">${l.items.map((x) => `<li>${nameLink(x.name)}${x.note ? ` <span class="muted">${esc(x.note)}</span>` : ''}</li>`).join('')}</ol>`
    : `<div class="tl-rows">${l.tiers.map((t) => `<div class="tl-show"><span class="tl-label">${esc(t.label)}</span><span class="tl-names">${t.items.map((x) => nameLink(x.name) + (x.note && x.note !== t.label ? ` <span class="muted">${esc(x.note)}</span>` : '')).join(' · ')}</span></div>`).join('')}</div>`;
  return `<section class="tl-entry" id="${esc(l.id)}">
<div class="tl-meta"><h3><a href="${esc(l.url)}" rel="nofollow noopener">${esc(l.title)}</a></h3><span class="muted">${esc(l.by)}, ${esc(l.where)}, ${esc(l.date)}</span>${voteControls(l.id, `${l.by}'s list`)}</div>
${body}
</section>`;
}

// Built on call: PERK_IDS is defined further down the file.
const maker = (kind) => ({
  guns: {
    urlPath: '/guns/tier-list/', noun: 'gun', plural: 'guns',
    items: () => ALL.map((x) => ({ id: x.id, name: x.name })),
    crumbs: [['Guides', '/guides/'], ['Guns', '/guns/'], ['Tier list']],
    title: 'Make your own surviv.io and survev.io gun tier list · Quickswitch',
    description: `Drag all ${ALL.length} surviv.io and survev.io guns into your own tier list, share it with a link, and vote on players' lists and the community's published ones.`,
  },
  perks: {
    urlPath: '/perks/tier-list/', noun: 'perk', plural: 'perks',
    items: () => PERK_IDS.map((id) => ({ id, name: PERKS.perks[id].name })),
    crumbs: [['Guides', '/guides/'], ['Perks', '/perks/'], ['Tier list']],
    title: 'Make your own surviv.io and survev.io perk tier list · Quickswitch',
    description: `Drag all ${PERK_IDS.length} surviv.io and survev.io perks into your own tier list, share it with a link, and vote on other players' lists.`,
  },
})[kind];

function makerPage(kind) {
  const m = maker(kind);
  const items = m.items();
  const community = COMMUNITY_LISTS.filter((l) => l.kind === kind);
  const byDps = [...ALL].sort((a, b) => b.sustained - a.sustained);
  const dpsTiers = DPS_TIERS.map(([t, min], i) => [t, min, byDps.filter((x) => x.sustained >= min && (i === 0 || x.sustained < DPS_TIERS[i - 1][1]))]);
  const body = `<article>
<h1>Make your own surviv.io ${m.noun} tier list</h1>
<p class="lead">Drag each ${m.noun} into a tier, or tap a ${m.noun} and then a tier. Save it to get a link you can share, then vote on other players' lists${community.length ? ' and the community\'s' : ''}.</p>
<div id="tl-shared" class="tl-shared" hidden></div>

<section class="maker" id="maker" data-kind="${kind}">
<script type="application/json" id="tl-items">${JSON.stringify(items).replace(/</g, '\\u003c')}</script>
<div class="tl-board">
${TIERS_ORDER.map((t) => `<div class="tl-row" data-tier="${t}"><span class="tl-label">${t}</span><div class="tl-drop" data-tier="${t}" aria-label="${t} tier"></div></div>`).join('\n')}
</div>
<h3 class="tl-pool-head">Not ranked yet</h3>
<div class="tl-drop tl-pool" data-tier="">
${items.map((x) => `<button type="button" class="chip" data-id="${x.id}">${esc(x.name)}</button>`).join('')}
</div>
<p class="muted tl-keys">With the keyboard: focus a ${m.noun}, then press S, A, B, C or D to place it, or U to unrank it.</p>
<form class="tl-save" id="tl-save">
<label>Title <input id="tl-title" maxlength="60" placeholder="My ${m.noun} tier list" autocomplete="off"></label>
<label>Your name <input id="tl-by" maxlength="24" placeholder="optional" autocomplete="nickname"></label>
<div class="tl-actions"><button type="button" class="ghost small" id="tl-clear">Start over</button><button type="submit" class="primary small">Save and share</button></div>
<p class="tl-status" id="tl-status" role="status"></p>
</form>
</section>

<h2>Vote on tier lists</h2>
${community.length ? `<p>${community.length} lists the community published, as their authors ranked them, then lists players saved here.</p>
<div class="tl-gallery">
${community.map(communityListHtml).join('\n')}
</div>
<h3 class="tl-sub">From players</h3>` : ''}
<div class="tl-sort" role="group" aria-label="Sort players' lists"><button type="button" class="ghost small" data-sort="top" aria-pressed="true">Top</button><button type="button" class="ghost small" data-sort="new" aria-pressed="false">New</button></div>
<div id="tl-gallery" class="tl-gallery"><p class="muted">Loading…</p></div>
${kind === 'guns' ? `
<h2>By the numbers: damage per second, with reloads</h2>
<p>Damage per second at close range, averaged over a full magazine and its reload, if every round hits the body, with no armor and no headshots. It rewards guns that keep firing and says nothing about range, so most snipers sit low here even though players rate them highest: the AWM-S is in the top picks of ${AWM_TOP} of the ${FULL_LISTS.length} <a href="/guns/community-tier-lists/">published rankings</a> that name them.</p>
<div class="ranking">
${dpsTiers.map(([t, min, xs], i) => `<section class="tier-group">
<h3 class="tier-head"><span class="tier-letter">${t}</span><span class="tier-note">${i === 0 ? `${min}+` : `${min}–${DPS_TIERS[i - 1][1]}`} damage per second</span></h3>
${xs.length ? `<ol class="bars">
${xs.map((x) => `<li><a href="/guns/${x.id}/">${esc(x.name)}</a><span class="ammo">${esc(x.ammo)}</span><span class="bar" aria-hidden="true"><i style="width:${Math.round(100 * x.sustained / byDps[0].sustained)}%"></i></span><b class="num">${Math.round(x.sustained)}</b></li>`).join('\n')}
</ol>` : '<p class="muted">None.</p>'}
</section>`).join('\n')}
</div>` : ''}
</article>`;
  return page({
    urlPath: m.urlPath, title: m.title, description: m.description, crumbs: m.crumbs, body,
    scripts: ['/guides/tierlists.js'],
    note: kind === 'guns' ? 'The numbers come from survev\'s source (<code>gunDefs.ts</code>, <code>bulletDefs.ts</code>, <code>gameConfig.ts</code>); each community list belongs to its author, as published at the link.' : 'Perk names come from survev\'s source (<code>perkDefs.ts</code>).',
  });
}

function communityPage() {
  const rows = TIER_LISTS.map((l) => [
    `<a href="${esc(l.url)}" rel="nofollow noopener">${esc(l.title)}</a>`, esc(l.author), esc(l.where), esc(l.date), esc(l.reach),
    l.top ? esc(l.top.join(', ')) + (l.note ? ` <span class="muted">(${esc(l.note)})</span>` : '') : `<span class="muted">${l.note ? esc(l.note) : 'in the video or image'}</span>`,
  ]);
  const body = `<article>
<h1>surviv.io gun tier lists: what players rank best</h1>
<p class="lead">Players have published gun rankings since 2018. The AWM-S is in the top picks of ${AWM_TOP} of the ${FULL_LISTS.length} full rankings below that name them, more than any other gun; the M249, SV-98, Saiga-12, USAS-12 and PKP make up most of the rest.</p>
<p>Each entry links to the original. Most of them rank the 2018–2021 surviv.io, whose guns survev.io kept.</p>
${table([{ t: 'Ranking' }, { t: 'By' }, { t: 'Where' }, { t: 'Date' }, { t: 'Reach' }, { t: 'Top picks' }], rows, 'lists')}

<h2>What players say</h2>
${QUOTES.map((x) => `<blockquote><p>“${esc(x.text)}”</p><footer>— <a href="${esc(x.url)}" rel="nofollow noopener">${esc(x.author)}</a>, ${esc(x.date)}</footer></blockquote>`).join('\n')}

<h2>Make your own</h2>
<p><a href="/guns/tier-list/">Make your own tier list</a> and vote on others', including ${COMMUNITY_LISTS.filter((l) => l.kind === 'guns').length} of these lists in full.</p>
</article>`;
  return page({
    urlPath: '/guns/community-tier-lists/',
    title: 'surviv.io gun tier lists from the community, in one place · Quickswitch',
    description: `${TIER_LISTS.length} surviv.io and survev.io gun tier lists and rankings from YouTube, Reddit and the wiki, with their top picks and links to each.`,
    crumbs: [['Guides', '/guides/'], ['Guns', '/guns/'], ['Community tier lists']],
    body,
    note: 'Each tier list and quote belongs to its author; follow the link for the original.',
  });
}

// ---------- how to get better: evanthebouncy's drills ----------

function evanPage() {
  const at = (mmss) => { const [m, sec] = mmss.split(':').map(Number); return `<a href="https://www.youtube.com/watch?v=${EVAN.id}&amp;t=${m * 60 + sec}s" rel="noopener">${mmss}</a>`; };
  const q = (text, mmss) => `<blockquote><p>“${esc(text)}”</p><footer>— evanthebouncy, ${at(mmss)}</footer></blockquote>`;
  const body = `<article>
<h1>How to get better at surviv.io: evanthebouncy's five drills</h1>
<p class="lead">In 2019 evanthebouncy (Evan Pu), who does AI and cognitive-science research, recorded an hour of surviv drills. His argument: a real match is too noisy to tell what won or lost it, so practice one skill at a time in a setting where every action has a result you can see.</p>
<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${EVAN.id}" title="${esc(EVAN.title)}" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
<p class="muted">“<a href="https://www.youtube.com/watch?v=${EVAN.id}" rel="noopener">${esc(EVAN.title)}</a>” by <a href="${EVAN.channelUrl}" rel="noopener">${esc(EVAN.channel)}</a>, ${EVAN.date}, ${EVAN.length}. He also <a href="${EVAN.reddit}" rel="noopener">posted it to r/survivio</a>. This page summarizes it; the timestamps link into the video.</p>
${q('drills so that you can actively practice so you get better', '00:20')}

<h2>Set up before you drill</h2>
<ul>
<li><b>Bind every weapon to your right hand</b> (${at('02:44')}). His left hand moves and loots; right click switches to the other gun, middle click to melee, and the mouse wheel steps through scopes.</li>
<li><b>Use a big crosshair</b> (${at('05:23')}). He finds the default too small.</li>
<li><b>Warm up for three minutes</b> (${at('06:14')}): clicking drills, one click straight onto each target.</li>
</ul>
${q('I used to never start [a game] with [surviv] without doing a click practice for at least three minutes', '07:50')}

<h2>The five drills</h2>
<ol>
<li><b>SMGs only, aiming behind the target</b> (${at('09:37')}). Use only spray guns such as the MAC-10, MP5 or AK-47. Leading a moving target with an imprecise cursor spreads your shots; trailing it keeps them together.</li>
<li><b>Double pump only</b> (${at('19:23')}). Fire a pump shotgun, switch to the other gun at once, fire again. He pairs an M870 or SPAS-12 with an MP220, M1100, Saiga-12, OT-38 or Mosin-Nagant, and puts the shortest gap between the two shots at about a quarter of a second. survev's source agrees: a <a href="/guides/quickswitch/">quick switch</a> costs ${s(SWITCH)}.</li>
<li><b>M870 plus an SMG</b> (${at('34:49')}): shotgun, half a magazine, shotgun, the other half, shotgun. Strong in tight spaces, weaker late in a match.</li>
<li><b>Melee only</b> (${at('46:58')}). Win fights with your fists to learn diagonal movement and how to stay on top of a target.</li>
<li><b>Passive-aggressive</b> (${at('52:49')}). Never fire first: close in, let them shoot, then answer with your shotgun. It trains patience.</li>
</ol>
${q('double pump is probably the most important thing you can do in [surviv]', '19:31')}
${q('the passive-aggressive drill which is you never fire on someone until he fire on you first', '52:54')}

<h2>Practice the same skills in Quickswitch</h2>
${table([{ t: 'His drill' }, { t: 'Quickswitch drill' }], [
    ['Three-minute click warm-up', '<b>Daily 5</b> (opens with a 30-second warm-up), <b>Flick</b>, <b>Static clicking</b>'],
    ['SMGs only, aim behind the target', '<b>Tracking</b>, <b>Reactive tracking</b>, the <b>Tracking focus</b> routine'],
    ['Double pump', '<b>Quick Switch</b> and <b>Shotgun Rush</b>, with survev\'s exact switch rule'],
    ['M870 plus an SMG', '<b>Quick Switch</b> (M870 and MP5)'],
    ['Passive-aggressive', '<b>Dodge under fire</b> and <b>1v1 Duel</b>, where the bot shoots back'],
    ['Melee only', 'No melee drill yet'],
  ])}
</article>`;
  return page({
    urlPath: '/guides/how-to-get-better/',
    title: 'How to get better at surviv.io and survev.io: 5 drills from evanthebouncy · Quickswitch',
    description: 'evanthebouncy\'s five surviv drills, with timestamps: SMG tracking, double pump, M870 plus SMG, melee only and passive-aggressive, plus his keybind and warm-up setup.',
    crumbs: [['Guides', '/guides/'], ['How to get better']],
    body,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: 'How to get better at surviv.io: evanthebouncy\'s five drills', url: `${ORIGIN}/guides/how-to-get-better/` },
    note: `The video belongs to ${esc(EVAN.channel)}; quotes are from its captions.`,
  });
}

// ---------- perks ----------

const LOOT_MAPS = { base: 'Normal', desert: 'Desert', savannah: 'Savannah' };
// Roles that hand out perks, by the mode they belong to (roleDefs.ts; Cobalt's classes come from
// cobaltDefs.ts perkModeRoles).
const ROLE_MODE = { scout: 'Cobalt', sniper: 'Cobalt', healer: 'Cobalt', demo: 'Cobalt', assault: 'Cobalt', tank: 'Cobalt',
  leader: '50v50', captain: '50v50', lieutenant: '50v50', medic: '50v50', marksman: '50v50', recon: '50v50',
  grenadier: '50v50', bugler: '50v50', last_man: '50v50', woods_king: 'Woods' };
// Lone Survivr always gets Steelskin and Takedown, plus one of each pair below at random (roleDefs.ts).
const LONE_RANDOM = ['ap_rounds', 'splinter', 'windwalk', 'field_medic'];
export const PERK_IDS = Object.keys(PERKS.perks).sort((a, b) => PERKS.perks[a].name.localeCompare(PERKS.perks[b].name));

function perkSources(id) {
  const out = [];
  for (const [rid, r] of Object.entries(PERKS.roles)) {
    if (!r.perks.includes(id)) continue;
    const mode = ROLE_MODE[rid];
    out.push(`${/^the /i.test(r.name) ? '' : 'the '}${esc(r.name)} role${mode ? ` (${mode})` : ''}${rid === 'last_man' && LONE_RANDOM.includes(id) ? ' as one of two random picks' : ''}`);
  }
  const maps = Object.entries(PERKS.lootByMap).filter(([, ids]) => ids.includes(id)).map(([m]) => LOOT_MAPS[m] || m);
  if (maps.length) out.push(`loot on the ${andList(maps)} map${maps.length > 1 ? 's' : ''}`);
  if (/^(trick_|treat_|halloween_)/.test(id)) out.push('the Halloween event');
  return out;
}
const perkLink = (id) => `<a href="/perks/${id}/">${esc(PERKS.perks[id].name)}</a>`;

function perksIndexPage() {
  const body = `<article>
<h1>surviv.io and survev.io perks</h1>
<p class="lead">What each of survev's ${PERK_IDS.length} perks does, in the game's own words, and where you can get it.</p>
<p><a href="/perks/tier-list/">Make your own perk tier list</a>.</p>
${table([{ t: 'Perk' }, { t: 'What it does' }, { t: 'Where you get it' }],
    PERK_IDS.map((id) => [perkLink(id), esc(PERKS.perks[id].desc) || '<span class="muted">no description in the game</span>', andList(perkSources(id)) || '<span class="muted">not in normal loot</span>']))}
</article>`;
  return page({
    urlPath: '/perks/',
    title: 'surviv.io and survev.io perks: what every perk does · Quickswitch',
    description: `All ${PERK_IDS.length} survev.io and surviv.io perks: what each one does and which role, map or event gives it, from the game's source.`,
    crumbs: [['Guides', '/guides/'], ['Perks']],
    body,
    note: 'Every perk and number on this page comes from survev\'s source (<code>perkDefs.ts</code>, <code>roleDefs.ts</code>, the map definitions and the English text file).',
  });
}

function perkPage(id) {
  const p = PERKS.perks[id];
  const from = perkSources(id);
  const ammo = Object.entries(PERKS.ammoBonuses).filter(([, ids]) => ids.includes(id)).map(([a]) => AMMO[a] || a);
  const props = p.properties ? Object.entries(p.properties).filter(([, v]) => typeof v !== 'object') : [];
  const body = `<article>
<h1>${esc(p.name)} perk in survev.io and surviv.io</h1>
<p class="lead">${esc(p.desc) || 'The game gives this perk no description.'}</p>
<p class="tl-link"><a href="/perks/tier-list/">Rank ${esc(p.name)} in your own perk tier list</a></p>
<ul class="facts">
<li>${from.length ? `You get it from ${andList(from)}.` : 'It isn\'t in normal loot or any role\'s kit.'}</li>
${ammo.length ? `<li>${andList(ammo)} rounds do ×${PERKS.ammoBonusDamageMult} damage with it.</li>\n` : ''}</ul>
${props.length ? `<h2>Numbers in the game files</h2>
${table([{ t: 'Setting' }, { t: 'Value', n: 1 }], props.map(([k, v]) => [`<code>${esc(k)}</code>`, esc(v)]), 'stats')}` : ''}
<h2>Other perks</h2>
<p class="peers">${PERK_IDS.filter((x) => x !== id).map(perkLink).join(' · ')}</p>
</article>`;
  return page({
    urlPath: `/perks/${id}/`,
    title: `${p.name} perk in surviv.io and survev.io: what it does · Quickswitch`,
    description: `${p.name} in survev.io and surviv.io: ${p.desc || 'what it does'}${from.length ? ` Comes from ${from.join(', ').replace(/<[^>]+>/g, '')}.` : ''}`,
    crumbs: [['Guides', '/guides/'], ['Perks', '/perks/'], [p.name]],
    body,
    note: 'Every perk and number on this page comes from survev\'s source (<code>perkDefs.ts</code>, <code>roleDefs.ts</code>, the map definitions and the English text file).',
  });
}

// ---------- bunker and puzzle codes ----------

// Where each puzzle in puzzles.ts sits, traced through survev's building, structure and map defs.
// `wait` is the puzzle's pieceResetDelay: how long it waits between presses before it resets.
const PUZZLE_SPOTS = [
  { id: 'bunker_eye_02_woods', room: 'bunker_eye_02', place: 'Eye bunker vault', maps: 'Woods (all seasons)', wait: 10 },
  { id: 'bunker_eye_02', room: 'bunker_eye_02', place: 'Eye bunker vault', maps: 'Halloween', wait: 10 },
  { id: 'bunker_chrys_01', place: 'Greenhouse bunker (chrysanthemum), lab door', maps: 'every map with a greenhouse: Normal and its seasonal versions, Desert, Snow, 50v50, Potato', wait: 10, show: { ichi: 'ichi (一)', ni: 'ni (二)', san: 'san (三)', shi: 'shi (四)' } },
  { id: 'bunker_chrys_02', place: 'Greenhouse bunker (chrysanthemum), vault', maps: 'the same greenhouse maps', wait: 10 },
  { id: 'bunker_twins', place: 'Twins bunker', maps: 'Cobalt', wait: 6, caption: 'Each class has its own control: scout is the green button, sniper the blue button, medic the switch with a pink band, demo the plain switch, assault the switch with a yellow band and tank the switch with an orange band.' },
  { id: 'club_01', place: 'Club, secret door', maps: 'Normal, Beach, Cobalt, Potato', wait: 10 },
  { id: 'club_02', place: 'Bathhouse under the club, vault', maps: 'Normal, Beach, Cobalt, Potato', wait: 10 },
  { id: 'saloon', place: 'Saloon, secret door', maps: 'Desert', wait: 10, caption: 'The buttons are seven coloured bottles spread around the saloon; press them in rainbow order.' },
  { id: 'reserve_vault', place: 'Reserve vault', maps: 'Desert', wait: 6, caption: 'The switches are on the outside wall. Two of them are numbered 2, and either one works for steps 2 and 5.' },
];

const PUZZLE_IMG = '/vendor/survev/img/puzzles/';

// One room drawn from survev's own floor art and puzzle pieces, cropped to the pieces, with the
// press order numbered on each piece (a piece pressed twice carries both numbers).
function roomSvg(spot) {
  const room = ROOMS.rooms[spot.room || spot.id];
  if (!room) return '';
  const code = PUZZLES[spot.id];
  const steps = {};
  code.forEach((piece, i) => { (steps[piece] = steps[piece] || []).push(i + 1); });
  const xs = room.pieces.map((p) => p.x), ys = room.pieces.map((p) => p.y);
  // Crop to the pieces with a margin, but never tighter than 24 × 14 units, so a one-piece room
  // still shows where the piece sits.
  const pad = 4.5;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const w = Math.max(Math.max(...xs) - Math.min(...xs) + 2 * pad, 24), h = Math.max(Math.max(...ys) - Math.min(...ys) + 2 * pad, 14);
  const box = { x: cx - w / 2, y: cy - h / 2, w, h };
  const tints = [...new Set([...room.floor, ...room.pieces].map((x) => x.tint).filter(Boolean))];
  const filter = (t) => t ? ` filter="url(#t${t.slice(1)})"` : '';
  const img = (x) => x.src ? `<image href="${PUZZLE_IMG}${x.src}" x="${r2(-x.w / 2)}" y="${r2(-x.h / 2)}" width="${r2(x.w)}" height="${r2(x.h)}" transform="translate(${r2(x.x)} ${r2(x.y)}) rotate(${x.rot}) scale(${x.mirrorX ? -1 : 1} ${x.mirrorY ? -1 : 1})"${x.alpha !== undefined && x.alpha < 1 ? ` opacity="${x.alpha}"` : ''}${filter(x.tint)}/>` : '';
  const marker = (p) => {
    const n = steps[p.piece];
    if (!n) return '';
    const label = n.join(',');
    const r = label.length > 2 ? 1.25 : 0.95;
    // A number sits on a big piece, and beside a small one (a switch is about one unit across).
    const off = p.w < 2 ? 1.5 : 0;
    return `<g class="step" transform="translate(${r2(p.x + off)} ${r2(p.y - off)})"><circle r="${r}"/><text dy="0.36">${label}</text></g>`;
  };
  return `<svg class="room" viewBox="${r2(box.x)} ${r2(box.y)} ${r2(box.w)} ${r2(box.h)}" role="img" aria-label="${esc(spot.place)}: the pieces numbered in the order to press them">
<defs>${tints.map((t) => { const [r, g, b] = [1, 3, 5].map((i) => (parseInt(t.slice(i, i + 2), 16) / 255).toFixed(3)); return `<filter id="t${t.slice(1)}"><feColorMatrix values="${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0"/></filter>`; }).join('')}</defs>
${room.floor.map(img).join('\n')}
${room.pieces.map(img).join('\n')}
${room.pieces.map(marker).join('')}
</svg>`;
}

function bunkerCodesPage() {
  const unplaced = Object.keys(PUZZLES).filter((id) => !PUZZLE_SPOTS.some((x) => x.id === id));
  if (unplaced.length) throw new Error(`puzzles.ts has codes this page doesn't place: ${unplaced.join(', ')}`);
  const emblem = (piece) => ROOMS.emblems[piece] ? `<img class="emblem" src="${PUZZLE_IMG}${ROOMS.emblems[piece]}" alt="" width="18" height="18">` : '';
  const code = (spot) => PUZZLES[spot.id].map((piece) => `<b>${spot.room === 'bunker_eye_02' ? emblem(piece) : ''}${esc((spot.show && spot.show[piece]) || piece)}</b>`).join(' → ');
  const body = `<article>
<h1>All survev.io and surviv.io bunker codes</h1>
<p class="lead">Every puzzle door in survev takes the same code in every match. Here are all ${PUZZLE_SPOTS.length}, read from the game's source (<code>puzzles.ts</code>), with a picture of each room below: press the pieces in the numbered order.</p>
${table([{ t: 'Where' }, { t: 'Map' }, { t: 'Code' }, { t: 'Reset after', n: 1 }],
    PUZZLE_SPOTS.map((x) => [esc(x.place), esc(x.maps), code(x), `${x.wait} s`]), 'codes')}
${PUZZLE_SPOTS.map((x) => `<section class="puzzle">
<h2>${esc(x.place)}: ${esc(x.maps.split(':')[0])}</h2>
<p class="puzzle-code">${code(x)}</p>
${roomSvg(x)}${x.caption ? `\n<p class="muted">${x.caption}</p>` : ''}
</section>`).join('\n')}

<h2>How the puzzles work</h2>
<ul>
<li><b>A wrong piece resets the whole code.</b> Once you've pressed as many pieces as the code is long and the order is wrong, the door buzzes and you start over.</li>
<li><b>Pause too long and it resets.</b> The last column is how long the puzzle waits between presses.</li>
<li><b>The Woods eye bunker uses a longer code</b> than the Halloween one: the game swaps in a ten-symbol code whenever the map is in woods mode.</li>
</ul>
</article>`;
  return page({
    urlPath: '/guides/bunker-codes/',
    title: 'All survev.io and surviv.io bunker codes, in one page · Quickswitch',
    description: 'Every survev.io and surviv.io bunker and puzzle code in one page: Eye bunker (Woods and Halloween), greenhouse chrysanthemum bunker, Twins bunker, club, bathhouse, saloon and reserve vault.',
    crumbs: [['Guides', '/guides/'], ['Bunker codes']],
    body,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: 'All survev.io and surviv.io bunker codes', url: `${ORIGIN}/guides/bunker-codes/` },
    note: 'Every code on this page comes from survev\'s source (<code>shared/defs/puzzles.ts</code> and the building and map definitions).',
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
    'guides/how-to-get-better/index.html': evanPage(),
    'guides/bunker-codes/index.html': bunkerCodesPage(),
    'guns/index.html': gunsIndexPage(),
    'guns/tier-list/index.html': makerPage('guns'),
    'perks/tier-list/index.html': makerPage('perks'),
    'guns/community-tier-lists/index.html': communityPage(),
    'perks/index.html': perksIndexPage(),
  };
  for (const x of ALL) files[`guns/${x.id}/index.html`] = gunPage(x);
  for (const id of PERK_IDS) files[`perks/${id}/index.html`] = perkPage(id);
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
