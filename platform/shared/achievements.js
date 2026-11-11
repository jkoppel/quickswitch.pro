// Achievements as a pure function of run history, so the browser and the server always agree.
// Shared by the browser (window.ST.achievements) and the server (require). MIT, see platform/LICENSE.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ST = root.ST || {}; root.ST.achievements = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Tier names in order. Thresholds live with the scenarios in js/benchmark.js; runs carry the
  // tier name they earned, so this module never needs the score tables.
  const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'];
  const STREAKS = [3, 7, 30, 100];

  const DEFS = {
    'first-routine':   { title: 'First routine', desc: 'Finished a routine end to end.' },
    'first-benchmark': { title: 'On the ruler', desc: 'Finished a full Benchmark.' },
    'first-pb':        { title: 'Personal best', desc: 'Beat your own best on a scored drill.' },
    'beat-challenge':  { title: 'Challenge won', desc: 'Beat a friend’s challenge score.' },
    'first-ricochet':  { title: 'Bank shot', desc: 'Landed a round off a metal surface.' },
    'quickswitch-10':  { title: 'Quick hands', desc: 'Ten shots in one run that beat the primary’s fire delay.' },
  };
  for (const n of STREAKS) DEFS['streak-' + n] = { title: `${n}-day streak`, desc: `Finished a routine ${n} days in a row.` };
  for (const t of TIER_ORDER.slice(1)) DEFS['tier-' + t.toLowerCase()] = { title: `${t} tier`, desc: `Reached ${t} on a Benchmark scenario (provisional thresholds).` };

  const tsOf = (r) => typeof r.ts === 'number' ? r.ts : new Date(r.ts).getTime();
  const counted = (r) => r && !r.warmup && r.score !== null && r.score !== undefined;

  function evaluate(runs) {
    const list = runs.filter(Boolean).slice().sort((a, b) => tsOf(a) - tsOf(b));
    const earned = new Map();
    const earn = (id, r) => { if (!earned.has(id) && DEFS[id]) earned.set(id, tsOf(r)); };
    const best = new Map();
    const bestTier = new Map();
    let prevDay = null, dayRun = 0;
    for (const r of list) {
      if (r.routineCompleted) {
        earn('first-routine', r);
        if (r.key === 'routine:benchmark') earn('first-benchmark', r);
        // Consecutive completion days, counted on the first completion of each day.
        if (r.day && r.day !== prevDay) {
          dayRun = prevDay && nextDay(prevDay) === r.day ? dayRun + 1 : 1;
          prevDay = r.day;
          for (const n of STREAKS) if (dayRun >= n) earn('streak-' + n, r);
        }
      }
      if (counted(r) && r.key && !r.key.startsWith('routine:')) {
        const b = best.get(r.key);
        if (b !== undefined && r.score > b) earn('first-pb', r);
        if (b === undefined || r.score > b) best.set(r.key, r.score);
      }
      if (counted(r) && r.benchmark && r.tier && r.scenario) {
        const rank = TIER_ORDER.indexOf(r.tier);
        const prev = bestTier.has(r.scenario) ? bestTier.get(r.scenario) : -1;
        if (rank > prev) {
          for (let i = Math.max(1, prev + 1); i <= rank; i++) earn('tier-' + TIER_ORDER[i].toLowerCase(), r);
          bestTier.set(r.scenario, rank);
        }
      }
      if (r.challengeBeat) earn('beat-challenge', r);
      if (r.ricochetHits > 0) earn('first-ricochet', r);
      if (r.quickSwitchShots >= 10) earn('quickswitch-10', r);
    }
    return [...earned.entries()]
      .map(([id, earnedAt]) => ({ id, title: DEFS[id].title, desc: DEFS[id].desc, earnedAt }))
      .sort((a, b) => a.earnedAt - b.earnedAt || a.id.localeCompare(b.id));
  }

  function nextDay(day) {
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  }

  // Achievements present after a run that were not present before it.
  function unlocked(before, after) {
    const had = new Set(before.map(a => a.id));
    return after.filter(a => !had.has(a.id));
  }

  return { evaluate, unlocked, DEFS, TIER_ORDER };
});
