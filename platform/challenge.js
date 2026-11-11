// "Beat my score": a link that drops a friend into the same Benchmark scenario on the same seed.
// No sign-up to play; saving the score afterwards is what makes the two of you friends.
window.ST = window.ST || {};

ST.challenge = (function () {
  const { $, esc, fmtInt } = ST.ui;
  let current = null;   // the challenge on the landing screen

  async function create(runId, btn) {
    const run = ST.history.all().find(r => r.id === runId);
    if (!run || run.seed === null || run.seed === undefined || !run.scenario) return;
    if (btn) btn.disabled = true;
    try {
      await ST.account.ensureSession();
      const r = await ST.api.post('/api/challenges', { scenario: run.scenario, key: run.key, seed: run.seed, score: run.score });
      const url = r.url || `${location.origin}/c/${r.id}`;
      ST.events.track('challenge_created', { scenario: run.scenario });
      const name = ST.SCENARIOS[run.scenario].name;
      const text = `Beat my ${fmtInt(run.score)} on ${name}: ${url}`;
      // A guest's handle is random (p_xxxx); ask for the name the friend will see instead.
      const me = ST.account.user();
      const askName = !(me && me.displayName);
      ST.ui.openSheet('Challenge a friend', `
        <p class="desc">Anyone with this link plays <b>${esc(name)}</b> on the same spawns you just had, then sees their score next to your <b>${fmtInt(run.score)}</b>. No account needed to play.</p>
        ${askName ? `<label class="name-row">Your name on the challenge <input id="ch-name" type="text" maxlength="40" placeholder="e.g. your survev name" autocomplete="nickname"></label>` : ''}
        <div class="copy-row"><input id="ch-link" type="text" readonly value="${esc(url)}" aria-label="Challenge link"><button class="primary small" data-act="copy" type="button">Copy</button></div>`,
      { onAction: async (act) => {
        if (act !== 'copy') return;
        const typed = askName && $('ch-name') ? $('ch-name').value.trim() : '';
        if (typed) { try { await ST.api.patch('/api/me', { displayName: typed }); await ST.account.refresh(); } catch (e) { /* the link still works unnamed */ } }
        try { await navigator.clipboard.writeText(text); ST.ui.sheetNote('Copied. Paste it in Discord.'); }
        catch (e) { $('ch-link').select(); ST.ui.sheetNote('Press Ctrl+C to copy.'); }
      } });
    } catch (e) {
      ST.ui.toast('Could not create the challenge. Try again.');
    } finally { if (btn) btn.disabled = false; }
  }

  async function landing(id, app) {
    app.show('challenge');
    $('ch-title').textContent = 'Loading';
    $('ch-sub').textContent = ''; $('ch-tip').textContent = ''; $('ch-spec').textContent = ''; $('ch-note').textContent = '';
    $('ch-results').innerHTML = '';
    $('ch-start').disabled = true;
    current = null;
    const h = await ST.api.ready;
    if (!h) { $('ch-title').textContent = 'Challenge'; $('ch-sub').textContent = 'Challenges need the online trainer.'; return; }
    try {
      const c = await ST.api.get('/api/challenges/' + encodeURIComponent(id));
      const sc = ST.SCENARIOS[c.scenario];
      if (!sc) throw new Error('unknown scenario');
      current = c;
      const who = ST.ui.playerName(c.creator, 'A friend');
      $('ch-title').textContent = `Beat ${fmtInt(c.score)}`;
      $('ch-sub').innerHTML = `<b>${esc(who)}</b> scored ${fmtInt(c.score)} on <b>${esc(sc.name)}</b>. You get the same spawns.`;
      $('ch-tip').textContent = sc.tip || '';
      const s = app.stepSpec(c.scenario).settings;
      $('ch-spec').textContent = `${ST.WEAPONS[s.weapon].name} · ${s.scope} · ${s.duration} s. Score is hits per second times the square root of accuracy.`;
      const results = (c.results || []).slice().sort((a, b) => b.score - a.score);
      $('ch-results').innerHTML = results.length
        ? results.map(r => `<li><span>${esc(ST.ui.playerName(r, 'A player'))}</span><b>${fmtInt(r.score)}</b></li>`).join('')
        : '';
      if (c.key && c.key !== `${c.scenario}:v${ST.BENCHMARK_VERSION}`) $('ch-note').textContent = 'Made on an older version of this scenario; scores may not compare.';
      $('ch-start').disabled = false;
      $('ch-start').focus();
      ST.events.track('challenge_opened', { scenario: c.scenario });
    } catch (e) {
      $('ch-title').textContent = 'Challenge not found';
      $('ch-sub').textContent = 'The link may be mistyped. You can still train from the home screen.';
    }
  }

  async function play(app) {
    if (!current) return;
    ST.account.ensureSession().catch(() => {});
    ST.router.set('/play/challenge');
    app.startScenario(current.scenario, { seed: current.seed, challengeId: current.id });
  }

  // After the challenged run: report the score, then show the comparison as the headline.
  async function onResults(seq) {
    const e = seq.results[0];
    const c = current && current.id === seq.challengeId ? current : null;
    const name = ST.ui.playerName(c && c.creator, 'your friend');
    // Warm-up only keeps a run out of personal bests; against a friend the score still counts.
    if (!e || !e.recorded) {
      ST.resultsHeadline.render(seq, { challengeHtml: '<p class="hl-detail">This run ended before the halfway mark, so it was not counted against the challenge.</p>' });
      return;
    }
    try {
      await ST.account.ensureSession();
      const r = await ST.api.post(`/api/challenges/${encodeURIComponent(seq.challengeId)}/result`, { score: e.result.score });
      if (r.beat && e.run) ST.history.update(e.run.id, { challengeBeat: true });
      ST.events.track('challenge_completed', { beat: !!r.beat });
      const cmp = `<div class="versus"><div><span>${esc(name)}</span><b>${fmtInt(r.creatorScore)}</b></div><div class="${r.beat ? 'win' : ''}"><span>You</span><b>${fmtInt(r.yourScore)}</b></div></div>`;
      ST.resultsHeadline.render(seq, {
        challenge: { name, theirScore: r.creatorScore, yourScore: r.yourScore },
        // A loss is still the story of this run, so it leads rather than a generic insight.
        headline: r.beat ? null : { kind: 'friend', title: `${fmtInt(r.creatorScore - r.yourScore)} short of ${name}`, detail: 'Same spawns every time, so Run again is a fair rematch.' },
        challengeHtml: cmp,
        challengeSave: true,
      });
    } catch (err) {
      ST.resultsHeadline.render(seq, { challengeHtml: '<p class="hl-detail">Could not reach the server to record this score.</p>' });
    }
  }

  function start(app) {
    $('ch-start').addEventListener('click', () => play(app));
    $('ch-home').addEventListener('click', () => ST.router.go('/'));
    app.on('results', (seq) => { if (seq.challengeId) onResults(seq); });
  }

  return { create, landing, start };
})();
