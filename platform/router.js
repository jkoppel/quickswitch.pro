// pushState routes: /, /play/<routine>, /results, /profile, /u/<handle>, /c/<id>. Opened from disk
// there is no history to push, so routes become plain view switches.
window.ST = window.ST || {};

ST.router = (function () {
  const served = /^https?:$/.test(location.protocol);
  const routes = [];
  let guard = null;

  // pattern: '/u/:handle'. Handlers receive the params and the query.
  function on(pattern, fn) {
    const names = [];
    const re = new RegExp('^' + pattern.replace(/:[a-z]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
    routes.push({ re, names, fn });
  }

  function dispatch(path, query) {
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      const params = {};
      r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      r.fn(params, query || new URLSearchParams());
      return true;
    }
    return false;
  }

  function split(url) {
    const u = new URL(url, location.origin === 'null' ? 'http://local/' : location.origin);
    return { path: u.pathname, query: u.searchParams, full: u.pathname + u.search };
  }

  // Navigate: update the address bar and show the view.
  function go(url, opts = {}) {
    const { path, query, full } = split(url);
    if (served && full !== location.pathname + location.search) history[opts.replace ? 'replaceState' : 'pushState']({}, '', full);
    dispatch(path, query);
  }
  // Record where we are without re-rendering (a view the app already showed, like results).
  function set(url, opts = {}) {
    if (!served) return;
    const { full } = split(url);
    if (full !== location.pathname + location.search) history[opts.replace ? 'replaceState' : 'pushState']({}, '', full);
  }

  // While a drill runs, Back pauses it instead of yanking the canvas away.
  function setGuard(fn) { guard = fn; }

  function start() {
    addEventListener('popstate', () => {
      if (guard && guard()) { history.pushState({}, '', location.pathname + location.search); return; }
      dispatch(location.pathname, new URLSearchParams(location.search));
    });
    const here = served ? location.pathname : '/';
    if (!dispatch(here, new URLSearchParams(served ? location.search : ''))) go('/', { replace: true });
  }

  function path() { return served ? location.pathname : '/'; }

  return { on, go, set, start, setGuard, path };
})();
