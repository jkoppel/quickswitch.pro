// Benchmark scenarios, routines, scoring tiers.
window.ST = window.ST || {};

// Bumped whenever a benchmark scenario's settings change, so old scores are not silently compared
// against new ones. v2 fixed every scenario's scope: several of them spawned targets further away
// than the scope could show on the short screen axis, which biased both difficulty and flick
// direction. v3 retired invincible bots for 500 HP ones that do take damage, and merged the old
// "smooth" movement into `orbit`.
ST.BENCHMARK_VERSION = 3;

// Each scenario is a full settings preset. Scores are throughput: 100 * hits/s * sqrt(accuracy).
// `ref` is the provisional score that marks the top tier; tiers are fractions of it.
// Scopes follow ST.scopeForDistance: the smallest scope that still shows maxDist in every direction.
ST.SCENARIOS = {
  warmup:         { name: 'Warm-up tracking',   cat: 'Warm-up',   scored: false, tip: 'Loosen up: hold the trigger and follow the bot. Nothing here counts.',
    settings: { weapon: 'mp5', scope: '2x', duration: 30, enemies: 1, behavior: 'strafe', enemyHp: 500, minDist: 8, maxDist: 14 } },
  staticClick:    { name: 'Static clicking',    cat: 'Clicking',  ref: 170, condition: 'speed', tip: 'Three targets, one hit each. Pick the next one before the current one dies.',
    settings: { weapon: 'mk12', scope: '4x', duration: 30, enemies: 3, behavior: 'hold', enemyHp: 1, minDist: 6, maxDist: 22 } },
  precisionClick: { name: 'Precision clicking', cat: 'Clicking',  ref: 120, condition: 'precision', tip: 'Same drill at 8x: targets are far smaller on screen. Slow the last part of the move and land short.',
    settings: { weapon: 'mk12', scope: '8x', duration: 30, enemies: 3, behavior: 'hold', enemyHp: 1, minDist: 18, maxDist: 32 } },
  dynamicClick:   { name: 'Dynamic clicking',   cat: 'Clicking',  ref: 110, tip: 'Juking targets, one hit each. Fire on the direction change, when they are briefly still.',
    settings: { weapon: 'mk12', scope: '2x', duration: 30, enemies: 2, behavior: 'juke', enemyHp: 1, minDist: 6, maxDist: 17 } },
  preciseTrack:   { name: 'Precise tracking',   cat: 'Tracking',  ref: 650, tip: 'Invincible bot, smooth strafe. Hold the trigger and lead by about a body width.',
    settings: { weapon: 'mp5', scope: '2x', duration: 30, enemies: 1, behavior: 'orbit', enemyHp: 500, minDist: 10, maxDist: 14 } },
  reactiveTrack:  { name: 'Reactive tracking',  cat: 'Tracking',  ref: 520, tip: 'Sudden reversals. Move your crosshair with the bot, and reset the instant it flips.',
    settings: { weapon: 'mp5', scope: '1x', duration: 30, enemies: 1, behavior: 'strafe', enemyHp: 500, minDist: 6, maxDist: 10 } },
  speedSwitch:    { name: 'Speed switching',    cat: 'Switching', ref: 480, tip: 'Four bots, two bullets each. Kill, switch, kill. Do not chase misses.',
    settings: { weapon: 'm4a1', scope: '2x', duration: 30, enemies: 4, behavior: 'hold', enemyHp: 28, minDist: 5, maxDist: 16 } },
  evasiveSwitch:  { name: 'Evasive switching',  cat: 'Switching', ref: 380, tip: 'Three jukers, three bullets each. Commit to one until it drops.',
    settings: { weapon: 'm4a1', scope: '2x', duration: 30, enemies: 3, behavior: 'juke', enemyHp: 42, minDist: 6, maxDist: 16 } },
  chase:          { name: 'Chase',              cat: 'Moving',    ref: 300, tip: 'Hold W and shoot in short bursts while closing. Stopping loses the runner.',
    settings: { weapon: 'ak47', scope: '2x', duration: 30, enemies: 1, behavior: 'flee', enemyHp: 100, minDist: 6, maxDist: 12, fleeSpeed: 0.95, leash: 6 } },
  dodge:          { name: 'Dodge under fire',   cat: 'Moving',    ref: 320, tip: 'The bot leads your movement. Break rhythm: short strafes, reversals, brief stops.',
    settings: { weapon: 'ak47', scope: '2x', duration: 30, enemies: 1, behavior: 'strafe', enemyHp: 100, enemyShoots: true, enemyAim: 'hard', minDist: 8, maxDist: 14 } },
  // Utility scenarios: scored like the rest, but not part of the Benchmark ruler (no `ref`).
  quickSwitch:    { name: 'Quick switching',    cat: 'Utility',   tip: 'Shell, switch, tap, switch. One free 0.25 s switch per second is the whole trick.',
    settings: { weapon: 'm870', secondary: 'm9', enemyWeapon: 'mp5', scope: '1x', duration: 30, enemies: 1, behavior: 'juke', enemyHp: 100, enemyShoots: true, enemyAim: 'normal', minDist: 6, maxDist: 12 } },
  fragLob:        { name: 'Frag lobbing',       cat: 'Utility',   tip: 'Cursor distance is throw strength. Lead the throw and cook so it lands live.',
    settings: { weapon: 'mp5', throwable: 'frag', throwableCount: 99, scope: '4x', duration: 30, enemies: 2, behavior: 'strafe', enemyHp: 100, minDist: 12, maxDist: 20, stones: 8 } },
  bankShot:       { name: 'Bank shots',         cat: 'Utility',   tip: 'Metal bunker walls are flat mirrors. Aim as far past the corner as the enemy is behind it.',
    settings: { weapon: 'm4a1', arena: 'bunker', scope: '2x', duration: 30, enemies: 1, behavior: 'cover', enemyHp: 100, enemyShoots: true, enemyAim: 'normal', minDist: 7, maxDist: 16 } },
  spinDodge:      { name: 'Spin dodge',         cat: 'Utility',   tip: 'Whirl while you cross open ground, settle to shoot. Spinning costs your aim, so it has to be paid back.',
    settings: { weapon: 'ak47', scope: '2x', duration: 30, enemies: 2, behavior: 'strafe', enemyHp: 100, enemyShoots: true, enemyAim: 'hard', minDist: 9, maxDist: 16 } },
};

