// Weapon, ammo, scope and enemy-skill definitions.
// Gun and bullet numbers come straight from survev's gunDefs/bulletDefs (vendor/survev/defs, GPL-3.0);
// this file only selects the trainer's weapon list and reshapes fields for the simulation.
// Units: world units (player radius = 1), seconds, degrees. Player speed is GameConfig.player.moveSpeed = 12.
window.ST = window.ST || {};

(function () {
  const G = window.SURVEV_GUN_DEFS || {};
  const B = window.SURVEV_BULLET_DEFS || {};
  const T = window.SURVEV_THROWABLE_DEFS || {};
  const X = window.SURVEV_EXPLOSION_DEFS || {};
  const O = window.SURVEV_OBSTACLE_DEFS || {};

  // survev's GameConfig, verbatim (vendor/survev/defs/gameConfig.js).
  ST.GC = window.SURVEV_GAME_CONFIG;

  // GameConfig.tracerColors (regular tint per ammo type) from survev shared/gameConfig.ts.
  ST.TRACER = {
    '9mm': { color: '#fee2c6', label: '9mm' },
    '762mm': { color: '#c5d6fe', label: '7.62mm' },
    '556mm': { color: '#a9ff92', label: '5.56mm' },
    '12gauge': { color: '#fedcdc', label: '12 gauge' },
    '50AE': { color: '#fff088', label: '.50 AE' },
    '308sub': { color: '#252b00', label: '.308 Subsonic' },
    '45acp': { color: '#ecbeff', label: '.45 ACP' },
    // Not ammo types but tracer styles: the USAS-12's explosive slugs and silenced guns' rounds,
    // which survev draws black (tint 0) so they barely show against the grass.
    frag: { color: '#cb0000', label: '12 gauge' },
    invis: { color: '#000000', label: 'silenced' },
  };
  ST.AMMO = ST.TRACER;

  // The trainer's weapon list, in survev's own ids: every gun that drops in a normal match (the guide
  // pages list the same ones). Event variants (potato, winter, flare, cursed) and the dual-wield forms
  // are left out. AWM-S is "awc" in survev.
  const AMMO_OK = new Set(['9mm', '762mm', '556mm', '12gauge', '45acp', '308sub', '50AE']);
  const LIST = Object.keys(G).filter((id) => !G[id].noDrop && !G[id].isDual && AMMO_OK.has(G[id].ammo) && !/_winter$/.test(id));

  function build(id) {
    const g = G[id];
    const b = g && B[g.bulletType];
    if (!g || !b) return null;
    return {
      id,
      name: g.name,
      ammo: b.tracerColor,                 // the tracer style; ammoType is what the gun loads
      ammoType: g.ammo,
      auto: g.fireMode === 'auto',
      burst: g.fireMode === 'burst' ? { count: g.burstCount || 3, delay: g.burstDelay || 0.05 } : null,
      fireDelay: g.fireDelay,
      dmg: b.damage,
      speed: b.speed,
      range: b.distance,
      falloff: b.falloff,
      spread: g.shotSpread,
      moveSpread: g.moveSpread,
      mag: g.maxClip,
      reload: g.reloadTime,
      reloadPerShell: g.maxReload < g.maxClip, // survev reloads maxReload rounds per reloadTime
      reloadCount: g.maxReload,
      barrel: g.barrelLength,
      barrelOffset: g.barrelOffset || 0,
      pellets: g.bulletCount > 1 ? g.bulletCount : undefined,
      pistol: !!g.pistol,
      bullpup: !!g.isBullpup,
      tracerWidth: b.tracerWidth,
      tracerLength: b.tracerLength,
      worldImg: g.worldImg,
      particle: g.particle,
      sound: g.sound,
      caseTiming: g.caseTiming,
      pullDelay: g.pullDelay || 0,
      // Fields the trainer needs for survev's damage and switching rules.
      headshotMult: g.headshotMult || 1,
      switchDelay: g.switchDelay,
      deployGroup: g.deployGroup,          // guns sharing a non-zero group cannot be quick-switched past
      recoilTime: g.recoilTime,            // idle longer than this and the next shot has zero spread
      jitter: g.jitter !== undefined ? g.jitter : 0.25,
      noDistAdj: !!b.noDistAdj,            // shotgun pellets skip the +-1 unit range jitter
      obstacleDamage: b.obstacleDamage !== undefined ? b.obstacleDamage : 1,
      shrapnel: !!b.shrapnel,
      onHit: b.onHit || null,              // explosive rounds (the USAS-12's) blow up where they stop
      fireMode: g.fireMode,
      slot: 'gun',
    };
  }

  ST.WEAPONS = {};
  for (const id of LIST) {
    const w = build(id);
    if (w) ST.WEAPONS[id === 'awc' ? 'awm' : id] = w;
  }
  // Legacy key used by drills/scenarios.
  if (ST.WEAPONS.awm) ST.WEAPONS.awm.id = 'awc';

  // A gun's class, worked out from its survev numbers rather than listed by hand: 12-gauge guns are
  // shotguns, pistols say so, automatics are SMGs on pistol ammo, LMGs with a big belt or drum and
  // assault rifles otherwise, and single-shot guns are snipers if they cycle slowly, DMRs if not.
  ST.WEAPON_CLASSES = ['Pistols', 'SMGs', 'Assault rifles', 'LMGs', 'DMRs', 'Shotguns', 'Snipers'];
  ST.weaponClass = (w) => {
    if (w.ammoType === '12gauge') return 'Shotguns';
    if (w.pistol) return 'Pistols';
    if (w.fireMode === 'auto' || w.fireMode === 'burst') {
      if (w.ammoType === '9mm' || w.ammoType === '45acp') return 'SMGs';
      return w.mag > 45 ? 'LMGs' : 'Assault rifles';
    }
    return w.fireDelay >= 0.5 ? 'Snipers' : 'DMRs';
  };

  // Shrapnel is a bullet like any other; frag grenades and barrels fire it.
  ST.SHRAPNEL = {};
  for (const id of ['shrapnel_frag', 'shrapnel_barrel', 'shrapnel_usas']) {
    const b = B[id];
    if (!b) continue;
    ST.SHRAPNEL[id] = {
      id, name: 'Shrapnel', ammo: b.tracerColor, dmg: b.damage, speed: b.speed, range: b.distance,
      falloff: b.falloff, variance: b.variance || 0, tracerWidth: b.tracerWidth, tracerLength: b.tracerLength,
      obstacleDamage: b.obstacleDamage, shrapnel: true, noDistAdj: true, headshotMult: 1,
    };
  }

  // Throwables, reshaped the same way guns are. survev's throwableDefs/explosionsDefs verbatim.
  ST.EXPLOSIONS = X;
  ST.THROWABLES = {};
  for (const [id, t] of Object.entries(T)) {
    const x = X[t.explosionType] || {};
    ST.THROWABLES[id] = {
      id, name: t.name, slot: 'throwable',
      explosion: t.explosionType, dmg: x.damage, radMin: x.rad.min, radMax: x.rad.max,
      shrapnelCount: x.shrapnelCount, shrapnelType: x.shrapnelType,
      cookable: t.cookable, fuseTime: t.fuseTime, rad: t.rad,
      speed: t.throwPhysics.speed, velZ: t.throwPhysics.velZ, playerVelMult: t.throwPhysics.playerVelMult,
      spinVel: t.throwPhysics.spinVel, worldImg: t.worldImg, handImg: t.handImg, sound: t.sound,
    };
  }

  // Obstacles the trainer places, with survev's colliders, health and reflectBullets flags.
  ST.OBSTACLES = O;

  // Scope name -> half of the visible height in world units. These are survev's per-scope zoom values
  // for desktop (shared/gameConfig.ts scopeZoomRadius.desktop).
  ST.SCOPES = {};
  for (const [k, v] of Object.entries(ST.GC.scopeZoomRadius.desktop)) ST.SCOPES[k.replace('scope', '')] = v;
  ST.SCOPE_ORDER = Object.keys(ST.SCOPES);

  // survev's camera: zoom is set from the larger screen dimension, but a window narrower than 16:9
  // is treated as if it were 16:9 so that a tall window does not zoom the world in.
  // (client/src/game.ts: maxScreenDim = max(minDim * 16/9, maxDim); targetZoom = maxScreenDim*0.5/(zoom*ppu).)
  ST.pixelsPerUnit = function (w, h, zoomRadius) {
    const maxScreenDim = Math.max(Math.min(w, h) * (16 / 9), Math.max(w, h));
    return maxScreenDim / (2 * zoomRadius);
  };

  // On a 16:9 screen the camera fits `zoomRadius` units to the left and right of you but only
  // zoomRadius * 9/16 above and below, so the short axis is what decides whether a target at a given
  // distance can appear in every direction. Everything below is measured against that short axis.
  ST.scopeHalfMin = (scope) => ST.SCOPES[scope] * (9 / 16);
  // The smallest scope that still shows a target `dist` units away in any direction, with a margin
  // so it is not sitting on the screen edge.
  ST.scopeForDistance = function (dist) {
    for (const s of ST.SCOPE_ORDER) if (dist <= ST.scopeHalfMin(s) * 0.85) return s;
    return ST.SCOPE_ORDER[ST.SCOPE_ORDER.length - 1];
  };
  // The furthest a target can spawn under a scope and still be reachable in every direction.
  ST.scopeMaxDist = (scope) => Math.floor(ST.scopeHalfMin(scope) * 0.85);

  // Visual constants lifted from the survev client (player.ts, animData.ts, particles.ts, map.ts).
  ST.SURVEV = {
    ppuBase: 16,                       // Camera.m_ppu: PIXI world pixels per unit at zoom 1
    skinTint: 0xf8c574,                // outfitBase baseTint / handTint
    backpackTint: 0x816537,            // outfitBase backpackTint
    backpack: { level: 1, offsets: [10.25, 11.5, 12.75] }, // player.ts: bag drawn behind the body at (0.4 + level*0.03)*0.5 scale
    grass: 0x80af49,                   // baseDefs biome colors.grass
    gridSize: 16, gridAlpha: 0.15,     // GameConfig.map.gridSize, map.ts grid lineStyle
    bodySpriteScale: 0.25,             // bodySprite.scale
    handSpriteScale: 0.25,             // hands use the same 0.25 (76px sprite -> 19px)
    poses: {                           // IdlePoses pivots, in PIXI pixels at 16 px per unit
      rifle: { handL: [28, 5.25], handR: [14, 1.75] },
      bullpup: { handL: [28, 5.25], handR: [24, 1.75] },
      pistol: { handL: [14, 1.75], handR: [14, 1.75] },
    },
    gunHandOffset: [-4.25, -1.75],     // GunSprites.setType handOffset for single guns
    stone: { sprite: 'map-stone-01.img', scale: 0.4, collision: 1.6 },
    barrel: { sprite: 'map-barrel-01.img', scale: 0.4, collision: 1.75 },
    fragBurst: { sprites: ['part-frag-burst-01.img', 'part-frag-burst-02.img', 'part-frag-burst-03.img'] },
    smokeParticle: { sprites: ['part-smoke-01.img', 'part-smoke-02.img', 'part-smoke-03.img'] },
    throwablePose: { handL: [15.75, -9.625], handR: [15.75, 9.625] },
    bloodSplat: { sprites: ['part-splat-01.img', 'part-splat-02.img', 'part-splat-03.img'], life: 0.5, scaleStart: 0.04, scaleEnd: [0.15, 0.2], color: 0xb70000 },
    casing: { life: [0.5, 0.75], drag: [3, 4], rotVel: Math.PI * 3, scaleStart: 0.0625, scaleEnd: 0.0325 },
  };
})();
