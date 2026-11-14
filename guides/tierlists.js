// The tier list maker on /guns/tier-list/ and /perks/tier-list/: drag (or tap, or key) items into
// tiers, save the list for a share link, show a shared list from ?l=, and vote on lists.
// Talks to /api/tierlists; works without an account (the first save or vote makes a guest session).
(function () {
  const maker = document.getElementById('maker');
  if (!maker) return;
  const kind = maker.dataset.kind;
  const TIERS = ['S', 'A', 'B', 'C', 'D'];
  const items = JSON.parse(document.getElementById('tl-items').textContent);
  const nameOf = Object.fromEntries(items.map((x) => [x.id, x.name]));
  const pool = maker.querySelector('.tl-pool');
  const drops = Object.fromEntries(TIERS.map((t) => [t, maker.querySelector(`.tl-drop[data-tier="${t}"]`)]));
  const chips = Object.fromEntries([...maker.querySelectorAll('.chip')].map((c) => [c.dataset.id, c]));
  const status = document.getElementById('tl-status');
  const DRAFT = `st.tierlist.${kind}`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (text, bad) => { status.textContent = text; status.classList.toggle('bad', !!bad); };

  // ---------- the board ----------

  function tiers() {
    return Object.fromEntries(TIERS.map((t) => [t, [...drops[t].querySelectorAll('.chip')].map((c) => c.dataset.id)]));
  }
  function saveDraft() {
    try { localStorage.setItem(DRAFT, JSON.stringify({ tiers: tiers(), title: $('tl-title').value, by: $('tl-by').value })); } catch (e) { /* ignore */ }
  }
  function load(t) {
    for (const c of Object.values(chips)) pool.appendChild(c);
    // Unranked chips go back in their original order.
    for (const x of items) pool.appendChild(chips[x.id]);
    for (const tier of TIERS) for (const id of (t && t[tier]) || []) if (chips[id]) drops[tier].appendChild(chips[id]);
  }
  function $(id) { return document.getElementById(id); }

  let selected = null;
  function select(chip) {
    if (selected) selected.classList.remove('selected');
    selected = chip && chip !== selected ? chip : null;
    if (selected) selected.classList.add('selected');
    maker.classList.toggle('picking', !!selected);
  }
  function place(chip, target, before) {
    if (before && before !== chip) target.insertBefore(chip, before); else if (!before) target.appendChild(chip);
    select(null);
    saveDraft();
  }

  // Dragging with the pointer works for mouse, pen and touch alike; a press that doesn't move is a tap.
  let drag = null;
  maker.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || e.button > 0) return;
    drag = { chip, x: e.clientX, y: e.clientY, ghost: null, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      const r = drag.chip.getBoundingClientRect();
      drag.dx = drag.x - r.left; drag.dy = drag.y - r.top;
      drag.ghost = drag.chip.cloneNode(true);
      drag.ghost.classList.add('ghost-chip');
      document.body.appendChild(drag.ghost);
      drag.chip.classList.add('dragging');
      try { drag.chip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    maker.querySelectorAll('.tl-drop.over').forEach((d) => d.classList.remove('over'));
    const drop = over && over.closest('.tl-drop');
    if (drop) drop.classList.add('over');
  }, { passive: false });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    if (!d.ghost) return;   // a tap: the click handler selects it
    d.ghost.remove();
    d.chip.classList.remove('dragging');
    maker.querySelectorAll('.tl-drop.over').forEach((x) => x.classList.remove('over'));
    const over = e && document.elementFromPoint(e.clientX, e.clientY);
    const drop = over && (over.closest('.tl-drop') || (over.closest('.tl-row') && over.closest('.tl-row').querySelector('.tl-drop')));
    if (drop) {
      const before = over.closest('.chip');
      place(d.chip, drop, before && drop.contains(before) ? before : null);
    }
    // The click that follows this pointerup must not also count as a tap.
    d.chip.dataset.dragged = '1';
    setTimeout(() => { delete d.chip.dataset.dragged; }, 0);
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', () => endDrag(null));

  maker.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
      if (chip.dataset.dragged) { delete chip.dataset.dragged; return; }
      // Tapping a chip while another is picked puts the picked one before it.
      if (selected && selected !== chip) { place(selected, chip.parentElement, chip); return; }
      select(chip);
      return;
    }
    const row = e.target.closest('.tl-row, .tl-pool');
    if (selected && row) place(selected, row.classList.contains('tl-pool') ? row : row.querySelector('.tl-drop'));
  });
  maker.addEventListener('keydown', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if (TIERS.includes(k)) { place(chip, drops[k]); chip.focus(); e.preventDefault(); }
    else if (k === 'U') { place(chip, pool); chip.focus(); e.preventDefault(); }
    else if (k === 'ESCAPE') select(null);
  });

  $('tl-clear').addEventListener('click', () => { load(null); select(null); say(''); saveDraft(); });
  for (const id of ['tl-title', 'tl-by']) $(id).addEventListener('input', saveDraft);

  // ---------- saving ----------

  const api = async (path, opts) => {
    const r = await fetch('/api/' + path, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', ...(opts && opts.headers) } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || 'request failed'), { status: r.status });
    return body;
  };
  const shareUrl = (id) => `${location.origin}${location.pathname}?l=${id}`;

  $('tl-save').addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = tiers();
    if (TIERS.reduce((n, k) => n + t[k].length, 0) < 3) { say('Place at least three before saving.', true); return; }
    const btn = e.submitter || $('tl-save').querySelector('[type="submit"]');
    btn.disabled = true;
    say('Saving…');
    try {
      const { id } = await api('tierlists', { method: 'POST', body: JSON.stringify({ kind, tiers: t, title: $('tl-title').value, by: $('tl-by').value }) });
      history.replaceState(null, '', `?l=${id}`);
      status.classList.remove('bad');
      status.innerHTML = `Saved. Share it: <a href="${shareUrl(id)}">${esc(shareUrl(id))}</a> <button type="button" class="ghost small" id="tl-copy">Copy link</button>`;
      $('tl-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(shareUrl(id)); $('tl-copy').textContent = 'Copied'; } catch (err) { /* the link is there to copy by hand */ }
      });
      sort = 'new';
      paintSort();
      loadGallery();
    } catch (err) {
      say(err.status === 429 ? 'That’s a lot of lists from this network today. Try again tomorrow.' : `Couldn’t save: ${err.message}.`, true);
    } finally { btn.disabled = false; }
  });

  // ---------- showing lists, and votes ----------

  const CHEVRON = (dir) => `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="${dir === 'up' ? 'M2.5 7.5 6 4l3.5 3.5' : 'M2.5 4.5 6 8l3.5-3.5'}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const voteControls = (id, label) => `<span class="vote" data-list="${esc(id)}"><button type="button" data-v="1" aria-label="Upvote ${esc(label)}">${CHEVRON('up')}<span class="up">·</span></button><button type="button" data-v="-1" aria-label="Downvote ${esc(label)}">${CHEVRON('down')}<span class="down">·</span></button></span>`;
  const when = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const ranked = (l) => TIERS.reduce((n, t) => n + ((l.tiers[t] || []).length), 0);
  function listHtml(l) {
    const title = l.title || `Untitled ${kind === 'guns' ? 'gun' : 'perk'} tier list`;
    return `<section class="tl-entry" data-id="${esc(l.id)}">
