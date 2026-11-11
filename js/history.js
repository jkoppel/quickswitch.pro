// Run history in localStorage: trends, personal bests, warm-up flags, daily practice budget.
window.ST = window.ST || {};

ST.uuid = function () {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

ST.history = (function () {
  const KEY = 'st.history';
  const DAYS_KEY = 'st.days';   // every day a routine was finished; never capped, the streak needs all of it
  const CAP = 3000;
  let cache = null;
  let days = null;
  const listeners = [];

  function load() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { cache = []; }
    // Entries from before sync had no id; give them one so the server can de-duplicate them.
    let changed = false;
    for (const r of cache) if (!r.id) { r.id = ST.uuid(); changed = true; }
    if (changed) save();
    return cache;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* ignore */ } }
  function loadDays() {
    if (days) return days;
    try { days = new Set(JSON.parse(localStorage.getItem(DAYS_KEY)) || []); } catch (e) { days = new Set(); }
    for (const r of load()) if (r.routineCompleted && r.day) days.add(r.day);
    return days;
  }
  function saveDays() { try { localStorage.setItem(DAYS_KEY, JSON.stringify([...days].sort())); } catch (e) { /* ignore */ } }
  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const today = () => dayKey(Date.now());

  function runsToday() { return load().filter(r => r.day === today()); }
  function minutesToday() { return runsToday().filter(r => !String(r.key).startsWith('routine:')).reduce((a, r) => a + (r.duration || 0), 0) / 60; }

  // The first ~30 s of practice each day is warm-up: excluded from bests (Listman et al. 2021 warm-up effect).
  // Routines start with a 30 s warm-up step, so the step after it is the first that counts. Tests (the
  // aim test, the diagnostic, the re-test) are never warm-up: they are measurements, taken as they come.
  function isWarmup() { return minutesToday() < 0.5; }

  function trim(list) { while (list.length > CAP) list.shift(); }

  function add(run) {
    const list = load();
    const entry = { id: ST.uuid(), ts: Date.now(), day: today(), ...run };
    list.push(entry);
    trim(list);
    save();
    if (entry.routineCompleted) { loadDays().add(entry.day); saveDays(); }
    for (const fn of listeners) { try { fn(entry); } catch (e) { console.error(e); } }
    return entry;
  }

  // Patch fields on an existing entry (a challenge result arrives after the run was recorded).
  function update(id, patch) {
    const r = load().find(x => x.id === id);
    if (!r) return null;
    Object.assign(r, patch);
    save();
    for (const fn of listeners) { try { fn(r); } catch (e) { console.error(e); } }
    return r;
  }

  // Merge entries from another device. Unknown ids are added; the list stays in time order.
  function merge(entries) {
    const list = load();
    const have = new Set(list.map(r => r.id));
    let n = 0;
    for (const e of entries) {
      if (!e || !e.id || have.has(e.id)) continue;
      list.push(e); have.add(e.id); n++;
      if (e.routineCompleted && e.day) loadDays().add(e.day);
    }
    if (n) { list.sort((a, b) => a.ts - b.ts); trim(list); save(); saveDays(); }
    return n;
  }

  function onAdd(fn) { listeners.push(fn); }

  function forKey(key) { return load().filter(r => r.key === key && r.score !== null && r.score !== undefined); }

  function best(key, metric, lower) {
    const runs = forKey(key).filter(r => !r.warmup && r[metric] !== null && r[metric] !== undefined);
    if (!runs.length) return null;
    return runs.reduce((b, r) => (lower ? r[metric] < b[metric] : r[metric] > b[metric]) ? r : b);
  }

  function completionDays() { return [...loadDays()].sort(); }

  function clear() { cache = []; save(); days = new Set(); saveDays(); }

  return { add, update, merge, onAdd, all: load, forKey, best, runsToday, minutesToday, isWarmup, dayKey, today, completionDays, clear };
})();
