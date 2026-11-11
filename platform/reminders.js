// Opt-in web push reminders: "warm up before you queue" at the hour you usually practise, and a
// nudge in the evening if the streak is at risk. Set up at the end of the diagnostic, with the week
// plan; otherwise offered on the home screen from the second practice day. The browser's
// permission prompt appears only after a click.
window.ST = window.ST || {};

ST.reminders = (function () {
  const { esc } = ST.ui;
  const KEY = 'st.reminder';   // { on, hour } or { dismissed: true }
  const ls = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

  // The median local hour of past runs, so the default is when this player actually practises.
  function usualHour() {
    const hours = ST.history.all().map(r => new Date(r.ts).getHours()).sort((a, b) => a - b);
    return hours.length ? hours[Math.floor(hours.length / 2)] : 18;
  }
  const label = (h) => ST.fmt.hour(h);

  function eligible() {
    if (!ST.api.available() || !supported()) return false;
    const st = ls.get();
    if (st.dismissed) return false;
    if (st.on) return true;
    // Day 2 or later: at least one earlier day with a finished routine.
    return ST.history.completionDays().some(d => d < ST.history.today());
  }

  function renderCard(el) {
    if (!eligible()) { el.classList.add('hidden'); return; }
    const st = ls.get();
    el.classList.remove('hidden');
    if (st.on) {
      el.className = 'card slim';
      el.innerHTML = `<span>Reminder on at ${label(st.hour)}.</span> <button class="link" type="button" data-rem="off">Turn off</button>`;
    } else {
      const h = usualHour();
      el.className = 'card';
      el.innerHTML = `<p class="card-title">Get a reminder to warm up before you queue</p>
        <div class="card-row">
          <label class="inline">At <select data-rem-hour aria-label="Reminder hour">${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${i === h ? 'selected' : ''}>${label(i)}</option>`).join('')}</select></label>
          <button class="secondary small" type="button" data-rem="on">Remind me</button>
          <button class="ghost" type="button" data-rem="no">No thanks</button>
        </div>
        <p class="field-hint">One notification a day, only if you have not practised yet. Turn it off any time.</p>`;
    }
    el.onclick = async (e) => {
      const b = e.target.closest('[data-rem]');
      if (!b) return;
      const act = b.dataset.rem;
      if (act === 'no') { ls.set({ dismissed: true }); renderCard(el); return; }
      b.disabled = true;
      try {
        if (act === 'on') await enable(Number(el.querySelector('[data-rem-hour]').value));
        else await disable();
      } catch (err) {
        ST.ui.toast(err && err.message === 'denied' ? 'Notifications are blocked for this site in your browser settings.' : 'Could not set up reminders.');
      }
      b.disabled = false;
      renderCard(el);
    };
  }

  function keyBytes(b64) {
    const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }

  async function enable(hour) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('denied');
    await ST.account.ensureSession();
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const { publicKey } = await ST.api.get('/api/push/key');
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    await ST.api.post('/api/push/subscribe', { subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, remindHour: hour });
    ls.set({ on: true, hour });
    ST.events.track('reminder_opt_in', { hour });
    ST.ui.toast(`Reminder set for ${label(hour)}.`);
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) {
      await ST.api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    ls.set({ dismissed: true });
  }

  return { renderCard, usualHour, enable, label, supported, state: () => ls.get() };
})();
