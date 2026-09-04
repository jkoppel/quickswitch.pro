// Benchmark scenarios, routines, scoring tiers.
window.ST = window.ST || {};

// Each scenario is a full settings preset. Scores are throughput: 100 * hits/s * sqrt(accuracy).
// `ref` is the provisional score that marks the top tier; tiers are fractions of it.
ST.SCENARIOS = {
  warmup:         { name: 'Warm-up tracking',   cat: 'Warm-up',   scored: false,
    settings: { weapon: 'mp5', scope: '1x', duration: 30, enemies: 1, behavior: 'strafe', invincible: true, minDist: 8, maxDist: 14 } },
  staticClick:    { name: 'Static clicking',    cat: 'Clicking',  ref: 170, condition: 'speed',
    settings: { weapon: 'mk12', scope: '1x', duration: 30, enemies: 3, behavior: 'static', enemyHp: 1, minDist: 6, maxDist: 22 } },
  precisionClick: { name: 'Precision clicking', cat: 'Clicking',  ref: 120, condition: 'precision',
    settings: { weapon: 'mk12', scope: '4x', duration: 30, enemies: 3, behavior: 'static', enemyHp: 1, minDist: 18, maxDist: 40 } },
  dynamicClick:   { name: 'Dynamic clicking',   cat: 'Clicking',  ref: 110,
    settings: { weapon: 'mk12', scope: '1x', duration: 30, enemies: 2, behavior: 'juke', enemyHp: 1, minDist: 6, maxDist: 18 } },
  preciseTrack:   { name: 'Precise tracking',   cat: 'Tracking',  ref: 650,
    settings: { weapon: 'mp5', scope: '2x', duration: 30, enemies: 1, behavior: 'smooth', invincible: true, minDist: 10, maxDist: 14 } },
  reactiveTrack:  { name: 'Reactive tracking',  cat: 'Tracking',  ref: 520,
    settings: { weapon: 'mp5', scope: '1x', duration: 30, enemies: 1, behavior: 'strafe', invincible: true, minDist: 6, maxDist: 10 } },
  speedSwitch:    { name: 'Speed switching',    cat: 'Switching', ref: 480,
    settings: { weapon: 'm4a1', scope: '1x', duration: 30, enemies: 4, behavior: 'static', enemyHp: 28, minDist: 5, maxDist: 16 } },
  evasiveSwitch:  { name: 'Evasive switching',  cat: 'Switching', ref: 380,
    settings: { weapon: 'm4a1', scope: '1x', duration: 30, enemies: 3, behavior: 'juke', enemyHp: 42, minDist: 6, maxDist: 16 } },
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
ST.ROUTINES = [
  {
    id: 'benchmark', name: 'Benchmark', minutes: 6, shuffle: false, rest: 12,
    desc: 'Warm-up plus seven 30-second scored scenarios covering clicking (speed and precision), tracking (precise and reactive) and switching (speed and evasive). Adaptive difficulty and lead hints are off so scores stay comparable between sessions. Re-run it weekly, not daily.',
    steps: ['warmup', 'staticClick', 'precisionClick', 'dynamicClick', 'preciseTrack', 'reactiveTrack', 'speedSwitch', 'evasiveSwitch'],
  },
  {
    id: 'daily', name: 'Daily 15', minutes: 15, shuffle: true, rest: 20,
    desc: 'One warm-up, then six 75-second adaptive drills in shuffled order, one per aim category. Short and daily beats long and weekly.',
    steps: ['warmup',
      { scenario: 'staticClick', settings: { duration: 75, adaptive: true, ttl: 1.6 } },
      { scenario: 'dynamicClick', settings: { duration: 75, adaptive: true, ttl: 2.0 } },
      { scenario: 'preciseTrack', settings: { duration: 75, adaptive: true } },
      { scenario: 'reactiveTrack', settings: { duration: 75, adaptive: true } },
      { scenario: 'speedSwitch', settings: { duration: 75, adaptive: true } },
      { scenario: 'evasiveSwitch', settings: { duration: 75, adaptive: true } },
    ],
  },
  {
    id: 'clicking', name: 'Clicking focus', minutes: 8, shuffle: true, rest: 15,
    desc: 'Flicks and taps. Adaptive target lifetimes keep success near 75%.',
    steps: ['warmup',
      { scenario: 'staticClick', settings: { duration: 60, adaptive: true, ttl: 1.6 } },
      { scenario: 'precisionClick', settings: { duration: 60, adaptive: true, ttl: 2.2 } },
      { scenario: 'dynamicClick', settings: { duration: 60, adaptive: true, ttl: 2.0 } },
      { scenario: 'staticClick', settings: { duration: 60, adaptive: true, ttl: 1.6, weapon: 'm9' } },
    ],
  },
  {
    id: 'tracking', name: 'Tracking focus', minutes: 8, shuffle: true, rest: 15,
    desc: 'Smooth and reactive tracking with SMGs and ARs, then a duel to apply it under fire.',
    steps: ['warmup',
      { scenario: 'preciseTrack', settings: { duration: 60, adaptive: true } },
      { scenario: 'reactiveTrack', settings: { duration: 60, adaptive: true } },
      { scenario: 'reactiveTrack', settings: { duration: 60, adaptive: true, weapon: 'ak47', scope: '2x', minDist: 10, maxDist: 16 } },
      { mode: 'duel', settings: { duration: 75 } },
    ],
  },
  {
    id: 'leads', name: 'Bullet leads', minutes: 8, shuffle: false, rest: 15,
    desc: 'Learn to aim where the target will be. The lead marker is on and fades out during each run so you do not lean on it.',
    steps: ['warmup',
      { mode: 'sniper', settings: { duration: 75, leadHint: true, scope: '4x', minDist: 18, maxDist: 34 } },
      { mode: 'sniper', settings: { duration: 75, leadHint: true } },
      { mode: 'sniper', settings: { duration: 75, leadHint: false } },
    ],
  },
];
