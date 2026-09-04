// A simulated human player that drives the trainer through real Playwright mouse/keyboard events.
// Reaction delay, Fitts-style movement time, minimum-jerk trajectories, endpoint noise,
// overshoot bias and corrective submovements, partial lead on moving targets.

const rand = (a, b) => a + Math.random() * (b - a);
function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const minJerk = (t) => t * t * t * (10 + t * (-15 + 6 * t));

// Injects a per-frame state writer into the page (main world) so the bot can read game state cheaply.
export async function installProbe(page) {
  await page.evaluate(() => {
    if (document.getElementById('bot-probe')) return;
    const s = document.createElement('script');
    s.id = 'bot-probe';
    s.textContent = `(function(){
      function vis(id){ const el=document.getElementById(id); return el && !el.classList.contains('hidden'); }
      function tick(){
        const g = window.ST && ST.currentGame;
        const st = { screen: vis('menu') ? 'menu' : vis('results') ? 'results' : vis('rest') ? 'rest' : vis('pause') ? 'pause' : 'game' };
        if (g && g.running && !g.paused && !g.finished) {
          st.time = g.time; st.w = g.w; st.h = g.h; st.r = g.ppu;
          st.auto = g.player.gun.def.auto; st.fireDelay = g.player.gun.def.fireDelay;
          st.bulletSpeed = g.player.gun.def.speed * g.ppu; st.ammo = g.player.gun.ammo; st.reloading = g.player.gun.reloading;
          st.hp = g.player.hp; st.shoots = !!g.s.enemyShoots; st.flee = g.s.behavior === 'flee';
          st.enemies = g.enemies.map(e => { const p = g.worldToScreen(e.pos.x, e.pos.y); return { id: e.spawnT, x: p.x, y: p.y, vx: e.vel.x * g.ppu, vy: e.vel.y * g.ppu, hp: e.hp, spawnT: e.spawnT }; });
        }
        document.body.dataset.bot = JSON.stringify(st);
        requestAnimationFrame(tick);
      }
      tick();
    })();`;
    document.body.appendChild(s);
  });
}

export async function readState(page) {
  const raw = await page.evaluate(() => document.body.dataset.bot || '{}');
  return JSON.parse(raw);
}

