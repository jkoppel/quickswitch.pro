// Weapon, ammo, scope and enemy-skill definitions.
// Numbers approximate surviv.io / survev gun defs (units: world units, seconds, degrees).
// A player has radius 1 world unit and moves at 12 units/s.
window.ST = window.ST || {};

ST.AMMO = {
  '9mm': { color: '#ffe36e', label: '9mm' },
  '762': { color: '#5bb2ff', label: '7.62mm' },
  '556': { color: '#8cff8c', label: '5.56mm' },
  '12g': { color: '#ff6b6b', label: '12 gauge' },
  '308': { color: '#c9a3ff', label: '.308' },
};

ST.WEAPONS = {
  m9:    { name: 'M9',           ammo: '9mm', auto: false, fireDelay: 0.10,  dmg: 12,   speed: 85,  range: 100, spread: 8,   moveSpread: 14,  mag: 15, reload: 1.6,  barrel: 1.4 },
  mp5:   { name: 'MP5',          ammo: '9mm', auto: true,  fireDelay: 0.09,  dmg: 11,   speed: 85,  range: 100, spread: 4,   moveSpread: 6,   mag: 30, reload: 2.6,  barrel: 2.0 },
  vector:{ name: 'Vector',       ammo: '9mm', auto: true,  fireDelay: 0.032, dmg: 7,    speed: 88,  range: 75,  spread: 4,   moveSpread: 7,   mag: 33, reload: 1.6,  barrel: 1.9 },
  ak47:  { name: 'AK-47',        ammo: '762', auto: true,  fireDelay: 0.10,  dmg: 13.5, speed: 100, range: 150, spread: 2,   moveSpread: 7,   mag: 30, reload: 2.8,  barrel: 2.5 },
  m4a1:  { name: 'M4A1-S',       ammo: '556', auto: true,  fireDelay: 0.082, dmg: 14,   speed: 102, range: 175, spread: 1.5, moveSpread: 6.5, mag: 30, reload: 2.3,  barrel: 2.5 },
  scar:  { name: 'SCAR-H',       ammo: '762', auto: true,  fireDelay: 0.09,  dmg: 15,   speed: 108, range: 150, spread: 1,   moveSpread: 7,   mag: 20, reload: 2.7,  barrel: 2.5 },
  dp28:  { name: 'DP-28',        ammo: '762', auto: true,  fireDelay: 0.115, dmg: 14,   speed: 110, range: 150, spread: 1,   moveSpread: 5,   mag: 60, reload: 3.6,  barrel: 2.8 },
  mk12:  { name: 'Mk 12 SPR',    ammo: '556', auto: false, fireDelay: 0.14,  dmg: 22,   speed: 132, range: 175, spread: 1,   moveSpread: 3,   mag: 20, reload: 2.4,  barrel: 2.7 },
  m39:   { name: 'M39 EMR',      ammo: '762', auto: false, fireDelay: 0.14,  dmg: 24,   speed: 130, range: 150, spread: 1,   moveSpread: 3,   mag: 20, reload: 2.4,  barrel: 2.7 },
  m870:  { name: 'M870',         ammo: '12g', auto: false, fireDelay: 0.9,   dmg: 9,    speed: 66,  range: 27,  spread: 10,  moveSpread: 10,  mag: 5,  reload: 0.75, barrel: 2.5, pellets: 5, reloadPerShell: true },
  spas12:{ name: 'SPAS-12',      ammo: '12g', auto: false, fireDelay: 0.75,  dmg: 8.75, speed: 88,  range: 50,  spread: 5,   moveSpread: 5,   mag: 9,  reload: 0.75, barrel: 2.5, pellets: 9, reloadPerShell: true },
  mosin: { name: 'Mosin-Nagant', ammo: '762', auto: false, fireDelay: 1.75,  dmg: 72,   speed: 178, range: 150, spread: 1,   moveSpread: 1,   mag: 5,  reload: 0.9,  barrel: 3.0, reloadPerShell: true },
  sv98:  { name: 'SV-98',        ammo: '762', auto: false, fireDelay: 1.5,   dmg: 80,   speed: 182, range: 150, spread: 1,   moveSpread: 1,   mag: 10, reload: 2.7,  barrel: 3.0 },
  awm:   { name: 'AWM-S',        ammo: '308', auto: false, fireDelay: 1.5,   dmg: 180,  speed: 136, range: 150, spread: 1,   moveSpread: 1,   mag: 5,  reload: 3.5,  barrel: 3.0 },
};

// Scope name -> half of the visible height in world units (surviv "zoom").
ST.SCOPES = { '1x': 28, '2x': 36, '4x': 48, '8x': 68, '15x': 104 };

// Enemy aim skill: sigma of aim error in degrees, reaction time after seeing you, whether it leads moving targets.
ST.AIM_SKILL = {
  easy:   { name: 'Easy',   sigma: 9,   reaction: 0.6, lead: false },
  normal: { name: 'Normal', sigma: 6,   reaction: 0.35, lead: false },
  hard:   { name: 'Hard',   sigma: 2.5, reaction: 0.2, lead: true },
};

ST.BEHAVIORS = {
  static: { name: 'Stationary',   desc: 'Does not move.' },
  strafe: { name: 'Strafe',       desc: 'Runs side to side, flipping direction unpredictably.' },
  juke:   { name: 'Juke',         desc: 'Random direction changes and stops, like a real player dodging.' },
  orbit:  { name: 'Orbit',        desc: 'Circles you at a constant distance.' },
  rush:   { name: 'Rush',         desc: 'Charges you and dances at point-blank range.' },
};
