// Friends and Discord-server boards. Plain ranked lists: streaks (effort, not worth forging) and
// Benchmark bests (fixed difficulty, comparable). No medals, no confetti.
window.ST = window.ST || {};

ST.boards = (function () {
  const { esc, fmtInt } = ST.ui;
  let data = null;
  let tab = 'friends';
  let scenario = null;

  function scenarioName(key) {
    const id = String(key).split(':')[0];
    return ST.SCENARIOS[id] ? ST.SCENARIOS[id].name : id;
  }

  function list(rows, fmt) {
    if (!rows || !rows.length) return '<p class="muted small">Nobody yet.</p>';
    return `<ol class="board">${rows.map(r => `<li class="${r.you ? 'you' : ''}">
      ${r.avatarUrl ? `<img src="${esc(r.avatarUrl)}" alt="" width="20" height="20">` : '<i class="dot-av" aria-hidden="true"></i>'}
      <span>${r.handle ? `<a href="/u/${encodeURIComponent(r.handle)}" data-link>${esc(ST.ui.playerName(r, 'A player'))}</a>` : esc(ST.ui.playerName(r, 'A player'))}${r.you ? ' <small>you</small>' : ''}</span>
      <b>${fmt(r.value)}</b></li>`).join('')}</ol>`;
  }

  function render(el) {
    if (!data) { el.innerHTML = '<p class="muted small">Loading…</p>'; return; }
    const tabs = [{ id: 'friends', name: 'Friends', board: data.friends }].concat((data.guilds || []).map(g => ({ id: 'g:' + g.id, name: g.name, board: g.board })));
    const cur = tabs.find(t => t.id === tab) || tabs[0];
    const b = cur.board || { streak: [], benchmark: {} };
    const keys = Object.keys(b.benchmark || {});
    if (!scenario || !keys.includes(scenario)) scenario = keys[0] || null;
    const friendsEmpty = cur.id === 'friends' && (!b.streak || b.streak.length <= 1);
    el.innerHTML = `
      <div class="seg" role="tablist">${tabs.map(t => `<button role="tab" type="button" class="${t === cur ? 'on' : ''}" aria-selected="${t === cur}" data-tab="${esc(t.id)}">${esc(t.name)}</button>`).join('')}</div>
      ${friendsEmpty ? '<p class="muted small">No friends yet. Send a challenge from your Benchmark results: whoever plays it shows up here.' + (ST.api.signIn().discord ? ' Sign in with Discord to see players from your servers.' : '') + '</p>' : ''}
      <div class="boards-grid">
        <div><h3>Streak</h3>${list(b.streak, (v) => `${v} d`)}</div>
        <div><h3>Benchmark ${keys.length ? `<select data-scenario aria-label="Scenario">${keys.map(k => `<option value="${esc(k)}" ${k === scenario ? 'selected' : ''}>${esc(scenarioName(k))}</option>`).join('')}</select>` : ''}</h3>
          ${scenario ? list(b.benchmark[scenario], fmtInt) : '<p class="muted small">No Benchmark scores yet.</p>'}</div>
      </div>`;
  }

  async function load(el) {
    data = null; render(el);
    try { data = await ST.api.get('/api/boards'); } catch (e) { data = { friends: { streak: [], benchmark: {} }, guilds: [] }; }
    render(el);
  }

  function bind(el) {
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; render(el); return; }
      const a = e.target.closest('a[data-link]');
      if (a) { e.preventDefault(); ST.router.go(a.getAttribute('href')); }
    });
    el.addEventListener('change', (e) => { if (e.target.matches('[data-scenario]')) { scenario = e.target.value; render(el); } });
  }

  return { load, bind };
})();
