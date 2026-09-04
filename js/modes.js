// Training drills. Each drill is a preset of settings; the menu lets you tweak them.
window.ST = window.ST || {};

ST.DEFAULT_SETTINGS = {
  weapon: 'mp5', scope: '1x', duration: 60, enemies: 1, behavior: 'strafe',
  enemyHp: 100, enemyShoots: false, enemyAim: 'normal', minDist: 8, maxDist: 16,
  ttl: 0, respawnDelay: 0.5, obstacles: true, sound: true, hitmarker: true,
};

ST.MODES = [
  {
    id: 'tracking', name: 'Tracking',
    desc: 'One enemy strafes at mid range. Keep your stream on them: SMG/AR spray control.',
    tip: 'Move your crosshair with the target, not to where it was. Reset your aim on every direction flip.',
    settings: { weapon: 'mp5', scope: '1x', duration: 60, enemies: 1, behavior: 'strafe', enemyHp: 100, minDist: 8, maxDist: 16 },
  },
  {
    id: 'flick', name: 'Flick',
    desc: 'Targets pop up one at a time anywhere on screen and vanish after 1.5 s. One hit kills.',
    tip: 'Snap, confirm, click. Chasing a missed shot is slower than resetting.',
    settings: { weapon: 'mk12', scope: '1x', duration: 60, enemies: 1, behavior: 'static', enemyHp: 1, minDist: 6, maxDist: 24, ttl: 1.5, respawnDelay: 0.2 },
  },
  {
    id: 'duel', name: '1v1 Duel',
    desc: 'A juking enemy shoots back with the same gun. Dodge with WASD while you land shots.',
    tip: 'Strafe perpendicular to the enemy while firing; standing still doubles their hit rate.',
    settings: { weapon: 'ak47', scope: '1x', duration: 90, enemies: 1, behavior: 'juke', enemyHp: 100, enemyShoots: true, enemyAim: 'normal', minDist: 8, maxDist: 18 },
  },
  {
    id: 'shotgun', name: 'Shotgun Rush',
    desc: 'Enemies charge you. Hip-fire the M870 into them before they reach you.',
    tip: 'Fire when they are within ~6 units so all pellets connect. Kite backwards between shots.',
    settings: { weapon: 'm870', scope: '1x', duration: 60, enemies: 2, behavior: 'rush', enemyHp: 100, enemyShoots: true, enemyAim: 'easy', minDist: 12, maxDist: 22 },
  },
  {
    id: 'sniper', name: 'Sniper Leads',
    desc: 'Long-range strafing targets on an 8x scope. Bullets take time to arrive: lead your shots.',
    tip: 'Aim where the target will be in ~0.25 s. At 40 units a Mosin round flies for a quarter second.',
    settings: { weapon: 'mosin', scope: '8x', duration: 90, enemies: 1, behavior: 'strafe', enemyHp: 1, minDist: 30, maxDist: 55 },
  },
  {
    id: 'swarm', name: 'Swarm',
    desc: 'Three jukers at once. Pick a target, finish it, switch.',
    tip: 'Commit to one target until it dies. Splitting damage kills nobody.',
    settings: { weapon: 'm4a1', scope: '2x', duration: 90, enemies: 3, behavior: 'juke', enemyHp: 100, minDist: 8, maxDist: 20 },
  },
  {
    id: 'pistol', name: 'Pistol Tap',
    desc: 'M9 against an orbiting enemy. Semi-auto: every click counts.',
    tip: 'The M9 has 8° standing spread and 14° while moving. Stop to shoot.',
    settings: { weapon: 'm9', scope: '1x', duration: 60, enemies: 1, behavior: 'orbit', enemyHp: 100, minDist: 6, maxDist: 12 },
  },
  {
    id: 'custom', name: 'Custom',
    desc: 'Configure everything yourself.',
    tip: '',
    settings: {},
  },
];
