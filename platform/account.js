// Who is playing. Everyone starts as a guest in this browser; the server creates an anonymous user
// the first time it needs one, and signing in (email code or Discord) attaches a credential to it so
// the streak and history survive a cleared browser or a new device.
window.ST = window.ST || {};

ST.account = (function () {
  const { esc } = ST.ui;
  let user = null;
  const listeners = [];
  let sessionPromise = null;

  function set(u) {
    const was = user;
    user = u || null;
    if (ST.analytics && user) ST.analytics.identify(user.id);
    try {
      const lastKind = localStorage.getItem('st.lastKind');
      if (user && user.kind === 'member' && lastKind === 'anon') {
        ST.events.track('signup', { method: user.signIn && user.signIn.discord ? 'discord' : 'email' });
      }
      if (user) localStorage.setItem('st.lastKind', user.kind);
    } catch (e) { /* ignore */ }
    for (const fn of listeners) { try { fn(user, was); } catch (e) { console.error(e); } }
    syncTimeZone();
  }

  // The server draws day boundaries (public streaks, reminders) in the player's own time zone.
  let tzSent = null;
  function syncTimeZone() {
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return; }
    if (!user || !tz || user.tz === tz || tzSent === user.id) return;
    tzSent = user.id;
    ST.api.patch('/api/me', { tz }).then((r) => { if (r && r.user) user = r.user; }).catch(() => { tzSent = null; });
  }
  function onChange(fn) { listeners.push(fn); }

  async function init() {
    const h = await ST.api.ready;
    if (!h) return null;
    try { const r = await ST.api.get('/api/me'); set(r.user); } catch (e) { set(null); }
    return user;
  }

  async function refresh() {
    if (!ST.api.available()) return user;
    try { const r = await ST.api.get('/api/me'); set(r.user); } catch (e) { /* keep what we have */ }
    return user;
  }

  // The server user, created on first need. Every caller shares one in-flight request.
  async function ensureSession() {
    if (user) return user;
    if (!ST.api.available()) return null;
    if (!sessionPromise) {
      sessionPromise = ST.api.post('/api/session').then((r) => { set(r.user); return user; }).finally(() => { sessionPromise = null; });
    }
    return sessionPromise;
  }

  function discordStart() {
    try { localStorage.setItem('st.lastKind', user ? user.kind : 'anon'); } catch (e) { /* ignore */ }
    location.href = '/api/auth/discord/start?return=' + encodeURIComponent(location.pathname + location.search);
  }

  async function logout() {
    try { await ST.api.post('/api/auth/logout'); } catch (e) { /* ignore */ }
    try { localStorage.removeItem('st.syncedUser'); } catch (e) { /* ignore */ }
    if (ST.analytics) ST.analytics.reset();
    set(null);
  }

  // ---------- the sign-in sheet ----------
  function openSheet(reason) {
    const s = ST.api.signIn();
    const member = user && user.kind === 'member';
    if (member) {
      const has = user.signIn || {};
      ST.ui.openSheet('Account', `
        <p class="desc">Signed in as <b>${esc(user.displayName || user.handle || 'you')}</b>${user.handle ? ` <span class="muted">@${esc(user.handle)}</span>` : ''}.</p>
        <p class="sheet-meta">${user.emailVerified ? `${esc(user.email)} (verified)` : 'No email'} · ${has.discord ? 'Discord linked' : 'Discord not linked'}</p>
        <div class="sheet-actions">
          ${s.email && !user.emailVerified ? '<button class="secondary" data-act="email" type="button">Add and verify an email</button>' : ''}
          ${s.discord && !has.discord ? '<button class="secondary" data-act="discord" type="button">Link Discord</button>' : ''}
          <button class="ghost" data-act="logout" type="button">Sign out</button>
        </div>`, { onAction });
    } else {
      const title = reason === 'first' ? 'Save your streak and history' : reason === 'challenge' ? 'Save your score' : reason === 'plan' ? 'Save your plan' : 'Sign in';
      const lead = reason === 'challenge'
        ? 'Sign in to keep this score, see it next to your friend’s, and start a streak of your own.'
        : reason === 'plan'
          ? 'Your week plan and history live in this browser. Sign in to keep them if it is cleared, and to bring them to another device.'
          : 'Your streak and history live in this browser. Sign in to keep them if it is cleared, and to bring them to another device.';
      // Discord leads once its OAuth app is configured (this audience lives there); until then it
      // shows as coming soon and email is the way in.
      ST.ui.openSheet(title, `
        <p class="desc">${lead}</p>
        <div class="sheet-actions">
          <button class="${s.discord ? 'primary' : 'secondary'}" data-act="discord" type="button"${s.discord ? '' : ' disabled'}>Continue with Discord</button>
          <button class="${s.discord ? 'secondary' : 'primary'}" data-act="email" type="button">Continue with email</button>
        </div>
        ${s.discord ? '' : '<p class="sheet-meta">Discord sign-in is coming soon.</p>'}`,
      { closeLabel: 'Not now', onAction });
    }
  }

  async function onAction(act, b) {
    if (act === 'discord') { discordStart(); return; }
    if (act === 'email') { openEmailSheet('signin'); return; }
    if (act !== 'logout') return;
    b.disabled = true;
    ST.ui.sheetNote('');
    try { await logout(); ST.ui.closeSheet(); ST.ui.toast('Signed out. Runs stay in this browser.'); }
    catch (err) { ST.ui.sheetNote((err && err.message) || 'Something went wrong.', true); }
    finally { b.disabled = false; }
  }

  // ---------- email: a six-digit code, sent and checked by the server ----------
  // Verifying an address is a full sign-in: an address that already belongs to an account switches
  // this browser to that account. Errors come back from the server in plain words; they are shown
  // as they are.
  function openEmailSheet(reason) {
    const unlock = reason === 'unlock';
    const pending = user && user.pendingEmail;
    const title = unlock ? 'Unlock custom settings' : 'Continue with email';
    const lead = unlock
      ? 'Custom weapons, scopes and scenario settings unlock with a verified email. We send a six-digit code; there is no password.'
      : 'We send a six-digit code to your address. No password. If the address already has an account, you are signed in to it.';
    const body = ST.ui.openSheet(title, `
      <p class="desc">${lead}</p>
      <form class="email-step" data-step="address">
        <label>Email <input name="email" type="email" autocomplete="email" inputmode="email" required value="${esc(pending || '')}"></label>
        <div class="row tight"><button class="primary" data-act="send" type="submit">Send code</button></div>
      </form>
      <form class="email-step hidden" data-step="code">
        <p class="sheet-meta" data-sent></p>
        <label>Code <input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required></label>
        <div class="row tight">
          <button class="link" data-act="resend" type="button">Send again</button>
          <button class="link" data-act="change" type="button">Use a different address</button>
          <span class="spacer"></span>
          <button class="primary" data-act="verify" type="submit">Verify</button>
        </div>
      </form>`, { closeLabel: 'Not now' });
    const steps = { address: body.querySelector('[data-step="address"]'), code: body.querySelector('[data-step="code"]') };
    let email = pending || '';
    const showCode = () => {
      steps.address.classList.add('hidden');
      steps.code.classList.remove('hidden');
      steps.code.querySelector('[data-sent]').textContent = `We sent a code to ${email}. It expires in 15 minutes.`;
      steps.code.querySelector('input').focus();
    };
    const run = async (btn, fn) => {
      btn.disabled = true;
      ST.ui.sheetNote('');
      try { await fn(); } catch (err) { ST.ui.sheetNote(sentence(err && err.message), true); }
      finally { btn.disabled = false; }
    };
    const send = (btn) => run(btn, async () => {
      email = steps.address.querySelector('input').value.trim();
      await ensureSession();
      const r = await ST.api.post('/api/auth/email/start', { email });
      email = r.email || email;
      showCode();
    });
    steps.address.addEventListener('submit', (e) => { e.preventDefault(); send(steps.address.querySelector('[data-act="send"]')); });
    steps.code.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = steps.code.querySelector('[data-act="verify"]');
      run(btn, async () => {
        const r = await ST.api.post('/api/auth/email/verify', { code: steps.code.querySelector('input').value });
        try { localStorage.setItem('st.lastKind', 'member'); } catch (err) { /* ignore */ }
        set(r.user);
        ST.events.track('email_verified', { reason: reason || 'signin', merged: !!r.merged });
        ST.ui.closeSheet();
        ST.ui.toast(unlock ? 'Email verified. Custom settings are unlocked.' : r.merged ? 'Signed in. This browser’s runs were added to your account.' : 'Email verified. You are signed in.');
      });
    });
    steps.code.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'resend') send(b).then(() => ST.ui.sheetNote('Sent a new code.'));
      if (b.dataset.act === 'change') { steps.code.classList.add('hidden'); steps.address.classList.remove('hidden'); steps.address.querySelector('input').focus(); }
    });
    if (pending) showCode();
    else steps.address.querySelector('input').focus();
  }
  // Server errors arrive lower-case and unpunctuated ("that code isn’t right"); show them as a sentence.
  function sentence(msg) {
    const m = String(msg || 'Something went wrong').trim();
    return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? '' : '.');
  }

  function avatarUrl(u) { return u && u.avatarUrl ? u.avatarUrl : null; }

  return {
    init, refresh, ensureSession, onChange, openSheet, openEmailSheet, logout, avatarUrl,
    user: () => user,
    isMember: () => !!(user && user.kind === 'member'),
  };
})();
