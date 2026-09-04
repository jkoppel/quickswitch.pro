// Run history in localStorage: trends, personal bests, warm-up flags, daily practice budget.
window.ST = window.ST || {};

ST.history = (function () {
  const KEY = 'st.history';
  const CAP = 600;
  let cache = null;

  function load() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { cache = []; }
    return cache;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* ignore */ } }
  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const today = () => dayKey(Date.now());

  function runsToday() { return load().filter(r => r.day === today()); }
  function minutesToday() { return runsToday().reduce((a, r) => a + (r.duration || 0), 0) / 60; }

  // The first ~40 s of practice each day is warm-up: excluded from bests (Listman et al. 2021 warm-up effect).
  // Every routine starts with a 45 s warm-up scenario, so scored steps after it count.
  function isWarmup() { return minutesToday() < 0.65; }

  function add(run) {
    const list = load();
    const entry = { ts: Date.now(), day: today(), ...run };
    list.push(entry);
    while (list.length > CAP) list.shift();
    save();
    return entry;
  }

  function forKey(key) { return load().filter(r => r.key === key && r.score !== null && r.score !== undefined); }

  function best(key, metric, lower) {
    const runs = forKey(key).filter(r => !r.warmup && r[metric] !== null && r[metric] !== undefined);
    if (!runs.length) return null;
    return runs.reduce((b, r) => (lower ? r[metric] < b[metric] : r[metric] > b[metric]) ? r : b);
  }

  function clear() { cache = []; save(); }

  return { add, all: load, forKey, best, runsToday, minutesToday, isWarmup, dayKey, today, clear };
})();
