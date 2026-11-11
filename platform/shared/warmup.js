// Real-game evidence: survev damage per minute in games played soon after a finished routine
// versus games played cold. Exact arithmetic on timestamps, no modelling. MIT, see platform/LICENSE.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ST = root.ST || {}; root.ST.warmup = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN_GAMES = 10;

  // survev match_history rows carry end_time (ISO) and time_alive (seconds).
  function matchStart(m) { return new Date(m.end_time).getTime() - (m.time_alive || 0) * 1000; }
  function dmgPerMin(m) { return m.time_alive > 0 ? m.damage_dealt / (m.time_alive / 60) : null; }

  // Pooled rate (total damage over total minutes alive), so a 20-second death does not swing it.
  function pool(list) {
    const secs = list.reduce((a, m) => a + (m.time_alive || 0), 0);
    const dmg = list.reduce((a, m) => a + (m.damage_dealt || 0), 0);
    return { n: list.length, dmgPerMin: secs > 0 ? dmg / (secs / 60) : null };
  }

  // routineCompletions: timestamps (ms or ISO) of routines finished end to end.
  function compareWarmVsCold(matches, routineCompletions, windowMin = 60) {
    const done = routineCompletions.map(t => typeof t === 'number' ? t : new Date(t).getTime()).sort((a, b) => a - b);
    const win = windowMin * 60000;
    const warm = [], cold = [];
    for (const m of matches) {
      if (!m || !m.end_time) continue;
      const start = matchStart(m);
      const isWarm = done.some(t => t <= start && start - t <= win);
      (isWarm ? warm : cold).push(m);
    }
    const w = pool(warm), c = pool(cold);
    const diff = w.dmgPerMin !== null && c.dmgPerMin !== null ? w.dmgPerMin - c.dmgPerMin : null;
    return { warm: w, cold: c, diff, enough: w.n >= MIN_GAMES && c.n >= MIN_GAMES };
  }

  return { compareWarmVsCold, dmgPerMin, matchStart, MIN_GAMES };
});
