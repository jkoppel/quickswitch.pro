// Weapon, ammo, scope and enemy-skill definitions.
// Gun and bullet numbers come straight from survev's gunDefs/bulletDefs (vendor/survev/defs, GPL-3.0);
// this file only selects the trainer's weapon list and reshapes fields for the simulation.
// Units: world units (player radius = 1), seconds, degrees. Player speed is GameConfig.player.moveSpeed = 12.
window.ST = window.ST || {};

(function () {
  const G = window.SURVEV_GUN_DEFS || {};
  const B = window.SURVEV_BULLET_DEFS || {};

  // GameConfig.tracerColors (regular tint per ammo type) from survev shared/gameConfig.ts.
  ST.TRACER = {
    '9mm': { color: '#fee2c6', label: '9mm' },
    '762mm': { color: '#c5d6fe', label: '7.62mm' },
    '556mm': { color: '#a9ff92', label: '5.56mm' },
    '12gauge': { color: '#fedcdc', label: '12 gauge' },
    '50AE': { color: '#fff088', label: '.50 AE' },
    '308sub': { color: '#252b00', label: '.308 Subsonic' },
    '45acp': { color: '#ecbeff', label: '.45 ACP' },
  };
  ST.AMMO = ST.TRACER;

  // The trainer's weapon list, in survev's own ids. AWM-S is "awc" in survev.
  const LIST = ['m9', 'mp5', 'vector', 'ak47', 'm4a1', 'scar', 'dp28', 'mk12', 'm39', 'm870', 'spas12', 'mosin', 'sv98', 'awc'];

  function build(id) {
    const g = G[id];
    const b = g && B[g.bulletType];
    if (!g || !b) return null;
    return {
      id,
      name: g.name,
      ammo: b.tracerColor,
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
    };
  }

  ST.WEAPONS = {};
  for (const id of LIST) {
    const w = build(id);
    if (w) ST.WEAPONS[id === 'awc' ? 'awm' : id] = w;
  }
  // Legacy key used by drills/scenarios.
  if (ST.WEAPONS.awm) ST.WEAPONS.awm.id = 'awc';

  // Scope name -> half of the visible height in world units. These are survev's per-scope zoom values
  // for desktop (shared/gameConfig.ts scopeZoomRadius.desktop).
  ST.SCOPES = { '1x': 28, '2x': 36, '4x': 48, '8x': 68, '15x': 104 };

  // Enemy aim skill: sigma of aim error in degrees, reaction time after seeing you, whether it leads moving targets.
  ST.AIM_SKILL = {
    easy: { name: 'Easy', sigma: 9, reaction: 0.6, lead: false },
    normal: { name: 'Normal', sigma: 6, reaction: 0.35, lead: false },
    hard: { name: 'Hard', sigma: 4, reaction: 0.2, lead: true },
  };

  ST.BEHAVIORS = {
    static: { name: 'Stationary', desc: 'Does not move.' },
    strafe: { name: 'Strafe', desc: 'Runs side to side, flipping direction unpredictably.' },
    smooth: { name: 'Smooth strafe', desc: 'Predictable side-to-side sweep. Precise tracking.' },
    juke: { name: 'Juke', desc: 'Random direction changes and stops, like a real player dodging.' },
    orbit: { name: 'Orbit', desc: 'Circles you at a constant distance.' },
    rush: { name: 'Rush', desc: 'Charges you and dances at point-blank range.' },
    flee: { name: 'Flee', desc: 'Runs away from you with jukes. You have to chase while shooting.' },
  };

  // Visual constants lifted from the survev client (player.ts, animData.ts, particles.ts, map.ts).
  ST.SURVEV = {
    ppuBase: 16,                       // Camera.m_ppu: PIXI world pixels per unit at zoom 1
    skinTint: 0xf8c574,                // outfitBase baseTint / handTint
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
    bloodSplat: { sprites: ['part-splat-01.img', 'part-splat-02.img', 'part-splat-03.img'], life: 0.5, scaleStart: 0.04, scaleEnd: [0.15, 0.2], color: 0xb70000 },
    casing: { life: [0.5, 0.75], drag: [3, 4], rotVel: Math.PI * 3, scaleStart: 0.0625, scaleEnd: 0.0325 },
  };
})();
