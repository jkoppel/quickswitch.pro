// Small DOM helpers shared by the platform screens: escaping, the one overlay sheet, toasts.
window.ST = window.ST || {};

ST.ui = (function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtInt = (v) => ST.fmt.int(v);

  // One overlay serves sign-in and feedback. It sits above every screen, including results.
  let onClose = null;
  let onAction = null;
  let returnFocus = null;
  function openSheet(title, bodyHtml, opts = {}) {
    returnFocus = document.activeElement;
    $('overlay-title').textContent = title;
    $('overlay-body').innerHTML = bodyHtml;
    $('overlay-note').textContent = '';
    $('overlay-close').textContent = opts.closeLabel || 'Close';
    onClose = opts.onClose || null;
    onAction = opts.onAction || null;
    $('overlay').classList.remove('hidden');
    const first = $('overlay-body').querySelector('button, input, textarea, select');
    (first || $('overlay-close')).focus();
    return $('overlay-body');
  }
  function closeSheet() {
    if ($('overlay').classList.contains('hidden')) return;
    $('overlay').classList.add('hidden');
    $('overlay-body').innerHTML = '';
    const fn = onClose; onClose = null; onAction = null;
    if (fn) fn();
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }
  function sheetNote(text, warn) {
    const n = $('overlay-note');
    n.textContent = text || '';
    n.classList.toggle('warn-text', !!warn);
  }
  $('overlay-close').addEventListener('click', closeSheet);
  // Buttons inside a sheet carry data-act; whoever opened the sheet handles them.
  $('overlay-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && onAction) onAction(b.dataset.act, b, e);
  });
  $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeSheet(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('overlay').classList.contains('hidden')) { e.stopPropagation(); closeSheet(); }
  }, true);

  // Brief confirmation that does not move focus ("Link copied").
  let toastEl = null, toastTimer = null;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2200);
  }

  const relDays = (day, today) => ST.fmt.relDay(day, today);

  // A guest's server handle is random (p_xxxx), so it never stands in for a name.
  function playerName(u, fallback) {
    if (!u) return fallback;
    if (u.displayName) return u.displayName;
    return u.handle && !/^p_/.test(u.handle) ? u.handle : fallback;
  }

  return { $, esc, fmtInt, playerName, openSheet, closeSheet, sheetNote, toast, relDays, sheetOpen: () => !$('overlay').classList.contains('hidden') };
})();
