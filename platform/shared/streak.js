// Daily streak: consecutive local days with a completed routine. No freezes, no repairs.
// Shared by the browser (window.ST.streak) and the server (require). MIT, see platform/LICENSE.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ST = root.ST || {}; root.ST.streak = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DAY_MS = 86400000;

  // Day strings are local calendar dates ('YYYY-MM-DD'). Arithmetic runs on UTC midnights so a
  // daylight-saving change can never make two calendar days 23 or 25 hours apart.
  function toNum(day) {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / DAY_MS;
  }
  function fromNum(n) {
    const t = new Date(n * DAY_MS);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  }
  function addDays(day, k) { return fromNum(toNum(day) + k); }

  // The local day of a timestamp, as the trainer has always written it into history entries.
  function localDay(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Days that count: a routine finished end to end. Single drills and abandoned routines do not.
  function completionDays(runs) {
    const set = new Set();
    for (const r of runs) if (r && r.routineCompleted && r.day) set.add(r.day);
    return [...set].sort();
  }

  // A streak survives until the end of the day after its last practice day: practising yesterday
  // and not yet today still shows the streak, missing a whole day ends it.
  function computeStreak(days, today) {
    const nums = [...new Set(days)].map(toNum).sort((a, b) => a - b);
    const set = new Set(nums);
    const t = toNum(today);
    let longest = 0, run = 0, prev = null;
    for (const n of nums) {
      run = prev !== null && n === prev + 1 ? run + 1 : 1;
      if (run > longest) longest = run;
      prev = n;
    }
    const practicedToday = set.has(t);
    let current = 0;
    let cursor = practicedToday ? t : (set.has(t - 1) ? t - 1 : null);
    while (cursor !== null && set.has(cursor)) { current++; cursor--; }
    return { current, longest, practicedToday };
  }

  return { computeStreak, completionDays, addDays, localDay };
});
