// Progress: your own (/profile, drawn from local history so it works offline) and anyone's public
// page (/u/<handle>, from the server). Growth over time, honestly labelled.
window.ST = window.ST || {};

ST.profile = (function () {
  const { $, esc, fmtInt } = ST.ui;
  const F = ST.fmt;
  const tip = () => document.getElementById('tip');
  const benchScenarios = () => Object.entries(ST.SCENARIOS).filter(([, sc]) => sc.ref).map(([id, sc]) => ({ id, name: sc.name, key: `${id}:v${ST.BENCHMARK_VERSION}` }));
  const counted = (r) => !r.warmup && typeof r.score === 'number' && !String(r.key).startsWith('routine:');
  // A chart earns its place only with enough points to draw a line through.
  const MIN_POINTS = 3;
  let mode = 'own';
  let survevLoading = false;

  const vis = (id, on) => $(id).classList.toggle('hidden', !on);
  // Rows are two-column grids; an odd one out takes the full width so nothing hangs alone.
  function layoutRows() {
    for (const id of ['pf-overview', 'pf-charts', 'pf-more']) {
      const row = $(id);
      const vis = [...row.children].filter(c => !c.classList.contains('hidden'));
      row.classList.toggle('hidden', !vis.length);
      for (const c of row.children) c.classList.remove('span');
      if (vis.length % 2 === 1) vis[vis.length - 1].classList.add('span');
    }
  }

  function header(u, own) {
    const av = u && u.avatarUrl;
    $('pf-avatar').innerHTML = av ? `<img class="avatar" src="${esc(av)}" alt="" width="44" height="44">` : '';
    const member = own && ST.account.isMember();
    $('pf-name').textContent = own ? (member ? (u.displayName || u.handle || 'Progress') : 'Progress') : ST.ui.playerName(u, 'A player');
    $('pf-sub').innerHTML = own
      ? (member ? `${u.handle ? '@' + esc(u.handle) + ' · ' : ''}synced to your account` : (ST.api.available() ? 'Guest · saved in this browser' : 'Saved in this browser'))
      : `@${esc(u.handle)}${u.survevSlug ? ` · <a href="https://survev.io/stats/${encodeURIComponent(u.survevSlug)}" target="_blank" rel="noopener">survev stats</a>` : ''}`;
    const acct = $('pf-account');
    acct.classList.toggle('hidden', !own || !ST.api.available());
    acct.textContent = member ? 'Account' : 'Sign in';
  }

  // ---------- the answer at the top ----------
  // "Are you getting better?" when the history can say so: the mean of a scenario's latest runs
  // (up to three) against its first counted run, on a fixed-difficulty Benchmark scenario that was
  // run on at least two days. The aim test's scenario wins when it qualifies, since everyone has it.
  function improvement(runs) {
    const byKey = new Map();
    for (const sc of benchScenarios()) byKey.set(sc.key, { sc, runs: [] });
    for (const r of runs) if (counted(r) && byKey.has(r.key)) byKey.get(r.key).runs.push(r);
    const ok = [...byKey.values()].filter(x => x.runs.length >= 2 && new Set(x.runs.map(r => r.day)).size >= 2);
    if (!ok.length) return null;
    const pick = ok.find(x => x.sc.id === 'staticClick') || ok.sort((a, b) => b.runs.length - a.runs.length)[0];
    const list = pick.runs.slice().sort((a, b) => a.ts - b.ts);
    const recent = list.slice(1).slice(-3);
    const change = recent.reduce((a, r) => a + r.score, 0) / recent.length / list[0].score - 1;
    return { name: pick.sc.name, change };
  }

  function hero(runs, s, pts) {
    const prog = ST.onboarding.progress();
    const days = new Set(runs.filter(r => r.day).map(r => r.day)).size;
    const imp = improvement(runs);
    let headline, usedStreak = false;
    if (imp && Math.abs(imp.change) >= 0.01) headline = `${imp.name} ${imp.change > 0 ? 'up' : 'down'} ${F.pct(Math.abs(imp.change))} since your first run`;
    else if (imp) headline = `${imp.name} holding steady since your first run`;
    else if (prog && prog.today) headline = `Day ${prog.today.n} of your plan`;
    else if (s.current > 0) { headline = `${s.current}-day streak`; usedStreak = true; }
    else headline = days === 1 ? 'Your first day of practice' : `${F.int(days)} days of practice`;
    const facts = [];
    if (s.current > 0 && !usedStreak) facts.push(`a ${s.current}-day streak`);
    if (pts.total > 0) facts.push(`${F.int(pts.total)} points`);
    let support = facts.length ? `You have ${facts.join(' and ')}.` : '';
    if (prog && prog.today && !prog.over) {
      const next = prog.today.done ? prog.days.find(d => d.n === prog.today.n + 1) : prog.today;
      if (next) support += `${support ? ' ' : ''}${prog.today.done ? 'Next' : 'Today'}: ${ST.onboarding.routineName(next.routine)}.`;
    }
    $('pf-headline').textContent = headline;
    $('pf-support').textContent = support;
    vis('pf-support', !!support);
  }

  function achievementsList(earned) {
    const have = new Map(earned.map(a => [a.id, a]));
    const order = Object.keys(ST.achievements.DEFS);
    const got = order.filter(id => have.has(id));
    const locked = order.filter(id => !have.has(id));
    vis('pf-ach-block', got.length > 0);
    $('pf-achievements').innerHTML = got.map(id => {
      const d = ST.achievements.DEFS[id];
      const a = have.get(id);
      const when = typeof a.earnedAt === 'number' ? a.earnedAt : Date.parse(a.earnedAt);
      return `<li><b>${esc(d.title)}</b><span>${esc(d.desc)}</span><small>${Number.isFinite(when) ? F.date(when) : ''}</small></li>`;
    }).join('');
    const lk = $('pf-locked');
    lk.classList.toggle('hidden', !locked.length);
    lk.querySelector('summary').textContent = `${F.int(locked.length)} still to earn`;
    lk.querySelector('p').textContent = locked.map(id => ST.achievements.DEFS[id].title).join(' · ');
  }

  // Points per day for the last two weeks, once there are at least three days to compare.
  function pointsStrip(pts, today) {
    const byDay = new Map();
    for (const a of pts.awards) byDay.set(a.day, (byDay.get(a.day) || 0) + a.points);
    const days = Array.from({ length: 14 }, (_, i) => ST.streak.addDays(today, i - 13));
    const enough = days.filter(d => byDay.get(d)).length >= MIN_POINTS;
    vis('pf-points-block', enough);
    if (!enough) return;
    const max = Math.max(1, ...days.map(d => byDay.get(d) || 0));
    $('pf-points').innerHTML = days.map((d, i) => {
      const v = byDay.get(d) || 0;
      const h = v ? Math.max(4, Math.round(v / max * 100)) : 0;
      // Day numbers under every other bar keep the axis readable without crowding it.
      const label = d === today || i % 2 === 1 ? F.date(d, 'dayNum') : '';
      return `<li title="${esc(F.date(d))}: ${fmtInt(v)}"${d === today ? ' class="today"' : ''}><span class="pbar" style="height:${h}%"></span><small>${label}</small></li>`;
    }).join('');
    $('pf-points-total').textContent = `${fmtInt(pts.week)} this week`;
  }

  // Best scores, only for scenarios that have one. Tiers stay labelled provisional.
  function bestsTable(bests) {
    const rows = benchScenarios().filter(sc => typeof bests[sc.key] === 'number').map(sc => {
      const t = ST.tierFor(sc.id, bests[sc.key]);
      return `<tr><td>${esc(sc.name)}</td><td>${fmtInt(bests[sc.key])}</td><td>${t ? esc(t.name) : ''}</td></tr>`;
    });
    vis('pf-bests-block', rows.length > 0);
    $('pf-bests').innerHTML = rows.length ? `<tr><th>Scenario</th><th>Best</th><th>Tier <small>provisional</small></th></tr>` + rows.join('') : '';
  }

  // Recent weeks only: six to start, growing with the history up to half a year.
  function calendar(levels, today) {
    const days = [...levels.keys()].sort();
    vis('pf-practice', days.length > 0);
    if (!days.length) return;
    const span = Math.round((F.parseDay(today) - F.parseDay(days[0])) / 86400000);
    const weeks = Math.max(6, Math.min(26, Math.ceil((span + 1) / 7) + 1));
    requestAnimationFrame(() => ST.pcharts.calendar($('pf-calendar'), levels, today, tip(), { weeks }));
  }

  // ---------- own profile ----------
  function renderOwn() {
    mode = 'own';
    const runs = ST.history.all();
    const today = ST.history.today();
    header(ST.account.user(), true);
    renderHandleRow();
    const empty = !runs.length;
    vis('pf-start', empty);
    if (empty) {
      $('pf-headline').textContent = 'Nothing here yet';
      $('pf-support').textContent = 'Your scores, streak and points show up after your first test.';
      vis('pf-support', true);
      for (const id of ['pf-practice', 'pf-bests-block', 'pf-bench-block', 'pf-throughput-block', 'pf-acc-block', 'pf-points-block', 'pf-ach-block', 'pf-survev', 'pf-boards']) vis(id, false);
      layoutRows();
      return;
    }
    const doneDays = ST.history.completionDays();
    const s = ST.streak.computeStreak(doneDays, today);
    const pts = ST.onboarding.points();
    hero(runs, s, pts);

    // Calendar: finished routine = full, practised without finishing = faint.
    const levels = new Map();
    for (const r of runs) if (r.day && !levels.has(r.day)) levels.set(r.day, 1);
    for (const d of doneDays) levels.set(d, 2);
    calendar(levels, today);

    const bests = {};
    for (const sc of benchScenarios()) { const b = ST.history.best(sc.key, 'score'); if (b) bests[sc.key] = b.score; }
    bestsTable(bests);
    pointsStrip(pts, today);
    const benchOn = prepareBench();
    const thrPts = throughputPoints(runs);
    const acc = accuracyWeeks(runs);
    vis('pf-throughput-block', thrPts.length >= MIN_POINTS);
    vis('pf-acc-block', acc.weeks.length >= MIN_POINTS);
    vis('pf-survev', true);
    achievementsList(ST.achievements.evaluate(runs));
    const showBoards = ST.api.available() && !!ST.account.user();
    vis('pf-boards', showBoards);
    if (showBoards) ST.boards.load($('pf-boards-body'));
    layoutRows();
    requestAnimationFrame(() => {
      if (benchOn) drawBench();
      if (thrPts.length >= MIN_POINTS) drawThroughput(thrPts);
      if (acc.weeks.length >= MIN_POINTS) drawAccuracy(acc);
    });
    renderSurvev();
  }

  // Scenarios with enough runs over enough days to draw a trend; the select lists only those.
  function prepareBench() {
    const list = benchScenarios().filter(sc => {
      const rs = ST.history.forKey(sc.key).filter(counted);
      return rs.length >= MIN_POINTS && new Set(rs.map(r => r.day)).size >= 2;
    });
    vis('pf-bench-block', list.length > 0);
    const sel = $('pf-scenario');
    const prev = sel.value;
    sel.innerHTML = list.map(sc => `<option value="${sc.id}">${esc(sc.name)}</option>`).join('');
    if (list.some(sc => sc.id === prev)) sel.value = prev;
    vis('pf-scenario', list.length > 1);
    return list.length > 0;
  }
  function drawBench() {
    const sc = benchScenarios().find(x => x.id === $('pf-scenario').value);
    if (!sc) return;
    ST.charts.trend($('pf-bench'), ST.history.forKey(sc.key).slice(-40), tip());
  }

  // Daily mean hits per second over counted drill runs: the throughput the score is built on.
  function throughputPoints(runs) {
    const byDay = new Map();
    for (const r of runs) {
      if (!counted(r) || !r.hitsPerSec) continue;
      const a = byDay.get(r.day) || []; a.push(r.hitsPerSec); byDay.set(r.day, a);
    }
    return [...byDay.keys()].sort().slice(-60).map(d => ({ x: d, v: byDay.get(d).reduce((a, b) => a + b, 0) / byDay.get(d).length }));
  }
  function drawThroughput(pts) {
    ST.pcharts.lines($('pf-throughput'), pts.map(p => p.x), [{ name: 'Hits per second', points: pts }], { fmt: (v) => F.num(v, 1), xLabel: (d) => F.date(d) }, tip());
    const half = Math.max(1, Math.floor(pts.length / 2));
    const avg = (a) => a.reduce((x, p) => x + p.v, 0) / a.length;
    const d = avg(pts.slice(-Math.min(5, half))) / avg(pts.slice(0, Math.min(5, half))) - 1;
    $('pf-throughput-note').textContent = Math.abs(d) < 0.01 ? 'steady' : `${d > 0 ? 'up' : 'down'} ${F.pct(Math.abs(d))}`;
  }

  // Weekly accuracy while moving and while standing, from runs that measured both.
  function accuracyWeeks(runs) {
    const byWeek = new Map();
    for (const r of runs) {
      if (r.warmup || typeof r.accMoving !== 'number' || typeof r.accStill !== 'number') continue;
      const monday = ST.points.weekStart(r.day);
      const w = byWeek.get(monday) || { m: [], s: [] };
      w.m.push(r.accMoving); w.s.push(r.accStill);
      byWeek.set(monday, w);
    }
    return { byWeek, weeks: [...byWeek.keys()].sort().slice(-26) };
  }
  function drawAccuracy({ byWeek, weeks }) {
    const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const series = [
      { name: 'Moving', points: weeks.map(w => ({ x: w, v: mean(byWeek.get(w).m) })) },
      { name: 'Standing', points: weeks.map(w => ({ x: w, v: mean(byWeek.get(w).s) })) },
    ];
    $('pf-acc-legend').innerHTML = `<span class="key" style="background:${ST.pcharts.PAIR[0]}"></span>Moving <span class="key" style="background:${ST.pcharts.PAIR[1]}"></span>Standing`;
    ST.pcharts.lines($('pf-acc'), weeks, series, { max: 1, fmt: (v) => F.pct(v), xLabel: (w) => F.date(w) }, tip());
  }

  // ---------- survev ----------
  function renderSurvev() {
    const body = $('pf-survev-body');
    const slug = ST.survev.slug();
    $('pf-survev-legend').innerHTML = '';
    if (!slug) {
      body.innerHTML = `<form class="copy-row" data-survev-form><input name="slug" type="text" placeholder="Your survev name" aria-label="survev name" autocomplete="off" spellcheck="false"><button class="ghost" type="submit">Link</button></form>
        <p class="field-hint">Puts your real games next to your practice.</p>`;
      return;
    }
    body.innerHTML = `<canvas id="pf-games" class="chart" role="img" aria-label="Damage per minute in recent survev games"></canvas>
      <p id="pf-games-text" class="pf-line">Loading your games…</p>
      <p class="field-hint">${esc(slug)} · <button class="link" type="button" data-unlink>Unlink</button></p>`;
    const draw = (list) => {
      const pts = list.slice().reverse().filter(m => m.time_alive > 0).map(m => ({ v: ST.warmup.dmgPerMin(m), m }));
      const done = ST.survev.routineCompletions();
      const isWarm = (p) => { const st = ST.warmup.matchStart(p.m); return done.some(t => t <= st && st - t <= 3600000); };
      $('pf-survev-legend').innerHTML = `<span class="key" style="background:${ST.pcharts.PAIR[0]}"></span>After a routine <span class="key" style="background:${ST.pcharts.PAIR[1]}"></span>Cold`;
      ST.pcharts.dots($('pf-games'), pts, [{ name: 'warm', test: isWarm }, { name: 'cold', test: () => true }], {
        empty: 'No games found for this name yet.',
        tipHtml: (p) => `${esc(F.dateTime(p.m.end_time))}<br><b>${F.int(p.v)}</b> damage/min · ${F.int(p.m.kills)} kills · #${F.int(p.m.rank)}<br>${isWarm(p) ? 'After a routine' : 'Cold'}`,
      }, tip());
      const c = ST.warmup.compareWarmVsCold(list, done);
      const t = $('pf-games-text');
      if (!list.length) t.textContent = 'No games yet.';
      else if (c.enough) t.textContent = `${c.diff >= 0 ? '+' : '−'}${F.int(Math.abs(c.diff))} damage/min after a routine (${F.int(c.warm.n)} games vs ${F.int(c.cold.n)} cold).`;
      else t.textContent = `${F.int(list.length)} games. The warm-up comparison needs ${ST.warmup.MIN_GAMES} after a routine; you have ${F.int(c.warm.n)}.`;
    };
    const cachedList = ST.survev.cachedMatches();
    if (cachedList) requestAnimationFrame(() => draw(cachedList));
    if (survevLoading) return;
    survevLoading = true;
    ST.survev.matches((partial) => { if (mode === 'own' && $('pf-games')) draw(partial); })
      .then((list) => { if (list && mode === 'own' && $('pf-games')) draw(list); })
      .catch(() => { const t = $('pf-games-text'); if (t) t.textContent = 'Could not reach survev’s stats API. Try again later.'; })
      .finally(() => { survevLoading = false; });
  }

  function renderHandleRow() {
    const row = $('pf-handle-row');
    const u = ST.account.user();
    if (!ST.api.available() || !u || !ST.account.isMember()) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');
    const url = u.handle ? `${location.host}/u/${u.handle}` : null;
    row.innerHTML = url
      ? `<span class="legend">Public page</span> <a href="/u/${encodeURIComponent(u.handle)}" data-link>${esc(url)}</a> <button class="link" type="button" data-edit-handle>Change name</button>`
      : `<button class="link" type="button" data-edit-handle>Pick a public name</button>`;
  }

  function editHandle() {
    const u = ST.account.user();
    ST.ui.openSheet('Public name', `
      <p class="desc">Your page will be at <b>${esc(location.host)}/u/<span id="hn-prev">${esc(u.handle || 'name')}</span></b>. Lowercase letters, digits and underscores, 3 to 20 characters.</p>
      <form class="copy-row" data-act-form><input id="hn" type="text" value="${esc(u.handle || '')}" maxlength="20" autocomplete="off" spellcheck="false" aria-label="Public name"><button class="primary small" data-act="save" type="button">Save</button></form>`,
    { onAction: async (act, b) => {
      if (act !== 'save') return;
      const v = $('hn').value.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(v)) { ST.ui.sheetNote('3 to 20 lowercase letters, digits or underscores.', true); return; }
      b.disabled = true;
      try {
        await ST.api.patch('/api/me', { handle: v });
        ST.ui.closeSheet();
        ST.ui.toast('Saved.');
        await ST.account.refresh();
      } catch (e) { ST.ui.sheetNote(e.status === 409 ? 'That name is taken.' : (e.message || 'Could not save.'), true); }
      finally { b.disabled = false; }
    } });
    $('hn').addEventListener('input', () => { $('hn-prev').textContent = $('hn').value || 'name'; });
  }

  // ---------- public profile ----------
  async function renderPublic(handle) {
    mode = 'public';
    $('pf-name').textContent = '@' + handle;
    $('pf-sub').textContent = 'Loading';
    $('pf-avatar').innerHTML = '';
    $('pf-account').classList.add('hidden');
    $('pf-handle-row').classList.add('hidden');
    $('pf-headline').textContent = '';
    vis('pf-support', false); vis('pf-start', false);
    for (const id of ['pf-practice', 'pf-bests-block', 'pf-bench-block', 'pf-throughput-block', 'pf-acc-block', 'pf-points-block', 'pf-ach-block', 'pf-survev', 'pf-boards']) vis(id, false);
    layoutRows();
    const h = await ST.api.ready;
    if (!h) { $('pf-sub').textContent = 'Public pages need the online trainer.'; return; }
    try {
      const p = await ST.api.get('/api/users/' + encodeURIComponent(handle));
      header(p.user, false);
      const days = (p.practiceDays || []).length;
      $('pf-headline').textContent = p.streak > 0 ? `${p.streak}-day streak` : days ? `${F.int(days)} day${days === 1 ? '' : 's'} of practice` : 'No practice yet';
      const n = (p.achievements || []).length;
      $('pf-support').textContent = n ? `${F.int(n)} achievement${n === 1 ? '' : 's'}.` : '';
      vis('pf-support', n > 0);
      calendar(new Map((p.practiceDays || []).map(d => [d, 2])), ST.history.today());
      bestsTable(p.bests || {});
      achievementsList(p.achievements || []);
      layoutRows();
    } catch (e) {
      $('pf-name').textContent = 'Not found';
      $('pf-sub').textContent = `Nobody uses @${handle}.`;
    }
  }

  function show(app, handle) {
    app.show('profile');
    const me = ST.account.user();
    if (handle && !(me && me.handle === handle)) renderPublic(handle);
    else renderOwn();
  }

  function start(app) {
    $('pf-back').addEventListener('click', () => ST.router.go('/'));
    $('pf-account').addEventListener('click', () => ST.account.openSheet());
    $('pf-scenario').addEventListener('change', drawBench);
    $('pf-start').addEventListener('click', () => ST.onboarding.startAimTest());
    ST.boards.bind($('pf-boards-body'));
    $('profile').addEventListener('click', (e) => {
      if (e.target.closest('[data-edit-handle]')) { editHandle(); return; }
      if (e.target.closest('[data-unlink]')) { ST.survev.unlink(); renderSurvev(); return; }
      const a = e.target.closest('a[data-link]');
      if (a) { e.preventDefault(); ST.router.go(a.getAttribute('href')); }
    });
    $('profile').addEventListener('submit', async (e) => {
      const f = e.target.closest('[data-survev-form]');
      if (!f) return;
      e.preventDefault();
      const btn = f.querySelector('button');
      btn.disabled = true;
      const r = await ST.survev.link(f.slug.value).catch(() => ({ ok: false, error: 'Could not reach survev’s stats API.' }));
      btn.disabled = false;
      if (!r.ok) {
        // A sync or sign-in can re-render the panel while the request is out, detaching this form.
        const form = f.isConnected ? f : $('profile').querySelector('[data-survev-form]');
        const n = form && form.parentElement.querySelector('.field-hint');
        if (n) { n.textContent = r.error; n.classList.add('warn'); }
        return;
      }
      renderSurvev();
    });
    ST.account.onChange(() => { if (app.current() === 'profile' && mode === 'own') renderOwn(); });
    ST.sync.onPulled(() => { if (app.current() === 'profile' && mode === 'own') renderOwn(); });
    let t = null;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (app.current() === 'profile' && mode === 'own') renderOwn(); }, 200); });
  }

  return { show, start };
})();
