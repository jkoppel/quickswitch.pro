// The landing view, by stage (ST.onboarding.stage): a first-timer sees one button, a tested player
// their score and the diagnostic, a planned player today's session and the week, everyone else
// today's five minutes. Works fully offline; account parts appear only when the server answers.
window.ST = window.ST || {};

ST.home = (function () {
  const { $, esc, fmtInt } = ST.ui;
  const STAGES = ['new', 'device', 'tested', 'plan', 'free'];
  const SHORT = { diagnostic: 'Tests', retest: 'Re-test', daily: 'Mix', clicking: 'Click', tracking: 'Track', switching: 'Switch', moving: 'Move', utility: 'Utility', leads: 'Leads', benchmark: 'Bench' };

  function streakNow() {
    return ST.streak.computeStreak(ST.history.completionDays(), ST.history.today());
  }

  function showStage(name) {
    for (const s of STAGES) $('home-' + s).classList.toggle('hidden', s !== name);
    // A first-timer gets the one button and nothing else; links and the footer come with history.
    const first = name === 'new' || name === 'device';
    $('home-links').classList.toggle('hidden', first || name === 'tested');
    $('home-foot').classList.toggle('hidden', first || name === 'tested');
    $('home').dataset.stage = name;
  }

  // "4-day streak · 1,240 points · 310 this week". The streak appears only when there is one.
  function metaLine() {
    const s = streakNow();
    const p = ST.onboarding.points();
    const bits = [];
    if (s.current > 0) bits.push(`<span><b>${s.current}</b>-day streak</span>`);
    if (p.total > 0) bits.push(`<span><b>${fmtInt(p.total)}</b> points</span>`, `<span>${fmtInt(p.week)} this week</span>`);
    return bits.join('<span class="sep" aria-hidden="true">·</span>');
  }

  function render() {
    const stage = ST.onboarding.stage();
    if (stage === 'new') renderNew();
    else if (stage === 'tested') renderTested();
    else if (stage === 'planned') renderPlanned();
    else renderFree();
    renderAccount(stage);
    // The reminder card is for people with a habit to protect; the plan sets its own up.
    if (stage === 'free' || stage === 'planned') ST.reminders.renderCard($('reminder-card'));
    else $('reminder-card').classList.add('hidden');
  }

  function renderNew() {
    if (ST.onboarding.touchOnly()) {
      showStage('device');
      $('btn-remind-desk').classList.toggle('hidden', !(ST.api.available() && ST.reminders.supported()));
      return;
    }
    showStage('new');
    for (const el of document.querySelectorAll('#home-new .signin-only')) el.classList.toggle('hidden', !ST.api.available() || ST.account.isMember());
  }

  function renderTested() {
    showStage('tested');
    const at = ST.onboarding.aimTest();
    const t = ST.tierFor('staticClick', at.score);
    $('tested-score').textContent = fmtInt(at.score);
    $('tested-tier').innerHTML = t ? `<span class="tier ${t.name}" title="Provisional threshold">${t.name}</span>` : '';
  }

  function renderPlanned() {
    showStage('plan');
    const prog = ST.onboarding.progress();
    $('plan-meta').innerHTML = metaLine();
    const today = prog.today;
    const card = $('plan-card');
    if (!today) {
      card.innerHTML = '<p class="plan-title">Your week starts soon</p>';
    } else if (today.routine === 'retest' && today.done && today.n === prog.days.length) {
      card.innerHTML = `<p class="plan-title">Week done</p><p class="plan-why">Your re-test is in. See how the week went, and plan the next one.</p>
        <button class="primary today" data-primary data-plan="measured" type="button">See your week</button>`;
    } else if (today.done) {
      const next = prog.days.find(d => d.n === today.n + 1);
      card.innerHTML = `<p class="plan-title">Day ${today.n} done</p>
        <p class="plan-why">${next ? `Tomorrow: ${esc(ST.onboarding.routineName(next.routine))}.` : 'That was the last day of the week.'}</p>
        <button class="secondary" data-plan="more" type="button">Train more</button>`;
    } else {
      const mins = ST.onboarding.routineMinutes(today.routine);
      card.innerHTML = `<p class="plan-title">Day ${today.n}: ${esc(ST.onboarding.routineName(today.routine))}</p>
        <p class="plan-why">${mins} minute${mins === 1 ? '' : 's'}. ${esc(today.why)}.</p>
        <button class="primary today" data-primary data-plan="start" data-routine="${esc(today.routine)}" type="button">Start</button>`;
    }
    $('plan-strip').innerHTML = prog.days.map(d => {
      const state = d.done ? 'done' : d === today ? 'today' : d.day < ST.history.today() ? 'missed' : '';
      const name = ST.onboarding.routineName(d.routine);
      return `<li class="${state}" title="Day ${d.n}: ${esc(name)}${d.done ? ', done' : state === 'missed' ? ', missed' : ''}"><b>${d.n}</b><span>${esc(SHORT[d.routine] || name)}</span></li>`;
    }).join('');
    $('btn-getplan').classList.add('hidden');
  }

  function renderFree() {
    showStage('free');
    const s = streakNow();
    $('free-meta').innerHTML = metaLine();
    $('free-meta').classList.toggle('hidden', !$('free-meta').innerHTML);
    $('home').classList.toggle('practiced', s.practicedToday);
    $('btn-today').textContent = s.practicedToday ? "Run today's 5 again" : "Start today's 5";
    $('today-sub').textContent = s.practicedToday
      ? `Done for today${s.current > 1 ? `: ${s.current} days in a row` : ''}. Another round still earns practice points.`
      : 'Warm up before you queue: a 30-second warm-up, then six adaptive drills. Five minutes.';
    $('btn-getplan').classList.remove('hidden');
  }

  function renderAccount(stage) {
    const btn = $('btn-account');
    const up = ST.api.available();
    // A first-timer signs in from the quiet line under the button, not the corner.
    btn.classList.toggle('hidden', !up || stage === 'new');
    const u = ST.account.user();
    const member = ST.account.isMember();
    if (member) {
      const av = ST.account.avatarUrl(u);
      btn.innerHTML = `${av ? `<img src="${esc(av)}" alt="" width="22" height="22">` : ''}<span>${esc(u.handle && !/^p_/.test(u.handle) ? '@' + u.handle : (u.displayName || 'Account'))}</span>`;
    } else btn.textContent = 'Sign in';
    $('home-data-note').textContent = !up ? 'Data stays in this browser.'
      : member ? 'Synced to your account.'
      : 'Saved in this browser.';
  }

  function start(app) {
    $('btn-aimtest').addEventListener('click', () => ST.onboarding.startAimTest());
    $('btn-diagnostic').addEventListener('click', () => ST.onboarding.startDiagnostic());
    $('btn-today').addEventListener('click', () => { ST.events.track('routine_start', { routine: 'daily', from: 'home' }); app.startRoutine('daily'); });
    $('btn-all').addEventListener('click', () => ST.router.go('/?drills'));
    $('btn-profile').addEventListener('click', () => ST.router.go('/profile'));
    $('btn-getplan').addEventListener('click', () => {
      // A plan needs an aim test for Clicking; without one, the test comes first.
      if (ST.onboarding.aimTest()) ST.onboarding.startDiagnostic(); else ST.onboarding.startAimTest();
    });
    $('btn-account').addEventListener('click', () => ST.account.openSheet());
    $('btn-remind-desk').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try { await ST.reminders.enable(18); b.textContent = `Reminder set for ${ST.fmt.hour(18)}`; }
      catch (err) { b.disabled = false; ST.ui.toast(err && err.message === 'denied' ? 'Notifications are blocked for this site.' : 'Could not set a reminder.'); }
    });
    $('home').addEventListener('click', (e) => {
      if (e.target.closest('[data-skip]')) { ST.onboarding.skip(); return; }
      if (e.target.closest('[data-signin]')) { ST.account.openSheet(); return; }
      if (e.target.closest('[data-tryanyway]')) { ST.onboarding.allowDevice(); render(); return; }
      const p = e.target.closest('[data-plan]');
      if (!p) return;
      if (p.dataset.plan === 'start') { ST.events.track('routine_start', { routine: p.dataset.routine, from: 'plan' }); app.startRoutine(p.dataset.routine); }
      else if (p.dataset.plan === 'more') ST.router.go('/?drills');
      else if (p.dataset.plan === 'measured') ST.onboarding.showMeasured();
    });
    $('plan-strip').addEventListener('click', () => ST.onboarding.showCurrentPlan());
    ST.account.onChange(() => { if (app.current() === 'home') render(); });
    ST.sync.onPulled(() => { if (app.current() === 'home') render(); });
  }

  return { render, start, streakNow };
})();