// Plays the current step until the screen changes away from 'game'.
export async function playStep(page, skill = {}) {
  const S = {
    reaction: [0.17, 0.28],   // s, uniform range before starting a flick
    fittsA: 0.08, fittsB: 0.11, // MT = a + b*log2(D/W + 1)
    noise: 0.35,               // endpoint sigma as a fraction of target radius
    overshoot: 1.06,           // gain bias on the primary movement
    leadSkill: 0.95,           // fraction of the true lead applied
    trackLag: 0.45,            // exponential approach rate per tick when tracking
    jitter: 1.2,               // px jitter while tracking
    movement: null,            // null | 'chase' | 'dodge' | 'auto'
    ...skill,
  };
  const held = new Set();
  let moveKeys = new Set();
  let nextMoveChange = 0;
  async function setKeys(want) {
    for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  }
  let cur = null;               // cursor position (screen px)
  let move = null;              // active ballistic movement {x0,y0,x1,y1,t0,dur,correction}
  let waitUntil = 0;            // reaction gate
  let lastTargetId = null;
  let down = false;
  let nextShot = 0;
  let lastState = null;
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;

  while (true) {
    const st = await readState(page);
    if (st.screen !== 'game' || !st.enemies) {
      if (down) { await page.mouse.up(); down = false; }
      await setKeys(new Set());
      return lastState;
    }
    lastState = st;
    const r = st.r;
    if (!cur) { cur = { x: st.w / 2 + 120, y: st.h / 2 - 80 }; await page.mouse.move(cur.x, cur.y); }
    const t = now();

    // Pick the nearest live enemy, sticking with the current one if still alive.
    let target = st.enemies.find(e => e.id === lastTargetId) || null;
    if (!target) {
      let best = Infinity;
      for (const e of st.enemies) { const d = Math.hypot(e.x - cur.x, e.y - cur.y); if (d < best) { best = d; target = e; } }
      if (target) { lastTargetId = target.id; waitUntil = t + rand(S.reaction[0], S.reaction[1]); move = null; }
    }
    if (!target) { if (down) { await page.mouse.up(); down = false; } await page.waitForTimeout(16); continue; }

    // Aim point with partial lead for bullet travel time.
    const dist = Math.hypot(target.x - st.w / 2, target.y - st.h / 2);
    const flight = dist / st.bulletSpeed;
    const aim = { x: target.x + target.vx * flight * S.leadSkill, y: target.y + target.vy * flight * S.leadSkill };
    const dAim = Math.hypot(aim.x - cur.x, aim.y - cur.y);

    const targetSpeed = Math.hypot(target.vx, target.vy);
    const tracking = targetSpeed > 0.5 * r && dAim < 6 * r; // moving target already near the cursor: track it
    if (move) {
      const u = Math.min(1, (t - move.t0) / move.dur);
      const k = minJerk(u);
      cur = { x: move.x0 + (move.x1 - move.x0) * k, y: move.y0 + (move.y1 - move.y0) * k };
      if (u >= 1) move = null;
    } else if (tracking) {
      cur = { x: cur.x + (aim.x - cur.x) * S.trackLag + gauss() * S.jitter, y: cur.y + (aim.y - cur.y) * S.trackLag + gauss() * S.jitter };
    } else if (dAim > 2.2 * r) {
      // Ballistic flick after the reaction delay.
      if (t >= waitUntil) {
        const D = dAim, W = 2 * r;
        const dur = S.fittsA + S.fittsB * Math.log2(D / W + 1);
        const g = S.overshoot + gauss() * 0.06;
        const nx = gauss() * S.noise * r, ny = gauss() * S.noise * r;
        move = { x0: cur.x, y0: cur.y, x1: cur.x + (aim.x - cur.x) * g + nx, y1: cur.y + (aim.y - cur.y) * g + ny, t0: t, dur };
      }
    } else if (dAim > 0.7 * r && !move) {
      // Small correction toward the aim point.
      const nx = gauss() * 0.15 * r, ny = gauss() * 0.15 * r;
      move = { x0: cur.x, y0: cur.y, x1: aim.x + nx, y1: aim.y + ny, t0: t, dur: rand(0.09, 0.14), correction: true };
    } else {
      // Tracking: lagged exponential approach plus jitter.
      cur = { x: cur.x + (aim.x - cur.x) * S.trackLag + gauss() * S.jitter, y: cur.y + (aim.y - cur.y) * S.trackLag + gauss() * S.jitter };
    }
    await page.mouse.move(cur.x, cur.y);

    // Trigger discipline.
    const onTarget = Math.hypot(aim.x - cur.x, aim.y - cur.y) < 1.4 * r && (!move || tracking);
    if (st.auto) {
      if (onTarget && !down) { await page.mouse.down(); down = true; }
      else if (!onTarget && down && Math.hypot(aim.x - cur.x, aim.y - cur.y) > 2.5 * r) { await page.mouse.up(); down = false; }
    } else if (onTarget && t >= nextShot && !st.reloading) {
      await page.mouse.down(); await page.waitForTimeout(25); await page.mouse.up();
      nextShot = t + st.fireDelay + rand(0.08, 0.2);
    }
    if (st.ammo === 0 && !st.reloading) await page.keyboard.press('r');
    // Movement: chase a runner, or juke when the enemy shoots back.
    const mode = S.movement === 'auto' || S.movement === null ? (st.flee ? 'chase' : st.shoots ? 'dodge' : null) : S.movement;
    if (mode === 'chase') {
      const dx = target.x - st.w / 2, dy = target.y - st.h / 2;
      const want = new Set();
      if (Math.hypot(dx, dy) > 5 * r) {
        if (Math.abs(dx) > 0.3 * Math.abs(dy)) want.add(dx > 0 ? 'd' : 'a');
        if (Math.abs(dy) > 0.3 * Math.abs(dx)) want.add(dy > 0 ? 's' : 'w');
      }
      if (t >= nextMoveChange) { moveKeys = want; nextMoveChange = t + rand(0.15, 0.3); }
      await setKeys(moveKeys);
    } else if (mode === 'dodge') {
      if (t >= nextMoveChange) {
        // Strafe roughly perpendicular to the enemy, reversing at irregular intervals, with brief stops.
        const dx = target.x - st.w / 2, dy = target.y - st.h / 2, len = Math.hypot(dx, dy) || 1;
        const px = -dy / len, py = dx / len, sgn = Math.random() < 0.5 ? -1 : 1;
        const want = new Set();
        if (Math.random() > 0.15) {
          if (Math.abs(px) > 0.4) want.add(px * sgn > 0 ? 'd' : 'a');
          if (Math.abs(py) > 0.4) want.add(py * sgn > 0 ? 's' : 'w');
        }
        moveKeys = want; nextMoveChange = t + rand(0.25, 0.6);
      }
      await setKeys(moveKeys);
    }
    await page.waitForTimeout(14);
  }
}

// Advances through rest screens / results until the given screen appears or a routine finishes.
export async function waitScreen(page, name, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const st = await readState(page);
    if (st.screen === name) return st;
    await page.waitForTimeout(100);
  }
  throw new Error(`screen ${name} not reached`);
}
