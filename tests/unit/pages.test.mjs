// The guide pages are generated from vendor/survev/defs by tools/build-pages.mjs and committed.
// If survev's numbers change and nobody reruns the script, the pages would quietly lie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { buildPages, stats } = await import('../../tools/build-pages.mjs');
const root = new URL('../../', import.meta.url);

test('the committed guide pages match what survev\'s defs produce', () => {
  const stale = Object.entries(buildPages()).filter(([rel, text]) => {
    try { return readFileSync(new URL(rel, root), 'utf8') !== text; } catch { return true; }
  }).map(([rel]) => rel);
  assert.deepEqual(stale, [], 'run `node tools/build-pages.mjs` and commit the result');
});

test('gun numbers follow survev\'s fire rules', () => {
  // M870: 9 pellets of 12.5, one pump every 0.9 s.
  const m870 = stats('m870');
  assert.equal(m870.perShot, 112.5);
  assert.equal(m870.shotsToKill, 1);
  assert.equal(m870.deployGroup, 1);
  // AN-94: a 2-round burst 0.025 s apart, then 0.24 s after the burst's last round.
  const an94 = stats('an94');
  assert.equal(an94.cycle, 0.025 + 0.24);
  assert.equal(an94.shotsToKill, 5);
  assert.equal(Math.round(an94.ttk * 1000), Math.round((2 * 0.265 + 0) * 1000));
  // MP5: 11 per round, 10 rounds for 100 HP, nine gaps of 0.09 s.
  const mp5 = stats('mp5');
  assert.equal(mp5.shotsToKill, 10);
  assert.equal(Math.round(mp5.ttk * 100), 81);
});

test('every guide page links home, names a canonical URL and is in the sitemap', () => {
  const files = buildPages();
  const sitemap = files['sitemap.xml'];
  for (const [rel, html] of Object.entries(files)) {
    if (!rel.endsWith('.html')) continue;
    const url = 'https://quickswitch.pro/' + rel.replace(/index\.html$/, '');
    assert.match(html, new RegExp(`<link rel="canonical" href="${url}">`), rel);
    assert.match(html, /<a class="cta" href="\/">/, rel);
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), rel);
  }
});

test('tier lists accept exactly the guns and perks that have pages', async () => {
  const { PAGE_IDS, PERK_IDS } = await import('../../tools/build-pages.mjs');
  const { itemIds } = await import('../../lib/tierlists.mjs');
  assert.deepEqual([...itemIds('guns')].sort(), [...PAGE_IDS].sort());
  assert.deepEqual([...itemIds('perks')].sort(), [...PERK_IDS].sort());
});

test('the bunker codes page shows every code in survev\'s puzzles.ts, in order', () => {
  const html = buildPages()['guides/bunker-codes/index.html'];
  const puzzles = JSON.parse(readFileSync(new URL('vendor/survev/defs/puzzles.json', root), 'utf8'));
  for (const [id, code] of Object.entries(puzzles)) {
    // Each piece in order, as a bold name (an emblem may precede it, a gloss like "(一)" follow it).
    let at = 0;
    for (const piece of code) {
      const re = new RegExp(`>${piece}( \\([^)]*\\))?</b>`, 'g');
      re.lastIndex = at;
      const m = re.exec(html);
      assert.ok(m, `${id}: ${piece}`);
      at = m.index + m[0].length;
    }
  }
});
