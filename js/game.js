// Core simulation + rendering. Top-down, world units where a player has radius 1.
window.ST = window.ST || {};

(function () {
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const PLAYER_R = 1;
  const MOVE_SPEED = 12;
  const ARENA = 100;               // arena is [-ARENA, ARENA] on both axes
  const PLAYER_MAX_HP = 100;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  // Distance from segment ab to point p (squared), and where along the segment it lands.
  function segPointDist2(ax, ay, bx, by, px, py) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    const cx = ax + dx * t, cy = ay + dy * t;
    return { d2: (px - cx) ** 2 + (py - cy) ** 2, t, cx, cy };
  }

  function makeGun(def) {
    return { def, ammo: def.mag, reloading: false, reloadT: 0, cooldown: 0, pullT: 0, recoil: 0, emptyClicked: false };
  }
  function startReload(g, opts) {
    if (g.reloading || g.ammo >= g.def.mag) return;
    g.reloading = true;
    g.reloadT = g.def.reload;
    ST.audio.reload(g.def, opts);
  }
  // Advances gun timers; fires via fireFn if wantFire and the gun is able. Returns true if it fired.
  function updateGun(g, dt, wantFire, fireFn, minDelay) {
    g.cooldown = Math.max(0, g.cooldown - dt);
    g.recoil = Math.max(0, g.recoil - g.recoil * dt * 5 - dt); // player.ts recoil decay
    if (g.pullT > 0) { g.pullT -= dt; if (g.pullT <= 0 && g.def.sound.pull) ST.audio.play(g.def.sound.pull, g.soundOpts); }
    if (g.reloading) {
      g.reloadT -= dt;
      if (g.reloadT <= 0) {
        // survev reloads maxReload rounds per reloadTime; shotguns and the Mosin load one shell at a time.
        g.ammo = Math.min(g.def.mag, g.ammo + (g.def.reloadCount || g.def.mag));
        if (g.ammo >= g.def.mag) g.reloading = false;
        else { g.reloadT = g.def.reload; ST.audio.reload(g.def, g.soundOpts); }
      }
    }
    if (!wantFire) { g.emptyClicked = false; return false; }
    if (g.ammo <= 0) {
      if (!g.emptyClicked && !g.reloading) { ST.audio.empty(g.def); g.emptyClicked = true; }
      startReload(g, g.soundOpts);
      return false;
    }
    if (g.cooldown > 0) return false;
    if (g.reloading) {
      if (g.def.reloadPerShell) g.reloading = false; // firing interrupts shell-by-shell reloads
      else return false;
    }
    g.ammo--;
    g.cooldown = Math.max(g.def.fireDelay, minDelay || 0);
    g.recoil += g.def.worldImg && g.def.worldImg.recoil ? g.def.worldImg.recoil : 1;
    if (g.def.pullDelay) g.pullT = g.def.pullDelay;
    fireFn();
    return true;
  }

  class Game {
    constructor(canvas, settings, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.s = settings;
      this.hooks = hooks || {};
      this.zoomRadius = ST.SCOPES[settings.scope] || 28;
      this.halfH = this.zoomRadius;

      this.keys = new Set();
      this.mouse = { x: 0, y: 0, down: false, queued: false };
      this.time = 0;
      this.running = false;
      this.paused = false;
      this.finished = false;

      this.player = {
        pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, hp: PLAYER_MAX_HP, aim: 0, moving: false,
        gun: makeGun(ST.WEAPONS[settings.weapon]),
      };
      this.enemyDef = ST.WEAPONS[settings.enemyWeapon || settings.weapon];
      this.enemies = [];
      this.bullets = [];
      this.particles = [];
      this.respawns = [];
      this.markers = [];
      this.feed = [];
      this.rocks = settings.obstacles ? this.makeRocks() : [];
      this.stats = {
        shots: 0, pellets: 0, hits: 0, kills: 0, deaths: 0, dmgDealt: 0, dmgTaken: 0,
        expired: 0, ttk: [], reaction: [], engage: [], movingShots: 0, onTarget: 0, firing: 0,
        movingTime: 0, movingPellets: 0, movingHits: 0, dmgTakenStill: 0, hitsTaken: 0, hitsTakenStill: 0,
      };
      // Kinematics: cursor samples (screen px) and one record per acquired target.
      this.cursorLog = [];
      this.targets = [];
      this.lastAcqT = 0;
      this.mouseSpeed = 0;
      // Adaptive difficulty (0..1). Staircase tuned for ~75% success.
      this.diff = settings.adaptive ? 0.35 : (settings.difficulty ?? 0.5);
      this.adaptWindow = { t: 0, pellets: 0, hits: 0, taken: 0 };
      this.hitFlash = 0;
      this.dmgFlash = 0;
      this.deathFlash = 0;

      ST.audio.setEnabled(!!settings.sound);

      this.onResize = () => this.resize();
      this.resize();
      this.bindInput();
      for (let i = 0; i < settings.enemies; i++) this.spawnEnemy();
    }

    // ---------- setup ----------
    makeRocks() {
      const rocks = [];
      let tries = 0;
      while (rocks.length < 14 && tries++ < 400) {
        const r = rand(1.6, 3.2);
        const x = rand(-ARENA + 6, ARENA - 6), y = rand(-ARENA + 6, ARENA - 6);
        if (Math.hypot(x, y) < 9) continue;
        if (rocks.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 6)) continue;
        rocks.push({ x, y, r, shade: rand(0.85, 1.1) });
      }
      return rocks;
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.dpr = dpr;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      // survev: camera.targetZoom = (maxScreenDim * 0.5) / (zoomRadius * ppu)  =>  px per unit = maxDim / (2 * zoomRadius)
      this.ppu = Math.max(this.w, this.h) / (this.zoomRadius * 2);
      this.halfW = this.w / (2 * this.ppu);
      this.halfH = this.h / (2 * this.ppu);
    }

    bindInput() {
      const c = this.canvas;
      this.onKeyDown = (e) => {
        if (e.repeat) return;
        const k = e.key.toLowerCase();
        if (k === 'escape') { this.togglePause(); e.preventDefault(); return; }
        if (this.paused) return;
        if (k === 'r') { startReload(this.player.gun); return; }
        this.keys.add(k);
        if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      };
      this.onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
      this.onMouseMove = (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; };
      this.onMouseDown = (e) => {
        if (e.button !== 0) return;
        ST.audio.unlock();
        this.mouse.down = true;
        this.mouse.queued = true;
        e.preventDefault();
      };
      this.onMouseUp = (e) => { if (e.button === 0) { this.mouse.down = false; this.mouse.queued = false; } };
      this.onBlur = () => { this.keys.clear(); this.mouse.down = false; this.mouse.queued = false; };
      this.onCtx = (e) => e.preventDefault();

      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('mousemove', this.onMouseMove);
      c.addEventListener('mousedown', this.onMouseDown);
      window.addEventListener('mouseup', this.onMouseUp);
      window.addEventListener('blur', this.onBlur);
      c.addEventListener('contextmenu', this.onCtx);
      window.addEventListener('resize', this.onResize);
    }

    unbindInput() {
      const c = this.canvas;
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('mousemove', this.onMouseMove);
      c.removeEventListener('mousedown', this.onMouseDown);
      window.removeEventListener('mouseup', this.onMouseUp);
      window.removeEventListener('blur', this.onBlur);
      c.removeEventListener('contextmenu', this.onCtx);
      window.removeEventListener('resize', this.onResize);
    }

    // ---------- lifecycle ----------
    start() {
      this.running = true;
      this.last = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        if (!this.paused) this.update(dt);
        this.render();
        if (this.hooks.onHud) this.hooks.onHud(this.hudState());
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.unbindInput();
    }

    togglePause() {
      if (this.finished) return;
      this.paused = !this.paused;
      this.keys.clear();
      this.mouse.down = false; this.mouse.queued = false;
      if (this.hooks.onPause) this.hooks.onPause(this.paused);
    }

    finish() {
      if (this.finished) return;
      this.finished = true;
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.unbindInput();
      this.feed = [];
      this.render();
      if (this.hooks.onFinish) this.hooks.onFinish(this.results());
    }

    results() {
      const st = this.stats;
      const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      const median = (a) => {
        if (!a.length) return null;
        const b = [...a].sort((x, y) => x - y);
        const m = b.length >> 1;
        return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
      };
      const minutes = Math.max(this.time, 1) / 60;
      return {
        time: this.time,
        shots: st.shots, pellets: st.pellets, hits: st.hits,
        accuracy: st.pellets ? st.hits / st.pellets : 0,
        kills: st.kills, deaths: st.deaths, expired: st.expired,
        dmgDealt: st.dmgDealt, dmgTaken: st.dmgTaken,
        dps: st.dmgDealt / Math.max(this.time, 1),
        killsPerMin: st.kills / minutes,
        avgTtk: avg(st.ttk), medianTtk: median(st.ttk),
        avgReaction: avg(st.reaction),
        avgEngage: avg(st.engage),
        shotsPerKill: st.kills ? st.shots / st.kills : null,
        hitsPerSec: st.hits / Math.max(this.time, 1),
        score: this.score(),
        movingShotFrac: st.shots ? st.movingShots / st.shots : 0,
        movingFrac: st.movingTime / Math.max(this.time, 1),
        accMoving: st.movingPellets ? st.movingHits / st.movingPellets : null,
        accStill: (st.pellets - st.movingPellets) ? (st.hits - st.movingHits) / (st.pellets - st.movingPellets) : null,
        dmgTakenPerMin: st.dmgTaken / Math.max(this.time, 1) * 60,
        stillDmgFrac: st.dmgTaken ? st.dmgTakenStill / st.dmgTaken : null,
        onTargetFrac: st.onTarget / Math.max(this.time, 1),
        firingFrac: st.firing / Math.max(this.time, 1),
        difficulty: this.diff,
        targets: this.targets,
        kinematics: this.kinematics(),
      };
    }

    // Throughput-style score: speed at acceptable accuracy, not accuracy alone.
    score() {
      const st = this.stats;
      const acc = st.pellets ? st.hits / st.pellets : 0;
      return 100 * (st.hits / Math.max(this.time, 1)) * Math.sqrt(acc);
    }

    kinematics() {
      const T = this.targets.filter(t => t.firstHit !== null);
      const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      const sectors = [];
      for (let i = 0; i < 8; i++) {
        const ts = T.filter(t => t.sector === i);
        sectors.push({ n: ts.length, firstHit: avg(ts.map(t => t.firstHit)), gain: avg(ts.map(t => t.gain).filter(g => g !== null)) });
      }
      return {
        n: T.length,
        reaction: avg(T.map(t => t.reaction).filter(v => v !== null)),
        moveTime: avg(T.map(t => t.moveTime).filter(v => v !== null)),
        firstHit: avg(T.map(t => t.firstHit)),
        gain: avg(T.map(t => t.gain).filter(v => v !== null)),
        peaks: avg(T.map(t => t.peaks)),
        sectors,
      };
    }

    hudState() {
      const g = this.player.gun;
      return {
        time: this.time, duration: this.s.duration,
        hp: this.player.hp, maxHp: PLAYER_MAX_HP,
        ammo: g.ammo, mag: g.def.mag, reloading: g.reloading,
        reloadFrac: g.reloading ? 1 - g.reloadT / g.def.reload : 0,
        weapon: g.def.name,
        kills: this.stats.kills, deaths: this.stats.deaths,
        accuracy: this.stats.pellets ? this.stats.hits / this.stats.pellets : 0,
        hits: this.stats.hits,
        difficulty: this.s.adaptive ? this.diff : null,
        label: this.s.label || null,
      };
    }

    // ---------- spawning ----------
    randomSpawn() {
      const p = this.player.pos;
      const minD = this.s.minDist, maxD = this.s.maxDist;
      // Keep spawns on screen so every target is reachable by aim alone.
      const bx = this.halfW - 2.5, by = this.halfH - 2.5;
      let best = null;
      for (let i = 0; i < 60; i++) {
        const a = rand(0, TAU), d = rand(minD, maxD);
        const x = clamp(p.x + Math.cos(a) * d, -ARENA + 2, ARENA - 2);
        const y = clamp(p.y + Math.sin(a) * d, -ARENA + 2, ARENA - 2);
        const cand = { x, y };
        best = best || cand;
        if (Math.abs(x - p.x) > bx || Math.abs(y - p.y) > by) continue;
        if (Math.hypot(x - p.x, y - p.y) < Math.min(minD, 4)) continue;
        if (this.rocks.some(r => Math.hypot(r.x - x, r.y - y) < r.r + 2.5)) continue;
        if (this.enemies.some(e => Math.hypot(e.pos.x - x, e.pos.y - y) < 3)) continue;
        // Skip spawns whose line of sight to the player is blocked.
        if (this.rocks.some(r => segPointDist2(p.x, p.y, x, y, r.x, r.y).d2 < r.r * r.r)) continue;
        return cand;
      }
      return best;
    }

    spawnEnemy() {
      const pos = this.randomSpawn();
      const skill = ST.AIM_SKILL[this.s.enemyAim] || ST.AIM_SKILL.normal;
      const hp = this.s.invincible ? Infinity : this.s.enemyHp;
      const e = {
        pos, vel: { x: 0, y: 0 }, hp, maxHp: hp,
        aim: Math.atan2(this.player.pos.y - pos.y, this.player.pos.x - pos.x),
        behavior: this.s.behavior, timer: 0, dirSign: Math.random() < 0.5 ? -1 : 1,
        wander: rand(0, TAU), stopped: false,
        spawnT: this.time, firstHitT: null, ttl: this.s.ttl > 0 ? this.s.ttl * this.ttlScale() : Infinity, ttlMax: this.s.ttl > 0 ? this.s.ttl * this.ttlScale() : Infinity,
        gun: Object.assign(makeGun(this.enemyDef), { soundOpts: { dist: Math.hypot(pos.x - this.player.pos.x, pos.y - this.player.pos.y) } }), skill, aimErr: 0, aimErrT: 0, reactT: skill.reaction,
        hitFlash: 0,
      };
      this.enemies.push(e);
      return e;
    }

    // ---------- update ----------
    update(dt) {
      this.time += dt;
      if (this.s.duration > 0 && this.time >= this.s.duration) { this.finish(); return; }
      this.sampleCursor(dt);
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.updateBullets(dt);
      this.updateEffects(dt);
      this.updateRespawns(dt);
      this.updateAdaptive(dt);
    }

    // ---------- difficulty ----------
    ttlScale() { return lerp(1.6, 0.45, this.diff); }
    fleeSpeed() { return (this.s.fleeSpeed || 0.95) * (this.s.adaptive ? lerp(0.85, 1.1, this.diff) : 1); }
    aimScale() { return this.s.adaptive ? lerp(2.2, 0.6, this.diff) : 1; }
    strafeScale() { return lerp(1.5, 0.55, this.diff); }
    bumpDiff(delta) {
      if (!this.s.adaptive) return;
      this.diff = clamp(this.diff + delta, 0, 1);
    }
    updateAdaptive(dt) {
      if (!this.s.adaptive) return;
      const w = this.adaptWindow;
      w.t += dt;
      if (w.t < 1) return;
      if (this.s.enemyShoots) {
        // Under fire: a good second is landing shots without taking any.
        if (w.pellets > 0) this.bumpDiff(w.hits / w.pellets >= 0.4 && w.taken === 0 ? 0.03 : -0.06);
        else if (w.taken > 0) this.bumpDiff(-0.06);
      } else if (this.s.invincible) {
        // Tracking has no kill events, so grade each one-second window on hit ratio.
        if (w.pellets > 0) this.bumpDiff(w.hits / w.pellets >= 0.6 ? 0.03 : -0.09);
      }
      w.t = 0; w.pellets = 0; w.hits = 0; w.taken = 0;
    }

    // ---------- kinematics ----------
    sampleCursor(dt) {
      const log = this.cursorLog;
      const last = log[log.length - 1];
      const sample = { t: this.time, x: this.mouse.x, y: this.mouse.y, v: 0 };
      // Speed over a ~50 ms window: mouse events arrive slower than frames, so per-frame speed is noisy.
      let j = log.length - 1;
      while (j > 0 && sample.t - log[j].t < 0.05) j--;
      if (j >= 0 && sample.t - log[j].t > 0) sample.v = Math.hypot(sample.x - log[j].x, sample.y - log[j].y) / (sample.t - log[j].t);
      this.mouseSpeed = sample.v;
      log.push(sample);
      while (log.length && log[0].t < this.time - 5) log.shift();
      // Time the cursor spends on any live target (tracking metric).
      const m = this.mouseWorld();
      if (this.enemies.some(e => Math.hypot(e.pos.x - m.x, e.pos.y - m.y) <= PLAYER_R * 1.15)) this.stats.onTarget += dt;
      if (this.mouse.down) this.stats.firing += dt;
    }

    // Called on the first hit of a target: reconstruct the acquisition movement from the cursor log.
    recordAcquisition(e) {
      const t0 = Math.max(this.lastAcqT, e.spawnT);
      const now = this.time;
      const log = this.cursorLog.filter(c => c.t >= t0);
      const rec = { t: now, spawnT: e.spawnT, acqT: t0, firstHit: now - t0, reaction: null, moveTime: null, gain: null, peaks: 0, sector: null, distPx: null, killed: false, expired: false };
      this.targets.push(rec);
      e.rec = rec;
      if (log.length < 3) return rec;
      const c0 = log[0];
      const tp = this.worldToScreen(e.pos.x, e.pos.y);
      const dx = tp.x - c0.x, dy = tp.y - c0.y;
      const dist = Math.hypot(dx, dy);
      rec.distPx = dist;
      rec.sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      const thresh = this.h * 0.35; // px/s: movement onset
      let onset = null, peak = 0, peaks = 0, primaryEnd = null, localPeak = 0, armed = true;
      for (let i = 1; i < log.length; i++) {
        const c = log[i];
        if (onset === null && c.v > thresh) onset = c.t;
        if (onset === null) continue;
        if (c.v > peak) peak = c.v;
        // A submovement = speed rises above threshold, then falls below half its local peak.
        if (armed && c.v > thresh) { armed = false; localPeak = c.v; }
        else if (!armed) {
          if (c.v > localPeak) localPeak = c.v;
          else if (c.v < localPeak * 0.5) { peaks++; armed = true; }
        }
        if (primaryEnd === null && peaks >= 1 && c.v < peak * 0.2) primaryEnd = c;
      }
      if (!armed) peaks++; // movement still in progress at the hit
      if (onset !== null) {
        rec.reaction = onset - t0;
        rec.moveTime = now - onset;
        rec.peaks = peaks;
        const end = primaryEnd || log[log.length - 1];
        if (dist > 40) {
          const proj = ((end.x - c0.x) * dx + (end.y - c0.y) * dy) / dist;
          rec.gain = proj / dist;
        }
      }
      return rec;
    }

    worldToScreen(x, y) {
      const p = this.player.pos;
      return { x: this.w / 2 + (x - p.x) * this.ppu, y: this.h / 2 + (y - p.y) * this.ppu };
    }

    updatePlayer(dt) {
      const p = this.player, k = this.keys;
      let mx = 0, my = 0;
      if (k.has('w') || k.has('arrowup')) my -= 1;
      if (k.has('s') || k.has('arrowdown')) my += 1;
      if (k.has('a') || k.has('arrowleft')) mx -= 1;
      if (k.has('d') || k.has('arrowright')) mx += 1;
      const l = Math.hypot(mx, my);
      p.moving = l > 0;
      if (l > 0) { mx /= l; my /= l; }
      p.vel.x = mx * MOVE_SPEED; p.vel.y = my * MOVE_SPEED;
      if (p.moving) this.stats.movingTime += dt;
      p.pos.x = clamp(p.pos.x + p.vel.x * dt, -ARENA + PLAYER_R, ARENA - PLAYER_R);
      p.pos.y = clamp(p.pos.y + p.vel.y * dt, -ARENA + PLAYER_R, ARENA - PLAYER_R);
      this.pushOutOfRocks(p.pos);

      const m = this.mouseWorld();
      p.aim = Math.atan2(m.y - p.pos.y, m.x - p.pos.x);

      const g = p.gun;
      const wantFire = g.def.auto ? this.mouse.down : this.mouse.queued;
      updateGun(g, dt, wantFire, () => {
        this.mouse.queued = false;
        this.stats.shots++;
        this.fireGun(p, g.def, p.aim, p.moving, 'player');
      });
    }

    updateEnemies(dt) {
      const p = this.player.pos;
      for (const e of this.enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.ttl -= dt;
        if (e.ttl <= 0) { e.expired = true; continue; }

        const dx = p.x - e.pos.x, dy = p.y - e.pos.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const tx = dx / d, ty = dy / d;           // unit vector toward player
        const px = -ty, py = tx;                  // perpendicular
        let vx = 0, vy = 0;
        e.timer -= dt;

        switch (e.behavior) {
          case 'static':
            break;
          case 'strafe': {
            if (e.timer <= 0) { if (Math.random() < 0.8) e.dirSign = -e.dirSign; e.timer = rand(0.3, 1.1) * this.strafeScale(); }
            vx = px * e.dirSign; vy = py * e.dirSign;
            if (d < this.s.minDist) { vx -= tx * 0.9; vy -= ty * 0.9; }
            if (d > this.s.maxDist) { vx += tx * 0.9; vy += ty * 0.9; }
            break;
          }
          case 'juke': {
            if (e.timer <= 0) {
              e.timer = rand(0.15, 0.55) * this.strafeScale();
              e.stopped = Math.random() < 0.15;
              // Bias toward lateral movement, like a player dodging.
              const lateral = (Math.random() < 0.5 ? -1 : 1);
              const ang = Math.atan2(py * lateral, px * lateral) + gauss() * 0.7;
              e.wander = ang;
            }
            if (!e.stopped) { vx = Math.cos(e.wander); vy = Math.sin(e.wander); }
            if (d < this.s.minDist) { vx -= tx * 1.2; vy -= ty * 1.2; }
            if (d > this.s.maxDist) { vx += tx * 1.2; vy += ty * 1.2; }
            break;
          }
          case 'smooth': {
            // Predictable sinusoidal strafe for precise tracking.
            e.timer -= 0; // unused
            const phase = (this.time - e.spawnT) * (1.2 / this.strafeScale());
            const sgn = Math.cos(phase) >= 0 ? 1 : -1;
            const mag = Math.abs(Math.cos(phase));
            vx = px * sgn * mag; vy = py * sgn * mag;
            const mid = (this.s.minDist + this.s.maxDist) / 2;
            const k = clamp((mid - d) * 0.3, -0.5, 0.5);
            vx -= tx * k; vy -= ty * k;
            break;
          }
          case 'orbit': {
            vx = px * e.dirSign; vy = py * e.dirSign;
            const mid = (this.s.minDist + this.s.maxDist) / 2;
            const k = clamp((mid - d) * 0.3, -0.8, 0.8);
            vx -= tx * k; vy -= ty * k;
            break;
          }
          case 'flee': {
            // Run away with lateral jukes; steer off walls and rocks; escape if the leash is exceeded.
            if (e.timer <= 0) { if (Math.random() < 0.7) e.dirSign = -e.dirSign; e.timer = rand(0.35, 0.9) * this.strafeScale(); }
            vx = -tx + px * e.dirSign * 0.55; vy = -ty + py * e.dirSign * 0.55;
            const margin = 14;
            const ex = Math.max(0, Math.abs(e.pos.x) - (ARENA - margin)) * Math.sign(e.pos.x);
            const ey = Math.max(0, Math.abs(e.pos.y) - (ARENA - margin)) * Math.sign(e.pos.y);
            vx -= ex * 0.25; vy -= ey * 0.25;
            for (const r of this.rocks) {
              const rx = r.x - e.pos.x, ry = r.y - e.pos.y, rd = Math.hypot(rx, ry);
              if (rd < r.r + 7 && (rx * vx + ry * vy) > 0) { const side = (rx * vy - ry * vx) > 0 ? -1 : 1; const k = 2.2 * (1 - (rd - r.r) / 7); vx += -ry / rd * side * k; vy += rx / rd * side * k; }
            }
            const leash = this.s.maxDist + (this.s.leash || 8);
            if (d > leash) { e.leashT = (e.leashT || 0) + dt; if (e.leashT > 1.2) e.expired = true; } else e.leashT = 0;
            break;
          }
          case 'rush': {
            if (e.timer <= 0) { if (Math.random() < 0.6) e.dirSign = -e.dirSign; e.timer = rand(0.25, 0.7); }
            if (d > 3.2) { vx = tx + px * e.dirSign * 0.5; vy = ty + py * e.dirSign * 0.5; }
            else { vx = px * e.dirSign + tx * 0.2; vy = py * e.dirSign + ty * 0.2; }
            break;
          }
        }
        const vl = Math.hypot(vx, vy);
        const speed = e.behavior === 'flee' ? MOVE_SPEED * this.fleeSpeed() : MOVE_SPEED;
        if (vl > 0) { vx = vx / vl * speed; vy = vy / vl * speed; }
        e.vel.x = vx; e.vel.y = vy;
        e.pos.x = clamp(e.pos.x + vx * dt, -ARENA + PLAYER_R, ARENA - PLAYER_R);
        e.pos.y = clamp(e.pos.y + vy * dt, -ARENA + PLAYER_R, ARENA - PLAYER_R);
        this.pushOutOfRocks(e.pos);
        // Keep enemies from overlapping each other.
        for (const o of this.enemies) {
          if (o === e) continue;
          const ox = e.pos.x - o.pos.x, oy = e.pos.y - o.pos.y, od = Math.hypot(ox, oy);
          if (od > 0 && od < 2 * PLAYER_R) { e.pos.x += ox / od * (2 * PLAYER_R - od) * 0.5; e.pos.y += oy / od * (2 * PLAYER_R - od) * 0.5; }
        }

        // Aiming and shooting.
        let aimX = p.x, aimY = p.y;
        e.aimErrT -= dt;
        if (e.aimErrT <= 0) { e.aimErr = gauss() * e.skill.sigma * this.aimScale() * DEG; e.leadFrac = rand(0.5, 1.1); e.aimErrT = rand(0.15, 0.4); }
        if (e.skill.lead) {
          // Humans lead imperfectly: the fraction of the true lead is re-rolled with the aim error.
          const flight = d / e.gun.def.speed;
          aimX += this.player.vel.x * flight * (e.leadFrac || 0.8); aimY += this.player.vel.y * flight * (e.leadFrac || 0.8);
        }
        const base = Math.atan2(aimY - e.pos.y, aimX - e.pos.x);
        e.aim = base + e.aimErr;

        if (this.s.enemyShoots) {
          const inRange = d <= e.gun.def.range * 0.95;
          const los = !this.rocks.some(r => segPointDist2(e.pos.x, e.pos.y, p.x, p.y, r.x, r.y).d2 < r.r * r.r);
          // Reaction timer counts down only while the enemy can see you; losing sight resets it.
          if (inRange && los) e.reactT -= dt; else e.reactT = Math.max(e.reactT, 0.15);
          // Bursts: automatic weapons are fired in 0.4 to 1.0 s bursts with 0.25 to 0.6 s re-aim pauses.
          e.burstT = (e.burstT || 0) - dt;
          if (e.burstT <= 0) { e.bursting = !e.bursting; e.burstT = e.bursting ? rand(0.4, 1.0) : rand(0.25, 0.6); }
          const wantFire = e.reactT <= 0 && (e.bursting || !e.gun.def.auto);
          updateGun(e.gun, dt, wantFire, () => {
            this.fireGun(e, e.gun.def, e.aim, vl > 0, 'enemy');
          }, e.gun.def.auto ? 0 : 0.22);
        }
      }
      // Remove expired (flick) targets and schedule replacements.
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (this.enemies[i].expired) {
          const e = this.enemies[i];
          this.enemies.splice(i, 1);
          this.stats.expired++;
          this.targets.push({ t: this.time, spawnT: e.spawnT, acqT: Math.max(this.lastAcqT, e.spawnT), firstHit: null, reaction: null, moveTime: null, gain: null, peaks: 0, sector: null, distPx: null, killed: false, expired: true });
          this.lastAcqT = this.time;
          this.bumpDiff(-0.09);
          this.pushFeed(e.behavior === 'flee' ? 'Enemy got away' : 'Target escaped', '#ffb080');
          this.respawns.push(this.s.respawnDelay);
        }
      }
    }

    fireGun(shooter, def, aim, moving, owner) {
      // weaponManager.ts: spread = shotSpread (+ moveSpread while moving); deviation = random(-0.5, 0.5) * spread.
      const spread = def.spread + (moving ? def.moveSpread : 0);
      const n = def.pellets || 1;
      const jitter = 0.25;
      const dx = Math.cos(aim), dy = Math.sin(aim);
      const gx = shooter.pos.x + -dy * def.barrelOffset, gy = shooter.pos.y + dx * def.barrelOffset;
      const dist = owner === 'enemy' ? Math.hypot(shooter.pos.x - this.player.pos.x, shooter.pos.y - this.player.pos.y) : 0;
      for (let i = 0; i < n; i++) {
        const a = aim + rand(-0.5, 0.5) * spread * DEG;
        let sx = gx + dx * def.barrel, sy = gy + dy * def.barrel;
        if (i > 0) { sx += rand(-jitter, jitter) * 1.11; sy += rand(-jitter, jitter) * 1.11; }
        this.bullets.push({
          x: sx, y: sy, sx, sy, dx: Math.cos(a), dy: Math.sin(a),
          speed: def.speed, dmg: def.dmg, range: def.range, traveled: 0, owner, ammo: def.ammo, moving,
          tracerWidth: def.tracerWidth, tracerLength: def.tracerLength, whizzed: false,
        });
        if (owner === 'player') { this.stats.pellets++; this.adaptWindow.pellets++; if (moving) this.stats.movingPellets++; }
      }
      if (owner === 'player' && moving) this.stats.movingShots++;
      if (def.caseTiming === 'shoot') this.spawnCasing(shooter, def, dx, dy);
      ST.audio.shot(def, { dist, fallOff: def.sound.fallOff });
    }

    // shot.ts createCasingParticle: shell flies perpendicular to the aim at 9.5 u/s, +-30 degrees.
    spawnCasing(shooter, def, dx, dy) {
      const P = def.particle || {};
      let shellDx = dy, shellDy = -dx; // rotate(dir, -PI/2)
      if (P.shellForward) { shellDx = dx * P.shellForward; shellDy = dy * P.shellForward; }
      let vx = shellDx * 9.5, vy = shellDy * 9.5;
      const ra = (Math.random() - 0.5) * Math.PI / 3, c = Math.cos(ra), si = Math.sin(ra);
      [vx, vy] = [vx * c - vy * si, vx * si + vy * c];
      if (P.shellReverse) { vx = -vx; vy = -vy; }
      const off = PLAYER_R + (P.shellOffset || 0.45);
      let x = shooter.pos.x + dx * off, y = shooter.pos.y + dy * off;
      if (P.shellOffsetY) { x += shellDx * P.shellOffsetY; y += shellDy * P.shellOffsetY; }
      const C = ST.SURVEV.casing;
      const life = rand(C.life[0], C.life[1]);
      this.particles.push({
        kind: 'casing', x, y, vx, vy, life, maxLife: life, drag: rand(C.drag[0], C.drag[1]),
        rot: -Math.atan2(shellDy, shellDx), rotVel: C.rotVel * (Math.random() < 0.5 ? -1 : 1),
        scale: (P.shellScale || 1), sprite: 'part-shell-01.img', r: 0.3, color: '#c9a44a',
      });
    }

    updateBullets(dt) {
      const p = this.player;
      for (const b of this.bullets) {
        const step = b.speed * dt;
        const nx = b.x + b.dx * step, ny = b.y + b.dy * step;
        let hitT = 1, hitKind = null, hitObj = null, hx = nx, hy = ny;

        for (const r of this.rocks) {
          const s = segPointDist2(b.x, b.y, nx, ny, r.x, r.y);
          if (s.d2 < r.r * r.r && s.t < hitT) { hitT = s.t; hitKind = 'rock'; hx = s.cx; hy = s.cy; }
        }
        if (b.owner === 'player') {
          for (const e of this.enemies) {
            if (e.hp <= 0) continue;
            const s = segPointDist2(b.x, b.y, nx, ny, e.pos.x, e.pos.y);
            if (s.d2 < PLAYER_R * PLAYER_R && s.t < hitT) { hitT = s.t; hitKind = 'enemy'; hitObj = e; hx = s.cx; hy = s.cy; }
          }
        } else {
          const s = segPointDist2(b.x, b.y, nx, ny, p.pos.x, p.pos.y);
          if (s.d2 < PLAYER_R * PLAYER_R && s.t < hitT) { hitT = s.t; hitKind = 'player'; hx = s.cx; hy = s.cy; }
        }

        if (b.owner === 'enemy' && !b.whizzed) {
          const s = segPointDist2(b.x, b.y, nx, ny, p.pos.x, p.pos.y);
          if (s.d2 < 9 && s.d2 > PLAYER_R * PLAYER_R) { b.whizzed = true; ST.audio.whiz({ volume: 0.7 }); }
        }
        if (hitKind) {
          b.dead = true;
          b.x = hx; b.y = hy;
          if (hitKind === 'enemy') this.damageEnemy(hitObj, b, hx, hy);
          else if (hitKind === 'player') this.damagePlayer(b, hx, hy);
          else { this.spawnPuff(hx, hy, 'rgba(200,200,200,0.8)', 3); ST.audio.play('stone_bullet_hit_01', { dist: Math.hypot(hx - p.pos.x, hy - p.pos.y), volume: 0.6 }); }
          continue;
        }
        b.x = nx; b.y = ny;
        b.traveled += step;
        if (b.traveled >= b.range) b.dead = true;
      }
      this.bullets = this.bullets.filter(b => !b.dead);
    }

    damageEnemy(e, b, hx, hy) {
      const st = this.stats;
      st.hits++;
      this.adaptWindow.hits++;
      if (b.moving) st.movingHits++;
      const dmg = Math.min(b.dmg, e.hp);
      st.dmgDealt += isFinite(dmg) ? dmg : b.dmg;
      e.hp -= b.dmg;
      e.hitFlash = 0.08;
      this.hitFlash = 0.12;
      this.spawnBlood(hx, hy, b.dx, b.dy, 1, e);
      if (e.firstHitT === null) {
        e.firstHitT = this.time;
        st.reaction.push(this.time - e.spawnT);
        this.recordAcquisition(e);
      }
      if (e.hp <= 0) {
        st.kills++;
        if (e.rec) e.rec.killed = true;
        this.lastAcqT = this.time;
        this.bumpDiff(0.03);
        const ttk = this.time - e.spawnT;
        st.ttk.push(ttk);
        st.engage.push(this.time - e.firstHitT);
        this.pushFeed(`Kill  ${ttk.toFixed(2)}s`, '#9cff9c');
        ST.audio.kill();
        this.spawnBlood(e.pos.x, e.pos.y, b.dx, b.dy, 6);
        this.enemies.splice(this.enemies.indexOf(e), 1);
        this.respawns.push(this.s.respawnDelay);
      } else {
        ST.audio.hit();
      }
    }

    damagePlayer(b, hx, hy) {
      const p = this.player;
      const dmg = Math.min(b.dmg, p.hp);
      p.hp -= b.dmg;
      this.stats.dmgTaken += dmg;
      this.stats.hitsTaken++;
      this.adaptWindow.taken++;
      if (!p.moving) { this.stats.dmgTakenStill += dmg; this.stats.hitsTakenStill++; }
      this.dmgFlash = 0.25;
      this.spawnBlood(hx, hy, b.dx, b.dy, 1, p);
      ST.audio.hurt();
      if (p.hp <= 0) {
        this.stats.deaths++;
        this.deathFlash = 0.6;
        this.pushFeed('You died', '#ff8080');
        p.hp = PLAYER_MAX_HP;
        p.gun = makeGun(p.gun.def);
        this.bullets = this.bullets.filter(x => x.owner === 'player');
        // Reset the fight: new enemy positions and fresh timers.
        this.enemies = [];
        this.respawns = [];
        for (let i = 0; i < this.s.enemies; i++) this.spawnEnemy();
      }
    }

    updateRespawns(dt) {
      for (let i = this.respawns.length - 1; i >= 0; i--) {
        this.respawns[i] -= dt;
        if (this.respawns[i] <= 0) { this.respawns.splice(i, 1); this.spawnEnemy(); }
      }
    }

    pushOutOfRocks(pos) {
      for (const r of this.rocks) {
        const dx = pos.x - r.x, dy = pos.y - r.y;
        const d = Math.hypot(dx, dy), min = r.r + PLAYER_R;
        if (d < min && d > 0) { pos.x = r.x + dx / d * min; pos.y = r.y + dy / d * min; }
      }
    }

    mouseWorld() {
      const p = this.player.pos;
      return { x: p.x + (this.mouse.x - this.w / 2) / this.ppu, y: p.y + (this.mouse.y - this.h / 2) / this.ppu };
    }

    // ---------- effects ----------
    spawnBlood(x, y, dx, dy, n, attach) {
      // particles.ts bloodSplat: scale 0.04 -> 0.15..0.2 of a 144px sprite (16 px/unit), life 0.5, alpha fades over the last quarter.
      n = n || 1;
      const S = ST.SURVEV.bloodSplat;
      for (let i = 0; i < n; i++) {
        const v = rand(0.45, 0.8);
        const color = `rgb(${Math.round(255 * v)},0,0)`;
        const jx = i ? gauss() * 0.4 : 0, jy = i ? gauss() * 0.4 : 0;
        const pos = { x: x + jx, y: y + jy };
        this.particles.push({
          kind: 'splat', x: pos.x, y: pos.y, vx: 0, vy: 0, life: S.life, maxLife: S.life,
          rot: Math.random() * TAU, scaleStart: S.scaleStart, scaleEnd: rand(S.scaleEnd[0], S.scaleEnd[1]),
          sprite: S.sprites[Math.floor(Math.random() * S.sprites.length)], color, r: 0.3,
          attach: attach || null, ox: attach ? pos.x - attach.pos.x : 0, oy: attach ? pos.y - attach.pos.y : 0,
        });
      }
    }
    spawnPuff(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(1, 4), life = rand(0.15, 0.3);
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life, r: rand(0.1, 0.25), color });
      }
    }
    pushFeed(text, color) {
      this.feed.unshift({ text, color, life: 2.5 });
      if (this.feed.length > 5) this.feed.pop();
    }
    updateEffects(dt) {
      for (const q of this.particles) {
        if (q.attach) { q.x = q.attach.pos.x + q.ox; q.y = q.attach.pos.y + q.oy; }
        else { q.x += q.vx * dt; q.y += q.vy * dt; }
        if (q.drag) { const k = Math.max(0, 1 - q.drag * dt); q.vx *= k; q.vy *= k; } else { q.vx *= 0.9; q.vy *= 0.9; }
        if (q.rotVel) q.rot += q.rotVel * dt;
        q.life -= dt;
      }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const f of this.feed) f.life -= dt;
      this.feed = this.feed.filter(f => f.life > 0);
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.dmgFlash = Math.max(0, this.dmgFlash - dt);
      this.deathFlash = Math.max(0, this.deathFlash - dt);
    }

    // ---------- render ----------
    render() {
      const ctx = this.ctx, W = this.w, H = this.h;
      const p = this.player;
      const A = ST.assets, SV = ST.SURVEV;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#5c8236';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(this.ppu, this.ppu);
      ctx.translate(-p.pos.x, -p.pos.y);

      // Grass and grid: baseDefs grass color, map.ts grid every GameConfig.map.gridSize units at 15% black.
      ctx.fillStyle = A.hex(SV.grass);
      ctx.fillRect(-ARENA, -ARENA, ARENA * 2, ARENA * 2);
      const left = p.pos.x - this.halfW, right = p.pos.x + this.halfW;
      const top = p.pos.y - this.halfH, bottom = p.pos.y + this.halfH;
      ctx.strokeStyle = `rgba(0,0,0,${SV.gridAlpha})`;
      ctx.lineWidth = Math.max(1.5 / this.ppu, 0.03);
      ctx.beginPath();
      const G = SV.gridSize;
      for (let x = Math.floor(Math.max(left, -ARENA) / G) * G; x <= Math.min(right, ARENA); x += G) { ctx.moveTo(x, Math.max(top, -ARENA)); ctx.lineTo(x, Math.min(bottom, ARENA)); }
      for (let y = Math.floor(Math.max(top, -ARENA) / G) * G; y <= Math.min(bottom, ARENA); y += G) { ctx.moveTo(Math.max(left, -ARENA), y); ctx.lineTo(Math.min(right, ARENA), y); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.4;
      ctx.strokeRect(-ARENA, -ARENA, ARENA * 2, ARENA * 2);

      // Rocks: map-stone-01 at img.scale 0.4 covers 3.6 units for a 1.6-unit collider.
      const stone = A.get(SV.stone.sprite);
      for (const r of this.rocks) {
        if (r.x + r.r * 1.3 < left || r.x - r.r * 1.3 > right || r.y + r.r * 1.3 < top || r.y - r.r * 1.3 > bottom) continue;
        if (stone) {
          const size = (144 * SV.stone.scale / SV.ppuBase) * (r.r / SV.stone.collision);
          ctx.drawImage(stone, r.x - size / 2, r.y - size / 2, size, size);
        } else {
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU);
          ctx.fillStyle = '#7d7d7d'; ctx.fill(); ctx.lineWidth = 0.25; ctx.strokeStyle = '#4c4c4c'; ctx.stroke();
        }
      }

      // Ground particles (blood splats under bodies, casings on the grass).
      for (const q of this.particles) this.drawParticle(ctx, q);

      // Bullets: player-bullet-trail-02 stretched behind the bullet, tinted with the ammo's tracer color.
      const trail = A.get('player-bullet-trail-02.img');
      for (const b of this.bullets) {
        const color = ST.TRACER[b.ammo] ? ST.TRACER[b.ammo].color : '#ffffff';
        // bullet.ts: trailLength = min(tracerLength * 15, dist / 2), sprite scale (0.8, tracerWidth) on a 36px sprite.
        const L = Math.min(b.tracerLength * 15, b.traveled / 2) * 36 * 0.8 / SV.ppuBase;
        const Wd = 36 * b.tracerWidth / SV.ppuBase;
        const ang = Math.atan2(b.dy, b.dx);
        if (trail && L > 0.05) {
          const img = A.tint('player-bullet-trail-02.img', color) || trail;
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(ang);
          ctx.drawImage(img, -L, -Wd / 2, L, Wd);
          ctx.restore();
        } else {
          ctx.strokeStyle = color; ctx.lineWidth = Math.max(Wd, 0.12); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b.x - b.dx * Math.max(L, 0.5), b.y - b.dy * Math.max(L, 0.5)); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      // Enemies, then the player on top.
      for (const e of this.enemies) {
        this.drawCharacter(e.pos.x, e.pos.y, e.aim, e.gun, e.hitFlash > 0 ? 0xffd9c2 : SV.skinTint);
        const bw = 2.6, bh = 0.32, bx = e.pos.x - bw / 2, by = e.pos.y - PLAYER_R - 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx - 0.06, by - 0.06, bw + 0.12, bh + 0.12);
        const frac = isFinite(e.maxHp) ? clamp(e.hp / e.maxHp, 0, 1) : 1;
        ctx.fillStyle = !isFinite(e.maxHp) ? '#9fb4ff' : frac > 0.5 ? '#61d15b' : frac > 0.25 ? '#f2c94c' : '#e0473d';
        ctx.fillRect(bx, by, bw * frac, bh);
        if (this.s.leadHint) {
          const a = this.leadAlpha();
          if (a > 0) {
            const lp = this.intercept(e);
            if (lp) {
              const rr = 9 / this.ppu;
              ctx.globalAlpha = a;
              ctx.beginPath(); ctx.arc(lp.x, lp.y, rr, 0, TAU);
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / this.ppu; ctx.stroke();
              ctx.beginPath(); ctx.arc(lp.x, lp.y, rr * 0.2, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
        }
        if (isFinite(e.ttl) && this.s.ttl > 0) {
          ctx.beginPath();
          ctx.arc(e.pos.x, e.pos.y, PLAYER_R + 0.45, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(e.ttl / e.ttlMax, 0, 1));
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.15; ctx.stroke();
        }
      }

      this.drawCharacter(p.pos.x, p.pos.y, p.aim, p.gun, SV.skinTint);
      if (p.gun.reloading) {
        const frac = 1 - p.gun.reloadT / p.gun.def.reload;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, PLAYER_R + 0.5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1));
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.18; ctx.stroke();
      }

      ctx.restore();

      if (this.dmgFlash > 0) {
        ctx.fillStyle = `rgba(200,0,0,${0.22 * this.dmgFlash / 0.25})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (this.deathFlash > 0) {
        ctx.fillStyle = `rgba(0,0,0,${0.5 * this.deathFlash / 0.6})`;
        ctx.fillRect(0, 0, W, H);
      }
      this.drawFeed(ctx);
      this.drawCrosshair(ctx);
      if (this.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    leadAlpha() {
      const dur = this.s.duration || 60;
      const f = this.time / dur;
      return f < 0.3 ? 0.9 : f < 0.7 ? 0.9 * (1 - (f - 0.3) / 0.4) : 0;
    }

    // Solve |e.pos + e.vel*t - muzzle| = speed*t for the earliest t > 0.
    intercept(e) {
      const p = this.player;
      const def = p.gun.def;
      const ox = p.pos.x + Math.cos(p.aim) * def.barrel, oy = p.pos.y + Math.sin(p.aim) * def.barrel;
      const rx = e.pos.x - ox, ry = e.pos.y - oy;
      const vx = e.vel.x, vy = e.vel.y, s = def.speed;
      const a = vx * vx + vy * vy - s * s, b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry;
      let t;
      if (Math.abs(a) < 1e-6) t = -c / b;
      else {
        const disc = b * b - 4 * a * c;
        if (disc < 0) return null;
        const r = Math.sqrt(disc);
        const t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a);
        t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
      }
      if (!(t > 0) || !isFinite(t)) return null;
      return { x: e.pos.x + vx * t, y: e.pos.y + vy * t };
    }

    drawParticle(ctx, q) {
      const A = ST.assets, u = 1 - clamp(q.life / q.maxLife, 0, 1);
      if (q.kind === 'splat') {
        // scale lerps 0..1 over life; alpha fades over the last quarter (lerp 0.75..1).
        const scale = lerp(q.scaleStart, q.scaleEnd, u);
        const size = 144 * scale / ST.SURVEV.ppuBase;
        const alpha = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
        const img = A.tint(q.sprite, q.color);
        ctx.globalAlpha = alpha;
        if (img) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.drawImage(img, -size / 2, -size / 2, size, size); ctx.restore(); }
        else { ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, size / 2, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        return;
      }
      if (q.kind === 'casing') {
        const C = ST.SURVEV.casing;
        const scale = lerp(C.scaleStart, C.scaleEnd, u) * q.scale;
        const w = 56 * scale / ST.SURVEV.ppuBase, h = 133 * scale / ST.SURVEV.ppuBase;
        const alpha = u < 0.95 ? 1 : 1 - (u - 0.95) / 0.05;
        const img = A.tint(q.sprite, q.color);
        ctx.globalAlpha = alpha;
        if (img) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore(); }
        else { ctx.fillStyle = q.color; ctx.fillRect(q.x - w / 2, q.y - h / 2, w, h); }
        ctx.globalAlpha = 1;
        return;
      }
      ctx.globalAlpha = clamp(q.life / q.maxLife, 0, 1);
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Player rendering per survev client/src/objects/player.ts and animData.ts:
    // body sprite at scale 0.25 (140px -> 35px = 2.19 units), hands at the idle-pose pivots (16 px per unit),
    // gun sprite anchored at its bottom center on the right hand offset (-4.25, -1.75), scaled by worldImg.scale * 0.5.
    drawCharacter(x, y, aim, gun, skinTint) {
      const ctx = this.ctx, A = ST.assets, SV = ST.SURVEV, U = SV.ppuBase;
      const def = gun.def;
      const body = A.tint('player-base-01.img', A.hex(skinTint));
      const hand = A.tint('player-hands-01.img', A.hex(skinTint));
      const gunImg = def.worldImg && A.get(def.worldImg.sprite);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(aim);
      const pose = def.pistol ? SV.poses.pistol : def.bullpup ? SV.poses.bullpup : SV.poses.rifle;
      const recoil = (gun.recoil || 0) * 1.125;
      const handR = { x: (pose.handR[0] - recoil) / U, y: pose.handR[1] / U };
      const lho = def.worldImg && def.worldImg.leftHandOffset ? def.worldImg.leftHandOffset : { x: 0, y: 0 };
      const handL = { x: (pose.handL[0] + lho.x - recoil) / U, y: (pose.handL[1] + lho.y) / U };
      const bodySize = 140 * SV.bodySpriteScale / U;
      const handSize = 76 * SV.handSpriteScale / U;

      // Backpack (level 1, as most players carry one): a dark circle offset behind the body, player.ts "Backpack".
      const bag = A.tint('player-circle-base-01.img', A.hex(SV.backpackTint));
      if (bag) {
        const lvl = SV.backpack.level;
        const bagScale = (0.4 + lvl * 0.03) * 0.5;
        const bagSize = 148 * bagScale * 2 / U; // circle-base sprite is 148px at 2x, like the others
        const bagOffset = SV.backpack.offsets[Math.min(lvl - 1, 2)] / U;
        ctx.drawImage(bag, -bagOffset - bagSize / 2, -bagSize / 2, bagSize, bagSize);
      }
      // Body.
      if (body) ctx.drawImage(body, -bodySize / 2, -bodySize / 2, bodySize, bodySize);
      else { ctx.beginPath(); ctx.arc(0, 0, PLAYER_R, 0, TAU); ctx.fillStyle = A.hex(skinTint); ctx.fill(); }

      // Gun, drawn from its stock at the right hand toward the muzzle.
      const drawGun = () => {
        if (!def.worldImg) return;
        const go = def.worldImg.gunOffset || { x: 0, y: 0 };
        const ax = handR.x + (SV.gunHandOffset[0] + go.x) / U, ay = handR.y + (SV.gunHandOffset[1] + go.y) / U;
        if (gunImg) {
          const gw = (gunImg.naturalWidth || gunImg.width) * def.worldImg.scale.x * 0.5 / U;
          const gl = (gunImg.naturalHeight || gunImg.height) * def.worldImg.scale.y * 0.5 / U;
          ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.PI / 2);
          ctx.drawImage(gunImg, -gw / 2, -gl, gw, gl);
          ctx.restore();
        } else {
          ctx.fillStyle = '#2b2b2b';
          ctx.fillRect(ax, ay - 0.17, def.barrel - ax, 0.34);
        }
      };
      const drawHands = () => {
        for (const h of [handL, handR]) {
          if (hand) ctx.drawImage(hand, h.x - handSize / 2, h.y - handSize / 2, handSize, handSize);
          else { ctx.beginPath(); ctx.arc(h.x, h.y, 0.34, 0, TAU); ctx.fillStyle = A.hex(skinTint); ctx.fill(); }
        }
      };
      if (def.worldImg && def.worldImg.handsBelow) { drawHands(); drawGun(); } else { drawGun(); drawHands(); }
      ctx.restore();
    }

    drawFeed(ctx) {
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      let y = 90;
      for (const f of this.feed) {
        ctx.globalAlpha = clamp(f.life / 0.6, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(f.text, 21, y + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 20, y);
        y += 22;
      }
      ctx.globalAlpha = 1;
    }

    drawCrosshair(ctx) {
      const { x, y } = this.mouse;
      const hit = this.s.hitmarker && this.hitFlash > 0;
      const img = ST.assets.get('crosshair000.img');
      const size = 32;
      if (img) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
        ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
        ctx.restore();
      } else {
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y); ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14);
        ctx.stroke();
      }
      if (hit) {
        ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.moveTo(x + sx * 8, y + sy * 8); ctx.lineTo(x + sx * 15, y + sy * 15);
        }
        ctx.stroke();
      }
    }
  }

  ST.Game = Game;
  ST.ARENA = ARENA;
})();
