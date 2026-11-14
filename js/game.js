// Core simulation + rendering. Top-down, world units where a player has radius 1.
window.ST = window.ST || {};

(function () {
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const GC = ST.GC;                          // survev's GameConfig, verbatim
  const PLAYER_R = GC.player.radius;
  const perkProps = (id) => ST.PERKS[id].props;   // survev's PerkProperties for one perk
  const EXPLOSION_FX = {
    frag: { sound: 'explosion_01', volume: 0.9, scale: 1 },
    usas: { sound: 'explosion_03', volume: 0.9, scale: 0.75 },
    rounds: { sound: 'explosion_04', volume: 0.45, scale: 0.32 },
    rounds_sg: { sound: 'explosion_04', volume: 0.18, scale: 0.32 },
  };
  const MOVE_SPEED = GC.player.moveSpeed;
  const ARENA = 100;               // default arena half-size; scopes past 4x widen it (see arenaFor)
  const PLAYER_MAX_HP = GC.player.health;

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  // math.remap from survev: map v from [a,b] onto [c,d].
  const remap = (v, a, b, c, d) => c + (clamp(v, Math.min(a, b), Math.max(a, b)) - a) / (b - a) * (d - c);
  // The field has to be bigger than the view or a high scope shows the edge of the world.
  const arenaFor = (zoomRadius) => Math.max(ARENA, Math.ceil(zoomRadius * 2.2));
  function gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  // Where a segment first enters a circle: the entry point and the outward surface normal there.
  // Bouncing needs the real entry point, not the segment's closest approach to the centre, or the
  // normal comes out perpendicular to the shot and nothing reflects.
  function segCircleEntry(ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax, dy = by - ay;
    const fx = ax - cx, fy = ay - cy;
    const A = dx * dx + dy * dy;
    if (A < 1e-12) return null;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t = (-B - sq) / (2 * A);
    if (t < 0) t = (-B + sq) / (2 * A);   // started inside the circle
    if (t < 0 || t > 1) return null;
    const px = ax + dx * t, py = ay + dy * t;
    const nl = Math.hypot(px - cx, py - cy) || 1;
    return { t, px, py, nx: (px - cx) / nl, ny: (py - cy) / nl };
  }

  // Where a segment first enters an axis-aligned box, and the outward normal of the face it hits.
  // Flat walls are the interesting mirror: unlike a barrel, a plane can bank a shot around a corner.
  function segRectEntry(ax, ay, bx, by, cx, cy, hw, hh) {
    const dx = bx - ax, dy = by - ay;
    let tmin = 0, tmax = 1, nx = 0, ny = 0;
    // x slab
    if (Math.abs(dx) < 1e-12) {
      if (ax < cx - hw || ax > cx + hw) return null;
    } else {
      let t1 = (cx - hw - ax) / dx, t2 = (cx + hw - ax) / dx;
      const sign = dx > 0 ? -1 : 1;          // the face you enter through faces back at you
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; nx = sign; ny = 0; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    // y slab
    if (Math.abs(dy) < 1e-12) {
      if (ay < cy - hh || ay > cy + hh) return null;
    } else {
      let t1 = (cy - hh - ay) / dy, t2 = (cy + hh - ay) / dy;
      const sign = dy > 0 ? -1 : 1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; nx = 0; ny = sign; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmax < 0 || tmin > 1) return null;
    const t = Math.max(tmin, 0);
    return { t, px: ax + dx * t, py: ay + dy * t, nx, ny };
  }

  // Whichever shape the obstacle is, where does this segment first touch it?
  function obstacleEntry(o, ax, ay, bx, by) {
    return o.shape === 'rect'
      ? segRectEntry(ax, ay, bx, by, o.x, o.y, o.hw, o.hh)
      : segCircleEntry(ax, ay, bx, by, o.x, o.y, o.r);
  }

  // Push a circle of `rad` out of an obstacle it has sunk into.
  function pushOut(pos, o, rad) {
    if (o.shape === 'rect') {
      const cx = clamp(pos.x, o.x - o.hw, o.x + o.hw);
      const cy = clamp(pos.y, o.y - o.hh, o.y + o.hh);
      const dx = pos.x - cx, dy = pos.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > 1e-9) {
        if (d < rad) { pos.x = cx + dx / d * rad; pos.y = cy + dy / d * rad; }
        return;
      }
      // Dead centre inside the box: leave by the nearest face.
      const l = pos.x - (o.x - o.hw), r = (o.x + o.hw) - pos.x;
      const u = pos.y - (o.y - o.hh), dn = (o.y + o.hh) - pos.y;
      const m = Math.min(l, r, u, dn);
      if (m === l) pos.x = o.x - o.hw - rad;
      else if (m === r) pos.x = o.x + o.hw + rad;
      else if (m === u) pos.y = o.y - o.hh - rad;
      else pos.y = o.y + o.hh + rad;
      return;
    }
    const dx = pos.x - o.x, dy = pos.y - o.y;
    const d = Math.hypot(dx, dy), min = o.r + rad;
    if (d < min && d > 0) { pos.x = o.x + dx / d * min; pos.y = o.y + dy / d * min; }
  }

  // Outward normal at the point of an obstacle nearest to (x, y). Used for grenade bounces.
  function normalAt(o, x, y) {
    if (o.shape === 'rect') {
      const cx = clamp(x, o.x - o.hw, o.x + o.hw);
      const cy = clamp(y, o.y - o.hh, o.y + o.hh);
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > 1e-9) return { nx: dx / d, ny: dy / d, cx, cy, d };
      return { nx: 0, ny: -1, cx, cy, d: 0 };
    }
    const dx = x - o.x, dy = y - o.y;
    const d = Math.hypot(dx, dy) || 1e-9;
    return { nx: dx / d, ny: dy / d, cx: o.x, cy: o.y, d };
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
    return {
      def, ammo: def.mag, reloading: false, reloadT: 0, cooldown: 0, pullT: 0, recoil: 0,
      emptyClicked: false, recoilTicker: 0, scheduledReload: false,
    };
  }
  // A throwable occupies a weapon slot like a gun does, but holds a count instead of a magazine.
  function makeThrowable(def, count) {
    return { def, throwable: true, count: count === undefined ? 3 : count, cooldown: 0, cooking: false, cookT: 0 };
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
    g.recoilTicker += dt;
    g.recoil = Math.max(0, g.recoil - g.recoil * dt * 5 - dt); // player.ts recoil decay
    if (g.pullT > 0) { g.pullT -= dt; if (g.pullT <= 0 && g.def.sound.pull) ST.audio.play(g.def.sound.pull, g.soundOpts); }
    // weaponManager.gunUpdate: a reload scheduled by the shot that emptied the gun (or by switching
    // to an empty one) starts as soon as that shot's fireDelay is up, whether or not you are still
    // holding the trigger. Running dry reloads by itself; you never have to press R for it.
    if (g.scheduledReload && g.cooldown <= 0) {
      g.scheduledReload = false;
      startReload(g, g.soundOpts);
    }
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
      // fireWeapon schedules a reload even on a trigger pull that finds the gun already empty.
      if (!g.emptyClicked && !g.reloading && !g.scheduledReload) { ST.audio.empty(g.def); g.emptyClicked = true; }
      g.scheduledReload = true;
      return false;
    }
    if (g.cooldown > 0) return false;
    if (g.reloading) {
      if (g.def.reloadPerShell) g.reloading = false; // firing interrupts shell-by-shell reloads
      else return false;
    }
    g.ammo--;
    g.scheduledReload = g.ammo <= 0;   // fireWeapon: the shot that empties the mag queues the reload
    // weaponManager.ts: a gun idle for longer than recoilTime fires its next shot with no spread.
    const firstShot = g.recoilTicker >= g.def.recoilTime;
    g.recoilTicker = 0;
    g.cooldown = Math.max(g.def.fireDelay, minDelay || 0);
    g.recoil += g.def.worldImg && g.def.worldImg.recoil ? g.def.worldImg.recoil : 1;
    if (g.def.pullDelay) g.pullT = g.def.pullDelay;
    fireFn(firstShot);
    return true;
  }

  class Game {
    constructor(canvas, settings, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.s = settings;
      this.hooks = hooks || {};
      if (settings.respawnDelay === undefined) settings.respawnDelay = ST.respawnDelayFor(settings);
      this.zoomRadius = ST.SCOPES[settings.scope] || 28;
      this.halfH = this.zoomRadius;
      this.arena = arenaFor(this.zoomRadius);

      this.keys = new Set();
      this.mouse = { x: 0, y: 0, down: false, queued: false };
      this.time = 0;
      this.running = false;
      this.paused = false;
      this.finished = false;

      // Weapon slots, as in survev: two guns, plus a throwable. Slot 0 is always the drill's weapon.
      const secondary = settings.secondary && ST.WEAPONS[settings.secondary] ? ST.WEAPONS[settings.secondary] : null;
      const throwable = settings.throwable && ST.THROWABLES[settings.throwable] ? ST.THROWABLES[settings.throwable] : null;
      // Perks change the player's guns (ST.perkedGun) and body: size, damage taken, speed, health.
      // Bots never carry any.
      const perks = ST.perkList(settings.perks);
      this.perks = new Set(perks);
      const scale = ST.perkScale(perks);
      this.player = {
        pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, hp: PLAYER_MAX_HP, aim: 0, aimVel: 0, moving: false,
        scale, radius: PLAYER_R * scale,   // player.ts: the collider grows with the perks' scale
        hasteT: 0, hasteType: '',          // player.ts giveHaste: +hasteSpeedBonus while it lasts
        weapons: [
          makeGun(ST.perkedGun(ST.WEAPONS[settings.weapon], perks)),
          secondary ? makeGun(ST.perkedGun(secondary, perks)) : null,
          throwable ? makeThrowable(throwable, settings.throwableCount) : null,
        ],
        curIdx: 0, lastIdx: secondary ? 1 : 0,
        freeSwitchTimer: 0,     // < 0 means the next weapon switch only costs baseSwitchDelay
        visualLog: [],          // recent perceived-centroid samples, for enemy perception latency
      };
      Object.defineProperty(this.player, 'gun', { get: () => this.player.weapons[this.player.curIdx] || this.player.weapons[0] });
      this.enemyDef = ST.WEAPONS[settings.enemyWeapon || settings.weapon];
      this.enemies = [];
      this.bullets = [];
      this.projectiles = [];
      this.explosions = [];
      this.particles = [];
      this.respawns = [];
      this.markers = [];
      this.feed = [];
      this.bunker = null;
      this.obstacles = settings.arena
        ? this.makeBunker(settings.arena)
        : (settings.obstacles ? this.makeObstacles() : []);
      if (this.bunker) {
        this.player.pos.x = this.bunker.spawn.x;
        this.player.pos.y = this.bunker.spawn.y;
      }
      this.stats = {
        shots: 0, pellets: 0, hits: 0, kills: 0, deaths: 0, dmgDealt: 0, dmgTaken: 0,
        expired: 0, ttk: [], reaction: [], engage: [], movingShots: 0, onTarget: 0, firing: 0,
        movingTime: 0, movingPellets: 0, movingHits: 0, dmgTakenStill: 0, hitsTaken: 0, hitsTakenStill: 0,
        headshots: 0,
        // Spinning: time spent whirling the cursor, and how it changed what you and the bots hit.
        spinTime: 0, spinPellets: 0, spinHits: 0, dmgTakenSpinning: 0, spinDodges: 0,
        // Quick switching: switches that beat the primary's own fire delay, and the gaps they produced.
        switches: 0, quickSwitchShots: 0, switchGaps: [],
        // Throwables and ricochet.
        nadesThrown: 0, nadeHits: 0, nadeDmg: 0, nadeKills: 0, nadeSelfDmg: 0, cookTimes: [],
        ricochetPellets: 0, ricochetHits: 0, ricochetDmg: 0, ricochetSelfDmg: 0, barrelsPopped: 0,
      };
      this.lastFireT = -99;      // when the last shot left any weapon, for quick-switch timing
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
    // Stones and barrels with survev's own colliders, health and reflectBullets flags
    // (vendor/survev/defs/obstacleDefs.js). Barrels bounce bullets and blow up when destroyed.
    makeObstacles() {
      const out = [];
      const A = this.arena;
      const wantBarrels = this.s.barrels === undefined ? 0 : this.s.barrels;
      const wantStones = this.s.stones === undefined ? 14 : this.s.stones;
      const place = (defId, n, minGap) => {
        const def = ST.OBSTACLES[defId];
        let tries = 0;
        let placed = 0;
        while (placed < n && tries++ < 500) {
          const scale = rand(def.scale.createMin, def.scale.createMax);
          const r = def.collisionRad * scale;
          const x = rand(-A + 6, A - 6), y = rand(-A + 6, A - 6);
          if (Math.hypot(x, y) < 9) continue;
          if (out.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + minGap)) continue;
          out.push({
            x, y, r, shape: 'circle', scale, def, defId, hp: def.health, maxHp: def.health,
            reflect: !!def.reflectBullets, dead: false, hitFlash: 0, id: out.length + 1,
          });
          placed++;
        }
      };
      place('barrel_01', wantBarrels, 4);
      place('stone_01', wantStones, 6);
      return out;
    }

    // One of survev's own buildings, laid out from its mapObjects list
    // (vendor/survev/defs/bunkerDefs.js). Pass a layout id, or "bunker" to draw one at random so a
    // drill is not the same room every time. survev's y axis points up and the trainer's points
    // down, so the layout is mirrored on import; `ori` is a quarter turn, which for an axis-aligned
    // box just swaps its extents.
    makeBunker(id) {
      const B = window.SURVEV_BUNKER_DEFS;
      if (!B) return [];
      const ids = Object.keys(B.layouts);
      if (!B.layouts[id]) id = ids[Math.floor(Math.random() * ids.length)];
      const layout = B.layouts[id];
      if (!layout) return [];
      this.arenaId = id;
      const out = [];
      for (const obj of layout.objects) {
        const wall = B.walls[obj.type];
        const prop = B.props[obj.type];
        if (!wall && !prop) continue;
        const material = wall ? wall.material : prop.material;
        const def = {
          collidable: true,
          height: wall ? 10 : prop.height,
          health: wall ? wall.health : prop.health,
          destructible: wall ? false : !!prop.destructible,
          reflectBullets: material === 'metal',
          explosion: prop && prop.explosion,
          material,
          sound: { bullet: material === 'metal' ? 'barrel_bullet' : 'stone_bullet', explode: 'barrel_break_01' },
          img: {},
        };
        const x = obj.pos[0], y = -obj.pos[1];
        const item = {
          x, y, scale: 1, def, defId: obj.type, hp: def.health, maxHp: def.health,
          reflect: def.reflectBullets, dead: false, hitFlash: 0, id: out.length + 1, material,
        };
        const extents = wall ? wall.extents : prop.extents;
        if (extents) {
          const swap = obj.ori % 2 === 1;
          item.shape = 'rect';
          item.hw = swap ? extents[1] : extents[0];
          item.hh = swap ? extents[0] : extents[1];
          item.r = Math.hypot(item.hw, item.hh);
        } else {
          item.shape = 'circle';
          item.r = prop.rad;
        }
        out.push(item);
      }
    // Bounds, rooms and a spawn point are derived from the walls when the layout does not name
      // them, so a new bunker only has to supply survev's own object list.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const o of out) {
        const hw = o.hw || o.r, hh = o.hh || o.r;
        minX = Math.min(minX, o.x - hw); maxX = Math.max(maxX, o.x + hw);
        minY = Math.min(minY, o.y - hh); maxY = Math.max(maxY, o.y + hh);
      }
      const bounds = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, hw: (maxX - minX) / 2, hh: (maxY - minY) / 2 };
      this.bunker = { rooms: [bounds], bounds, name: layout.name };
      this.obstacles = out;   // clearAt needs them in place before it can look for open floor
      this.bunker.spawn = this.openestPoint(bounds);
      return out;
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
      // survev client/src/game.ts: maxScreenDim = max(minDim * 16/9, maxDim);
      // targetZoom = (maxScreenDim * 0.5) / (zoomRadius * ppu). A window narrower than 16:9 is treated
      // as 16:9, so the world is the same size on screen as it is in the real game.
      // A canvas can be momentarily zero-sized — a fullscreen transition, a restored tab, layout not
      // settled yet — and 0/0 would make the scale NaN, which then leaks into aim and spawn geometry
      // and is very hard to trace back here. Refuse to compute a degenerate camera.
      this.ppu = ST.pixelsPerUnit(Math.max(this.w, 1), Math.max(this.h, 1), this.zoomRadius) || 1;
      this.halfW = Math.max(this.w, 1) / (2 * this.ppu);
      this.halfH = Math.max(this.h, 1) / (2 * this.ppu);
    }

    bindInput() {
      const c = this.canvas;
      // Inputs map to actions through ST.controls (rebindable; survev's layout by default).
      // this.keys holds the movement actions currently held.
      this.press = (action, e) => {
        switch (action) {
          case 'shoot': ST.audio.unlock(); this.mouse.down = true; this.mouse.queued = true; break;
          case 'up': case 'down': case 'left': case 'right': this.keys.add(action); break;
          case 'reload': { const g = this.player.gun; if (g && !g.throwable) startReload(g); break; }
          // Weapon slots, as in survev: the two guns, the throwable, and the last weapon.
          case 'primary': this.equip(0); break;
          case 'secondary': this.equip(1); break;
          case 'throwable': this.equip(2); break;
          case 'swap': this.equip(this.player.lastIdx); break;
          default: return;
        }
        e.preventDefault();
      };
      this.release = (action) => {
        if (action === 'shoot') { this.mouse.down = false; this.mouse.queued = false; } else this.keys.delete(action);
      };
      this.onKeyDown = (e) => {
        if (e.code === 'Escape' || e.key === 'Escape') { if (!e.repeat) this.togglePause(); e.preventDefault(); return; }
        const action = ST.controls.actionFor(e.code);
        if (!action) return;
        if (e.repeat || this.paused) { e.preventDefault(); return; }
        this.press(action, e);
      };
      this.onKeyUp = (e) => { const a = ST.controls.actionFor(e.code); if (a) this.release(a); };
      this.onMouseMove = (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; };
      this.onMouseDown = (e) => {
        ST.audio.unlock();
        const action = ST.controls.actionFor('Mouse' + e.button);
        if (action && !this.paused) this.press(action, e);
        else e.preventDefault();
      };
      this.onMouseUp = (e) => {
        const a = ST.controls.actionFor('Mouse' + e.button);
        if (a) this.release(a);
        // Mouse 4 and 5 are the browser's back and forward buttons.
        if (e.button === 3 || e.button === 4) e.preventDefault();
      };
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

    // ---------- weapons ----------
    // survev weaponManager.setCurWeapIndex, verbatim in behaviour:
    //   the switch costs the new gun's switchDelay, except that a switch is "free" (baseSwitchDelay,
    //   0.25 s) once every freeSwitchCooldown (1 s); and two guns that share a non-zero deployGroup
    //   pay the full switchDelay while the old gun is still on cooldown, so you cannot quick-switch
    //   between two shotguns to skip the pump.
    equip(idx) {
      const p = this.player;
      // Asked to swap to the slot already in hand: take the next usable slot instead, so right
      // click and Q always do something.
      if (idx === p.curIdx) {
        const alt = p.weapons.findIndex((w, i) => w && i !== p.curIdx && (!w.throwable || w.count > 0));
        if (alt < 0) return;
        idx = alt;
      }
      const next = p.weapons[idx];
      const cur = p.weapons[p.curIdx];
      if (!next || !cur) return;
      if (next.throwable && next.count <= 0) return;
      if (cur.throwable && cur.cooking) this.throwGrenade(true);   // switching away lobs the cooked nade
      if (cur.reloading) { cur.reloading = false; cur.reloadT = 0; }
      if (!cur.throwable) cur.scheduledReload = false;
      // setCurWeapIndex: switching to a gun you left empty queues its reload behind the switch delay.
      if (!next.throwable && next.ammo <= 0) next.scheduledReload = true;

      const swappingToGun = !next.throwable;
      let delay = swappingToGun ? next.def.switchDelay : 0;
      if (p.freeSwitchTimer < 0) {
        delay = GC.player.baseSwitchDelay;
        p.freeSwitchTimer = GC.player.freeSwitchCooldown;
      }
      const sameGroup = swappingToGun && !cur.throwable
        && cur.def.deployGroup !== undefined && cur.def.deployGroup === next.def.deployGroup;
      if (sameGroup && cur.cooldown > 0) delay = next.def.switchDelay;

      next.cooldown = delay;
      if (!next.throwable) next.recoilTicker = 0;
      p.lastIdx = p.curIdx;
      p.curIdx = idx;
      this.stats.switches++;
      this.pendingSwitchShot = true;   // the next shot closes a switch, for quick-switch timing
      ST.audio.play('gun_switch_01', { volume: 0.5 });
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
        headshots: st.headshots,
        // Spinning: what it cost you and what it bought you.
        spinFrac: st.spinTime / Math.max(this.time, 1),
        accSpinning: st.spinPellets ? st.spinHits / st.spinPellets : null,
        accNotSpinning: (st.pellets - st.spinPellets) ? (st.hits - st.spinHits) / (st.pellets - st.spinPellets) : null,
        dmgTakenPerMinSpinning: st.spinTime > 3 ? st.dmgTakenSpinning / st.spinTime * 60 : null,
        dmgTakenPerMinSteady: (this.time - st.spinTime) > 3 ? (st.dmgTaken - st.dmgTakenSpinning) / (this.time - st.spinTime) * 60 : null,
        // Quick switching.
        switches: st.switches,
        quickSwitchShots: st.quickSwitchShots,
        avgSwitchGap: avg(st.switchGaps),
        switchesPerMin: st.switches / minutes,
        // Throwables.
        nadesThrown: st.nadesThrown, nadeHits: st.nadeHits, nadeKills: st.nadeKills,
        nadeDmg: st.nadeDmg, nadeSelfDmg: st.nadeSelfDmg,
        nadeDmgPerThrow: st.nadesThrown ? st.nadeDmg / st.nadesThrown : null,
        avgCookTime: avg(st.cookTimes),
        // Ricochet.
        ricochetPellets: st.ricochetPellets, ricochetHits: st.ricochetHits,
        ricochetDmg: st.ricochetDmg, ricochetSelfDmg: st.ricochetSelfDmg,
        ricochetRate: st.ricochetPellets ? st.ricochetHits / st.ricochetPellets : null,
        barrelsPopped: st.barrelsPopped,
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
      const p = this.player;
      const g = p.gun;
      const slots = p.weapons.map((w, i) => w ? {
        idx: i, key: i === 2 ? '4' : String(i + 1), name: w.def.name, active: i === p.curIdx,
        ammo: w.throwable ? w.count : w.ammo, mag: w.throwable ? null : w.def.mag,
        throwable: !!w.throwable, ready: w.cooldown <= 0,
      } : null).filter(Boolean);
      return {
        time: this.time, duration: this.s.duration,
        hp: p.hp, maxHp: PLAYER_MAX_HP,
        ammo: g.throwable ? g.count : g.ammo, mag: g.throwable ? null : g.def.mag,
        reloading: !g.throwable && g.reloading,
        reloadFrac: !g.throwable && g.reloading ? 1 - g.reloadT / g.def.reload : 0,
        weapon: g.def.name,
        slots, spin: this.spinFrac(), cooking: !!(g.throwable && g.cooking),
        perks: [...this.perks], haste: p.hasteT > 0 ? p.hasteType : '',
        kills: this.stats.kills, deaths: this.stats.deaths,
        accuracy: this.stats.pellets ? this.stats.hits / this.stats.pellets : 0,
        hits: this.stats.hits,
        difficulty: this.s.adaptive ? this.diff : null,
        label: this.s.label || null,
      };
    }

    // ---------- spawning ----------
    // The most open spot in a region: where a player can stand furthest from anything solid.
    openestPoint(b) {
      let best = { x: b.x, y: b.y }, bestClear = -1;
      for (let i = 0; i < 3000; i++) {
        const x = rand(b.x - b.hw, b.x + b.hw), y = rand(b.y - b.hh, b.y + b.hh);
        let clear = Infinity;
        for (const o of this.obstacles) {
          if (o.dead || !o.def.collidable) continue;
          clear = Math.min(clear, normalAt(o, x, y).d);
          if (clear <= bestClear) break;
        }
        if (clear > bestClear) { bestClear = clear; best = { x, y }; }
      }
      return best;
    }

    // Is there room for a body at (x, y) without clipping anything solid?
    clearAt(x, y, margin) {
      const pad = PLAYER_R + (margin === undefined ? 0.6 : margin);
      return !this.obstacles.some(o => !o.dead && o.def.collidable && normalAt(o, x, y).d < pad);
    }

    // In a bunker the enemy has to come from somewhere you could actually walk: pick a room, pick a
    // spot in it that is clear, in range and in sight, so the drill always opens with a fair shot.
    bunkerSpawn() {
      const p = this.player.pos;
      const rooms = this.bunker.rooms;
      let best = null;
      for (let i = 0; i < 200; i++) {
        const rm = rooms[Math.floor(Math.random() * rooms.length)];
        const x = rand(rm.x - rm.hw, rm.x + rm.hw);
        const y = rand(rm.y - rm.hh, rm.y + rm.hh);
        if (!this.clearAt(x, y)) continue;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < 4) continue;
        best = best || { x, y };
        if (d < this.s.minDist || d > this.s.maxDist) continue;
        if (this.blocked(p.x, p.y, x, y)) continue;
        return { x, y };
      }
      return best || { x: p.x + 6, y: p.y };
    }

    randomSpawn() {
      if (this.bunker) return this.bunkerSpawn();
      const p = this.player.pos;
      const minD = this.s.minDist, maxD = this.s.maxDist;
      // Keep spawns on screen so every target is reachable by aim alone.
      const bx = this.halfW - 2.5, by = this.halfH - 2.5;
      let best = null;
      for (let i = 0; i < 60; i++) {
        const a = rand(0, TAU), d = rand(minD, maxD);
        const x = clamp(p.x + Math.cos(a) * d, -this.arena + 2, this.arena - 2);
        const y = clamp(p.y + Math.sin(a) * d, -this.arena + 2, this.arena - 2);
        const cand = { x, y };
        best = best || cand;
        if (Math.abs(x - p.x) > bx || Math.abs(y - p.y) > by) continue;
        if (Math.hypot(x - p.x, y - p.y) < Math.min(minD, 4)) continue;
        if (!this.clearAt(x, y, 1.5)) continue;
        // hugCover: the ricochet drill only works if targets stand beside a barrel, because a round
        // barrel throws bullets back into the shooter's own half of the field and can never bend
        // them around behind itself.
        if (this.s.hugCover && !this.obstacles.some(r => !r.dead && r.reflect && Math.hypot(r.x - x, r.y - y) < r.r + 5)) continue;
        if (this.enemies.some(e => Math.hypot(e.pos.x - x, e.pos.y - y) < 3)) continue;
        // Skip spawns whose line of sight to the player is blocked.
        if (this.blocked(p.x, p.y, x, y)) continue;
        return cand;
      }
      return best;
    }

    spawnEnemy() {
      const pos = this.randomSpawn();
      const skill = ST.AIM[this.s.enemyAim] || ST.AIM.normal;
      const hp = this.s.enemyHp;
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
      this.updateProjectiles(dt);
      this.updateBullets(dt);
      this.repairState();
      this.updateEffects(dt);
      this.updateRespawns(dt);
      this.updateAdaptive(dt);
    }

    // A frozen, unkillable enemy is the worst failure this thing has: it looks like the drill is
    // broken and there is no way for a player to clear it. If anything's position or velocity ever
    // stops being a real number, put it back rather than letting it sit there.
    repairState() {
      const ok = (v) => Number.isFinite(v);
      const p = this.player;
      if (!ok(p.pos.x) || !ok(p.pos.y)) { p.pos.x = 0; p.pos.y = 0; p.vel.x = 0; p.vel.y = 0; }
      if (!ok(p.vel.x) || !ok(p.vel.y)) { p.vel.x = 0; p.vel.y = 0; }
      if (!ok(p.aim)) p.aim = 0;
      if (!ok(p.aimVel)) p.aimVel = 0;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (!ok(e.vel.x) || !ok(e.vel.y)) { e.vel.x = 0; e.vel.y = 0; }
        if (!ok(e.heading)) e.heading = rand(0, TAU);
        if (!ok(e.timer)) e.timer = 0;
        if (!ok(e.hp) || !ok(e.maxHp)) { e.hp = this.s.enemyHp; e.maxHp = this.s.enemyHp; }
        if (!ok(e.pos.x) || !ok(e.pos.y)) {
          const spot = this.randomSpawn();
          if (spot && ok(spot.x) && ok(spot.y)) { e.pos.x = spot.x; e.pos.y = spot.y; }
          else { this.enemies.splice(i, 1); this.respawns.push(this.s.respawnDelay); }
        }
      }
      this.bullets = this.bullets.filter(b => ok(b.x) && ok(b.y) && ok(b.dx) && ok(b.dy));
      this.projectiles = this.projectiles.filter(q => ok(q.x) && ok(q.y));
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
      } else if (ST.isTrackingDrill(this.s)) {
        // A tracking drill's bots are tough enough that kills are rare, so grade each one-second
        // window on hit ratio instead.
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
      if (k.has('up')) my -= 1;
      if (k.has('down')) my += 1;
      if (k.has('left')) mx -= 1;
      if (k.has('right')) mx += 1;
      const l = Math.hypot(mx, my);
      p.moving = l > 0;
      if (l > 0) { mx /= l; my /= l; }
      // Cooking a grenade slows you the way it does in survev (GameConfig.player.cookSpeedPenalty).
      const cooking = p.gun && p.gun.throwable && p.gun.cooking;
      // Haste (Windwalk, Takedown) adds hasteSpeedBonus; Small Arms gives guns an equip speed of +1
      // (player.ts), where every gun's own is 0 in the trainer.
      const hasted = p.hasteT > 0 ? GC.player.hasteSpeedBonus : 0;
      const smallArms = this.perks.has('small_arms') && p.gun && !p.gun.throwable ? perkProps('small_arms').gunEquipSpeed : 0;
      const speed = MOVE_SPEED + hasted + smallArms - (cooking ? GC.player.cookSpeedPenalty : 0);
      p.vel.x = mx * speed; p.vel.y = my * speed;
      if (p.moving) this.stats.movingTime += dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      this.clampToBounds(p.pos, p.radius);
      this.pushOutOfObstacles(p.pos, p.radius);
      if (p.hasteT > 0) { p.hasteT -= dt; if (p.hasteT <= 0) { p.hasteT = 0; p.hasteType = ''; } }
      // Gift of the Woods: player.ts regenerates healthRegen a second.
      if (this.perks.has('gotw')) p.hp = Math.min(PLAYER_MAX_HP, p.hp + perkProps('gotw').healthRegen * dt);

      const m = this.mouseWorld();
      const prevAim = p.aim;
      p.aim = Math.atan2(m.y - p.pos.y, m.x - p.pos.x);
      this.updateSpin(dt, prevAim);
      this.sampleVisual();

      p.freeSwitchTimer -= dt;

      const g = p.gun;
      if (!g) return;
      if (g.throwable) { this.updateThrowable(dt, g); return; }
      const wantFire = g.def.auto ? this.mouse.down : this.mouse.queued;
      updateGun(g, dt, wantFire, (firstShot) => {
        this.mouse.queued = false;
        this.stats.shots++;
        // A shot that lands sooner than the gun it followed could have fired is a quick switch.
        const gap = this.time - this.lastFireT;
        if (this.pendingSwitchShot) {
          this.pendingSwitchShot = false;
          if (gap < this.slowestFireDelay()) { this.stats.quickSwitchShots++; this.stats.switchGaps.push(gap); }
        }
        this.lastFireT = this.time;
        const m = this.mouseWorld();
        this.fireGun(p, g.def, p.aim, p.moving, 'player', { firstShot, toMouseLen: Math.hypot(m.x - p.pos.x, m.y - p.pos.y), gun: g });
      });
    }

    // The fire delay you would have waited had you not switched: the slowest of the two guns.
    slowestFireDelay() {
      let d = 0;
      for (const w of this.player.weapons) {
        if (!w || w.throwable) continue;
        d = Math.max(d, w.def.fireDelay + (w.def.pullDelay || 0));
      }
      return d;
    }

    // ---------- spinning ----------
    // How fast you are whirling your aim, in radians per second, smoothed over ~150 ms.
    // Spinning is a real survev habit: it costs you your own aim, and it denies the enemy both a
    // stable silhouette to track and the facing cue they use to predict your next strafe.
    updateSpin(dt, prevAim) {
      const p = this.player;
      let d = p.aim - prevAim;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const inst = dt > 0 ? Math.abs(d) / dt : 0;
      const a = clamp(dt / 0.15, 0, 1);
      p.aimVel = lerp(p.aimVel, inst, a);
      if (this.spinFrac() > 0.5) this.stats.spinTime += dt;
    }
    // 0 at rest, 1 at a full revolution per second and beyond. Two revolutions per second is what a
    // player doing this on purpose reaches; casual tracking sits well under a quarter of it.
    spinFrac() { return clamp((this.player.aimVel - 2.5) / (TAU - 2.5), 0, 1); }

    // Enemies see a silhouette, not a hitbox: body, hands and a gun sticking out in front. The point
    // they actually shoot at is the centre of that silhouette, which swings around you as you turn.
    visualCentroid() {
      const p = this.player;
      const g = p.gun;
      const barrel = g && !g.throwable ? g.def.barrel : 1.5;
      const off = clamp(barrel * 0.15, 0, 0.6);
      return {
        x: p.pos.x + Math.cos(p.aim) * off, y: p.pos.y + Math.sin(p.aim) * off,
        vx: p.vel.x, vy: p.vel.y, t: this.time,
      };
    }
    sampleVisual() {
      const log = this.player.visualLog;
      log.push(this.visualCentroid());
      while (log.length > 1 && log[0].t < this.time - 1.2) log.shift();
    }
    // What an enemy with `latency` seconds of perception delay saw: where your silhouette was and
    // which way you were going. Spin fast enough and the stale silhouette centre is uncorrelated
    // with the current one, which is the miss distance spinning buys you directly: at most the gun's
    // own offset from your body, never more.
    perceived(latency) {
      const log = this.player.visualLog;
      const p = this.player;
      if (!log.length) return { x: p.pos.x, y: p.pos.y, vx: p.vel.x, vy: p.vel.y };
      const want = this.time - latency;
      for (let i = log.length - 1; i >= 0; i--) if (log[i].t <= want) return log[i];
      return log[0];
    }

    // ---------- throwables ----------
    // survev: holding fire pulls the pin and starts the fuse; releasing throws. Throw strength is the
    // cursor's distance from you over GameConfig.player.throwableMaxMouseDist, so a nade at your feet
    // is a short lob and a nade at the edge of the screen is a full throw.
    updateThrowable(dt, w) {
      w.cooldown = Math.max(0, w.cooldown - dt);
      if (w.cooldown > 0) return;
      if (this.mouse.down && !w.cooking && w.count > 0) {
        w.cooking = true;
        w.cookT = 0;
        ST.audio.play(w.def.sound.pullPin, { volume: 0.8 });
      }
      if (!w.cooking) return;
      w.cookT += dt;
      // A cooked frag goes off in your hand: survev's own safety check throws it at fuseTime.
      if (!this.mouse.down && w.cookT >= GC.player.cookTime) this.throwGrenade(false);
      else if (w.def.cookable && w.cookT > w.def.fuseTime) this.throwGrenade(false);
    }

    throwGrenade(noSpeed) {
      const p = this.player;
      const w = p.weapons[2];
      if (!w || !w.cooking || w.count <= 0) return;
      if (w.cookT < GC.player.cookTime) return;
      const def = w.def;
      w.cooking = false;
      w.count--;
      w.cooldown = GC.player.throwTime;
      this.stats.nadesThrown++;
      this.stats.cookTimes.push(w.cookT);

      const m = this.mouseWorld();
      const mouseLen = Math.hypot(m.x - p.pos.x, m.y - p.pos.y);
      const mult = noSpeed ? 0 : clamp(mouseLen, 0, GC.player.throwableMaxMouseDist) / GC.player.throwableMaxMouseDist;
      const strength = mult * def.speed;
      const dx = Math.cos(p.aim), dy = Math.sin(p.aim);
      // Thrown from the right hand: survev offsets the spawn by (0.5, -1) rotated into aim space.
      const hx = p.pos.x + 0.5 * dx - -1 * dy, hy = p.pos.y + 0.5 * dy + -1 * dx;
      this.projectiles.push({
        def, x: hx, y: hy, z: 0.5,
        vx: dx * strength + p.vel.x * def.playerVelMult,
        vy: dy * strength + p.vel.y * def.playerVelMult,
        vz: def.velZ,
        // A cooked grenade keeps the fuse it already burned.
        fuse: Math.max(0, def.fuseTime - (def.cookable ? w.cookT : 0)),
        rot: p.aim, rotVel: def.spinVel * (Math.random() < 0.5 ? -1 : 1),
        owner: 'player', cookT: w.cookT,
      });
      ST.audio.play(def.sound.throwing, { volume: 0.8 });
    }

    updateProjectiles(dt) {
      const G = GC.projectile;
      for (const q of this.projectiles) {
        // Height first: drag only applies once the grenade is rolling on the ground.
        q.vz -= G.gravity * dt;
        q.z += q.vz * dt;
        if (q.z <= 0) {
          q.z = 0;
          if (q.vz < 0) { q.vz = -q.vz * 0.35; if (q.vz < 1.2) q.vz = 0; ST.audio.play('frag_ground_01', { dist: this.distToPlayer(q), volume: 0.5 }); }
          const k = 1 / (1 + dt * G.groundDrag);
          q.vx *= k; q.vy *= k;
        }
        const nx = q.x + q.vx * dt, ny = q.y + q.vy * dt;
        // Bounce off obstacles that stand taller than the grenade currently flies.
        let bounced = false;
        const rad = q.def.rad * 0.5;
        for (const o of this.obstacles) {
          if (o.dead || q.z > o.def.height) continue;
          const n = normalAt(o, nx, ny);
          if (n.d < rad) {
            const vl = Math.hypot(q.vx, q.vy) || 0.0001;
            const dot = (q.vx / vl) * n.nx + (q.vy / vl) * n.ny;
            const rx = q.vx / vl - 2 * dot * n.nx, ry = q.vy / vl - 2 * dot * n.ny;
            const scale = Math.max(1 + dot, 0.15);   // survev projectile.ts
            q.vx = rx * vl * scale; q.vy = ry * vl * scale;
            q.x = n.cx + n.nx * (rad + 0.1); q.y = n.cy + n.ny * (rad + 0.1);
            bounced = true;
            break;
          }
        }
        if (!bounced) { q.x = nx; q.y = ny; }
        q.x = clamp(q.x, -this.arena + 0.5, this.arena - 0.5);
        q.y = clamp(q.y, -this.arena + 0.5, this.arena - 0.5);
        q.rot += q.rotVel * dt;
        q.rotVel *= 1 / (1 + dt);
        q.fuse -= dt;
        if (q.fuse <= 0) { q.done = true; this.explode(q); }
      }
      this.projectiles = this.projectiles.filter(q => !q.done);
    }

    // survev explosion.ts: everything inside rad.min takes the full damage; past that the damage
    // ramps linearly to zero at rad.max, and an obstacle between you and the blast eats it entirely.
    explode(q) {
      const def = q.def;
      const x = q.x, y = q.y;
      this.explosions.push({ x, y, life: 0.5, maxLife: 0.5, radMax: def.radMax });
      // explosion.ts effect defs, on grass: frags and barrels burst with explosion_01 (02 is the water
      // sound), the USAS-12's slug with explosion_03 at 0.75 scale, explosive rounds with a quiet
      // explosion_04 at 0.32 scale (quieter still from shotgun pellets).
      const fx = EXPLOSION_FX[q.effect] || EXPLOSION_FX.frag;
      ST.audio.play(fx.sound, { dist: this.distToPlayer(q), volume: fx.volume });
      this.spawnFragBurst(x, y, fx.scale);
      if (def.dmg > 0) {
        // As with bullets, bots' blasts only hurt the player; the player's hurt everyone, the player included.
        const targets = [{ o: this.player, kind: 'player' }].concat(q.owner === 'enemy' ? [] : this.enemies.map(e => ({ o: e, kind: 'enemy' })));
        for (const t of targets) {
          const o = t.o;
          const dx = o.pos.x - x, dy = o.pos.y - y;
          const dist = Math.max(0, Math.hypot(dx, dy) - (t.kind === 'player' ? this.player.radius : PLAYER_R));
          if (dist > def.radMax) continue;
          if (this.blocked(x, y, o.pos.x, o.pos.y)) continue;
          const dmg = dist <= def.radMin ? def.dmg : remap(dist, 0, def.radMax, def.dmg, 0);
          if (dmg <= 0) continue;
          // An explosive round's blast is the gun's damage, not a grenade's, so it stays out of the grenade stats.
          const source = q.round ? 'round' : 'explosion';
          if (t.kind === 'enemy') this.damageEnemy(o, { dmg, dx: dx, dy: dy, source }, o.pos.x, o.pos.y);
          else {
            if (q.owner === 'player' && !q.round) this.stats.nadeSelfDmg += Math.min(dmg, this.player.hp);
            this.damagePlayer({ dmg, dx, dy, source: 'explosion', owner: q.owner }, o.pos.x, o.pos.y);
          }
        }
      }
      // Shrapnel: real bullets, fired outward, that can come back at you.
      const sh = ST.SHRAPNEL[def.shrapnelType];
      if (sh && def.shrapnelCount) {
        for (let i = 0; i < def.shrapnelCount; i++) {
          const a = rand(0, TAU);
          const variance = 1 + rand(-0.5, 0.5) * (sh.variance || 0);
          this.bullets.push(this.makeBullet(x, y, a, sh, q.owner, { range: sh.range * variance, shrapnel: true }));
        }
      }
    }

    // Line of sight: any solid obstacle taller than a bullet between the two points blocks.
    blocked(ax, ay, bx, by) {
      return this.obstacles.some(o => !o.dead && o.def.height >= GC.bullet.height
        && obstacleEntry(o, ax, ay, bx, by));
    }
    distToPlayer(q) { return Math.hypot(q.x - this.player.pos.x, q.y - this.player.pos.y); }

    // Everything a movement pattern or an aim skill is allowed to know about the world.
    // Built once per bot per frame and handed to ST.MOVEMENT / ST.aimSolution, so drills cannot
    // grow their own private variants of either.
    botContext(e, dt) {
      const p = this.player.pos;
      const dx = p.x - e.pos.x, dy = p.y - e.pos.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const tx = dx / d, ty = dy / d;
      return {
        dt, time: this.time, dist: d,
        toPlayer: { x: tx, y: ty }, perp: { x: -ty, y: tx },
        player: p, playerVel: this.player.vel,
        minDist: this.s.minDist, maxDist: this.s.maxDist,
        tempo: this.strafeScale(), aimScale: this.aimScale(), spin: this.spinFrac(),
        bulletSpeed: e.gun.def.speed,
        rand, gauss,
        perceived: (lat) => this.perceived(lat),
        blocked: (ax, ay, bx, by) => this.blocked(ax, ay, bx, by),
        clearAt: (x, y) => this.clearAt(x, y),
        avoid: (pos, vx, vy, range) => this.avoidSteering(pos, vx, vy, range),
        findSpot: (from, wantLos) => this.findSpot(from, wantLos),
      };
    }

    // Steer away from obstacles ahead and from the edge of the playable area.
    avoidSteering(pos, vx, vy, range) {
      let sx = 0, sy = 0;
      for (const r of this.obstacles) {
        if (r.dead || !r.def.collidable) continue;
        const n = normalAt(r, pos.x, pos.y);
        if (n.d > range) continue;
        const rx = -n.nx, ry = -n.ny;                  // toward the obstacle
        if (rx * vx + ry * vy <= 0) continue;          // already moving away from it
        const k = 2.2 * (1 - n.d / range);
        const side = (rx * vy - ry * vx) > 0 ? -1 : 1; // slide around rather than stall
        sx += -ry * side * k; sy += rx * side * k;
      }
      const b = this.bunker && this.bunker.bounds;
      const margin = 6;
      if (b) {
        sx -= Math.max(0, margin - ((b.x + b.hw) - pos.x)) * 0.4;
        sx += Math.max(0, margin - (pos.x - (b.x - b.hw))) * 0.4;
        sy -= Math.max(0, margin - ((b.y + b.hh) - pos.y)) * 0.4;
        sy += Math.max(0, margin - (pos.y - (b.y - b.hh))) * 0.4;
      } else {
        const lim = this.arena - 14;
        sx -= Math.max(0, Math.abs(pos.x) - lim) * Math.sign(pos.x) * 0.25;
        sy -= Math.max(0, Math.abs(pos.y) - lim) * Math.sign(pos.y) * 0.25;
      }
      return { x: sx, y: sy };
    }

    // A place to stand that is clear, in range, and either hidden from the player or exposed to
    // them. Hiding places are looked for on the far side of nearby walls rather than at random,
    // which is the difference between a bot that holds cover and one that wanders into the open.
    // Because it re-solves as you move, walking around the corner just makes it pick another one.
    findSpot(from, wantVisible) {
      const p = this.player.pos;
      const cands = [];
      if (!wantVisible) {
        for (const o of this.obstacles) {
          if (o.dead || !o.def.collidable || o.def.height < GC.bullet.height) continue;
          if (Math.hypot(o.x - from.x, o.y - from.y) > 22) continue;
          // Straight out the back of the wall, plus a little to either side of that line.
          const dx = o.x - p.x, dy = o.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const ux = dx / d, uy = dy / d;
          // How deep the box actually is along the line of sight, not its longest side: a 21-unit
          // wall seen end-on is thin, and using its length would put the hiding spot outside the room.
          const depth = (o.hw ? Math.abs(ux) * o.hw + Math.abs(uy) * o.hh : o.r) + PLAYER_R + 0.8;
          for (const lat of [0, -2.5, 2.5, -5, 5]) {
            cands.push({ x: o.x + ux * depth - uy * lat, y: o.y + uy * depth + ux * lat });
          }
        }
      }
      for (let i = 0; i < 40; i++) {
        const a = rand(0, TAU), r = rand(1, 12);
        cands.push({ x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r });
      }
      // Sidesteps the player could take in the next second or so. A hiding place that only works
      // from exactly where they stand is not cover; the good ones stay blocked as they shuffle.
      const px = p.x - (this.enemies[0] ? this.enemies[0].pos.x : from.x);
      const py = p.y - (this.enemies[0] ? this.enemies[0].pos.y : from.y);
      const pl = Math.hypot(px, py) || 1;
      const sx = -py / pl, sy = px / pl;
      const probes = wantVisible ? [[0, 0]] : [[0, 0], [4, 0], [-4, 0], [8, 0], [-8, 0]];

      let best = null, bestScore = -Infinity;
      for (const cnd of cands) {
        if (!this.clearAt(cnd.x, cnd.y, 0.4)) continue;
        const d = Math.hypot(cnd.x - p.x, cnd.y - p.y);
        if (d < 5) continue;
        if (this.blocked(cnd.x, cnd.y, p.x, p.y) === wantVisible) continue;
        // There is no pathfinding here, so only consider cover it can actually walk straight to.
        // That is also how a player picks cover: the nearest corner you can reach, not the best one.
        if (this.blocked(from.x, from.y, cnd.x, cnd.y)) continue;
        let robust = 0;
        for (const [lat] of probes) {
          if (this.blocked(cnd.x, cnd.y, p.x + sx * lat, p.y + sy * lat) !== wantVisible) robust++;
        }
        const score = robust * 6
                      - Math.abs(d - (this.s.minDist + this.s.maxDist) / 2) * 0.5
                      - Math.hypot(cnd.x - from.x, cnd.y - from.y) * 0.35;
        if (score > bestScore) { bestScore = score; best = cnd; }
      }
      return best;
    }

    updateEnemies(dt) {
      const p = this.player.pos;
      for (const e of this.enemies) {
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.ttl -= dt;
        if (e.ttl <= 0) { e.expired = true; continue; }

        const c = this.botContext(e, dt);
        e.timer -= dt;
        const pattern = ST.MOVEMENT[e.behavior] || ST.MOVEMENT.strafe;
        const want = pattern.update(e, c) || { x: 0, y: 0 };
        let vx = want.x, vy = want.y;

        // A runner that gets too far ahead for too long has escaped.
        if (e.behavior === 'flee') {
          const leash = this.s.maxDist + (this.s.leash || 8);
          if (c.dist > leash) { e.leashT = (e.leashT || 0) + dt; if (e.leashT > 1.2) e.expired = true; }
          else e.leashT = 0;
        }

        const vl = Math.hypot(vx, vy);
        const speed = e.behavior === 'flee' ? MOVE_SPEED * this.fleeSpeed() : MOVE_SPEED;
        if (vl > 0) { vx = vx / vl * speed; vy = vy / vl * speed; }
        e.vel.x = vx; e.vel.y = vy;
        e.pos.x += vx * dt;
        e.pos.y += vy * dt;
        this.clampToBounds(e.pos);
        this.pushOutOfObstacles(e.pos);
        // Keep enemies from overlapping each other.
        for (const o of this.enemies) {
          if (o === e) continue;
          const ox = e.pos.x - o.pos.x, oy = e.pos.y - o.pos.y, od = Math.hypot(ox, oy);
          if (od > 0 && od < 2 * PLAYER_R) { e.pos.x += ox / od * (2 * PLAYER_R - od) * 0.5; e.pos.y += oy / od * (2 * PLAYER_R - od) * 0.5; }
        }

        // Aiming and shooting: one shared solution (js/behaviors.js) for every bot in every drill,
        // which is what makes spinning behave the same way everywhere.
        e.aim = ST.aimSolution(e, c);

        if (this.s.enemyShoots) {
          const inRange = c.dist <= e.gun.def.range * 0.95;
          const los = !this.blocked(e.pos.x, e.pos.y, p.x, p.y);
          // Reaction timer counts down only while the enemy can see you; losing sight resets it.
          if (inRange && los) e.reactT -= dt; else e.reactT = Math.max(e.reactT, 0.15);
          const bursting = ST.aimBurst(e, c);
          const wantFire = e.reactT <= 0 && los && inRange && (bursting || !e.gun.def.auto);
          updateGun(e.gun, dt, wantFire, () => {
            this.fireGun(e, e.gun.def, e.aim, vl > 0, 'enemy', { toMouseLen: c.dist });   // a bot's "cursor" is on you
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

    // One bullet, with everything survev's bullet needs to resolve damage later.
    makeBullet(x, y, angle, def, owner, opts) {
      opts = opts || {};
      // bullet.ts: every bullet's range is jittered by +-1 unit in 16 steps so spray patterns are not
      // perfectly repeatable. Shotgun pellets opt out (noDistAdj) because they already jitter.
      const distAdj = def.noDistAdj ? 0 : remap(randInt(0, 16), 0, 16, -1, 1);
      const reflectCount = opts.reflectCount || 0;
      // bullet.ts clamps a clipped round's distance at 0, so a slug fired at your feet bursts at the muzzle.
      const range = Math.max(opts.clip ? 0 : 1, (opts.range !== undefined ? opts.range : def.range) + distAdj);
      return {
        x, y, sx: x, sy: y, dx: Math.cos(angle), dy: Math.sin(angle),
        speed: def.speed * (opts.speedMult || 1), dmg: def.dmg * (opts.dmgMult || 1), range, traveled: 0, owner, ammo: def.ammo,
        moving: !!opts.moving, spin: !!opts.spin,
        falloff: def.falloff, headshotMult: def.headshotMult || 1,
        obstacleDamage: def.obstacleDamage === undefined ? 1 : def.obstacleDamage,
        tracerWidth: def.tracerWidth, tracerLength: def.tracerLength, whizzed: false,
        reflectCount, reflectObjId: opts.reflectObjId || 0, reflected: false,
        shrapnel: !!opts.shrapnel,
        // bullet.ts: a bullet that has bounced, or shrapnel, can hurt the person who fired it.
        damageSelf: reflectCount > 0 || !!opts.shrapnel,
        def,
      };
    }

    fireGun(shooter, def, aim, moving, owner, opts) {
      opts = opts || {};
      // weaponManager.ts: spread = shotSpread (+ moveSpread while moving); deviation = random(-0.5, 0.5) * spread.
      // A gun idle longer than recoilTime fires its first shot dead straight.
      const spread = opts.firstShot ? 0 : def.spread + (moving ? def.moveSpread : 0);
      const n = def.pellets || 1;
      const jitter = def.jitter === undefined ? 0.25 : def.jitter;
      const dx = Math.cos(aim), dy = Math.sin(aim);
      const gx = shooter.pos.x + -dy * def.barrelOffset, gy = shooter.pos.y + dx * def.barrelOffset;
      const dist = owner === 'enemy' ? Math.hypot(shooter.pos.x - this.player.pos.x, shooter.pos.y - this.player.pos.y) : 0;
      const spinning = owner === 'player' && this.spinFrac() > 0.5;
      // weaponManager.ts: a toMouseHit gun (the USAS-12) fires each round only as far as the cursor,
      // less the barrel, so an explosive slug bursts where you aim rather than at full range.
      const clip = def.toMouseHit && opts.toMouseLen !== undefined ? Math.min(def.range, Math.max(opts.toMouseLen - def.barrel, 0)) : undefined;
      // One in the Chamber (weaponManager.ts): the first round of a full magazine and the last one hit
      // harder; the ammo count has already gone down by this shot.
      const g = opts.gun;
      const chambered = def.chambered && g && (g.ammo === 0 || g.ammo === def.mag - 1) ? def.chambered : 1;
      for (let i = 0; i < n; i++) {
        // .45 in the Chamber: each round has empoweredChance to fly straight, faster and harder.
        const emp = def.empowered45 && Math.random() < def.empowered45.empoweredChance ? def.empowered45 : null;
        const a = aim + (emp ? 0 : rand(-0.5, 0.5) * spread * DEG);
        let sx = gx + dx * def.barrel, sy = gy + dy * def.barrel;
        if (i > 0) { sx += rand(-jitter, jitter) * 1.11; sy += rand(-jitter, jitter) * 1.11; }
        const shot = { moving, spin: spinning, range: clip, clip: clip !== undefined,
          dmgMult: chambered * (emp ? emp.empoweredDamageMult : 1), speedMult: emp ? emp.empoweredSpeedMult : 1 };
        this.bullets.push(this.makeBullet(sx, sy, a, def, owner, shot));
        // Splinter: two more rounds either side of this one, deviated by 0.2-0.25 of the shot's spread
        // (at least 1 degree), each at splitsDamageMult of its damage.
        if (def.splinter) {
          const splinterSpread = Math.max(spread, 1);
          for (let j = 0; j < 2; j++) {
            const dev = rand(0.2, 0.25) * splinterSpread * (j % 2 === 0 ? -1 : 1);
            this.bullets.push(this.makeBullet(sx, sy, a + dev * DEG, def, owner, { ...shot, dmgMult: shot.dmgMult * def.splinter, splinter: true }));
          }
        }
        if (owner === 'player') {
          this.stats.pellets++; this.adaptWindow.pellets++;
          if (moving) this.stats.movingPellets++;
          if (spinning) this.stats.spinPellets++;
        }
      }
      if (owner === 'player' && moving) this.stats.movingShots++;
      if (def.caseTiming === 'shoot') this.spawnCasing(shooter, def, dx, dy);
      ST.audio.shot(def, { dist, fallOff: def.sound.fallOff });
    }

    // survev bullet.ts, in order: halve per bounce, then the linear range falloff.
    // The headshot roll is applied per victim, so it lives in the damage functions.
    bulletDamage(b) {
      let dmg = b.dmg / (b.reflectCount + 1);
      if (GC.bullet.falloff && b.falloff !== undefined) {
        dmg *= remap(clamp(b.traveled / b.range, 0, 1), 0, 1, 1, b.falloff);
      }
      return dmg;
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
      const spawned = [];
      for (const b of this.bullets) {
        const step = b.speed * dt;
        const nx = b.x + b.dx * step, ny = b.y + b.dy * step;
        let hitT = 1, hitKind = null, hitObj = null, hx = nx, hy = ny;

        let hitNormal = null;
        for (const r of this.obstacles) {
          if (r.dead || r.def.height < GC.bullet.height) continue;
          if (r.id === b.reflectObjId) continue;      // never bounce twice off the same object
          const s = obstacleEntry(r, b.x, b.y, nx, ny);
          if (s && s.t < hitT) { hitT = s.t; hitKind = 'obstacle'; hitObj = r; hx = s.px; hy = s.py; hitNormal = s; }
        }
        if (b.owner === 'player' || b.damageSelf) {
          for (const e of this.enemies) {
            if (e.hp <= 0) continue;
            const s = segPointDist2(b.x, b.y, nx, ny, e.pos.x, e.pos.y);
            if (s.d2 < PLAYER_R * PLAYER_R && s.t < hitT) { hitT = s.t; hitKind = 'enemy'; hitObj = e; hx = s.cx; hy = s.cy; }
          }
        }
        if (b.owner === 'enemy' || b.damageSelf) {
          const s = segPointDist2(b.x, b.y, nx, ny, p.pos.x, p.pos.y);
          if (s.d2 < p.radius * p.radius && s.t < hitT) { hitT = s.t; hitKind = 'player'; hitObj = null; hx = s.cx; hy = s.cy; }
        }
        // Windwalk (bullet.ts): an enemy round within maxTriggerDistance of you gives you haste,
        // unless Windwalk's haste is already running.
        if (b.owner === 'enemy' && this.perks.has('windwalk') && p.hasteType !== 'windwalk'
          && Math.hypot(nx - p.pos.x, ny - p.pos.y) <= perkProps('windwalk').maxTriggerDistance) {
          p.hasteType = 'windwalk'; p.hasteT = perkProps('windwalk').hasteDuration;
        }

        if (b.owner === 'enemy' && !b.whizzed) {
          const s = segPointDist2(b.x, b.y, nx, ny, p.pos.x, p.pos.y);
          if (s.d2 < 9 && s.d2 > p.radius * p.radius) { b.whizzed = true; ST.audio.whiz({ volume: 0.7 }); }
        }
        if (hitKind) {
          b.traveled += step * hitT;
          b.x = hx; b.y = hy;
          if (hitKind === 'enemy') { b.dead = true; this.damageEnemy(hitObj, b, hx, hy); }
          else if (hitKind === 'player') {
            b.dead = true;
            this.damagePlayer(b, hx, hy);
            // Steelskin (bullet.ts): the round hurts you and also glances off, like a pan.
            if (this.perks.has('steelskin') && !b.def.roundsBlast && !b.reflected && b.reflectCount < GC.bullet.maxReflect) {
              // The normal is at the point the round enters your circle, not the closest point
              // of its path, which is your center when the round flies straight at you.
              const ox = p.pos.x - b.x, oy = p.pos.y - b.y;
              const along = ox * b.dx + oy * b.dy, perp2 = ox * ox + oy * oy - along * along;
              const enter = along - Math.sqrt(Math.max(0, p.radius * p.radius - perp2));
              const ex = b.x + b.dx * enter, ey = b.y + b.dy * enter;
              const ux = (ex - p.pos.x) / p.radius, uy = (ey - p.pos.y) / p.radius;
              hx = ex; hy = ey;
              const dot = b.dx * ux + b.dy * uy;
              // client bullet.ts: a round off Ironskin clangs like a pan and throws metal chips.
              ST.audio.play('pan_bullet_hit_01', { volume: 0.6 });
              this.spawnPuff(hx, hy, 'rgba(255,225,150,0.9)', 3);
              if (dot < 0) {
                b.reflected = true;
                spawned.push(this.makeBullet(hx + ux * 0.1, hy + uy * 0.1, Math.atan2(b.dy - 2 * dot * uy, b.dx - 2 * dot * ux), b.def, b.owner, {
                  reflectCount: b.reflectCount + 1, range: b.range, shrapnel: b.shrapnel,
                }));
              }
            }
          }
          else {
            b.dead = true;
            const ric = this.hitObstacle(hitObj, b, hx, hy, hitNormal);
            if (ric) spawned.push(ric);
          }
          continue;
        }
        b.x = nx; b.y = ny;
        b.traveled += step;
        if (b.traveled >= b.range) b.dead = true;
      }
      // bullet.ts: a round with an onHit effect (the USAS-12's) explodes where it stops, hit or not,
      // unless it bounced off metal; 0.1 units back along its path, so never inside an obstacle.
      for (const b of this.bullets.slice()) {
        if (!b.dead || b.reflected || !b.def.onHit) continue;
        if (b.def.roundsBlast && b.traveled >= b.range) continue;   // explosive rounds peter out
        const x = ST.EXPLOSIONS[b.def.onHit];
        if (!x) continue;
        this.explode({ x: b.x - b.dx * 0.1, y: b.y - b.dy * 0.1, owner: b.owner, round: true, effect: x.explosionEffectType,
          def: { dmg: x.damage, radMin: x.rad.min, radMax: x.rad.max, shrapnelCount: x.shrapnelCount, shrapnelType: x.shrapnelType } });
      }
      this.bullets = this.bullets.filter(b => !b.dead);
      for (const b of spawned) this.bullets.push(b);
    }

    // Bullet meets stone or barrel. Barrels are metal: survev flags them reflectBullets, so the round
    // comes off the curved shell at the mirror angle with half the damage, and can find you again.
    hitObstacle(o, b, hx, hy, normal) {
      const p = this.player.pos;
      const dmg = this.bulletDamage(b) * b.obstacleDamage * (o.def.obstacleDamageMult || 1);
      o.hitFlash = 0.08;
      if (o.def.destructible) {
        o.hp -= dmg;
        if (o.hp <= 0 && !o.dead) this.destroyObstacle(o);
      }
      const snd = o.reflect ? (Math.random() < 0.5 ? 'metal_bullet_hit_01' : 'metal_bullet_hit_02') : 'stone_bullet_hit_01';
      ST.audio.play(snd, { dist: Math.hypot(hx - p.x, hy - p.y), volume: 0.6 });
      this.spawnPuff(hx, hy, o.reflect ? 'rgba(255,225,150,0.9)' : 'rgba(200,200,200,0.8)', 3);
      if (!o.reflect || o.dead) return null;
      if (b.def.roundsBlast) return null;   // bullet.ts: explosive rounds never bounce
      if (b.reflected || b.reflectCount >= GC.bullet.maxReflect) return null;
      b.reflected = true;
      // Mirror the direction about the surface normal. On a barrel that is the radius through the
      // impact point, so a bounce can only come back into your own half of the field; on a flat metal
      // wall it is the face normal, which is what lets a shot turn a corner in a bunker.
      const n = normal || normalAt(o, hx, hy);
      const ux = n.nx, uy = n.ny;
      const dot = b.dx * ux + b.dy * uy;
      if (dot >= 0) return null;   // already leaving the surface
      const rx = b.dx - 2 * dot * ux, ry = b.dy - 2 * dot * uy;
      const ang = Math.atan2(ry, rx);
      const nb = this.makeBullet(hx + ux * 0.05, hy + uy * 0.05, ang, b.def, b.owner, {
        reflectCount: b.reflectCount + 1, reflectObjId: o.id, range: b.range,
        shrapnel: b.shrapnel, moving: b.moving, spin: b.spin,
      });
      if (b.owner === 'player') this.stats.ricochetPellets++;
      return nb;
    }

    destroyObstacle(o) {
      o.dead = true;
      o.hp = 0;
      if (o.def.explosion) {
        this.stats.barrelsPopped++;
        ST.audio.play(o.def.sound.explode, { dist: Math.hypot(o.x - this.player.pos.x, o.y - this.player.pos.y), volume: 0.9 });
        const x = ST.EXPLOSIONS[o.def.explosion];
        this.explode({
          x: o.x, y: o.y, owner: 'world',
          def: {
            dmg: x.damage, radMin: x.rad.min, radMax: x.rad.max,
            shrapnelCount: x.shrapnelCount, shrapnelType: x.shrapnelType,
          },
        });
      }
    }

    // survev server player.ts: every bullet hit rolls a 15% headshot, which multiplies the damage by
    // the gun's headshotMult. Explosions never headshot.
    rollDamage(b) {
      const blast = b.source === 'explosion' || b.source === 'round';
      let dmg = blast ? b.dmg : this.bulletDamage(b);
      let head = false;
      if (!blast && b.headshotMult > 1 && Math.random() < GC.player.headshotChance) {
        dmg *= b.headshotMult;
        head = true;
      }
      return { dmg, head };
    }

    damageEnemy(e, b, hx, hy) {
      const st = this.stats;
      const roll = this.rollDamage(b);
      const amount = roll.dmg;
      if (b.source === 'round' || b.owner === 'enemy') {
        // An explosive round's blast, or a bot's round glancing off a wall or your Steelskin:
        // damage dealt, but not one of your hits.
      } else if (b.source !== 'explosion') {
        st.hits++;
        this.adaptWindow.hits++;
        if (b.moving) st.movingHits++;
        if (b.spin) st.spinHits++;
        if (roll.head) st.headshots++;
        if (b.reflectCount) { st.ricochetHits++; st.ricochetDmg += Math.min(amount, e.hp); }
      } else {
        st.nadeHits++;
        st.nadeDmg += Math.min(amount, e.hp);
      }
      const dmg = Math.min(amount, e.hp);
      st.dmgDealt += isFinite(dmg) ? dmg : amount;
      e.hp -= amount;
      e.hitFlash = 0.08;
      this.hitFlash = 0.12;
      this.spawnBlood(hx, hy, b.dx, b.dy, 1, e);
      if (e.firstHitT === null) {
        e.firstHitT = this.time;
        st.reaction.push(this.time - e.spawnT);
        this.recordAcquisition(e);
      }
      if (e.hp <= 0) {
        // Takedown (player.ts): a kill gives you health and a burst of haste. A bot's own round
        // reflected off you is the bot's kill, not yours.
        if (this.perks.has('takedown') && b.owner !== 'enemy') {
          this.player.hp = Math.min(PLAYER_MAX_HP, this.player.hp + perkProps('takedown').hpReward);
          this.player.hasteType = 'takedown'; this.player.hasteT = perkProps('takedown').hasteDuration;
        }
        st.kills++;
        if (b.source === 'explosion') st.nadeKills++;
        if (e.rec) e.rec.killed = true;
        this.lastAcqT = this.time;
        this.bumpDiff(0.03);
        const ttk = this.time - e.spawnT;
        st.ttk.push(ttk);
        st.engage.push(this.time - e.firstHitT);
        this.pushFeed(`Kill  ${ST.fmt.sec(ttk)}`, '#9cff9c');
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
      const roll = this.rollDamage(b);
      // player.ts damage: Flak Jacket, then Steelskin, each take their share off what is left.
      // Blasts and shrapnel count as explosions.
      const isExplosion = b.source === 'explosion' || b.source === 'round' || !!b.shrapnel;
      let taken = roll.dmg;
      if (this.perks.has('flak_jacket')) taken -= taken * (isExplosion ? perkProps('flak_jacket').explosionDamageReduction : perkProps('flak_jacket').damageReduction);
      if (this.perks.has('steelskin')) taken -= taken * perkProps('steelskin').damageReduction;
      roll.dmg = taken;
      const dmg = Math.min(roll.dmg, p.hp);
      p.hp -= roll.dmg;
      this.stats.dmgTaken += dmg;
      this.stats.hitsTaken++;
      this.adaptWindow.taken++;
      if (!p.moving) { this.stats.dmgTakenStill += dmg; this.stats.hitsTakenStill++; }
      if (this.spinFrac() > 0.5) this.stats.dmgTakenSpinning += dmg;
      if (b.reflectCount && b.owner === 'player') this.stats.ricochetSelfDmg += dmg;
      this.dmgFlash = 0.25;
      this.spawnBlood(hx, hy, b.dx, b.dy, 1, p);
      ST.audio.hurt();
      if (p.hp <= 0) {
        this.stats.deaths++;
        this.deathFlash = 0.6;
        this.pushFeed('You died', '#ff8080');
        p.hp = PLAYER_MAX_HP;
        for (let i = 0; i < p.weapons.length; i++) {
          const w = p.weapons[i];
          if (!w) continue;
          p.weapons[i] = w.throwable ? makeThrowable(w.def, this.s.throwableCount) : makeGun(w.def);
        }
        p.curIdx = 0;
        this.projectiles = [];
        this.bullets = this.bullets.filter(x => x.owner === 'player' && !x.damageSelf);
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

    // Inside a bunker the walkable world is the building's own footprint, not the grass field.
    clampToBounds(pos, r = PLAYER_R) {
      const b = this.bunker && this.bunker.bounds;
      if (b) {
        pos.x = clamp(pos.x, b.x - b.hw + r, b.x + b.hw - r);
        pos.y = clamp(pos.y, b.y - b.hh + r, b.y + b.hh - r);
        return;
      }
      pos.x = clamp(pos.x, -this.arena + r, this.arena - r);
      pos.y = clamp(pos.y, -this.arena + r, this.arena - r);
    }

    liveObstacles() { return this.obstacles.filter(o => !o.dead); }
    pushOutOfObstacles(pos, radius = PLAYER_R) {
      for (const r of this.obstacles) {
        if (r.dead || !r.def.collidable) continue;
        pushOut(pos, r, radius);
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
    // particles.ts frag burst: a few sprite puffs thrown outward from the blast.
    spawnFragBurst(x, y, scale = 1) {
      const S = ST.SURVEV.fragBurst;
      for (let i = 0; i < 10; i++) {
        const a = rand(0, TAU), sp = rand(4, 14), life = rand(0.35, 0.7);
        this.particles.push({
          kind: 'burst', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life,
          drag: rand(3, 5), rot: rand(0, TAU), rotVel: rand(-4, 4),
          scaleStart: 0.06 * scale, scaleEnd: rand(0.18, 0.3) * scale,
          sprite: S.sprites[Math.floor(Math.random() * S.sprites.length)], color: '#ffd9a0', r: 0.3,
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
      for (const x of this.explosions) x.life -= dt;
      this.explosions = this.explosions.filter(x => x.life > 0);
      for (const o of this.obstacles) o.hitFlash = Math.max(0, o.hitFlash - dt);
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
      const AR = this.arena;
      const inside = !!this.bunker;
      // Underground: there is no grass to see, so the whole view is the building and the dark
      // around it rather than a structure sitting on a field.
      ctx.fillStyle = inside ? '#26241f' : A.hex(SV.grass);
      ctx.fillRect(-AR, -AR, AR * 2, AR * 2);
      const left = p.pos.x - this.halfW, right = p.pos.x + this.halfW;
      const top = p.pos.y - this.halfH, bottom = p.pos.y + this.halfH;
      if (inside) { ctx.fillStyle = '#26241f'; ctx.fillRect(left - 2, top - 2, (right - left) + 4, (bottom - top) + 4); }
      ctx.strokeStyle = `rgba(0,0,0,${SV.gridAlpha})`;
      ctx.lineWidth = Math.max(1.5 / this.ppu, 0.03);
      if (!inside) {
        ctx.beginPath();
        const G = SV.gridSize;
        for (let x = Math.floor(Math.max(left, -AR) / G) * G; x <= Math.min(right, AR); x += G) { ctx.moveTo(x, Math.max(top, -AR)); ctx.lineTo(x, Math.min(bottom, AR)); }
        for (let y = Math.floor(Math.max(top, -AR) / G) * G; y <= Math.min(bottom, AR); y += G) { ctx.moveTo(Math.max(left, -AR), y); ctx.lineTo(Math.min(right, AR), y); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 0.4 / this.ppu * 16;
        ctx.strokeRect(-AR, -AR, AR * 2, AR * 2);
      }

      // A bunker replaces the grass with its own concrete floor.
      if (inside) {
        const b = this.bunker.bounds, m = 3;
        ctx.fillStyle = '#3a3630';
        ctx.fillRect(b.x - b.hw - m, b.y - b.hh - m, (b.hw + m) * 2, (b.hh + m) * 2);
        ctx.fillStyle = '#4b4640';
        ctx.fillRect(b.x - b.hw, b.y - b.hh, b.hw * 2, b.hh * 2);
      }

      // Obstacles: each survev sprite is 144 px drawn at its own img.scale on a 16 px/unit world,
      // then stretched by how much the instance's collider was scaled up.
      for (const r of this.obstacles) {
        if (r.dead) continue;
        if (r.x + r.r * 1.6 < left || r.x - r.r * 1.6 > right || r.y + r.r * 1.6 < top || r.y - r.r * 1.6 > bottom) continue;
        if (r.shape === 'rect') { this.drawWall(ctx, r); continue; }
        const img = A.get(r.def.img && r.def.img.sprite);
        if (img) {
          const size = this.spriteSize(img, r.def.img.scale) * r.scale;
          if (r.hitFlash > 0) ctx.globalAlpha = 0.75;
          ctx.drawImage(img, r.x - size / 2, r.y - size / 2, size, size);
          ctx.globalAlpha = 1;
        } else {
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU);
          ctx.fillStyle = r.reflect ? '#9a5b2e' : '#7d7d7d'; ctx.fill();
          ctx.lineWidth = 0.25; ctx.strokeStyle = '#4c4c4c'; ctx.stroke();
        }
        // Damaged props get a health ring so you can see what is about to go off.
        if (r.def.destructible && r.hp < r.maxHp) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.r + 0.3, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(r.hp / r.maxHp, 0, 1));
          ctx.strokeStyle = 'rgba(255,120,80,0.75)'; ctx.lineWidth = 0.14; ctx.stroke();
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

      // Grenades in flight: survev draws the projectile scaled up with its height off the ground,
      // with a shadow left behind on the grass.
      const nadeImg = A.get('proj-frag-nopin-nolever-01.img');
      for (const q of this.projectiles) {
        const lift = 1 + q.z / GC.projectile.maxHeight;
        const size = this.spriteSize(nadeImg, q.def.worldImg.scale) * lift;
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, 0.34, 0.24, 0, 0, TAU);
        ctx.fillStyle = '#000'; ctx.fill();
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(q.x, q.y - q.z * 0.35);
        ctx.rotate(q.rot);
        if (nadeImg) ctx.drawImage(nadeImg, -size / 2, -size / 2, size, size);
        else { ctx.beginPath(); ctx.arc(0, 0, 0.35, 0, TAU); ctx.fillStyle = '#3f6b2f'; ctx.fill(); }
        ctx.restore();
        // The fuse ring: the last second before it goes off reads at a glance.
        if (q.fuse < 1.2) {
          ctx.beginPath();
          ctx.arc(q.x, q.y - q.z * 0.35, 0.75, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(q.fuse / 1.2, 0, 1));
          ctx.strokeStyle = 'rgba(255,90,60,0.9)'; ctx.lineWidth = 0.16; ctx.stroke();
        }
      }
      // Blast radius, drawn for the half second after the bang so you can see what you actually covered.
      for (const x of this.explosions) {
        const u = 1 - clamp(x.life / x.maxLife, 0, 1);
        ctx.globalAlpha = (1 - u) * 0.45;
        ctx.beginPath(); ctx.arc(x.x, x.y, x.radMax * (0.35 + u * 0.65), 0, TAU);
        ctx.fillStyle = '#ffb14a'; ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Enemies, then the player on top.
      for (const e of this.enemies) {
        this.drawCharacter(e.pos.x, e.pos.y, e.aim, e.gun, e.hitFlash > 0 ? 0xffd9c2 : SV.skinTint);
        const bw = 2.6, bh = 0.32, bx = e.pos.x - bw / 2, by = e.pos.y - PLAYER_R - 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx - 0.06, by - 0.06, bw + 0.12, bh + 0.12);
        const frac = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = frac > 0.5 ? '#61d15b' : frac > 0.25 ? '#f2c94c' : '#e0473d';
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

      this.drawCharacter(p.pos.x, p.pos.y, p.aim, p.gun, SV.skinTint, p.scale, this.perks);
      if (p.gun && p.gun.throwable && p.gun.cooking) {
        // Cooking: the ring counts the fuse down on your own body.
        const left2 = clamp(1 - p.gun.cookT / p.gun.def.fuseTime, 0, 1);
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius + 0.5, -Math.PI / 2, -Math.PI / 2 + TAU * left2);
        ctx.strokeStyle = left2 < 0.35 ? 'rgba(255,90,60,0.95)' : 'rgba(255,211,92,0.9)';
        ctx.lineWidth = 0.18; ctx.stroke();
      }
      if (p.gun && !p.gun.throwable && p.gun.reloading) {
        const frac = 1 - p.gun.reloadT / p.gun.def.reload;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius + 0.5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1));
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

    // Walls and crates are boxes. survev draws bunker interiors with one big floor-and-wall image per
    // building rather than a sprite per wall, so these are painted from the material instead: metal
    // reads cool and bright with a highlight, because metal is the only thing in here that bounces a
    // bullet and you need to pick it out at a glance.
    drawWall(ctx, o) {
      const x = o.x - o.hw, y = o.y - o.hh, w = o.hw * 2, h = o.hh * 2;
      const mat = o.material || (o.reflect ? 'metal' : 'concrete');
      const fill = mat === 'metal' ? '#8d99a6' : mat === 'wood' ? '#8a6234' : '#6f6a62';
      const edge = mat === 'metal' ? '#d8e4ee' : mat === 'wood' ? '#5c3f20' : '#514d47';
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
      if (o.hitFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, w, h); }
      ctx.strokeStyle = edge;
      ctx.lineWidth = mat === 'metal' ? 0.22 : 0.14;
      ctx.strokeRect(x + 0.07, y + 0.07, w - 0.14, h - 0.14);
      if (o.def.destructible && o.hp < o.maxHp) {
        ctx.fillStyle = 'rgba(255,120,80,0.6)';
        ctx.fillRect(x, o.y + o.hh - 0.22, w * clamp(o.hp / o.maxHp, 0, 1), 0.22);
      }
    }

    // World size of a survev sprite: its own pixel size at the client's scale, at 16 px per unit.
    spriteSize(img, scale) {
      return (img ? (img.naturalWidth || img.width) : 144) * scale / ST.SURVEV.ppuBase;
    }

    drawParticle(ctx, q) {
      const A = ST.assets, u = 1 - clamp(q.life / q.maxLife, 0, 1);
      if (q.kind === 'splat') {
        // scale lerps 0..1 over life; alpha fades over the last quarter (lerp 0.75..1).
        const scale = lerp(q.scaleStart, q.scaleEnd, u);
        const size = this.spriteSize(A.get(q.sprite), scale);
        const alpha = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
        const img = A.tint(q.sprite, q.color);
        ctx.globalAlpha = alpha;
        if (img) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.drawImage(img, -size / 2, -size / 2, size, size); ctx.restore(); }
        else { ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, size / 2, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        return;
      }
      if (q.kind === 'burst') {
        const scale = lerp(q.scaleStart, q.scaleEnd, u);
        const img = A.tint(q.sprite, q.color);
        const size = this.spriteSize(A.get(q.sprite), scale);
        ctx.globalAlpha = 1 - u;
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
    drawCharacter(x, y, aim, gun, skinTint, scale = 1, perks = null) {
      const ctx = this.ctx, A = ST.assets, SV = ST.SURVEV, U = SV.ppuBase;
      const def = gun.def;
      const throwing = !!gun.throwable;
      const body = A.tint('player-base-01.img', A.hex(skinTint));
      const hand = A.tint('player-hands-01.img', A.hex(skinTint));
      const gunImg = !throwing && def.worldImg && A.get(def.worldImg.sprite);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(aim);
      if (scale !== 1) ctx.scale(scale, scale);   // perks' size: survev draws the bigger collider bigger
      const pose = throwing ? SV.throwablePose : def.pistol ? SV.poses.pistol : def.bullpup ? SV.poses.bullpup : SV.poses.rifle;
      // player.ts applies gun recoil to the right hand only; the gun rides along because it hangs off it.
      const recoil = (gun.recoil || 0) * 1.125;
      const handR = { x: (pose.handR[0] - recoil) / U, y: pose.handR[1] / U };
      const lho = !throwing && def.worldImg && def.worldImg.leftHandOffset ? def.worldImg.leftHandOffset : { x: 0, y: 0 };
      const handL = { x: (pose.handL[0] + lho.x) / U, y: (pose.handL[1] + lho.y) / U };
      const bodySize = 140 * SV.bodySpriteScale / U;
      const handSize = 76 * SV.handSpriteScale / U;

      // Backpack (level 1, as most players carry one): a dark circle offset behind the body, player.ts "Backpack".
      const bag = A.tint('player-circle-base-01.img', A.hex(SV.backpackTint));
      if (bag) {
        const lvl = SV.backpack.level;
        const bagScale = (0.4 + lvl * 0.03) * 0.5;
        const bagSize = this.spriteSize(A.get('player-circle-base-01.img'), bagScale);
        const bagOffset = SV.backpack.offsets[Math.min(lvl - 1, 2)] / U;
        ctx.drawImage(bag, -bagOffset - bagSize / 2, -bagSize / 2, bagSize, bagSize);
      }
      // Body.
      if (body) ctx.drawImage(body, -bodySize / 2, -bodySize / 2, bodySize, bodySize);
      else { ctx.beginPath(); ctx.arc(0, 0, PLAYER_R, 0, TAU); ctx.fillStyle = A.hex(skinTint); ctx.fill(); }
      // What player.ts puts on the body for two perks: Flak Jacket a dark red vest at 70%, Cast
      // Ironskin a black frying pan, each sprite centred on its anchor.
      const wear = (sprite, spriteScale, ax, ay, tint, alpha) => {
        const raw = A.get(sprite);
        const img = tint === undefined ? raw : A.tint(sprite, A.hex(tint));
        if (!raw || !img) return;
        const w = (raw.naturalWidth || raw.width) * spriteScale / U, h = (raw.naturalHeight || raw.height) * spriteScale / U;
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, -ax * w, -ay * h, w, h);
        ctx.globalAlpha = 1;
      };
      if (perks && perks.has('flak_jacket')) wear('player-armor-base-01.img', 0.215, 0.5, 0.5, 0x380606, 0.7);
      if (perks && perks.has('steelskin')) wear('loot-melee-pan-black.img', 0.4, 0.575, 0.5, undefined, 1);

      // Gun, drawn from its stock at the right hand toward the muzzle.
      // Most guns share a generic silhouette (gun-short/med/long) and are told apart only by
      // worldImg.tint, which the client applies as a PIXI tint: without it an AK, an Mk 12, an M39
      // and an M870 are the same white shape. Guns with their own artwork carry tint 0xffffff, so
      // tinting them is a no-op and the same code path covers both.
      const drawGun = () => {
        if (throwing) {
          // The grenade sits in the throwing hand, at handImg's own pivot and scale.
          const hi = def.handImg;
          const img = A.get(gun.cooking ? 'proj-frag-nopin-nolever-01.img' : 'proj-frag-pin-01.img') || A.get('proj-frag-pin-01.img');
          if (!img) return;
          const size = this.spriteSize(img, hi.scale);
          ctx.save();
          ctx.translate(hi.pos.x / U, hi.pos.y / U);
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
          ctx.restore();
          return;
        }
        if (!def.worldImg) return;
        const wi = def.worldImg;
        const go = wi.gunOffset || { x: 0, y: 0 };
        const ax = handR.x + (SV.gunHandOffset[0] + go.x) / U, ay = handR.y + (SV.gunHandOffset[1] + go.y) / U;
        if (gunImg) {
          const tinted = A.tint(wi.sprite, A.hex(wi.tint === undefined ? 0xffffff : wi.tint)) || gunImg;
          const gw = (gunImg.naturalWidth || gunImg.width) * wi.scale.x * 0.5 / U;
          const gl = (gunImg.naturalHeight || gunImg.height) * wi.scale.y * 0.5 / U;
          // The magazine is a separate sprite at its own pivot, drawn under or over the barrel
          // depending on magImg.top. The DP-28's pan sits on top of the gun.
          const mag = wi.magImg && A.get(wi.magImg.sprite);
          const drawMag = () => {
            if (!mag) return;
            const ms = this.spriteSize(mag, 0.25);
            ctx.drawImage(mag, wi.magImg.pos.x / U - ms / 2, wi.magImg.pos.y / U - ms / 2, ms, ms);
          };
          ctx.save(); ctx.translate(ax, ay); ctx.rotate(Math.PI / 2);
          if (mag && !wi.magImg.top) drawMag();
          ctx.drawImage(tinted, -gw / 2, -gl, gw, gl);
          if (mag && wi.magImg.top) drawMag();
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
      if (!throwing && def.worldImg && def.worldImg.handsBelow) { drawHands(); drawGun(); } else { drawGun(); drawHands(); }
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

  // Sample a point inside a room rect; used by the headless tests.
  ST.__r = (rm) => ({ x: rand(rm.x - rm.hw, rm.x + rm.hw), y: rand(rm.y - rm.hh, rm.y + rm.hh) });
  ST.Game = Game;
  ST.ARENA = ARENA;
  ST.arenaFor = arenaFor;
})();