<div class="tl-meta"><h3><a href="?l=${esc(l.id)}">${esc(title)}</a></h3><span class="muted">${l.by ? `${esc(l.by)}, ` : ''}${when(l.created_at)} · ${ranked(l)} ranked</span>${voteControls(l.id, title)}</div>
<div class="tl-rows">${TIERS.filter((t) => (l.tiers[t] || []).length).map((t) => `<div class="tl-show"><span class="tl-label">${t}</span><span class="tl-names">${l.tiers[t].map((id) => esc(nameOf[id] || id)).join(' · ')}</span></div>`).join('')}</div>
</section>`;
  }

  const tally = {};
  function paintVotes(id) {
    const t = tally[id] || { up: 0, down: 0, mine: 0 };
    document.querySelectorAll(`.vote[data-list="${id}"]`).forEach((g) => {
      g.querySelector('.up').textContent = t.up;
      g.querySelector('.down').textContent = t.down;
      g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(t.mine === Number(b.dataset.v))));
    });
  }
  // Votes go one at a time: the first creates the session cookie the next must carry.
  let queue = Promise.resolve();
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.vote[data-list] button[data-v]');
    if (!b) return;
    const id = b.closest('.vote').dataset.list;
    queue = queue.then(async () => {
      const v = Number(b.dataset.v);
      const vote = (tally[id] && tally[id].mine) === v ? 0 : v;   // pressing your vote again takes it back
      try {
        const r = await api(`tierlists/${encodeURIComponent(id)}/vote`, { method: 'POST', body: JSON.stringify({ vote }) });
        tally[id] = { up: r.up, down: r.down, mine: r.mine };
        paintVotes(id);
      } catch (err) {
        alert(err.status === 429 ? 'Too many votes from this network today. Try again tomorrow.' : 'That vote didn’t go through.');
      }
    });
  });

  let sort = 'top';
  const sortButtons = [...document.querySelectorAll('.tl-sort [data-sort]')];
  function paintSort() { sortButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === sort))); }
  sortButtons.forEach((b) => b.addEventListener('click', () => { sort = b.dataset.sort; paintSort(); loadGallery(); }));

  async function loadGallery() {
    const box = $('tl-gallery');
    try {
      const d = await api(`tierlists?kind=${kind}&sort=${sort}`);
      box.innerHTML = d.lists.length ? d.lists.map(listHtml).join('') : `<p class="muted">No player lists yet. Save yours above and it will be the first.</p>`;
      for (const l of d.lists) tally[l.id] = { up: l.up, down: l.down, mine: l.mine };
      for (const [id, t] of Object.entries(d.community || {})) tally[id] = t;
      Object.keys(tally).forEach(paintVotes);
    } catch (err) { box.innerHTML = '<p class="muted">Players’ lists couldn’t load.</p>'; }
  }

  async function showShared(id) {
    const box = $('tl-shared');
    try {
      const { list } = await api(`tierlists/${encodeURIComponent(id)}`);
      if (list.kind !== kind) return;
      tally[list.id] = { up: list.up, down: list.down, mine: list.mine };
      box.innerHTML = `${listHtml(list)}<p class="tl-shared-actions"><button type="button" class="ghost small" id="tl-copyfrom">Start from this list</button></p>`;
      box.hidden = false;
      paintVotes(list.id);
      $('tl-copyfrom').addEventListener('click', () => { load(list.tiers); saveDraft(); maker.scrollIntoView({ behavior: 'smooth' }); });
    } catch (err) {
      box.innerHTML = '<p class="muted">That tier list isn’t here any more.</p>';
      box.hidden = false;
    }
  }

  // Restore the draft, then show a shared list and the gallery.
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (d) { load(d.tiers); $('tl-title').value = d.title || ''; $('tl-by').value = d.by || ''; }
  } catch (e) { /* ignore */ }
  const shared = new URLSearchParams(location.search).get('l');
  if (shared) showShared(shared);
  loadGallery();
})();
