// Menu, routine runner, HUD, rest, pause and results screens.
(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const screens = { menu: $('menu'), pause: $('pause'), rest: $('rest'), results: $('results') };
  const hud = $('hud');
  const tip = $('tip');

  let selection = { kind: 'mode', item: ST.MODES[0] };
  let game = null;
  let seq = null;          // active sequence: { steps, index, results, routine }
  let lastSeqSpec = null;  // for "Run again"
  let restTimer = null;

  // ---------- persistence ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const drillKey = (s) => `${s.mode}:${s.weapon}`;

  // ---------- form ----------
  const fields = {
    weapon: $('f-weapon'), scope: $('f-scope'), duration: $('f-duration'), enemies: $('f-enemies'),
    behavior: $('f-behavior'), enemyHp: $('f-hp'), minDist: $('f-mind'), maxDist: $('f-maxd'), ttl: $('f-ttl'),
    enemyAim: $('f-aim'), enemyShoots: $('f-shoots'), invincible: $('f-invincible'), adaptive: $('f-adaptive'), leadHint: $('f-lead'),
    obstacles: $('f-obstacles'), sound: $('f-sound'), hitmarker: $('f-hitmarker'),
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

  function normalize(s) {
    s.enemies = Math.max(1, Math.min(8, s.enemies | 0));
    s.duration = Math.max(10, s.duration || 60);
    s.enemyHp = Math.max(1, s.enemyHp || 100);
    s.minDist = Math.max(2, s.minDist || 8);
    s.maxDist = Math.max(s.minDist + 1, s.maxDist || 16);
    s.ttl = Math.max(0, s.ttl || 0);
    s.respawnDelay = s.ttl > 0 ? 0.2 : 0.5;
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
    updateBestAndTrend();
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
      `<span>Range <b>${w.range}</b></span>`,
      `<span>Spread <b>${w.spread}° / ${w.moveSpread}° moving</b></span>`,
      `<span>Mag <b>${w.mag}</b></span>`,
      `<span>Reload <b>${w.reload}s${w.reloadPerShell ? ' per shell' : ''}</b></span>`,
    ].join('');
  }

  function currentKey() {
    if (selection.kind === 'routine') return `routine:${selection.item.id}`;
    return drillKey(readSettings());
  }
  function updateBestAndTrend() {
    const key = currentKey();
    const runs = ST.history.forKey(key).slice(-40);
    ST.charts.trend($('trend'), runs, tip);
    $('trend-title').textContent = selection.kind === 'routine' ? `${selection.item.name} score over runs` : 'Score over runs (this drill + weapon)';
    const b = ST.history.best(key, 'score');
    const el = $('best');
    if (!b) { el.textContent = runs.length ? 'Only warm-up runs so far. Bests count after the first 40 seconds of practice each day.' : 'No previous runs.'; return; }
    const parts = [`Best: ${Math.round(b.score)} score`, `${b.hitsPerSec.toFixed(2)} hits/s`, `${(b.accuracy * 100).toFixed(0)}% accuracy`];
    if (selection.kind === 'routine' && selection.item.id === 'benchmark') parts.push(`avg tier ${tierFromFrac(b.score / 100).name}`);
    parts.push(`on ${b.day}`);
    el.textContent = parts.join(' · ');
  }
  function tierFromFrac(f) {
    let t = ST.TIERS[0];
    for (const tier of ST.TIERS) if (f >= tier.min) t = tier;
    return t;
  }

  for (const el of Object.values(fields)) el.addEventListener('change', () => { updateWeaponInfo(); updateBestAndTrend(); });

  // ---------- lists ----------
  function makeButton(container, title, sub, onClick) {
    const b = document.createElement('button');
    b.className = 'mode-btn';
    b.innerHTML = `${title}<small>${sub}</small>`;
    b.addEventListener('click', onClick);
    container.appendChild(b);
    return b;
  }
  for (const r of ST.ROUTINES) {
    r._btn = makeButton($('routine-list'), r.name, `${r.steps.length} steps · ~${r.minutes} min`, () => select('routine', r));
  }
  for (const m of ST.MODES) {
    m._btn = makeButton($('mode-list'), m.name, m.settings.weapon ? ST.WEAPONS[m.settings.weapon].name + ' · ' + m.settings.scope : 'Your rules', () => select('mode', m));
  }

  function stepSpec(step) {
    // Resolve a routine step into { label, key, settings, scenario?, mode?, scored }.
    if (typeof step === 'string') step = { scenario: step };
    const p = prefs();
    const base = { ...ST.DEFAULT_SETTINGS, sound: p.sound ?? true, hitmarker: p.hitmarker ?? true };
    if (step.scenario) {
      const sc = ST.SCENARIOS[step.scenario];
      const settings = normalize({ ...base, ...sc.settings, ...(step.settings || {}), mode: step.scenario, label: sc.name });
      const scored = sc.scored !== false;
      const custom = !!step.settings;
      return { label: sc.name, key: custom ? `${step.scenario}:${settings.weapon}:${settings.duration}` : step.scenario, settings, scenario: step.scenario, scored, benchmark: !custom };
    }
    const m = ST.MODES.find(x => x.id === step.mode);
    const settings = normalize({ ...base, ...m.settings, ...(step.settings || {}), mode: m.id, label: m.name });
    return { label: m.name, key: drillKey(settings), settings, mode: m.id, scored: true };
  }

  function select(kind, item) {
    selection = { kind, item };
    for (const x of ST.ROUTINES) x._btn.classList.toggle('active', x === item);
    for (const x of ST.MODES) x._btn.classList.toggle('active', x === item);
    $('mode-title').textContent = item.name;
    $('mode-desc').textContent = item.desc;
    $('mode-tip').textContent = item.tip || '';
    const isRoutine = kind === 'routine';
    $('drill-form').classList.toggle('hidden', isRoutine);
    $('routine-steps').classList.toggle('hidden', !isRoutine);
    $('btn-reset').classList.toggle('hidden', isRoutine);
    if (isRoutine) {
      const steps = item.steps.map(stepSpec);
      $('routine-steps').innerHTML = `<b>${item.shuffle ? 'Shuffled order' : 'Fixed order'}, ${item.rest}s rest between steps.</b><ol>` +
        steps.map(st => {
          const w = ST.WEAPONS[st.settings.weapon];
          const b = st.scored ? ST.history.best(st.key, 'score') : null;
          return `<li>${st.label} <span>· ${w.name} · ${st.settings.scope} · ${st.settings.duration}s${st.settings.adaptive ? ' · adaptive' : ''}${b ? ` · best ${Math.round(b.score)}` : ''}</span></li>`;
        }).join('') + '</ol>';
      updateBestAndTrend();
    } else {
      const saved = LS.get('st.lastSettings.' + item.id, null);
      writeSettings(saved || modeDefaults(item));
    }
    LS.set('st.lastSelection', { kind, id: item.id });
  }
  $('btn-reset').addEventListener('click', () => writeSettings(modeDefaults(selection.item)));

  // ---------- screens ----------
  function show(name) {
    for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
    hud.classList.toggle('hidden', name === 'menu' || name === 'results' || name === 'rest');
    if (name === 'menu') updateSession();
  }
  function updateSession() {
    const min = ST.history.minutesToday();
    const n = ST.history.runsToday().length;
    const el = $('session-today');
    el.textContent = `Today: ${Math.round(min)} min · ${n} run${n === 1 ? '' : 's'}${min > 45 ? ' · diminishing returns, consider stopping' : ''}`;
    el.parentElement.classList.toggle('over', min > 45);
  }
  $('btn-fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
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
    game = new ST.Game(canvas, settings, {
      onHud: updateHud,
      onPause: (paused) => show(paused ? 'pause' : null),
      onFinish: (r) => onStepFinish(step, r),
    });
    ST.currentGame = game;
    show(null);
    lastHud = '';
    game.start();
  }

  function onStepFinish(step, r) {
    const entry = { step, result: r, scenario: step.scenario, key: step.key };
    if (r.time >= step.settings.duration * 0.5) {
      const w = ST.WEAPONS[step.settings.weapon];
      if (step.scored) entry.prevBest = ST.history.best(step.key, 'score');
      entry.run = ST.history.add({
        key: step.key, label: step.label, weapon: w.name, scope: step.settings.scope, duration: r.time,
        score: step.scored ? r.score : null, hitsPerSec: r.hitsPerSec, accuracy: r.accuracy, kills: r.kills, avgTtk: r.avgTtk,
        difficulty: step.settings.adaptive ? r.difficulty : null, warmup: step.warmup, benchmark: !!step.benchmark,
      });
    }
    seq.results.push(entry);
    if (seq.aborted || seq.index >= seq.steps.length - 1) { finishSequence(); return; }
    seq.index++;
    showRest(entry);
  }

  function showRest(entry) {
    const next = seq.steps[seq.index];
    const r = entry.result;
    $('rest-last').textContent = entry.step.scored
      ? `${entry.step.label}: ${Math.round(r.score)} score · ${r.hitsPerSec.toFixed(2)} hits/s · ${Math.round(r.accuracy * 100)}% acc${entry.step.warmup ? ' (warm-up, not counted)' : ''}`
      : `${entry.step.label} done.`;
    const w = ST.WEAPONS[next.settings.weapon];
    $('rest-next').textContent = `Next: ${next.label} · ${w.name} · ${next.settings.scope} · ${next.settings.duration}s`;
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
      // Routine summary in history: average tier fraction (benchmark) or average score ratio to best.
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

  $('btn-start').addEventListener('click', () => {
    if (selection.kind === 'routine') {
      startSequence({ routine: selection.item, steps: selection.item.steps.map(stepSpec) });
    } else {
      const s = readSettings();
      LS.set('st.lastSettings.' + s.mode, s);
      startSequence({ steps: [{ label: selection.item.name, key: drillKey(s), settings: { ...s, label: selection.item.name }, mode: s.mode, scored: true }] });
    }
  });
  $('btn-resume').addEventListener('click', () => game && game.togglePause());
  $('btn-quit').addEventListener('click', () => { if (game) { seq.aborted = true; game.paused = false; game.finish(); } });
  $('btn-menu').addEventListener('click', () => { show('menu'); select(selection.kind, selection.item); });
  $('btn-again').addEventListener('click', () => lastSeqSpec && startSequence(lastSeqSpec));

  // ---------- HUD ----------
  const hudEls = {
    timer: $('hud-timer'), kills: $('hud-kills'), acc: $('hud-acc'), deaths: $('hud-deaths'), step: $('hud-step'),
    health: $('hud-health-fill'), healthText: $('hud-health-text'), weapon: $('hud-weapon'), mag: $('hud-mag'),
    reload: $('hud-reload'), reloadFill: $('hud-reload-fill'), diff: $('hud-diff'),
  };
  let lastHud = '';
  function updateHud(h) {
    const remaining = Math.max(0, h.duration - h.time);
    const m = Math.floor(remaining / 60);
    const s = Math.ceil(remaining - m * 60);
    hudEls.timer.textContent = `${m}:${String(s === 60 ? 59 : s).padStart(2, '0')}`;
    const key = `${h.kills}|${h.hits}|${h.deaths}|${h.accuracy.toFixed(3)}|${h.hp}|${h.ammo}|${h.reloading}|${h.difficulty === null ? '' : h.difficulty.toFixed(2)}`;
    if (key !== lastHud) {
      lastHud = key;
      hudEls.kills.textContent = h.kills;
      hudEls.acc.textContent = (h.accuracy * 100).toFixed(0) + '%';
      hudEls.deaths.textContent = h.deaths ? ` · ${h.deaths} deaths` : '';
      hudEls.step.textContent = h.label ? `${h.label}${seq && seq.steps.length > 1 ? ` (${seq.index + 1}/${seq.steps.length})` : ''}` : '';
      hudEls.health.style.width = (100 * h.hp / h.maxHp) + '%';
      hudEls.health.style.background = h.hp > 50 ? '#fff' : h.hp > 25 ? '#ffd35c' : '#ff5b5b';
      hudEls.healthText.textContent = Math.ceil(h.hp);
      hudEls.weapon.textContent = h.weapon;
      hudEls.mag.textContent = h.ammo;
      hudEls.mag.classList.toggle('empty', h.ammo === 0);
      hudEls.reload.style.visibility = h.reloading ? 'visible' : 'hidden';
      hudEls.diff.textContent = h.difficulty === null ? '' : `difficulty ${Math.round(h.difficulty * 100)}`;
    }
    hudEls.reloadFill.style.width = (h.reloadFrac * 100) + '%';
  }

  // ---------- results ----------
  const fmt = {
    pct: (v) => (v * 100).toFixed(1) + '%',
    sec: (v) => v === null || v === undefined ? '—' : v.toFixed(2) + 's',
    num: (v) => v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toString(),
    int: (v) => String(v),
  };
  const tierHtml = (t) => t ? `<span class="tier ${t.name}">${t.name}</span>` : '';

  function showResults() {
    const entries = seq.results;
    const table = $('results-table');
    const insightsEl = $('insights');
    const strategyEl = $('strategy');
    strategyEl.classList.add('hidden');
    insightsEl.innerHTML = '';
    const multi = entries.length > 1;

    if (multi) {
      const scored = entries.filter(e => e.step.scored);
      table.innerHTML = `<tr><th>Scenario</th><th>Score</th><th>Tier</th><th>vs best</th></tr>` + entries.map(e => {
        const r = e.result;
        const t = e.scenario && e.step.benchmark ? ST.tierFor(e.scenario, r.score) : null;
        let delta = '';
        if (e.step.scored && e.prevBest) {
          const d = r.score - e.prevBest.score;
          delta = `<td class="${d >= 0 ? 'delta-up' : 'delta-down'}">${d >= 0 ? '+' : ''}${Math.round(d)}</td>`;
        } else if (e.step.scored) delta = `<td>${e.step.warmup ? 'warm-up' : 'first'}</td>`;
        else delta = '<td></td>';
        return `<tr><td>${e.step.label}${e.step.warmup ? ' <small>(warm-up)</small>' : ''}</td><td>${e.step.scored ? Math.round(r.score) : '—'}<br><small>${r.hitsPerSec.toFixed(2)} hits/s · ${Math.round(r.accuracy * 100)}%</small></td><td>${tierHtml(t)}</td>${delta}</tr>`;
      }).join('');
      const fracs = scored.map(e => e.scenario && e.step.benchmark && ST.SCENARIOS[e.scenario].ref ? e.result.score / ST.SCENARIOS[e.scenario].ref : null).filter(x => x !== null);
      const avgTier = fracs.length ? tierFromFrac(fracs.reduce((a, b) => a + b, 0) / fracs.length) : null;
      $('results-sub').innerHTML = `${seq.routine ? seq.routine.name : 'Sequence'} · ${entries.length} steps${avgTier ? ` · overall ${tierHtml(avgTier)} <small>(provisional thresholds)</small>` : ''}`;
      const strat = ST.strategyCheck(entries);
      if (strat) { strategyEl.textContent = strat.text; strategyEl.className = 'insight ' + (strat.adapted ? 'ok' : ''); }
      // Insights from the weakest scored step.
      const weakest = scored.filter(e => e.scenario && ST.SCENARIOS[e.scenario].ref).sort((a, b) => a.result.score / ST.SCENARIOS[a.scenario].ref - b.result.score / ST.SCENARIOS[b.scenario].ref)[0] || scored[scored.length - 1];
      if (weakest) {
        const ins = ST.insights(weakest.result, weakest.step.settings);
        insightsEl.innerHTML = `<div class="insight muted">From ${weakest.step.label}, your weakest step:</div>` + (ins.length ? ins.map(i => `<div class="insight">${i.text}</div>`).join('') : '<div class="insight ok">Nothing stands out. Keep the tempo up.</div>');
        // Direction map pooled over every scored step (single steps rarely have enough flicks).
        const pooled = [];
        for (let i = 0; i < 8; i++) pooled.push({ n: 0, fh: 0, gsum: 0, gn: 0 });
        for (const e of scored) {
          const k = e.result.kinematics; if (!k) continue;
          k.sectors.forEach((sec, i) => { if (sec.n) { pooled[i].n += sec.n; pooled[i].fh += sec.firstHit * sec.n; if (sec.gain !== null) { pooled[i].gsum += sec.gain * sec.n; pooled[i].gn += sec.n; } } });
        }
        ST.charts.rose($('rose'), pooled.map(p => ({ n: p.n, firstHit: p.n ? p.fh / p.n : null, gain: p.gn ? p.gsum / p.gn : null })), tip);
      }
    } else {
      const e = entries[0];
      const r = e.result, s = e.step.settings;
      const prev = e.prevBest;
      const better = (k, lower) => prev && prev[k] !== null && prev[k] !== undefined ? (lower ? r[k] < prev[k] : r[k] > prev[k]) : !!e.run;
      const prevOf = (k, f) => prev && prev[k] !== null && prev[k] !== undefined ? 'best ' + f(prev[k]) : '';
      const k = r.kinematics;
      const rows = [
        ['Score (100 × hits/s × √acc)', fmt.int(Math.round(r.score)), prevOf('score', (v) => Math.round(v)), better('score')],
        ['Hits per second', r.hitsPerSec.toFixed(2), prevOf('hitsPerSec', (v) => v.toFixed(2)), better('hitsPerSec')],
        ['Accuracy (hits / bullets)', `${fmt.pct(r.accuracy)}  (${r.hits}/${r.pellets})`, prevOf('accuracy', fmt.pct), better('accuracy')],
        ['Kills', fmt.int(r.kills), prevOf('kills', fmt.int), better('kills')],
        ['Avg time to kill', fmt.sec(r.avgTtk), prevOf('avgTtk', fmt.sec), r.avgTtk !== null && better('avgTtk', true)],
      ];
      if (s.invincible) rows.push(['Cursor on target', fmt.pct(r.onTargetFrac), '', false]);
      if (k && k.n >= 3) {
        rows.push(['Flicks analysed', fmt.int(k.n), '', false]);
        rows.push(['Reaction (target → move start)', fmt.sec(k.reaction), '', false]);
        rows.push(['Movement time (move start → hit)', fmt.sec(k.moveTime), '', false]);
        rows.push(['Overshoot gain (1.0 = exact)', k.gain === null ? '—' : k.gain.toFixed(2), '', false]);
        rows.push(['Movements per target', fmt.num(k.peaks), '', false]);
      }
      rows.push(['Shots fired while moving', fmt.pct(r.movingShotFrac), '', false]);
      if (r.accMoving !== null && r.accStill !== null) rows.push(['Accuracy moving / standing', `${fmt.pct(r.accMoving)} / ${fmt.pct(r.accStill)}`, '', false]);
      if (s.behavior === 'flee') rows.push(['Time spent moving', fmt.pct(r.movingFrac), '', false], ['Enemies got away', fmt.int(r.expired), '', false]);
      if (s.enemyShoots) rows.push(['Damage taken per minute', fmt.num(r.dmgTakenPerMin), '', false], ['Damage taken while still', r.stillDmgFrac === null ? '—' : fmt.pct(r.stillDmgFrac), '', false]);
      if (s.adaptive) rows.push(['Difficulty reached', fmt.int(Math.round(r.difficulty * 100)), prevOf('difficulty', (v) => Math.round(v * 100)), false]);
      if (s.ttl > 0 && s.behavior !== 'flee') rows.push(['Targets escaped', fmt.int(r.expired), '', false]);
      if (s.enemyShoots) rows.push(['Deaths', fmt.int(r.deaths), '', false], ['Damage taken', fmt.int(Math.round(r.dmgTaken)), '', false]);
      table.innerHTML = rows.map(([label, val, best, isNew]) =>
        `<tr><td>${label}</td><td class="${isNew && !e.step.warmup ? 'new-best' : ''}">${val}</td><td>${best}</td></tr>`).join('');
      const t = e.scenario && e.step.benchmark ? ST.tierFor(e.scenario, r.score) : null;
      $('results-sub').innerHTML = `${e.step.label} · ${ST.WEAPONS[s.weapon].name} · ${s.scope} · ${Math.round(r.time)}s${e.step.warmup ? ' · <b>warm-up run, not counted toward bests</b>' : ''}${t ? ' · ' + tierHtml(t) : ''}`;
      const ins = ST.insights(r, s);
      insightsEl.innerHTML = ins.length ? ins.map(i => `<div class="insight">${i.text}</div>`).join('') : '<div class="insight ok">Nothing stands out. Keep the tempo up.</div>';
      ST.charts.rose($('rose'), k ? k.sectors : [], tip);
    }
    show('results');
  }

  // ---------- boot ----------
  const last = LS.get('st.lastSelection', null);
  let initial = null;
  if (last && last.kind === 'routine') initial = ['routine', ST.ROUTINES.find(r => r.id === last.id)];
  else if (last) initial = ['mode', ST.MODES.find(m => m.id === last.id)];
  if (!initial || !initial[1]) initial = ['routine', ST.ROUTINES[0]];
  select(initial[0], initial[1]);
  show('menu');
})();
