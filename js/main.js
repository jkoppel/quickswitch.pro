// Menu, HUD, pause and results screens.
(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const screens = { menu: $('menu'), pause: $('pause'), results: $('results') };
  const hud = $('hud');

  let currentMode = ST.MODES[0];
  let game = null;
  let lastSettings = null;

  // ---------- persistence ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const bestKey = (s) => `st.best.${s.mode}.${s.weapon}`;

  // ---------- form ----------
  const fields = {
    weapon: $('f-weapon'), scope: $('f-scope'), duration: $('f-duration'), enemies: $('f-enemies'),
    behavior: $('f-behavior'), enemyHp: $('f-hp'), minDist: $('f-mind'), maxDist: $('f-maxd'), ttl: $('f-ttl'),
    enemyAim: $('f-aim'), enemyShoots: $('f-shoots'), obstacles: $('f-obstacles'), sound: $('f-sound'), hitmarker: $('f-hitmarker'),
  };
  function fill(select, entries) {
    select.innerHTML = '';
    for (const [value, label] of entries) {
      const o = document.createElement('option');
      o.value = value; o.textContent = label;
      select.appendChild(o);
    }
  }
  fill(fields.weapon, Object.entries(ST.WEAPONS).map(([k, w]) => [k, `${w.name} (${ST.AMMO[w.ammo].label})`]));
  fill(fields.scope, Object.keys(ST.SCOPES).map(k => [k, k]));
  fill(fields.behavior, Object.entries(ST.BEHAVIORS).map(([k, b]) => [k, b.name]));
  fill(fields.enemyAim, Object.entries(ST.AIM_SKILL).map(([k, a]) => [k, a.name]));

  function readSettings() {
    const s = { mode: currentMode.id };
    for (const [k, el] of Object.entries(fields)) {
      if (el.type === 'checkbox') s[k] = el.checked;
      else if (el.type === 'number') s[k] = Number(el.value);
      else s[k] = el.value;
    }
    s.enemies = Math.max(1, Math.min(8, s.enemies | 0));
    s.duration = Math.max(10, s.duration || 60);
    s.enemyHp = Math.max(1, s.enemyHp || 100);
    s.minDist = Math.max(2, s.minDist || 8);
    s.maxDist = Math.max(s.minDist + 1, s.maxDist || 16);
    s.ttl = Math.max(0, s.ttl || 0);
    s.respawnDelay = s.ttl > 0 ? 0.2 : 0.5;
    return s;
  }
  function writeSettings(s) {
    for (const [k, el] of Object.entries(fields)) {
      if (!(k in s)) continue;
      if (el.type === 'checkbox') el.checked = !!s[k];
      else el.value = s[k];
    }
    updateWeaponInfo();
    updateBest();
  }
  function modeDefaults(mode) {
    const prefs = LS.get('st.prefs', {});
    return { ...ST.DEFAULT_SETTINGS, sound: prefs.sound ?? true, hitmarker: prefs.hitmarker ?? true, ...mode.settings };
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
      `<span>Range <b>${w.range}</b></span>`,
      `<span>Spread <b>${w.spread}° / ${w.moveSpread}° moving</b></span>`,
      `<span>Mag <b>${w.mag}</b></span>`,
      `<span>Reload <b>${w.reload}s${w.reloadPerShell ? ' per shell' : ''}</b></span>`,
    ].join('');
  }
  function updateBest() {
    const s = readSettings();
    const b = LS.get(bestKey(s), null);
    const el = $('best');
    if (!b) { el.textContent = 'No previous runs with this drill and weapon.'; return; }
    const parts = [`Best: ${b.kills} kills`, `${(b.accuracy * 100).toFixed(1)}% accuracy`];
    if (b.avgTtk !== null) parts.push(`${b.avgTtk.toFixed(2)}s avg time-to-kill`);
    el.textContent = parts.join(' · ');
  }

  for (const el of Object.values(fields)) {
    el.addEventListener('change', () => { updateWeaponInfo(); updateBest(); });
  }

  // ---------- mode list ----------
  const list = $('mode-list');
  for (const m of ST.MODES) {
    const b = document.createElement('button');
    b.className = 'mode-btn';
    b.innerHTML = `${m.name}<small>${m.settings.weapon ? ST.WEAPONS[m.settings.weapon].name + ' · ' + m.settings.scope : 'Your rules'}</small>`;
    b.addEventListener('click', () => selectMode(m));
    m._btn = b;
    list.appendChild(b);
  }
  function selectMode(m, keepForm) {
    currentMode = m;
    for (const x of ST.MODES) x._btn.classList.toggle('active', x === m);
    $('mode-title').textContent = m.name;
    $('mode-desc').textContent = m.desc;
    $('mode-tip').textContent = m.tip;
    if (!keepForm) writeSettings(modeDefaults(m));
    LS.set('st.lastMode', m.id);
  }
  $('btn-reset').addEventListener('click', () => writeSettings(modeDefaults(currentMode)));

  // ---------- screens ----------
  function show(name) {
    for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
    hud.classList.toggle('hidden', name === 'menu' || name === 'results');
  }

  function startGame(settings) {
    if (game) game.stop();
    lastSettings = settings;
    LS.set('st.prefs', { sound: settings.sound, hitmarker: settings.hitmarker });
    LS.set('st.lastSettings.' + settings.mode, settings);
    game = new ST.Game(canvas, settings, {
      onHud: updateHud,
      onPause: (paused) => show(paused ? 'pause' : null),
      onFinish: showResults,
    });
    ST.currentGame = game;
    show(null);
    game.start();
  }

  $('btn-start').addEventListener('click', () => startGame(readSettings()));
  $('btn-resume').addEventListener('click', () => game && game.togglePause());
  $('btn-quit').addEventListener('click', () => { if (game) { game.paused = false; game.finish(); } });
  $('btn-menu').addEventListener('click', () => { show('menu'); updateBest(); });
  $('btn-again').addEventListener('click', () => startGame(lastSettings));

  // ---------- HUD ----------
  const hudEls = {
    timer: $('hud-timer'), kills: $('hud-kills'), acc: $('hud-acc'), deaths: $('hud-deaths'),
    health: $('hud-health-fill'), healthText: $('hud-health-text'), weapon: $('hud-weapon'), mag: $('hud-mag'),
    reload: $('hud-reload'), reloadFill: $('hud-reload-fill'),
  };
  let lastHud = '';
  function updateHud(h) {
    const remaining = Math.max(0, h.duration - h.time);
    const m = Math.floor(remaining / 60), s = Math.ceil(remaining % 60) % 60;
    const timer = `${m}:${String(remaining < 60 ? Math.ceil(remaining) : s).padStart(2, '0')}`;
    hudEls.timer.textContent = m === 0 ? `0:${String(Math.ceil(remaining)).padStart(2, '0')}` : timer;
    const key = `${h.kills}|${h.deaths}|${h.accuracy.toFixed(3)}|${h.hp}|${h.ammo}|${h.reloading}`;
    if (key !== lastHud) {
      lastHud = key;
      hudEls.kills.textContent = h.kills;
      hudEls.acc.textContent = (h.accuracy * 100).toFixed(0) + '%';
      hudEls.deaths.textContent = h.deaths ? ` · ${h.deaths} deaths` : '';
      hudEls.health.style.width = (100 * h.hp / h.maxHp) + '%';
      hudEls.health.style.background = h.hp > 50 ? '#fff' : h.hp > 25 ? '#ffd35c' : '#ff5b5b';
      hudEls.healthText.textContent = Math.ceil(h.hp);
      hudEls.weapon.textContent = h.weapon;
      hudEls.mag.textContent = h.ammo;
      hudEls.mag.classList.toggle('empty', h.ammo === 0);
      hudEls.reload.style.visibility = h.reloading ? 'visible' : 'hidden';
    }
    hudEls.reloadFill.style.width = (h.reloadFrac * 100) + '%';
  }

  // ---------- results ----------
  function showResults(r) {
    const s = lastSettings;
    const prev = LS.get(bestKey(s), null);
    const better = {
      kills: !prev || r.kills > prev.kills,
      accuracy: !prev || r.accuracy > prev.accuracy,
      avgTtk: r.avgTtk !== null && (!prev || prev.avgTtk === null || r.avgTtk < prev.avgTtk),
      avgReaction: r.avgReaction !== null && (!prev || prev.avgReaction === null || r.avgReaction < prev.avgReaction),
      dps: !prev || r.dps > prev.dps,
    };
    const fmt = {
      pct: (v) => (v * 100).toFixed(1) + '%',
      sec: (v) => v === null ? '—' : v.toFixed(2) + 's',
      num: (v) => v === null ? '—' : (Math.round(v * 10) / 10).toString(),
      int: (v) => String(v),
    };
    const prevOf = (k, f) => prev && prev[k] !== undefined && prev[k] !== null ? 'best ' + f(prev[k]) : '';
    const rows = [
      ['Kills', fmt.int(r.kills), prevOf('kills', fmt.int), better.kills],
      ['Accuracy (hits / bullets)', `${fmt.pct(r.accuracy)}  (${r.hits}/${r.pellets})`, prevOf('accuracy', fmt.pct), better.accuracy],
      ['Avg time to kill', fmt.sec(r.avgTtk), prevOf('avgTtk', fmt.sec), better.avgTtk],
      ['Median time to kill', fmt.sec(r.medianTtk), '', false],
      ['Avg reaction (spawn → first hit)', fmt.sec(r.avgReaction), prevOf('avgReaction', fmt.sec), better.avgReaction],
      ['Avg engage (first hit → kill)', fmt.sec(r.avgEngage), '', false],
      ['Shots per kill', fmt.num(r.shotsPerKill), '', false],
      ['Damage per second', fmt.num(r.dps), prevOf('dps', fmt.num), better.dps],
      ['Kills per minute', fmt.num(r.killsPerMin), '', false],
    ];
    if (s.ttl > 0) rows.push(['Targets escaped', fmt.int(r.expired), '', false]);
    if (s.enemyShoots) {
      rows.push(['Deaths', fmt.int(r.deaths), '', false]);
      rows.push(['Damage taken', fmt.int(Math.round(r.dmgTaken)), '', false]);
    }
    const table = $('results-table');
    table.innerHTML = rows.map(([label, val, best, isNew]) =>
      `<tr><td>${label}</td><td class="${isNew ? 'new-best' : ''}">${val}</td><td>${best}</td></tr>`).join('');
    $('results-sub').textContent = `${currentMode.name} · ${ST.WEAPONS[s.weapon].name} · ${s.scope} · ${Math.round(r.time)}s`;

    // Persist per-metric bests.
    const merged = prev ? { ...prev } : {};
    for (const k of ['kills', 'accuracy', 'dps']) if (better[k]) merged[k] = r[k];
    if (better.avgTtk) merged.avgTtk = r.avgTtk;
    if (better.avgReaction) merged.avgReaction = r.avgReaction;
    for (const k of ['kills', 'accuracy', 'dps', 'avgTtk', 'avgReaction']) if (merged[k] === undefined) merged[k] = r[k];
    LS.set(bestKey(s), merged);
    show('results');
  }

  // ---------- boot ----------
  const lastId = LS.get('st.lastMode', null);
  const initial = ST.MODES.find(m => m.id === lastId) || ST.MODES[0];
  selectMode(initial);
  const saved = LS.get('st.lastSettings.' + initial.id, null);
  if (saved) writeSettings(saved);
  show('menu');
})();
