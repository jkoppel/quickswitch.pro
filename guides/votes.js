// Gun votes on the guide pages: fills in each [data-gun] pair of buttons, sends votes, and on the
// tier list page sorts the voted guns into tiers. Talks to /api/votes; works without an account.
(function () {
  const groups = Array.from(document.querySelectorAll('.vote[data-gun]'));
  const board = document.getElementById('community-tiers');
  if (!groups.length && !board) return;
  let tallies = {};
  let mine = {};
  const names = {};
  groups.forEach((g) => { const a = g.closest('tr, p') && g.closest('tr, p').querySelector('a[href^="/guns/"]'); if (a) names[g.dataset.gun] = a.textContent; });

  function paint(gun) {
    const t = tallies[gun] || { up: 0, down: 0 };
    document.querySelectorAll(`.vote[data-gun="${gun}"]`).forEach((g) => {
      g.querySelector('.up').textContent = t.up;
      g.querySelector('.down').textContent = t.down;
      g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(mine[gun] === Number(b.dataset.v))));
    });
  }

  // Tiers by rank among the voted guns: the top 10% are S, then 20% A, 30% B, 25% C, the rest D.
  // A gun's place is the lower bound of its upvote share (Wilson, 80%), so one lucky vote can't top it.
  function wilson(up, n) {
    if (!n) return 0;
    const z = 1.28, p = up / n;
    return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
  }
  function renderBoard() {
    if (!board) return;
    const rated = Object.entries(tallies).filter(([, t]) => t.up + t.down > 0)
      .map(([gun, t]) => ({ gun, t, score: wilson(t.up, t.up + t.down) })).sort((a, b) => b.score - a.score || b.t.up - a.t.up);
    const votes = rated.reduce((n, r) => n + r.t.up + r.t.down, 0);
    if (!rated.length) { board.innerHTML = '<p class="muted">No votes yet. Vote below and you set the first ranking.</p>'; return; }
    const cuts = [['S', 0.1, 'top 10%'], ['A', 0.3, 'next 20%'], ['B', 0.6, 'next 30%'], ['C', 0.85, 'next 25%'], ['D', 1, 'the rest']];
    let i = 0;
    const rows = cuts.map(([tier, upTo, note]) => {
      const xs = [];
      while (i < rated.length && i < Math.ceil(upTo * rated.length)) xs.push(rated[i++]);
      if (!xs.length) return '';
      return `<section class="tier-group"><h3 class="tier-head"><span class="tier-letter">${tier}</span><span class="tier-note">${note} of rated guns</span></h3><ol class="bars">${xs.map((r) => {
        const n = r.t.up + r.t.down;
        const share = Math.round(100 * r.t.up / n);
        return `<li><a href="/guns/${r.gun}/">${names[r.gun] || r.gun}</a><span class="ammo">${n} vote${n === 1 ? '' : 's'}</span><span class="bar" aria-hidden="true"><i style="width:${share}%"></i></span><b class="num" title="${r.t.up} up, ${r.t.down} down">${share}%</b></li>`;
      }).join('')}</ol></section>`;
    });
    board.innerHTML = rows.join('') + `<p class="muted">${votes} vote${votes === 1 ? '' : 's'} on ${rated.length} gun${rated.length === 1 ? '' : 's'} so far. The number is each gun's share of upvotes; guns with few votes rank lower until more come in.</p>`;
  }

  // Votes go one at a time: the first one creates the session cookie that every later one must carry,
  // and each vote is worked out from the result of the one before.
  let queue = Promise.resolve();
  const send = (gun, v) => { queue = queue.then(() => sendNow(gun, v)); };
  async function sendNow(gun, v) {
    const vote = mine[gun] === v ? 0 : v;   // pressing your current vote again takes it back
    try {
      const r = await fetch('/api/votes', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ gun, vote }) });
      const body = await r.json();
      if (!r.ok) { alert(r.status === 429 ? 'Too many votes from this network today. Try again tomorrow.' : 'That vote didn’t go through.'); return; }
      tallies[gun] = { up: body.up, down: body.down };
      if (body.mine) mine[gun] = body.mine; else delete mine[gun];
      paint(gun);
      renderBoard();
    } catch (e) { alert('That vote didn’t go through.'); }
  }

  groups.forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) send(g.dataset.gun, Number(b.dataset.v));
  }));

  fetch('/api/votes', { credentials: 'same-origin' }).then((r) => r.json()).then((d) => {
    tallies = d.tallies || {};
    mine = d.mine || {};
    groups.forEach((g) => paint(g.dataset.gun));
    renderBoard();
  }).catch(() => { if (board) board.innerHTML = '<p class="muted">Votes couldn’t load.</p>'; });
})();
