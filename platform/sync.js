// Keeps localStorage history and the server in step. Local history is always the source the game
// reads; the server is the copy that survives a cleared browser and follows the player to a new device.
window.ST = window.ST || {};

ST.sync = (function () {
  const UNSYNCED = 'st.unsynced';
  const SYNCED_USER = 'st.syncedUser';
  const PULLED_AT = 'st.pulledAt';
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  let pushing = false, again = false;
  let timer = null;
  const listeners = [];

  function markUnsynced(ids) {
    const set = new Set(ls.get(UNSYNCED, []));
    for (const id of ids) set.add(id);
    ls.set(UNSYNCED, [...set]);
  }

  // Server rows come back as history entries keyed by the client's id; timestamps may be ISO.
  function normalize(r) {
    const e = { ...r };
    if (typeof e.ts === 'string') e.ts = Date.parse(e.ts);
    if (!e.day && e.ts) e.day = ST.history.dayKey(e.ts);
    return e;
  }

  async function push() {
    if (!ST.api.available()) return;
    if (pushing) { again = true; return; }
    pushing = true;
    try {
      const user = await ST.account.ensureSession();
      if (!user) return;
      let ids = ls.get(UNSYNCED, []);
      while (ids.length) {
        const wanted = new Set(ids.slice(0, 200));
        const batch = ST.history.all().filter(r => wanted.has(r.id));
        if (batch.length) await ST.api.post('/api/runs', { runs: batch });
        const left = new Set(ls.get(UNSYNCED, []));
        for (const id of wanted) left.delete(id);
        ids = [...left];
        ls.set(UNSYNCED, ids);
      }
    } catch (e) {
      console.warn('[sync] push failed', e);
    } finally {
      pushing = false;
      if (again) { again = false; schedule(); }
    }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(push, 400); }

  async function pull() {
    if (!ST.api.available() || !ST.account.user()) return 0;
    const since = ls.get(PULLED_AT, null);
    try {
      const r = await ST.api.get('/api/runs' + (since ? '?since=' + encodeURIComponent(since) : ''));
      const n = ST.history.merge((r.runs || []).map(normalize));
      ls.set(PULLED_AT, new Date(Date.now() - 60000).toISOString());
      if (n) for (const fn of listeners) fn(n);
      return n;
    } catch (e) { console.warn('[sync] pull failed', e); return 0; }
  }

  // A new user on this browser (first session, sign-in, or a merge into another account): upload
  // everything local, then fetch whatever the account already had.
  async function onUser(user) {
    if (!user) return;
    if (ls.get(SYNCED_USER, null) !== user.id) {
      markUnsynced(ST.history.all().map(r => r.id));
      ls.set(SYNCED_USER, user.id);
      ls.set(PULLED_AT, null);
    }
    await push();
    await pull();
  }

  function start() {
    ST.history.onAdd((entry) => { markUnsynced([entry.id]); schedule(); });
    ST.account.onChange((u, was) => { if (u && (!was || was.id !== u.id || was.kind !== u.kind)) onUser(u); });
  }

  return { start, push, pull, onPulled: (fn) => listeners.push(fn) };
})();
