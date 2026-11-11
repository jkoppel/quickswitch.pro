// The first week's training plan, built from the diagnostic. Deterministic: the same scores give the
// same week. Shared by the browser (window.ST.plan) and the server (require). MIT, see platform/LICENSE.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./streak.js'));
  else { root.ST = root.ST || {}; root.ST.plan = factory(root.ST.streak); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (streak) {
  // The four skills the diagnostic measures, and the five-minute routine that trains each.
  const FOCUS = {
    Clicking: 'clicking',
    Tracking: 'tracking',
    Switching: 'switching',
    Moving: 'moving',
  };
  const ORDER = ['Clicking', 'Tracking', 'Switching', 'Moving'];

  // A skill's level is its scenarios' mean score as a fraction of their reference scores, the same
  // ruler the provisional tiers use. Skills the diagnostic did not reach are left out.
  function skillLevels(results, scenarios) {
    const acc = {};
    for (const r of results) {
      const sc = scenarios[r.scenario];
      if (!sc || !sc.ref || !(sc.cat in FOCUS) || typeof r.score !== 'number') continue;
      (acc[sc.cat] = acc[sc.cat] || []).push(r.score / sc.ref);
    }
    const out = {};
    for (const cat of ORDER) if (acc[cat]) out[cat] = acc[cat].reduce((a, b) => a + b, 0) / acc[cat].length;
    return out;
  }

  // Weakest first; ties keep the fixed skill order so the result never depends on object order.
  function rank(levels) {
    return ORDER.filter(c => c in levels).sort((a, b) => levels[a] - levels[b] || ORDER.indexOf(a) - ORDER.indexOf(b));
  }

  // Day 1 is the diagnostic itself. Days 2 to 6 spend two sessions on the weakest skill, one each on
  // the next two, and one Daily 5 so nothing goes untouched; the weakest never repeats on
  // consecutive days. Day 7 re-runs the tests so the week ends on a measured change.
  function buildPlan(levels, startDay) {
    const r = rank(levels);
    const pick = (i) => r[Math.min(i, r.length - 1)];
    const body = r.length
      ? [
          { focus: pick(0), why: 'Your weakest area' },
          { focus: pick(1), why: 'Second on your list' },
          { focus: null, why: 'A bit of everything' },
          { focus: pick(0), why: 'Your weakest area, again' },
          { focus: pick(2), why: 'Keep it from slipping' },
        ]
      : [null, null, null, null, null].map(() => ({ focus: null, why: 'A bit of everything' }));
    const days = [{ routine: 'diagnostic', focus: null, why: 'Where you stand today' }]
      .concat(body.map(b => ({ routine: b.focus ? FOCUS[b.focus] : 'daily', focus: b.focus, why: b.why })))
      .concat([{ routine: 'retest', focus: null, why: 'Measure the week' }]);
    return {
      startDay,
      levels,
      days: days.map((d, i) => ({ ...d, n: i + 1, day: streak.addDays(startDay, i) })),
    };
  }

  // Which plan day today is, and which days were done. A day is done when its routine was finished
  // on that calendar day; a session done late counts on the day it was actually trained.
  function progress(plan, runs, today) {
    if (!plan || !plan.days) return null;
    const finished = new Set();
    for (const r of runs) if (r && r.routineCompleted && r.day && r.key) finished.add(`${r.day}|${r.key}`);
    const days = plan.days.map(d => ({ ...d, done: finished.has(`${d.day}|routine:${d.routine}`) }));
    const todayIdx = days.findIndex(d => d.day === today);
    return {
      days,
      today: todayIdx >= 0 ? days[todayIdx] : null,
      over: today > days[days.length - 1].day,
      doneCount: days.filter(d => d.done).length,
    };
  }

  return { FOCUS, skillLevels, rank, buildPlan, progress };
});
