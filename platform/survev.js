// The player's real survev games, read straight from survev's public stats API in the browser
// (it allows any origin). Ten matches per request; we stay well under its 40-per-minute limit.
window.ST = window.ST || {};

ST.survev = (function () {
  const API = 'https://api.survev.io/api/match_history';
  const SLUG_KEY = 'st.survevSlug';
  const CACHE_KEY = 'st.survevCache';
  const CACHE_MS = 10 * 60000;
  const MAX = 100;
  const GAP_MS = 3100;   // 20 requests a minute at most

  function slug() {
    const u = ST.account && ST.account.user();
    if (u && u.survevSlug) return u.survevSlug;
    try { return localStorage.getItem(SLUG_KEY) || null; } catch (e) { return null; }
  }

  async function page(s, offset) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: s, offset, count: 10, teamModeFilter: 7 }),
    });
    if (!res.ok) throw new Error(`survev answered ${res.status}`);
    const data = await res.json();
    // An unknown name comes back as an empty object rather than an empty list.
    return Array.isArray(data) ? data : null;
  }

  function cached(s) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (c && c.slug === s) return c;
    } catch (e) { /* ignore */ }
    return null;
  }

  // Check a name before saving it: the first page must be a list.
  async function verify(s) {
    const first = await page(s, 0);
    if (first === null) return { ok: false };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ slug: s, at: Date.now(), matches: first, complete: first.length < 10 })); } catch (e) { /* ignore */ }
    return { ok: true, matches: first };
  }

  async function link(s) {
    s = String(s || '').trim();
    if (!s) return { ok: false, error: 'Enter your survev name.' };
    const v = await verify(s);
    if (!v.ok) return { ok: false, error: `survev has no stats for “${s}”. Use the name in your survev.io/stats link.` };
    try { localStorage.setItem(SLUG_KEY, s); } catch (e) { /* ignore */ }
    if (ST.api.available() && ST.account.user()) { try { await ST.api.patch('/api/me', { survevSlug: s }); } catch (e) { /* kept locally */ } }
    ST.events.track('survev_linked');
    return { ok: true };
  }

  function unlink() {
    try { localStorage.removeItem(SLUG_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
    if (ST.api.available() && ST.account.user()) ST.api.patch('/api/me', { survevSlug: null }).catch(() => {});
  }

  // Up to 100 recent matches, newest first. onProgress(matches) fires as pages arrive.
  async function matches(onProgress) {
    const s = slug();
    if (!s) return null;
    const c = cached(s);
    if (c && c.complete && Date.now() - c.at < CACHE_MS) return c.matches;
    let all = [];
    for (let offset = 0; offset < MAX; offset += 10) {
      if (offset) await new Promise(r => setTimeout(r, GAP_MS));
      const p = await page(s, offset);
      if (!p) break;
      all = all.concat(p);
      if (onProgress) onProgress(all);
      if (p.length < 10) break;
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ slug: s, at: Date.now(), matches: all, complete: true })); } catch (e) { /* ignore */ }
    return all;
  }

  // Whatever is cached, without a network call (the results screen must not wait on survev).
  function cachedMatches() { const s = slug(); const c = s && cached(s); return c ? c.matches : null; }

  function routineCompletions() {
    return ST.history.all().filter(r => r.routineCompleted).map(r => r.ts);
  }

  function comparison(list) {
    list = list || cachedMatches();
    if (!list || !list.length) return null;
    return ST.warmup.compareWarmVsCold(list, routineCompletions());
  }

  return { slug, link, unlink, matches, cachedMatches, comparison, routineCompletions };
})();
