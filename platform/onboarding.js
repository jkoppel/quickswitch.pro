// The first run, staged: a 30-second aim test, a message about it, an optional five-test diagnostic,
// then a week plan with a daily reminder. Each stage can be skipped for the full trainer. The stage
// is derived from history and the stored plan, never stored itself, so clearing either resets
// cleanly. Spec: platform/ONBOARDING.md.
window.ST = window.ST || {};

ST.onboarding = (function () {
  const { $, esc, fmtInt } = ST.ui;
  const PLAN_KEY = 'st.plan';
  const SKIP_KEY = 'st.skipOnboarding';
  const BRIEFED_KEY = 'st.briefed';
  const DEVICE_KEY = 'st.deviceOk';
  const AIM_SEED = 1100;   // the re-test replays the aim test's spawns (js/benchmark.js)
  const ls = {
    get(k) { try { const v = localStorage.getItem(k); return v === null ? null : JSON.parse(v); } catch (e) { return null; } },
    set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  let app = null;
  let shownSeq = null;     // the sequence whose test screen is up, for "See details"

  const track = (step, extra) => ST.events.track('onboarding_step', { step, ...(extra || {}) });

  // ---------- plan ----------
  function getPlan() { return ls.get(PLAN_KEY); }
  async function setPlan(plan) {
    ls.set(PLAN_KEY, plan);
    if (!ST.api.available()) return;
    try {
      await ST.account.ensureSession();
      await ST.api.patch('/api/me', { plan });
    } catch (e) { console.warn('[plan] could not save to the account', e); }
  }
  // A new device takes the account's plan; an account without one takes this browser's.
  function reconcile(user) {
    if (!user) return;
    const local = getPlan();
    if (user.plan && (!local || user.plan.startDay > local.startDay)) { ls.set(PLAN_KEY, user.plan); return true; }
    if (local && (!user.plan || local.startDay > user.plan.startDay)) ST.api.patch('/api/me', { plan: local }).catch(() => {});
    return false;
  }

  function routineName(id) {
    const r = ST.ROUTINES.find(x => x.id === id);
    return r ? r.name : id;
  }
  function routineMinutes(id) {
    const r = ST.ROUTINES.find(x => x.id === id);
    return r && r._seconds ? Math.max(1, Math.round(r._seconds / 60)) : 5;
  }

  function progress() {
    const plan = getPlan();
    return plan ? ST.plan.progress(plan, ST.history.all(), ST.history.today()) : null;
  }

  // ---------- stage ----------
  function stage() {
    const p = progress();
    if (p && !p.over) return 'planned';
    if (ls.get(SKIP_KEY)) return 'free';
    const runs = ST.history.all();
    if (!runs.some(r => r.score !== null && r.score !== undefined)) return 'new';
    if (aimTest()) return p ? 'free' : 'tested';
    return 'free';
  }
  // The most recent aim test, if any: a run recorded as the aim test.
  function aimTest() {
    const runs = ST.history.all();
    for (let i = runs.length - 1; i >= 0; i--) if (runs[i].test === 'aim' && runs[i].score !== null) return runs[i];
    return null;
  }
  function skip() {
    ls.set(SKIP_KEY, true);
    track('skipped');
    ST.router.go('/?drills');
  }

  // Phones and tablets: survev's mobile mode exists, but this trainer is mouse and keyboard.
  function touchOnly() {
    return !ls.get(DEVICE_KEY) && window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches;
  }
  function allowDevice() { ls.set(DEVICE_KEY, true); }

  function points() {
    return ST.points.evaluate(ST.history.all(), { plan: getPlan(), today: ST.history.today() });
  }

  // ---------- starting the tests ----------
  function startAimTest() {
    track('aim_test_start');
    app.startScenario('staticClick', { seed: AIM_SEED, test: 'aim' });
  }
  function startDiagnostic() {
    track('diagnostic_start');
    app.startRoutine('diagnostic');
  }

  // ---------- briefing, before a player's first ever drill ----------
  function briefing(step, go) {
    if (ST.history.all().length || ls.get(BRIEFED_KEY)) return false;
    const s = step.settings;
    const seq = app.lastSequence();
    const moving = s.behavior === 'flee' || s.enemyShoots;
    const what = step.scenario === 'staticClick'
      ? 'Three targets at a time. Hit as many as you can in 30 seconds. Misses cost you.'
      : (step.tip || '');
    $('brief-title').textContent = seq && seq.test === 'aim' ? 'Aim test' : step.label;
    $('brief-list').innerHTML = [
      '<li><b>Mouse</b> to aim, <b>click</b> to shoot.</li>',
      what ? `<li>${esc(what)}</li>` : '',
      moving ? '<li><b>W A S D</b> to move.</li>' : '',
      '<li><b>Esc</b> pauses.</li>',
    ].join('');
    $('brief-go').onclick = () => { ls.set(BRIEFED_KEY, true); go(); };
    app.show('brief');
    $('brief-go').focus();
    return true;
  }

  // ---------- the aim test's result ----------
  function showAimResult(seq) {
    const e = seq.results[0];
    const r = e.result;
    const t = ST.tierFor('staticClick', r.score);
    $('at-score').textContent = fmtInt(r.score);
    // Three short facts and nothing else: the coaching lives one click away under "See details".
    $('at-tier').innerHTML = `${esc(t.name)} tier <span class="muted">(provisional)</span>`;
    $('at-line').textContent = `${ST.fmt.int(r.hits)} hit${r.hits === 1 ? '' : 's'} in 30 seconds, ${ST.fmt.pct(r.accuracy)} accurate.`;
    shownSeq = seq;
    track('aim_test_done', { score: Math.round(r.score), tier: t.name });
    app.show('aimtest');
    $('at-next').focus();
  }

  // ---------- the diagnostic's result: skills and the week ----------
  function levelsFrom(entries) {
    return ST.plan.skillLevels(entries.filter(x => x.recorded && x.scenario).map(x => ({ scenario: x.scenario, score: x.result.score })), ST.SCENARIOS);
  }
  function tierOf(frac) {
    let t = ST.TIERS[0];
    for (const x of ST.TIERS) if (frac >= x.min) t = x;
    return t;
  }
  function skillBars(levels, before) {
    const order = ['Clicking', 'Tracking', 'Switching', 'Moving'].filter(c => c in levels);
    // Bars run to the top tier's threshold and stop there; past it is still "Master".
    return order.map(c => {
      const f = levels[c];
      const pct = Math.max(2, Math.min(100, f / 0.95 * 100));
      const delta = before && before[c] ? (f - before[c]) / before[c] * 100 : null;
      const d = delta === null ? '' : ` <span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : '−'}${ST.fmt.pct(Math.abs(delta) / 100)}</span>`;
      return `<li><span class="skill-name">${c}</span><span class="bar" role="img" aria-label="${c}: ${ST.fmt.pct(f)} of the reference score"><span style="width:${pct.toFixed(1)}%"></span></span><span class="skill-tier">${tierOf(f).name}${d}</span></li>`;
    }).join('');
  }
  function weekRows(plan, prog) {
    const days = prog ? prog.days : plan.days;
    const today = ST.history.today();
    return days.map(d => {
      const state = d.done ? 'done' : d.day < today ? 'missed' : d.day === today ? 'today' : '';
      return `<li class="${state}"><span class="wl-day">Day ${d.n}</span><span class="wl-name">${esc(routineName(d.routine))}</span><span class="wl-why">${esc(d.why)}</span><span class="wl-state">${d.done ? 'Done' : state === 'missed' ? 'Missed' : ''}</span></li>`;
    }).join('');
  }

  function remindAction() {
    const el = $('pl-action');
    const note = $('pl-note');
    const st = ST.reminders.state();
    note.textContent = '';
    note.classList.remove('warn');
    const done = () => {
      el.innerHTML = '<button class="primary" data-primary type="button" data-pl="home">Done</button>';
    };
    if (st.on) { note.textContent = `Your daily reminder is set for ${ST.reminders.label(st.hour)}.`; done(); return; }
    if (!ST.api.available() || !ST.reminders.supported()) {
      note.textContent = 'Daily reminders need notifications, which this browser can’t do here. Come back to this page and today’s session is on the home screen.';
      done(); return;
    }
    const now = new Date().getHours();
    const h = Math.max(18, now);
    el.innerHTML = `<label class="inline">Remind me each day at <select id="pl-hour" aria-label="Reminder hour">${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${i === h ? 'selected' : ''}>${ST.reminders.label(i)}</option>`).join('')}</select></label>
      <button class="primary" data-primary type="button" data-pl="remind">Set my daily reminder</button>`;
    note.textContent = 'One notification a day, only if you haven’t trained yet. Turn it off any time.';
  }

  function showPlan(plan, opts = {}) {
    const measured = !!opts.measured;
    const levels = measured ? opts.levels : plan.levels;
    const ranked = ST.plan.rank(levels);
    $('pl-title').textContent = measured ? 'Your week, measured' : 'Your aim';
    if (measured) {
      // The bars carry the per-skill change; the line says what it is measured against.
      $('pl-sub').textContent = opts.before ? 'Against day 1, on the same tests and the same spawns.' : 'Same tests, same spawns as day 1.';
    } else {
      $('pl-sub').textContent = ranked.length > 1 ? `Strongest: ${ranked[ranked.length - 1]}. Work on: ${ranked[0]}.` : '';
    }
    $('pl-skills').innerHTML = skillBars(levels, measured ? opts.before : null);
    const showWeek = !measured;
    $('pl-week-title').classList.toggle('hidden', !showWeek);
    $('pl-week').classList.toggle('hidden', !showWeek);
    if (showWeek) $('pl-week').innerHTML = weekRows(plan, ST.plan.progress(plan, ST.history.all(), ST.history.today()));
    if (measured) {
      $('pl-action').innerHTML = '<button class="primary" data-primary type="button" data-pl="next">Plan next week</button>';
      $('pl-note').textContent = 'The next week is built from today’s results.';
    } else remindAction();
    const offerSave = ST.api.available() && !ST.account.isMember();
    $('pl-save').classList.toggle('hidden', !offerSave);
    $('pl-save-sep').classList.toggle('hidden', !offerSave);
    $('pl-details').classList.toggle('hidden', !opts.seq);
    $('pl-details-sep').classList.toggle('hidden', !opts.seq);
    shownSeq = opts.seq || null;
    app.show('plan');
    const primary = $('pl-action').querySelector('[data-primary]');
    if (primary) primary.focus();
  }

  async function onPlanAction(act, b) {
    if (act === 'home') { ST.router.go('/'); return; }
    if (act === 'remind') {
      b.disabled = true;
      const hour = Number($('pl-hour').value);
      try {
        await ST.reminders.enable(hour);
        track('reminder_set', { hour });
        remindAction();
        $('pl-note').textContent = `Reminder set for ${ST.reminders.label(hour)}.`;
        const p = $('pl-action').querySelector('[data-primary]');
        if (p) p.focus();
      } catch (err) {
        b.disabled = false;
        $('pl-note').textContent = err && err.message === 'denied'
          ? 'Notifications are blocked for this site in your browser settings. Today’s session will be on the home screen when you come back.'
          : 'Could not set up the reminder. Try again in a moment.';
        $('pl-note').classList.add('warn');
      }
      return;
    }
    if (act === 'next') {
      const measured = lastMeasured;
      if (!measured) return;
      const plan = ST.plan.buildPlan(measured, ST.history.today());
      // The re-test just run is this week's first day; nothing to re-run tomorrow.
      plan.days[0] = { ...plan.days[0], routine: 'retest', why: 'Where you stand now' };
      await setPlan(plan);
      track('plan_created', { week: 'next' });
      showPlan(plan);
    }
  }

  // ---------- results intercept ----------
  let lastMeasured = null;
  function intercept(seq) {
    if (seq.test === 'aim' && seq.results.length === 1 && seq.results[0].recorded) { showAimResult(seq); return true; }
    if (seq.test === 'diagnostic' && seq.completed) {
      // The aim test fills in Clicking alongside dynamic clicking, if there is one to use.
      const at = aimTest();
      const entries = seq.results.slice();
      if (at) entries.push({ recorded: true, scenario: 'staticClick', result: { score: at.score } });
      const levels = levelsFrom(entries);
      const plan = ST.plan.buildPlan(levels, ST.history.today());
      setPlan(plan);
      track('diagnostic_done');
      track('plan_created', { week: 'first' });
      showPlan(plan, { seq });
      return true;
    }
    if (seq.test === 'retest' && seq.completed) {
      const plan = getPlan();
      lastMeasured = levelsFrom(seq.results);
      showPlan(plan, { measured: true, levels: lastMeasured, before: plan ? plan.levels : null, seq });
      return true;
    }
    return false;
  }

  // Day 7's comparison again, from the home screen: the latest re-test result for each scenario.
  function showMeasured() {
    const plan = getPlan();
    const latest = {};
    for (const r of ST.history.all()) if (r.test === 'retest' && r.scenario && r.score !== null) latest[r.scenario] = r;
    const entries = Object.values(latest).map(r => ({ recorded: true, scenario: r.scenario, result: { score: r.score } }));
    if (!plan || !entries.length) { showCurrentPlan(); return; }
    lastMeasured = levelsFrom(entries);
    showPlan(plan, { measured: true, levels: lastMeasured, before: plan.levels });
  }

  // The plan screen for the current plan (from the home screen's week strip, or a reload).
  function showCurrentPlan() {
    const plan = getPlan();
    if (plan) showPlan(plan); else ST.router.go('/');
  }

  function start(appRef) {
    app = appRef;
    app.registerScreen('aimtest', $('aimtest'), { backdrop: true });
    app.registerScreen('plan', $('plan'), { backdrop: true });
    app.registerScreen('brief', $('brief'), { backdrop: true });
    app.setBriefing(briefing);
    app.setResultsIntercept(intercept);

    $('at-next').addEventListener('click', startDiagnostic);
    $('at-later').addEventListener('click', () => ST.router.go('/'));
    $('at-details').addEventListener('click', () => app.showClassicResults());
    $('pl-later').addEventListener('click', () => ST.router.go('/'));
    $('pl-details').addEventListener('click', () => app.showClassicResults());
    $('pl-save').addEventListener('click', () => ST.account.openSheet('plan'));
    $('pl-action').addEventListener('click', (e) => { const b = e.target.closest('[data-pl]'); if (b) onPlanAction(b.dataset.pl, b); });

    // The advanced gate: locked while the backend is up and the account has no verified email.
    app.setGate(() => ST.api.available() && !(ST.account.user() && ST.account.user().emailVerified));
    app.on('gate-click', (id) => { ST.events.track('advanced_locked_click', { drill: id }); ST.account.openEmailSheet('unlock'); });
    ST.account.onChange((u) => {
      if (reconcile(u) && app.current() === 'home') ST.home.render();
      if (app.current() === 'menu') app.refreshPicker();
    });
    ST.api.ready.then(() => { if (app.current() === 'menu') app.refreshPicker(); });
  }

  return {
    start, stage, getPlan, setPlan, progress, aimTest, points, skip, touchOnly, allowDevice,
    startAimTest, startDiagnostic, showCurrentPlan, showMeasured, routineName, routineMinutes,
  };
})();
