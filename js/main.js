// Menu, routine runner, HUD, rest, pause and results screens.
(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const backdrop = $('backdrop');
  const screens = { menu: $('menu'), pause: $('pause'), rest: $('rest'), results: $('results') };
  const hud = $('hud');
  const tip = $('tip');
  const WARMUP_COPY = 'Your first ~40 s of practice each day is warm-up and doesn’t count toward bests.';

  let selection = { kind: 'mode', item: ST.MODES[0] };
  let game = null;
  let seq = null;          // active sequence: { steps, index, results, routine }
  let lastSeqSpec = null;  // for "Run again"
  let restTimer = null;
  let current = 'menu';    // which screen is showing

  // ---------- persistence ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const drillKey = (s) => `${s.mode}:${s.weapon}`;

  // ---------- form ----------
  const fields = {
    weapon: $('f-weapon'), secondary: $('f-secondary'), throwable: $('f-throwable'),
    scope: $('f-scope'), duration: $('f-duration'), enemies: $('f-enemies'),
    behavior: $('f-behavior'), enemyHp: $('f-hp'), minDist: $('f-mind'), maxDist: $('f-maxd'), ttl: $('f-ttl'),
    enemyAim: $('f-aim'), enemyShoots: $('f-shoots'), invincible: $('f-invincible'), adaptive: $('f-adaptive'), leadHint: $('f-lead'),
    obstacles: $('f-obstacles'), barrels: $('f-barrels'), sound: $('f-sound'), hitmarker: $('f-hitmarker'),
  };
  function fill(select, entries) {
    select.innerHTML = '';
    for (const [value, label] of entries) {
      const o = document.createElement('option');
      o.value = value; o.textContent = label;
      select.appendChild(o);
    }
  }
  // Weapons grouped by class so the 14-item list scans.
  const WEAPON_CLASS = [
    ['Pistols', ['m9']], ['SMGs', ['mp5', 'vector']], ['Assault rifles', ['ak47', 'm4a1', 'scar']], ['LMG', ['dp28']],
    ['DMRs', ['mk12', 'm39']], ['Shotguns', ['m870', 'spas12']], ['Snipers', ['mosin', 'sv98', 'awm']],
  ];
  (function fillWeapons() {
    const sel = fields.weapon;
    sel.innerHTML = '';
    const seen = new Set();
    for (const [group, ids] of WEAPON_CLASS) {
      const og = document.createElement('optgroup'); og.label = group;
      for (const id of ids) { const w = ST.WEAPONS[id]; if (!w) continue; seen.add(id); const o = document.createElement('option'); o.value = id; o.textContent = `${w.name} (${ST.AMMO[w.ammo].label})`; og.appendChild(o); }
      sel.appendChild(og);
    }
    for (const [id, w] of Object.entries(ST.WEAPONS)) if (!seen.has(id)) { const o = document.createElement('option'); o.value = id; o.textContent = w.name; sel.appendChild(o); }
  })();
  // Secondary weapon and throwable are optional, so both lists lead with an empty entry.
  (function fillSecondary() {
    const sel = fields.secondary;
    sel.innerHTML = '';
    const none = document.createElement('option'); none.value = ''; none.textContent = 'None';
    sel.appendChild(none);
    for (const [group, ids] of WEAPON_CLASS) {
      const og = document.createElement('optgroup'); og.label = group;
      for (const id of ids) { const w = ST.WEAPONS[id]; if (!w) continue; const o = document.createElement('option'); o.value = id; o.textContent = w.name; og.appendChild(o); }
      sel.appendChild(og);
    }
  })();
  fill(fields.throwable, [['', 'None']].concat(Object.entries(ST.THROWABLES).map(([k, t]) => [k, t.name])));
  fill(fields.scope, Object.keys(ST.SCOPES).map(k => [k, `${k} (shows ${ST.scopeMaxDist(k)} units in any direction)`]));
  fill(fields.behavior, Object.entries(ST.BEHAVIORS).map(([k, b]) => [k, b.name]));
  fill(fields.enemyAim, Object.entries(ST.AIM_SKILL).map(([k, a]) => [k, a.name]));

  function normalize(s) {
    s.enemies = Math.max(1, Math.min(8, s.enemies | 0));
    s.duration = Math.max(10, s.duration || 60);
    s.enemyHp = Math.max(1, s.enemyHp || 100);
    s.minDist = Math.max(2, s.minDist || 8);
    s.maxDist = Math.max(s.minDist + 1, s.maxDist || 16);
    s.ttl = Math.max(0, s.ttl || 0);
    s.respawnDelay = s.ttl > 0 ? 0.2 : 0.5;
    s.barrels = Math.max(0, Math.min(40, s.barrels | 0));
    s.stones = s.stones === undefined ? 14 : Math.max(0, Math.min(40, s.stones | 0));
    if (!s.obstacles) { s.barrels = 0; s.stones = 0; }
    s.throwableCount = s.throwableCount === undefined ? 3 : Math.max(0, s.throwableCount | 0);
    if (s.secondary === s.weapon) s.secondary = '';
    return s;
  }
  function readSettings() {
    const s = { mode: selection.item.id };
    for (const [k, el] of Object.entries(fields)) {
      if (el.type === 'checkbox') s[k] = el.checked;
      else if (el.type === 'number') s[k] = Number(el.value);
      else s[k] = el.value;
    }
    return normalize(s);
  }
  function writeSettings(s) {
    for (const [k, el] of Object.entries(fields)) {
      if (!(k in s)) continue;
      if (el.type === 'checkbox') el.checked = !!s[k];
      else el.value = s[k];
    }
    updateWeaponInfo();
    updateBehaviorHint();
    updateBestAndTrend();
    validateForm();
  }
  function prefs() { return LS.get('st.prefs', {}); }
  function modeDefaults(mode) {
    const p = prefs();
    return { ...ST.DEFAULT_SETTINGS, sound: p.sound ?? true, hitmarker: p.hitmarker ?? true, ...mode.settings };
  }

  function updateWeaponInfo() {
    const w = ST.WEAPONS[fields.weapon.value];
    if (!w) return;
    const rpm = Math.round(60 / w.fireDelay);
    const pellets = w.pellets ? ` × ${w.pellets} pellets` : '';
    $('weapon-info').innerHTML = [
      `<span>Damage <b>${w.dmg}${pellets}</b></span>`,
      `<span>Fire rate <b>${rpm} rpm</b></span>`,
      `<span>Bullet speed <b>${w.speed} u/s</b></span>`,
      `<span>Range <b>${w.range} units</b></span>`,
      `<span>Spread <b>${w.spread}° still, +${w.moveSpread}° moving</b></span>`,
      `<span>Mag <b>${w.mag}</b></span>`,
      `<span>Reload <b>${w.reload}s${w.reloadPerShell ? ' per shell' : ''}</b></span>`,
      // survev applies these two on every hit; both were missing from the trainer before.
      `<span>Damage at max range <b>${Math.round(w.dmg * w.falloff * 10) / 10}</b> <small>(${Math.round(w.falloff * 100)}% falloff floor)</small></span>`,
      `<span>Headshot <b>×${w.headshotMult}</b> <small>(15% of hits)</small></span>`,
      `<span>Switch delay <b>${w.switchDelay}s</b>${w.deployGroup !== undefined ? ` <small>(deploy group ${w.deployGroup})</small>` : ''}</span>`,
    ].join('');
    const sec = ST.WEAPONS[fields.secondary.value];
    const note = $('switch-note');
    if (!sec) note.textContent = '';
    else if (w.deployGroup !== undefined && w.deployGroup === sec.deployGroup) {
      note.textContent = `${w.name} and ${sec.name} share deploy group ${w.deployGroup}, so survev makes you pay the full ${sec.switchDelay}s switch delay: no quick-switching between them.`;
      note.className = 'field-hint warn';
    } else {
      note.textContent = `Quick switch available: the free switch costs ${ST.GC.player.baseSwitchDelay}s instead of ${sec.switchDelay}s, once every ${ST.GC.player.freeSwitchCooldown}s.`;
      note.className = 'field-hint';
    }
  }
  function updateBehaviorHint() {
    const b = ST.BEHAVIORS[fields.behavior.value];
    $('behavior-hint').textContent = b ? b.desc : '';
  }
  // Inline validation instead of silent rewriting.
  function validateForm() {
    const note = $('form-note');
    const min = Number(fields.minDist.value), max = Number(fields.maxDist.value);
    if (max <= min) { note.textContent = `Max spawn distance (${max}) must be greater than min (${min}); it will run as ${min + 1}.`; return; }
    if (Number(fields.duration.value) < 10) { note.textContent = 'Duration is at least 10 s.'; return; }
    // A 16:9 view is much shorter than it is wide, so a scope that "reaches" horizontally can still
    // hide targets directly above and below you. Say so rather than silently biasing the drill.
    const scope = fields.scope.value;
    const fits = ST.scopeMaxDist(scope);
    if (max > fits) {
      note.textContent = `At ${scope} you can only see ${fits} units above and below you, so targets at ${max} units will only ever appear to the sides. ${ST.scopeForDistance(max)} fits this range.`;
      return;
    }
    note.textContent = '';
  }

  function currentKey() {
    if (selection.kind === 'routine') return `routine:${selection.item.id}`;
    return drillKey(readSettings());
  }
  function relDay(day) {
    const today = ST.history.today();
    if (day === today) return 'today';
    const d = Math.round((new Date(today) - new Date(day)) / 86400000);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  function updateBestAndTrend() {
    const key = currentKey();
    const runs = ST.history.forKey(key).slice(-40);
    const summary = ST.charts.trend($('trend'), runs, tip);
    $('trend-text').textContent = summary;
    $('trend-title').textContent = selection.kind === 'routine' ? `${selection.item.name} score over runs` : 'Score over runs, this drill and weapon';
    const b = ST.history.best(key, 'score');
    const el = $('best');
    if (!b) { el.textContent = runs.length ? `Only warm-up runs so far. ${WARMUP_COPY}` : 'No previous runs.'; return; }
    const parts = [`Best ${Math.round(b.score)}`, `${b.hitsPerSec.toFixed(2)} hits/s`, `${(b.accuracy * 100).toFixed(0)}% accuracy`];
    if (selection.kind === 'routine' && selection.item.id === 'benchmark') parts.push(`average tier ${tierFromFrac(b.score / 100).name}`);
    parts.push(relDay(b.day));
    el.textContent = parts.join(' · ');
  }
  function tierFromFrac(f) {
    let t = ST.TIERS[0];
    for (const tier of ST.TIERS) if (f >= tier.min) t = tier;
    return t;
  }

  for (const el of Object.values(fields)) el.addEventListener('change', () => { updateWeaponInfo(); updateBehaviorHint(); updateBestAndTrend(); validateForm(); });
  for (const el of [fields.minDist, fields.maxDist, fields.duration]) el.addEventListener('input', validateForm);

  // ---------- lists ----------
  function makeButton(container, title, sub, onClick) {
    const b = document.createElement('button');
    b.className = 'mode-btn';
    b.type = 'button';
    b.innerHTML = `${title}<small>${sub}</small>`;
    b.addEventListener('click', onClick);
    container.appendChild(b);
    return b;
  }
  for (const r of ST.ROUTINES) {
    // Length is derived from the steps and rests, so it can never drift from what actually runs.
    const secs = ST.routineSeconds(r, stepSpec);
    r._seconds = secs;
    const mins = Math.round(secs / 60);
    r._btn = makeButton($('routine-list'), r.name, `${r.steps.length} steps · ${mins} min`, () => select('routine', r));
  }
  for (const m of ST.MODES) {
    m._btn = makeButton($('mode-list'), m.name, m.settings.weapon ? ST.WEAPONS[m.settings.weapon].name + ' · ' + m.settings.scope : 'Your rules', () => select('mode', m));
  }

  function stepSpec(step) {
    // Resolve a routine step into { label, key, settings, scenario?, mode?, scored, tip }.
    if (typeof step === 'string') step = { scenario: step };
    const p = prefs();
    const base = { ...ST.DEFAULT_SETTINGS, sound: p.sound ?? true, hitmarker: p.hitmarker ?? true };
    if (step.scenario) {
      const sc = ST.SCENARIOS[step.scenario];
      const settings = normalize({ ...base, ...sc.settings, ...(step.settings || {}), mode: step.scenario, label: sc.name });
      const scored = sc.scored !== false;
      const custom = !!step.settings;
      const key = custom
        ? `${step.scenario}:${settings.weapon}:${settings.duration}:v${ST.BENCHMARK_VERSION}`
        : `${step.scenario}:v${ST.BENCHMARK_VERSION}`;
      return { label: sc.name, key, settings, scenario: step.scenario, scored, benchmark: !custom, tip: sc.tip || '' };
    }
    const m = ST.MODES.find(x => x.id === step.mode);
    const settings = normalize({ ...base, ...m.settings, ...(step.settings || {}), mode: m.id, label: m.name });
    return { label: m.name, key: drillKey(settings), settings, mode: m.id, scored: true, tip: m.tip || '' };
  }

  function select(kind, item) {
    selection = { kind, item };
    for (const x of ST.ROUTINES) { x._btn.classList.toggle('active', x === item); x._btn.setAttribute('aria-current', x === item ? 'true' : 'false'); }
    for (const x of ST.MODES) { x._btn.classList.toggle('active', x === item); x._btn.setAttribute('aria-current', x === item ? 'true' : 'false'); }
    $('mode-title').textContent = item.name;
    $('mode-desc').textContent = item.desc;
    $('mode-tip').textContent = item.tip || '';
    const isRoutine = kind === 'routine';
    $('drill-form').classList.toggle('hidden', isRoutine);
    $('routine-steps').classList.toggle('hidden', !isRoutine);
    $('btn-reset').classList.toggle('hidden', isRoutine);
    $('form-note').textContent = '';
    if (isRoutine) {
      const steps = item.steps.map(stepSpec);
      $('routine-steps').innerHTML = `<b>${item.shuffle ? 'Shuffled order' : 'Fixed order'}, ${item.rest} s rest between steps. ${Math.round(item._seconds / 60 * 10) / 10} minutes end to end.</b><ol>` +
        steps.map(st => {
          const w = ST.WEAPONS[st.settings.weapon];
          const b = st.scored ? ST.history.best(st.key, 'score') : null;
          const extra = [st.settings.secondary ? '+' + ST.WEAPONS[st.settings.secondary].name : '', st.settings.throwable ? '+' + ST.THROWABLES[st.settings.throwable].name : ''].filter(Boolean).join(' ');
          return `<li>${st.label} <span>· ${w.name}${extra ? ' ' + extra : ''} · ${st.settings.scope} · ${st.settings.duration}s${st.settings.adaptive ? ' · adaptive' : ''}${b ? ` · best ${Math.round(b.score)}` : ''}</span></li>`;
        }).join('') + '</ol>';
      updateBestAndTrend();
    } else {
      const saved = LS.get('st.lastSettings.' + item.id, null);
      writeSettings(saved || modeDefaults(item));
      // Custom is the one drill whose point is the full parameter set.
      $('advanced').open = item.id === 'custom';
    }
    LS.set('st.lastSelection', { kind, id: item.id });
  }
  $('btn-reset').addEventListener('click', () => writeSettings(modeDefaults(selection.item)));

  // ---------- screens ----------
  function show(name) {
    current = name;
    for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
    const inRun = name === null;
    hud.classList.toggle('hidden', !inRun && name !== 'pause');
    hud.setAttribute('aria-hidden', inRun ? 'false' : 'true');
    // The world runs behind the menu and results, and stops while a drill is on the same canvas stack.
    const wantBackdrop = name === 'menu' || name === 'results';
    backdrop.classList.toggle('hidden', !wantBackdrop);
    if (wantBackdrop) ST.menuScene.start(backdrop); else ST.menuScene.stop();
    if (name === 'menu') updateSession();
    if (name === 'pause') { disarmQuit(); $('btn-resume').focus(); }
    if (name === 'rest') $('btn-rest-skip').focus();
    if (name === 'results') $('btn-menu').focus();
  }
  function updateSession() {
    const min = ST.history.minutesToday();
    const n = ST.history.runsToday().length;
    const el = $('session-today');
    el.textContent = `Today: ${Math.round(min)} min · ${n} run${n === 1 ? '' : 's'}${min > 45 ? ' · past 45 min, returns are diminishing' : ''}`;
    el.parentElement.classList.toggle('over', min > 45);
  }
  $('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => { $('form-note').textContent = 'Fullscreen was blocked by the browser. Press F11 instead.'; });
  });
  document.addEventListener('fullscreenchange', () => { $('btn-fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });

  // Clear history: two clicks, no modal.
  let clearArmed = null;
  $('btn-clear').addEventListener('click', () => {
    const b = $('btn-clear');
    if (clearArmed) { clearTimeout(clearArmed); clearArmed = null; ST.history.clear(); b.textContent = 'History cleared'; select(selection.kind, selection.item); updateSession(); setTimeout(() => { b.textContent = 'Clear history'; }, 2000); return; }
    b.textContent = 'Click again to clear all runs';
    clearArmed = setTimeout(() => { clearArmed = null; b.textContent = 'Clear history'; }, 4000);
  });

  // ---------- sequence runner ----------
  function startSequence(spec) {
    lastSeqSpec = spec;
    let steps = spec.steps.slice();
    if (spec.routine && spec.routine.shuffle) {
      const head = steps.filter(s => s.scenario === 'warmup');
      const rest = steps.filter(s => s.scenario !== 'warmup');
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      steps = head.concat(rest);
    }
    seq = { steps, index: 0, results: [], routine: spec.routine || null, aborted: false };
    runStep();
  }

  function runStep() {
    const step = seq.steps[seq.index];
    if (game) game.stop();
    const settings = { ...step.settings };
    LS.set('st.prefs', { sound: settings.sound, hitmarker: settings.hitmarker });
    step.warmup = step.scored ? ST.history.isWarmup() : false;
    // Sprites are tiny SVGs, but the first run must not start before they exist.
    ST.assets.load().then(() => {
      game = new ST.Game(canvas, settings, {
        onHud: updateHud,
        onPause: (paused) => show(paused ? 'pause' : null),
        onFinish: (r) => onStepFinish(step, r),
      });
      ST.currentGame = game;
      show(null);
      lastHud = '';
      game.start();
    });
  }

  function onStepFinish(step, r) {
    const entry = { step, result: r, scenario: step.scenario, key: step.key, recorded: false };
    if (r.time >= step.settings.duration * 0.5) {
      const w = ST.WEAPONS[step.settings.weapon];
      if (step.scored) entry.prevBest = ST.history.best(step.key, 'score');
      entry.run = ST.history.add({
        key: step.key, label: step.label, weapon: w.name, scope: step.settings.scope, duration: r.time,
        score: step.scored ? r.score : null, hitsPerSec: r.hitsPerSec, accuracy: r.accuracy, kills: r.kills, avgTtk: r.avgTtk,
        difficulty: step.settings.adaptive ? r.difficulty : null, warmup: step.warmup, benchmark: !!step.benchmark,
      });
      entry.recorded = true;
    }
    seq.results.push(entry);
    if (seq.aborted || seq.index >= seq.steps.length - 1) { finishSequence(); return; }
    seq.index++;
    showRest(entry);
  }

  function showRest(entry) {
    const next = seq.steps[seq.index];
    const r = entry.result;
    $('rest-step').textContent = `Step ${seq.index} of ${seq.steps.length} done`;
    $('rest-last').innerHTML = entry.step.scored
      ? `${entry.step.label}: <b>${Math.round(r.score)}</b> score · ${r.hitsPerSec.toFixed(2)} hits/s · ${Math.round(r.accuracy * 100)}% accuracy${entry.step.warmup ? ' · warm-up, not counted' : ''}`
      : `${entry.step.label} done.`;
    const w = ST.WEAPONS[next.settings.weapon];
    $('rest-next').textContent = `Next: ${next.label} · ${w.name} · ${next.settings.scope} · ${next.settings.duration}s`;
    $('rest-tip').textContent = next.tip || '';
    let n = (seq.routine && seq.routine.rest) || 15;
    $('rest-count').textContent = n;
    show('rest');
    clearInterval(restTimer);
    restTimer = setInterval(() => {
      n--; $('rest-count').textContent = n;
      if (n <= 0) { clearInterval(restTimer); runStep(); }
    }, 1000);
  }
  $('btn-rest-skip').addEventListener('click', () => { clearInterval(restTimer); runStep(); });
  $('btn-rest-quit').addEventListener('click', () => { clearInterval(restTimer); finishSequence(); });

  function finishSequence() {
    if (game) { game.stop(); game = null; }
    const scored = seq.results.filter(e => e.step.scored);
    if (seq.routine && scored.length) {
      const fracs = scored.map(e => e.scenario && ST.SCENARIOS[e.scenario].ref ? e.result.score / ST.SCENARIOS[e.scenario].ref : null).filter(x => x !== null);
      if (fracs.length) {
        const avg = fracs.reduce((a, b) => a + b, 0) / fracs.length;
        ST.history.add({
          key: `routine:${seq.routine.id}`, label: seq.routine.name, duration: scored.reduce((a, e) => a + e.result.time, 0),
          score: avg * 100, hitsPerSec: scored.reduce((a, e) => a + e.result.hitsPerSec, 0) / scored.length,
          accuracy: scored.reduce((a, e) => a + e.result.accuracy, 0) / scored.length, warmup: false,
        });
      }
    }
    showResults();
  }

  function startFromMenu() {
    if (selection.kind === 'routine') {
      startSequence({ routine: selection.item, steps: selection.item.steps.map(stepSpec) });
    } else {
      const s = readSettings();
      LS.set('st.lastSettings.' + s.mode, s);
      startSequence({ steps: [{ label: selection.item.name, key: drillKey(s), settings: { ...s, label: selection.item.name }, mode: s.mode, scored: true, tip: selection.item.tip || '' }] });
    }
  }
  $('btn-start').addEventListener('click', startFromMenu);
  $('btn-resume').addEventListener('click', () => game && game.togglePause());

  // Ending a multi-step routine from pause takes two clicks; a single drill ends at once.
  let quitArmed = null;
  function disarmQuit() {
    clearTimeout(quitArmed); quitArmed = null;
    const b = $('btn-quit');
    b.classList.remove('armed');
    b.textContent = seq && seq.steps.length > 1 ? 'End routine' : 'End drill';
    $('pause-sub').textContent = seq && seq.steps.length > 1 ? `Step ${seq.index + 1} of ${seq.steps.length}. Esc or Resume to continue.` : 'Esc or Resume to continue.';
  }
  $('btn-quit').addEventListener('click', () => {
    if (!game) return;
    const multi = seq && seq.steps.length > 1;
    if (multi && !quitArmed) {
      const b = $('btn-quit');
      b.classList.add('armed'); b.textContent = 'Click again to end';
      quitArmed = setTimeout(disarmQuit, 3000);
      return;
    }
    seq.aborted = true; game.paused = false; game.finish();
  });
  $('btn-menu').addEventListener('click', () => { ST.menuScene.rebuild(); show('menu'); select(selection.kind, selection.item); });
  $('btn-again').addEventListener('click', () => lastSeqSpec && startSequence(lastSeqSpec));

  // Keyboard accelerators on screens (the game binds its own keys while running).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    const isListItem = t && t.classList && t.classList.contains('mode-btn');
    if (t && !isListItem && (t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SUMMARY')) return;
    if (current === 'menu') { e.preventDefault(); startFromMenu(); }
    else if (current === 'rest') { e.preventDefault(); clearInterval(restTimer); runStep(); }
    else if (current === 'results') { e.preventDefault(); $('btn-menu').click(); }
  });

  // ---------- HUD ----------
  const hudEls = {
    timer: $('hud-timer'), kills: $('hud-kills'), deaths: $('hud-deaths'), step: $('hud-step'),
    health: $('hud-health-fill'), healthText: $('hud-health-text'), weapon: $('hud-weapon'), mag: $('hud-mag'),
    reload: $('hud-reload'), reloadFill: $('hud-reload-fill'), diff: $('hud-diff'), slots: $('hud-slots'),
    spin: $('hud-spin'), spinFill: $('hud-spin-fill'),
  };
  let lastHud = '';
  let lastSlots = '';
  function updateHud(h) {
    const remaining = Math.max(0, h.duration - h.time);
    const m = Math.floor(remaining / 60);
    const s = Math.ceil(remaining - m * 60);
    hudEls.timer.textContent = `${m}:${String(s === 60 ? 59 : s).padStart(2, '0')}`;
    const key = `${h.kills}|${h.deaths}|${h.hp}|${h.ammo}|${h.reloading}|${h.difficulty === null ? '' : h.difficulty.toFixed(2)}`;
    if (key !== lastHud) {
      lastHud = key;
      hudEls.kills.textContent = h.kills;
      hudEls.deaths.textContent = h.deaths ? ` · ${h.deaths} ${h.deaths === 1 ? 'death' : 'deaths'}` : '';
      hudEls.step.textContent = h.label ? `${h.label}${seq && seq.steps.length > 1 ? ` · step ${seq.index + 1} of ${seq.steps.length}` : ''}` : '';
      hudEls.health.style.transform = `scaleX(${Math.max(0, h.hp / h.maxHp)})`;
      hudEls.health.style.background = h.hp > 50 ? '#fff' : h.hp > 25 ? '#ffd35c' : '#ff5b5b';
      hudEls.healthText.textContent = Math.ceil(h.hp);
      hudEls.weapon.textContent = h.weapon;
      hudEls.mag.textContent = h.ammo;
      hudEls.mag.classList.toggle('empty', h.ammo === 0);
      // Weapon slots, survev-style: the number key, the name and what is left in it.
      const slotKey = h.slots.map(sl => `${sl.key}${sl.active ? '*' : ''}${sl.ammo}`).join('|');
      if (slotKey !== lastSlots) {
        lastSlots = slotKey;
        hudEls.slots.innerHTML = h.slots.length > 1 ? h.slots.map(sl =>
          `<div class="slot${sl.active ? ' active' : ''}"><span class="k">${sl.key}</span><span class="n">${sl.name}</span><span class="a">${sl.ammo}${sl.mag ? '/' + sl.mag : ''}</span></div>`).join('') : '';
      }
      hudEls.reload.style.visibility = h.reloading ? 'visible' : 'hidden';
      hudEls.diff.textContent = h.difficulty === null ? '' : `adaptive difficulty ${Math.round(h.difficulty * 100)} / 100`;
    }
    hudEls.reloadFill.style.width = (h.reloadFrac * 100) + '%';
    // The only live readout the trainer adds: how hard you are spinning, because you cannot see your
    // own angular velocity and the whole point of the drill is learning what "spinning" feels like.
    hudEls.spin.style.visibility = h.spin > 0.02 ? 'visible' : 'hidden';
    hudEls.spinFill.style.transform = `scaleX(${h.spin.toFixed(2)})`;
  }

  // ---------- results ----------
  const fmt = {
    pct: (v) => (v * 100).toFixed(1) + '%',
    sec: (v) => v === null || v === undefined ? '—' : v.toFixed(2) + 's',
    num: (v) => v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toString(),
    int: (v) => String(v),
  };
  const tierHtml = (t) => t ? `<span class="tier ${t.name}" title="Provisional tier: ${Math.round(t.frac * 100)}% of the reference score">${t.name}</span>` : '';
  const TIER_TITLE = 'Provisional: tiers are fractions of a hand-set reference score until real player data exists.';

  function heroBlock(r, prevBest, warmup, unit) {
    let delta = '';
    if (prevBest && !warmup) {
      const d = r.score - prevBest.score;
      delta = d >= 0.5 ? `<span class="delta up">▲ +${Math.round(d)} vs best</span>` : d <= -0.5 ? `<span class="delta down">▼ ${Math.round(d)} vs best</span>` : `<span class="delta flat">matches best</span>`;
    } else if (!warmup) delta = '<span class="delta flat">first counted run</span>';
    $('hero').innerHTML = `<span class="num ${warmup ? 'muted' : ''}">${Math.round(r.score)}</span><span class="unit">${unit}</span>${delta}`;
    $('substats').innerHTML = `<div><b>${r.hitsPerSec.toFixed(2)}</b> hits/s</div><div><b>${Math.round(r.accuracy * 100)}%</b> accuracy <small>(${r.hits}/${r.pellets})</small></div><div><b>${r.kills}</b> kills</div>`;
  }

  function showResults() {
    const entries = seq.results;
    const table = $('results-table');
    const insightsEl = $('insights');
    const strategyEl = $('strategy');
    const warm = $('warmup-note');
    strategyEl.classList.add('hidden');
    warm.classList.add('hidden');
    insightsEl.innerHTML = '';
    $('results-note').textContent = '';
    const multi = entries.length > 1;
    let roseSectors = [];

    if (multi) {
      const scored = entries.filter(e => e.step.scored);
      const fracs = scored.map(e => e.scenario && e.step.benchmark && ST.SCENARIOS[e.scenario].ref ? e.result.score / ST.SCENARIOS[e.scenario].ref : null).filter(x => x !== null);
      const avgFrac = fracs.length ? fracs.reduce((a, b) => a + b, 0) / fracs.length : null;
      const avgTier = avgFrac !== null ? tierFromFrac(avgFrac) : null;
      // Hero: overall tier for a benchmark, otherwise the number of counted steps.
      if (avgTier) {
        $('hero').innerHTML = `<span class="num">${Math.round(avgFrac * 100)}</span><span class="unit">% of reference · overall <span class="tier ${avgTier.name}" title="${TIER_TITLE}">${avgTier.name}</span></span>`;
        $('substats').innerHTML = `<div><b>${scored.length}</b> scored steps</div><div><b>${scored.filter(e => e.prevBest && e.result.score > e.prevBest.score).length}</b> new bests</div><div><b>${Math.round(entries.reduce((a, e) => a + e.result.time, 0) / 60)}</b> min</div>`;
      } else {
        $('hero').innerHTML = `<span class="num">${scored.length}</span><span class="unit">steps done</span>`;
        $('substats').innerHTML = `<div><b>${scored.filter(e => e.prevBest && e.result.score > e.prevBest.score).length}</b> new bests</div><div><b>${Math.round(entries.reduce((a, e) => a + e.result.time, 0) / 60)}</b> min</div>`;
      }
      table.innerHTML = `<tr><th>Scenario</th><th>Score</th><th>Tier</th><th>vs best</th></tr>` + entries.map(e => {
        const r = e.result;
        const t = e.scenario && e.step.benchmark && !e.step.warmup ? ST.tierFor(e.scenario, r.score) : null;
        let delta = '<td></td>';
        if (e.step.scored && e.step.warmup) delta = '<td><small>warm-up</small></td>';
        else if (e.step.scored && !e.recorded) delta = '<td><small>ended early</small></td>';
        else if (e.step.scored && e.prevBest) { const d = r.score - e.prevBest.score; delta = `<td class="${d >= 0 ? 'delta-up' : 'delta-down'}">${d >= 0 ? '+' : ''}${Math.round(d)}</td>`; }
        else if (e.step.scored) delta = '<td><small>first</small></td>';
        const scoreCell = e.step.scored ? `${Math.round(r.score)}<br><small>${r.hitsPerSec.toFixed(2)} hits/s · ${Math.round(r.accuracy * 100)}%</small>` : `<small>${r.hitsPerSec.toFixed(2)} hits/s · ${Math.round(r.accuracy * 100)}%</small>`;
        return `<tr><td>${e.step.label}</td><td>${scoreCell}</td><td>${tierHtml(t)}</td>${delta}</tr>`;
      }).join('');
      const hasWarm = scored.some(e => e.step.warmup);
      if (hasWarm) { warm.textContent = `Rows marked warm-up: ${WARMUP_COPY}`; warm.classList.remove('hidden'); }
      $('results-sub').innerHTML = `${seq.routine ? seq.routine.name : 'Sequence'} · ${entries.length} steps${avgTier ? ' · <small>tiers are provisional thresholds</small>' : ''}`;
      if (seq.routine && seq.routine.id === 'benchmark') $('results-note').textContent = 'The Benchmark is a ruler: re-run it in about a week, not today.';
      const strat = ST.strategyCheck(entries);
      if (strat) { strategyEl.textContent = strat.text; strategyEl.className = 'insight ' + (strat.adapted ? 'ok' : ''); }
      const weakest = scored.filter(e => e.scenario && ST.SCENARIOS[e.scenario].ref).sort((a, b) => a.result.score / ST.SCENARIOS[a.scenario].ref - b.result.score / ST.SCENARIOS[b.scenario].ref)[0] || scored[scored.length - 1];
      if (weakest) {
        const ins = ST.insights(weakest.result, weakest.step.settings);
        insightsEl.innerHTML = `<p class="insight-from">From ${weakest.step.label}, your weakest step</p>` + (ins.length ? ins.map(i => `<div class="insight">${i.text}</div>`).join('') : '<div class="insight ok">Nothing stands out. Keep the tempo up.</div>');
      }
      // Pool flick directions across every step that measured them.
      roseSectors = mergeSectors(entries.map(e => e.result.kinematics).filter(Boolean));
    } else {
      const e = entries[0];
      const r = e.result, s = e.step.settings;
      const prev = e.prevBest;
      const better = (k, lower) => e.recorded && !e.step.warmup && (prev && prev[k] !== null && prev[k] !== undefined ? (lower ? r[k] < prev[k] : r[k] > prev[k]) : true);
      const prevOf = (k, f) => prev && prev[k] !== null && prev[k] !== undefined ? 'best ' + f(prev[k]) : '';
      const k = r.kinematics;
      heroBlock(r, prev, e.step.warmup, 'score');
      const rows = [];
      const row = (label, val, best, isNew) => rows.push(`<tr><td>${label}</td><td class="${isNew ? 'new-best' : ''}">${val}</td><td>${best}</td></tr>`);
      const section = (name) => rows.push(`<tr class="section"><td colspan="3">${name}</td></tr>`);
      row('Avg time to kill', fmt.sec(r.avgTtk), prevOf('avgTtk', fmt.sec), r.avgTtk !== null && better('avgTtk', true));
      if (s.invincible) row('Cursor on target', fmt.pct(r.onTargetFrac), '', false);
      if (s.ttl > 0 && s.behavior !== 'flee') row('Targets escaped', fmt.int(r.expired), '', false);
      if (s.adaptive) row('Adaptive difficulty reached', `${Math.round(r.difficulty * 100)} / 100`, prevOf('difficulty', (v) => `${Math.round(v * 100)} / 100`), false);
      if (k && k.n >= 3) {
        section('Flick kinematics');
        row('Flicks analysed', fmt.int(k.n), '', false);
        row('Reaction (target appears → move starts)', fmt.sec(k.reaction), '', false);
        row('Movement time (move starts → hit)', fmt.sec(k.moveTime), '', false);
        row('Overshoot gain', k.gain === null ? '—' : `${k.gain.toFixed(2)} <small>(1.00 = exact)</small>`, '', false);
        row('Movements per target', fmt.num(k.peaks), '', false);
      }
      section('Movement');
      row('Shots fired while moving', fmt.pct(r.movingShotFrac), '', false);
      if (r.accMoving !== null && r.accStill !== null) row('Accuracy moving / standing', `${fmt.pct(r.accMoving)} / ${fmt.pct(r.accStill)}`, '', false);
      if (s.behavior === 'flee') { row('Time spent moving', fmt.pct(r.movingFrac), '', false); row('Enemies got away', fmt.int(r.expired), '', false); }
      if (s.enemyShoots) {
        section('Under fire');
        row('Deaths', fmt.int(r.deaths), '', false);
        row('Damage taken per minute', fmt.num(r.dmgTakenPerMin), '', false);
        row('Damage taken while standing still', r.stillDmgFrac === null ? '—' : fmt.pct(r.stillDmgFrac), '', false);
      }
      // Spinning is only worth reporting once you actually did some.
      if (r.spinFrac > 0.03) {
        section('Spinning');
        row('Time spent spinning', fmt.pct(r.spinFrac), '', false);
        if (r.accSpinning !== null && r.accNotSpinning !== null) {
          row('Accuracy spinning / steady', `${fmt.pct(r.accSpinning)} / ${fmt.pct(r.accNotSpinning)}`, '', false);
        }
        if (r.dmgTakenPerMinSpinning !== null && r.dmgTakenPerMinSteady !== null) {
          row('Damage taken per minute, spinning / steady', `${fmt.num(r.dmgTakenPerMinSpinning)} / ${fmt.num(r.dmgTakenPerMinSteady)}`, '', false);
        }
      }
      if (s.secondary) {
        section('Weapon switching');
        row('Switches', fmt.int(r.switches), '', false);
        row('Shots that beat the primary’s fire delay', fmt.int(r.quickSwitchShots), '', false);
        row('Average gap between the two guns’ shots', fmt.sec(r.avgSwitchGap), '', false);
      }
      if (s.throwable) {
        section('Throwables');
        row('Grenades thrown', fmt.int(r.nadesThrown), '', false);
        row('Damage per grenade', fmt.num(r.nadeDmgPerThrow), '', false);
        row('Kills by grenade', fmt.int(r.nadeKills), '', false);
        row('Average cook time', fmt.sec(r.avgCookTime), '', false);
        row('Damage you took from your own grenades', fmt.num(r.nadeSelfDmg), '', false);
      }
      if (s.barrels > 0) {
        section('Barrels');
        row('Rounds that bounced off a barrel', fmt.int(r.ricochetPellets), '', false);
        row('Bounced rounds that hit', `${fmt.int(r.ricochetHits)}${r.ricochetRate !== null ? ` <small>(${fmt.pct(r.ricochetRate)})</small>` : ''}`, '', false);
        row('Damage dealt by bounced rounds', fmt.num(r.ricochetDmg), '', false);
        row('Barrels detonated', fmt.int(r.barrelsPopped), '', false);
        row('Damage you took from your own ricochets', fmt.num(r.ricochetSelfDmg), '', false);
      }
      if (r.headshots) row('Headshots landed', `${fmt.int(r.headshots)} <small>(survev rolls 15% per hit)</small>`, '', false);
      table.innerHTML = rows.join('');
      const t = e.scenario && e.step.benchmark && !e.step.warmup ? ST.tierFor(e.scenario, r.score) : null;
      $('results-sub').innerHTML = `${e.step.label} · ${ST.WEAPONS[s.weapon].name} · ${s.scope} · ${Math.round(r.time)}s${t ? ' · ' + tierHtml(t) : ''}`;
      if (e.step.warmup) { warm.textContent = `Warm-up run, not counted toward bests. ${WARMUP_COPY}`; warm.classList.remove('hidden'); }
      if (!e.recorded) $('results-note').textContent = 'Ended before the halfway mark, so this run was not recorded.';
      const ins = ST.insights(r, s);
      insightsEl.innerHTML = ins.length ? ins.map(i => `<div class="insight">${i.text}</div>`).join('') : '<div class="insight ok">Nothing stands out. Keep the tempo up.</div>';
      roseSectors = k ? k.sectors : [];
    }
    // Draw the rose only once the panel is visible so the canvas has real dimensions.
    const roseValid = roseSectors.filter(s => s.n > 0 && s.firstHit !== null).length >= 2;
    $('rose-block').classList.toggle('hidden', !roseValid);
    show('results');
    if (roseValid) requestAnimationFrame(() => { $('rose-text').textContent = ST.charts.rose($('rose'), roseSectors, tip); });
  }

  function mergeSectors(list) {
    const out = [];
    for (let i = 0; i < 8; i++) {
      let n = 0, fh = 0, fhN = 0, g = 0, gN = 0;
      for (const k of list) {
        const s = k.sectors[i]; if (!s || !s.n) continue;
        n += s.n;
        if (s.firstHit !== null) { fh += s.firstHit * s.n; fhN += s.n; }
        if (s.gain !== null) { g += s.gain * s.n; gN += s.n; }
      }
      out.push({ n, firstHit: fhN ? fh / fhN : null, gain: gN ? g / gN : null });
    }
    return out;
  }

  // ---------- boot ----------
  const last = LS.get('st.lastSelection', null);
  let initial = null;
  if (last && last.kind === 'routine') initial = ['routine', ST.ROUTINES.find(r => r.id === last.id)];
  else if (last) initial = ['mode', ST.MODES.find(m => m.id === last.id)];
  if (!initial || !initial[1]) initial = ['routine', ST.ROUTINES[0]];
  select(initial[0], initial[1]);
  show('menu');
  ST.assets.load().then(() => { if (current === 'menu' || current === 'results') ST.menuScene.start(backdrop); });
})();