// Benchmark scenarios are a ruler: no adaptive difficulty, no lead hints, fixed difficulty.
for (const sc of Object.values(ST.SCENARIOS)) {
  sc.settings = { adaptive: false, leadHint: false, difficulty: 0.5, ...sc.settings };
}

ST.TIERS = [
  { name: 'Bronze',   min: 0 },
  { name: 'Silver',   min: 0.35 },
  { name: 'Gold',     min: 0.5 },
  { name: 'Platinum', min: 0.65 },
  { name: 'Diamond',  min: 0.8 },
  { name: 'Master',   min: 0.95 },
];
ST.tierFor = function (scenarioId, score) {
  const sc = ST.SCENARIOS[scenarioId];
  if (!sc || !sc.ref || score === null) return null;
  const f = score / sc.ref;
  let t = ST.TIERS[0];
  for (const tier of ST.TIERS) if (f >= tier.min) t = tier;
  return { name: t.name, frac: f };
};

// A routine is a list of steps; each step names a scenario or a drill and may override settings.
// The daily routines are built to fit five minutes including their rests: see ST.routineSeconds.
const D = 32;   // seconds per adaptive step in a daily routine
const F = 50;   // seconds per step in a focus routine

ST.ROUTINES = [
  {
    id: 'daily', name: 'Daily 5', shuffle: true, rest: 8,
    desc: 'Five minutes, every day: a short warm-up then six adaptive drills in shuffled order, one from each of clicking, tracking, switching and moving. Short and daily beats long and weekly.',
    steps: ['warmup',
      { scenario: 'staticClick', settings: { duration: D, adaptive: true, ttl: 1.6 } },
      { scenario: 'dynamicClick', settings: { duration: D, adaptive: true, ttl: 2.0 } },
      { scenario: 'reactiveTrack', settings: { duration: D, adaptive: true } },
      { scenario: 'preciseTrack', settings: { duration: D, adaptive: true } },
      { scenario: 'evasiveSwitch', settings: { duration: D, adaptive: true } },
      { scenario: 'dodge', settings: { duration: D, adaptive: true } },
    ],
  },
  {
    id: 'benchmark', name: 'Benchmark', shuffle: false, rest: 12,
    desc: 'A 30-second warm-up plus nine 30-second scored scenarios covering clicking (speed and precision), tracking (precise and reactive), switching (speed and evasive) and moving (chase, dodge under fire). Adaptive difficulty and lead hints are off so scores stay comparable between sessions. Re-run it weekly, not daily.',
    steps: ['warmup', 'staticClick', 'precisionClick', 'dynamicClick', 'preciseTrack', 'reactiveTrack', 'speedSwitch', 'evasiveSwitch', 'chase', 'dodge'],
  },
  {
    id: 'moving', name: 'Moving focus', shuffle: true, rest: 10,
    desc: 'Five minutes of accuracy on the move: chase a fleeing enemy, dodge one that shoots back, spin off their aim, then a full duel.',
    steps: ['warmup',
      { scenario: 'chase', settings: { duration: F, adaptive: true } },
      { scenario: 'dodge', settings: { duration: F, adaptive: true } },
      { scenario: 'spinDodge', settings: { duration: F, adaptive: true } },
      { mode: 'duel', settings: { duration: F, enemyAim: 'hard' } },
    ],
  },
  {
    id: 'clicking', name: 'Clicking focus', shuffle: true, rest: 10,
    desc: 'Five minutes of flicks and taps. Adaptive target lifetimes keep success near 75%.',
    steps: ['warmup',
      { scenario: 'staticClick', settings: { duration: F, adaptive: true, ttl: 1.6 } },
      { scenario: 'precisionClick', settings: { duration: F, adaptive: true, ttl: 2.2 } },
      { scenario: 'dynamicClick', settings: { duration: F, adaptive: true, ttl: 2.0 } },
      { scenario: 'staticClick', settings: { duration: F, adaptive: true, ttl: 1.6, weapon: 'm9', scope: '2x', maxDist: 17 } },
    ],
  },
  {
    id: 'tracking', name: 'Tracking focus', shuffle: true, rest: 10,
    desc: 'Five minutes of smooth and reactive tracking with SMGs and ARs, then a duel to apply it under fire.',
    steps: ['warmup',
      { scenario: 'preciseTrack', settings: { duration: F, adaptive: true } },
      { scenario: 'reactiveTrack', settings: { duration: F, adaptive: true } },
      { scenario: 'reactiveTrack', settings: { duration: F, adaptive: true, weapon: 'ak47', scope: '2x', minDist: 10, maxDist: 16 } },
      { mode: 'duel', settings: { duration: F } },
    ],
  },
  {
    id: 'utility', name: 'Utility focus', shuffle: true, rest: 10,
    desc: 'Five minutes on the things that win fights without out-aiming anyone: quick switching off a shotgun, frag placement, bank shots off barrels and spinning off an enemy’s aim.',
    steps: ['warmup',
      { scenario: 'quickSwitch', settings: { duration: F, adaptive: true } },
      { scenario: 'fragLob', settings: { duration: F, adaptive: true } },
      { scenario: 'bankShot', settings: { duration: F, adaptive: true } },
      { scenario: 'spinDodge', settings: { duration: F, adaptive: true } },
    ],
  },
  {
    id: 'leads', name: 'Bullet leads', shuffle: false, rest: 10,
    desc: 'Five minutes learning to aim where the target will be. The lead marker is on and fades out during each run so you do not lean on it.',
    steps: ['warmup',
      { mode: 'sniper', settings: { duration: F, leadHint: true, scope: '8x', minDist: 18, maxDist: 32 } },
      { mode: 'sniper', settings: { duration: F, leadHint: true } },
      { mode: 'sniper', settings: { duration: F, leadHint: false } },
      { mode: 'sniper', settings: { duration: F, leadHint: false, weapon: 'awm' } },
    ],
  },
];

// Wall-clock length of a routine, rests included, so the menu never has to be kept in sync by hand.
ST.routineSeconds = function (routine, stepSpec) {
  let total = 0;
  for (const step of routine.steps) total += stepSpec(step).settings.duration;
  return total + routine.rest * Math.max(0, routine.steps.length - 1);
};
