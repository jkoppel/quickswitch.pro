// Extracts the rooms that hold survev's puzzle doors, for the pictures on /guides/bunker-codes/:
// each room's floor art and puzzle pieces, placed the way survev's client places them. Run it
// against a checkout of github.com/survev/survev (Node 23+ reads its TypeScript directly):
//
//   node tools/extract-puzzle-rooms.mjs /path/to/survev
//
// Writes vendor/survev/defs/puzzleRooms.json and copies the sprites it uses into
// vendor/survev/img/puzzles/. Positions are in game units with y pointing down (survev's points up).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SURVEV = path.resolve(process.argv[2] || '');
if (!existsSync(path.join(SURVEV, 'shared/defs/mapObjectDefs.ts'))) {
  console.error('usage: node tools/extract-puzzle-rooms.mjs /path/to/survev');
  process.exit(1);
}
const { RawMapObjectDefs: DEFS } = await import(path.join(SURVEV, 'shared/defs/mapObjectDefs.ts'));
const PPU = 16;   // survev's camera: 16 screen pixels per unit at zoom 1

// The room each puzzle is drawn from. bunker_chrys_02 also appears in compartment_01b, which holds
// no pieces of its own; bunker_eye_01's building has no pieces either.
const ROOMS = {
  bunker_eye_02: 'bunker_eye_sublevel_01',
  bunker_chrys_01: 'bunker_chrys_sublevel_01',
  bunker_chrys_02: 'bunker_chrys_compartment_01',
  bunker_twins: 'bunker_twins_sublevel_01',
  club_01: 'club_01',
  club_02: 'bathhouse_01',
  saloon: 'saloon_01',
  reserve_vault: 'reserve_vault_01',
};

// Sprite name ("map-switch-01.img") to its file in client/public/img.
const files = {};
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(svg|png)$/.test(e.name)) files[e.name.replace(/\.(svg|png)$/, '')] = files[e.name.replace(/\.(svg|png)$/, '')] || p;
  }
})(path.join(SURVEV, 'client/public/img'));

const outImg = path.join(ROOT, 'vendor/survev/img/puzzles');
mkdirSync(outImg, { recursive: true });
const used = new Set();

// A sprite's size in pixels, from the SVG's width and height (or its viewBox).
function spritePx(file) {
  if (file.endsWith('.png')) {
    const b = readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  const head = readFileSync(file, 'utf8').slice(0, 4000);
  const svg = /<svg[\s\S]*?>/.exec(head)[0];
  const num = (name) => { const m = new RegExp(`\\s${name}="([\\d.]+)`).exec(svg); return m ? Number(m[1]) : null; };
  let w = num('width'), h = num('height');
  if (!w || !h) { const vb = /viewBox="([\d.\s-]+)"/.exec(svg)[1].trim().split(/\s+/).map(Number); w = vb[2]; h = vb[3]; }
  return { w, h };
}

function sprite(name, scale) {
  const key = String(name).replace(/\.img$/, '');
  const file = files[key];
  if (!file) return null;
  const out = path.basename(file);
  if (!used.has(out)) { copyFileSync(file, path.join(outImg, out)); used.add(out); }
  const { w, h } = spritePx(file);
  return { src: out, w: (w * scale) / PPU, h: (h * scale) / PPU };
}

const hex = (t) => (t === undefined || t === 0xffffff ? null : '#' + t.toString(16).padStart(6, '0'));

const rooms = {};
for (const [puzzle, building] of Object.entries(ROOMS)) {
  const b = DEFS[building];
  if (!b || !b.puzzle) throw new Error(`${building} has no puzzle`);
  const floor = [];
  for (const img of (b.floor && b.floor.imgs) || []) {
    const s = img.sprite && img.sprite !== 'none' ? sprite(img.sprite, img.scale ?? 1) : null;
    if (!s) continue;
    const pos = img.pos || { x: 0, y: 0 };
    // Floor sprites turn clockwise on screen by their rot, in quarter turns (building.ts).
    floor.push({ ...s, x: pos.x, y: -pos.y, rot: (img.rot || 0) * 90, mirrorX: !!img.mirrorX, mirrorY: !!img.mirrorY, alpha: img.alpha ?? 1, tint: hex(img.tint) });
  }
  const pieces = [];
  for (const o of b.mapObjects || []) {
    if (!o.puzzlePiece) continue;
    const d = DEFS[o.type];
    const s = d && d.img && sprite(d.img.sprite, (d.img.scale ?? 1) * (o.scale ?? 1));
    // Obstacles turn counter-clockwise on screen by their ori (obstacle.ts: rotation = -rot).
    pieces.push({ piece: o.puzzlePiece, type: o.type, x: o.pos.x, y: -o.pos.y, rot: -(o.ori || 0) * 90,
      ...(s || { src: null, w: 1, h: 1 }), tint: d && d.img ? hex(d.img.tint) : null,
      mirrorX: !!(d && d.img && d.img.mirrorX), mirrorY: !!(d && d.img && d.img.mirrorY) });
  }
  rooms[puzzle] = { building, floor, pieces };
}
// survev's own emblems for the eye bunker's symbols, where it has one (emotes/logo-*.svg).
const emblems = {};
for (const name of ['swine', 'hydra', 'crossing', 'hatchet', 'harpsichord', 'caduceus', 'egg', 'cloud', 'storm', 'conch']) {
  const s = sprite(`logo-${name}`, 1);
  if (s) emblems[name] = s.src;
}

writeFileSync(path.join(ROOT, 'vendor/survev/defs/puzzleRooms.json'), JSON.stringify({ rooms, emblems }, null, 1) + '\n');
console.log(`${Object.keys(rooms).length} rooms, ${used.size} sprites`);
for (const [k, r] of Object.entries(rooms)) console.log(k, r.building, 'floor', r.floor.length, 'pieces', r.pieces.map((p) => p.piece).join(','));
