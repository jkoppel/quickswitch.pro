// Key and mouse bindings: what each input does in a run, saved in this browser, and the dialog
// that changes them. Inputs are physical key codes (e.code, so WASD stays under the left hand on
// any layout) or mouse buttons written 'Mouse0'..'Mouse4'. Esc always pauses and can't be rebound.
window.ST = window.ST || {};

ST.controls = (function () {
  const KEY = 'st.controls';
  const SLOTS = 2;            // a main and an alternate binding per action, as in most shooters

  // In the order the dialog lists them. Defaults are survev's.
  const ACTIONS = [
    { id: 'up', label: 'Move up', keys: ['KeyW', 'ArrowUp'] },
    { id: 'left', label: 'Move left', keys: ['KeyA', 'ArrowLeft'] },
    { id: 'down', label: 'Move down', keys: ['KeyS', 'ArrowDown'] },
    { id: 'right', label: 'Move right', keys: ['KeyD', 'ArrowRight'] },
    { id: 'shoot', label: 'Shoot', keys: ['Mouse0'] },
    { id: 'swap', label: 'Last weapon', keys: ['KeyQ', 'Mouse2'] },
    { id: 'primary', label: 'Primary weapon', keys: ['Digit1'] },
    { id: 'secondary', label: 'Secondary weapon', keys: ['Digit2'] },
    { id: 'throwable', label: 'Throwable', keys: ['Digit4', 'KeyG'] },
    { id: 'reload', label: 'Reload', keys: ['KeyR'] },
  ];
  const RESERVED = 'Escape';

  const defaults = () => Object.fromEntries(ACTIONS.map(a => [a.id, a.keys.slice()]));
  const validInput = (s) => typeof s === 'string' && s.length <= 32 && s !== RESERVED && /^(Mouse[0-4]|[A-Za-z][A-Za-z0-9]*)$/.test(s);

  // Saved bindings, repaired: unknown actions and inputs dropped, an input bound twice kept only
  // on its first action, and an action missing from the save given its default.
  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* ignore */ }
    const binds = saved && saved.binds && typeof saved.binds === 'object' ? saved.binds : {};
    const out = {}, seen = new Set();
    for (const a of ACTIONS) {
      const list = Array.isArray(binds[a.id]) ? binds[a.id] : a.keys;
      out[a.id] = list.filter(validInput).filter(i => !seen.has(i) && seen.add(i)).slice(0, SLOTS);
    }
    return out;
  }

  let binds = load();
  let byInput = null;
  const listeners = [];
  function index() {
    byInput = new Map();
    for (const a of ACTIONS) for (const i of binds[a.id]) byInput.set(i, a.id);
  }
  index();

  function save(next) {
    binds = next;
    index();
    try { localStorage.setItem(KEY, JSON.stringify({ binds })); } catch (e) { /* ignore */ }
    refreshHints();
    for (const fn of listeners) fn();
  }

  // ---------- names ----------
  const MOUSE = ['Left click', 'Middle click', 'Right click', 'Mouse 4', 'Mouse 5'];
  const SHORT_MOUSE = ['LMB', 'MMB', 'RMB', 'M4', 'M5'];
  const NAMED = {
    Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock',
    ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt', AltRight: 'Right Alt', MetaLeft: 'Left ⌘', MetaRight: 'Right ⌘',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  };
  // The key's printed name on this keyboard layout, where the browser can tell us (Chrome, Edge).
  let layout = null;
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    navigator.keyboard.getLayoutMap().then((m) => { layout = m; refreshHints(); }).catch(() => {});
  }
  function label(input, short = false) {
    const m = /^Mouse(\d)$/.exec(input);
    if (m) return (short ? SHORT_MOUSE : MOUSE)[Number(m[1])];
    const printed = layout && layout.get(input);
    if (printed && printed.trim() && /^(Key|Digit)/.test(input)) return printed.toUpperCase();
    if (/^Key[A-Z]$/.test(input)) return input.slice(3);
    if (/^Digit\d$/.test(input)) return input.slice(5);
    if (/^Numpad/.test(input)) return 'Num ' + input.slice(6);
    return NAMED[input] || input;
  }

  // Text for anything that names the controls: the in-run hint line, and form labels marked
  // data-keys="secondary,swap".
  function hudHint() {
    const first = (id) => (binds[id][0] ? label(binds[id][0], true) : '–');
    const all = (id) => binds[id].map(i => label(i, true)).join('/') || '–';
    const move = ['up', 'left', 'down', 'right'].map(first);
    const moveText = move.join('') === 'WASD' ? 'WASD' : move.join(' ');
    return `${moveText} move · ${all('shoot')} shoot · ${all('swap')} swap · ${all('reload')} reload · `
      + `${[first('primary'), first('secondary'), first('throwable')].join('/')} slots · Esc pause`;
  }
  function refreshHints() {
    const hint = document.getElementById('hud-hint');
    if (hint) hint.textContent = hudHint();
    for (const el of document.querySelectorAll('[data-keys]')) {
      const names = el.dataset.keys.split(',').flatMap(id => (binds[id] || []).map(i => label(i)));
      el.textContent = names.length ? `(${names.join(' / ')})` : '';
    }
  }

  // ---------- the dialog ----------
  let dialog = null, capturing = null, note = '';
  const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // The rows are built once and updated in place, so a click that starts on one binding while
  // another is waiting still lands on the button it started on.
  function render() {
    const body = dialog.querySelector('.binds tbody');
    if (!body.children.length) {
      body.innerHTML = ACTIONS.map(a => `<tr><th scope="row">${esc(a.label)}</th>${Array.from({ length: SLOTS }, (_, s) =>
        `<td><button type="button" class="bind" data-action="${a.id}" data-slot="${s}"></button></td>`).join('')}</tr>`).join('');
    }
    for (const b of body.querySelectorAll('.bind')) {
      const a = ACTIONS.find(x => x.id === b.dataset.action), s = Number(b.dataset.slot);
      const input = binds[a.id][s];
      const live = !!capturing && capturing.action === a.id && capturing.slot === s;
      b.textContent = live ? 'Press a key, or click here' : input ? label(input) : '—';
      b.classList.toggle('live', live);
      b.classList.toggle('empty', !input && !live);
      b.setAttribute('aria-label', `${a.label}, binding ${s + 1}: ${input ? label(input) : 'none'}`);
    }
    const unbound = ACTIONS.filter(a => !binds[a.id].length).map(a => a.label);
    dialog.querySelector('#controls-note').textContent = capturing
      ? 'For a mouse button, click it over the box. Esc cancels; Backspace clears the binding.'
      : note || (unbound.length ? `Not bound: ${unbound.join(', ')}.` : 'Click a binding to change it. Esc always pauses.');
  }

  function bindTo(input) {
    const { action, slot } = capturing;
    const next = Object.fromEntries(ACTIONS.map(a => [a.id, binds[a.id].slice()]));
    const taken = byInput.get(input);
    if (taken && taken !== action) {
      next[taken] = next[taken].filter(i => i !== input);
      note = `${label(input)} moved from ${ACTIONS.find(a => a.id === taken).label}.`;
    } else note = '';
    // Replace what was in this slot; if the input sat in the action's other slot, that one empties.
    const slots = Array.from({ length: SLOTS }, (_, i) => (next[action][i] === input ? null : next[action][i] || null));
    slots[slot] = input;
    next[action] = slots.filter(Boolean);
    capturing = null;
    save(next);
    render();
  }
  function clearSlot() {
    const { action, slot } = capturing;
    const next = { ...binds, [action]: binds[action].filter((_, i) => i !== slot) };
    capturing = null; note = '';
    save(next);
    render();
  }

  // Window capture listeners run before the game's and the menu's, so while the dialog is open
  // no key or click reaches them (Esc closes the dialog instead of resuming the run).
  function onKey(e) {
    if (!dialog || dialog.classList.contains('hidden')) return;
    e.stopPropagation();
    if (!capturing) { if (e.key === 'Escape') { e.preventDefault(); close(); } return; }
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === RESERVED) { capturing = null; note = ''; render(); return; }
    if (e.code === 'Backspace' || e.code === 'Delete') { clearSlot(); return; }
    if (validInput(e.code)) bindTo(e.code);
  }
  // A mouse button binds when pressed over the waiting box; a click anywhere else cancels.
  function onMouseDown(e) {
    if (!capturing) return;
    if (!e.target.closest || !e.target.closest('.bind.live')) { capturing = null; note = ''; render(); return; }
    e.preventDefault(); e.stopPropagation();
    bindTo('Mouse' + e.button);
  }
  function onMouseUp(e) {
    // Mouse 4 and 5 are the browser's back and forward buttons; don't let a binding navigate away.
    if (capturing || (dialog && !dialog.classList.contains('hidden'))) { if (e.button === 3 || e.button === 4) e.preventDefault(); }
  }
  function onContext(e) { if (capturing || (dialog && !dialog.classList.contains('hidden'))) e.preventDefault(); }

  function build() {
    dialog = document.createElement('div');
    dialog.id = 'controls';
    dialog.className = 'overlay hidden';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'controls-title');
    dialog.innerHTML = `<div class="panel sheet controls-sheet">
      <h1 id="controls-title">Controls</h1>
      <table class="binds"><thead><tr><th></th><th scope="col">Main</th><th scope="col">Alternate</th></tr></thead><tbody></tbody></table>
      <p id="controls-note" class="legend" aria-live="polite"></p>
      <div class="row">
        <button type="button" class="ghost" data-controls="reset">Reset to survev defaults</button>
        <span class="spacer"></span>
        <button type="button" class="primary" data-controls="close">Done</button>
      </div>
    </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) { close(); return; }
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.controls === 'close') close();
      else if (b.dataset.controls === 'reset') { capturing = null; note = 'Back to survev’s defaults.'; save(defaults()); render(); }
      else if (b.dataset.action) {
        // The click has already finished its mousedown, so listening now can't bind the click itself.
        capturing = { action: b.dataset.action, slot: Number(b.dataset.slot) }; note = ''; render();
      }
    });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('contextmenu', onContext, true);
  }

  let returnFocus = null;
  function open() {
    if (!dialog) build();
    returnFocus = document.activeElement;
    capturing = null; note = '';
    render();
    dialog.classList.remove('hidden');
    dialog.querySelector('.bind').focus();
  }
  function close() {
    capturing = null;
    dialog.classList.add('hidden');
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshHints);
  else refreshHints();

  return {
    ACTIONS,
    actionFor: (input) => byInput.get(input) || null,
    bindings: () => Object.fromEntries(ACTIONS.map(a => [a.id, binds[a.id].slice()])),
    label, hudHint, open,
    onChange: (fn) => listeners.push(fn),
  };
})();
