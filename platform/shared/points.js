// Points: for training more, and for getting better. A pure function of the run history, so the
// browser and the server always agree. Shared as window.ST.points / require. MIT, see platform/LICENSE.
//
// Practice   10 per minute in a drill, any drill, warm-up included. Capped at the 45-minute daily
//            budget, so the points never reward overtraining.
// Plan day   50 for finishing the day's routine from your week plan, on its day.
// Best       when a counted run beats your best score on that drill: 2 per percent of improvement,
//            at most 100 a run. The score is hits per second times √accuracy, so it already pays
//            for accuracy without paying for slowing down.
// Accuracy   when a counted run beats your best accuracy on that drill without dropping below 95%
//            of the hit rate you had then: 2 per percentage point, at most 50 a run.
// The first run on a drill sets the baseline and earns practice points only.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./streak.js'));
  else { root.ST = root.ST || {}; root.ST.points = factory(root.ST.streak); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (streak) {
  const PER_MINUTE = 10;
  const DAILY_CAP = 45 * PER_MINUTE;
  const PLAN_DAY = 50;
  const BEST_PER_PCT = 2, BEST_MAX = 100;
  const ACC_PER_PP = 2, ACC_MAX = 50, ACC_SPEED_FLOOR = 0.95;

  const isRoutine = (r) => typeof r.key === 'string' && r.key.startsWith('routine:');
  const num = (v) => typeof v === 'number' && Number.isFinite(v);

  // Monday of the week containing `day`, for "this week" totals.
  function weekStart(day) {
    const [y, m, d] = day.split('-').map(Number);
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    return streak.addDays(day, -dow);
  }

  // runs: history entries in any order. plan: the week plan (optional), for plan-day points.
  // Returns totals plus every award, each tied to the run that earned it.
  function evaluate(runs, { plan = null, today = null } = {}) {
    const list = runs.filter(r => r && r.day).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const planDays = new Map();
    if (plan && plan.days) for (const d of plan.days) planDays.set(d.day, `routine:${d.routine}`);

    const awards = [];
    const usedToday = new Map();      // day -> practice points already given
    const bestScore = new Map();      // key -> best counted score
    const bestAcc = new Map();        // key -> { acc, hps } of the most accurate counted run
    const planPaid = new Set();

    for (const r of list) {
      const id = r.id || null;
      if (isRoutine(r)) {
        if (r.routineCompleted && planDays.get(r.day) === r.key && !planPaid.has(r.day)) {
          planPaid.add(r.day);
          awards.push({ runId: id, day: r.day, kind: 'plan', points: PLAN_DAY });
        }
        continue;
      }
      if (num(r.duration) && r.duration > 0) {
        const used = usedToday.get(r.day) || 0;
        const pts = Math.min(Math.floor(r.duration / 60 * PER_MINUTE), DAILY_CAP - used);
        if (pts > 0) { usedToday.set(r.day, used + pts); awards.push({ runId: id, day: r.day, kind: 'practice', points: pts }); }
      }
      if (r.warmup || !r.key) continue;
      if (num(r.score)) {
        const prev = bestScore.get(r.key);
        if (prev !== undefined && prev > 0 && r.score > prev) {
          const pct = (r.score - prev) / prev * 100;
          const pts = Math.min(BEST_MAX, Math.round(pct * BEST_PER_PCT));
          if (pts > 0) awards.push({ runId: id, day: r.day, kind: 'best', points: pts, from: prev, to: r.score });
        }
        if (prev === undefined || r.score > prev) bestScore.set(r.key, r.score);
      }
      if (num(r.accuracy)) {
        const prev = bestAcc.get(r.key);
        const hps = num(r.hitsPerSec) ? r.hitsPerSec : 0;
        if (prev && r.accuracy > prev.acc && hps >= prev.hps * ACC_SPEED_FLOOR) {
          const pts = Math.min(ACC_MAX, Math.round((r.accuracy - prev.acc) * 100 * ACC_PER_PP));
          if (pts > 0) awards.push({ runId: id, day: r.day, kind: 'accuracy', points: pts, from: prev.acc, to: r.accuracy });
        }
        if (!prev || r.accuracy > prev.acc) bestAcc.set(r.key, { acc: r.accuracy, hps });
      }
    }

    const sum = (xs) => xs.reduce((a, x) => a + x.points, 0);
    const out = { total: sum(awards), today: 0, week: 0, awards };
    if (today) {
      const ws = weekStart(today);
      out.today = sum(awards.filter(a => a.day === today));
      out.week = sum(awards.filter(a => a.day >= ws && a.day <= today));
    }
    return out;
  }

  // The awards one run earned, grouped by kind, for the results screen.
  function forRun(result, runId) {
    const mine = result.awards.filter(a => a.runId === runId);
    const by = {};
    for (const a of mine) by[a.kind] = (by[a.kind] || 0) + a.points;
    return { total: mine.reduce((s, a) => s + a.points, 0), by, awards: mine };
  }

  return { evaluate, forRun, weekStart, PER_MINUTE, DAILY_CAP, PLAN_DAY };
});
