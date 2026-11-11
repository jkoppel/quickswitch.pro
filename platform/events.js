// Product analytics, batched to our own /api/e and mirrored to PostHog and GA (platform/analytics.js).
window.ST = window.ST || {};

ST.events = (function () {
  const ANON_KEY = 'st.anonId';
  let anonId = null;
  try { anonId = localStorage.getItem(ANON_KEY); } catch (e) { /* ignore */ }
  if (!anonId) { anonId = ST.uuid(); try { localStorage.setItem(ANON_KEY, anonId); } catch (e) { /* ignore */ } }

  let queue = [];
  let timer = null;

  // Automated browsers (deploy screenshotters, our own e2e runs) and anyone who opted out with
  // localStorage 'st.noTrack' stay out of the funnel.
  let off = !!navigator.webdriver;
  try { off = off || !!localStorage.getItem('st.noTrack'); } catch (e) { /* ignore */ }

  function track(name, props) {
    if (off) return;
    if (ST.analytics) ST.analytics.capture(name, props);
    queue.push({ name, props: props || {}, ts: new Date().toISOString() });
    if (queue.length >= 50) flush();
    else if (!timer) timer = setTimeout(flush, 4000);
  }

  function flush(useBeacon) {
    clearTimeout(timer); timer = null;
    if (!queue.length || !ST.api.available()) return;
    const batch = queue.splice(0, 50);
    const body = JSON.stringify({ anonId, events: batch });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/e', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/e', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }

  // Events queued before the health check answered are sent once it does, or dropped if it never does.
  ST.api.ready.then((h) => { if (h) flush(); else queue = []; });
  addEventListener('pagehide', () => flush(true));
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });

  // Uncaught errors become events, so a broken screen shows up without anyone reporting it.
  let errors = 0;
  addEventListener('error', (e) => {
    if (errors++ > 20) return;
    track('error', { message: String(e.message || '').slice(0, 300), source: String(e.filename || '').split('/').pop(), line: e.lineno, col: e.colno });
  });
  addEventListener('unhandledrejection', (e) => {
    if (errors++ > 20) return;
    const r = e.reason;
    track('error', { message: String((r && r.message) || r || '').slice(0, 300), kind: 'rejection' });
  });

  return { track, flush, anonId: () => anonId };
})();
