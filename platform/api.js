// The trainer's backend, if there is one. Opened from disk or a plain static server, /api/health
// does not answer and every platform feature that needs the server stays hidden.
window.ST = window.ST || {};

ST.api = (function () {
  const served = /^https?:$/.test(location.protocol);
  let health = null;

  // Resolves once, to { ok, signIn } or null. 1.5 s is the most the home screen will wait.
  const ready = !served ? Promise.resolve(null) : (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch('/api/health', { signal: ctrl.signal, credentials: 'include' });
      clearTimeout(t);
      if (!res.ok) return null;
      const body = await res.json();
      health = body && body.ok ? body : null;
      return health;
    } catch (e) { return null; }
  })();

  async function call(method, path, body) {
    const res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    ready,
    available: () => !!health,
    signIn: () => (health && health.signIn) || { discord: false, email: false },
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b === undefined ? {} : b),
    patch: (p, b) => call('PATCH', p, b),
  };
})();
