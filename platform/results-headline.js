// The one headline at the top of the results screen, the points the run earned, and at most one
// prompt beneath them: save the streak after a first finished routine, or share an achievement.
// Never both, never a carousel.
window.ST = window.ST || {};

ST.resultsHeadline = (function () {
  const { $, esc, fmtInt: fmt } = ST.ui;
  let before = null;
  let last = null;   // the context of the results on screen, so a challenge reply can re-render it

  function snapshot() {
    const runs = ST.history.all();
    return {
      achievements: ST.achievements.evaluate(runs),
      streak: ST.streak.computeStreak(ST.history.completionDays(), ST.history.today()).current,
    };
  }

  // The step most worth a headline: a tier up, else the largest personal best, else the last step.
  function notableRun(seq) {
    const rec = seq.results.filter(e => e.recorded && e.step.scored && !e.step.warmup);
    const pick = rec.find(e => e.run && e.run.tier && e.prevTier && ST.achievements.TIER_ORDER.indexOf(e.run.tier) > ST.achievements.TIER_ORDER.indexOf(e.prevTier))
      || rec.filter(e => e.prevBest && e.result.score > e.prevBest.score).sort((a, b) => (b.result.score - b.prevBest.score) - (a.result.score - a.prevBest.score))[0]
      || null;
    const insightEl = document.querySelector('#insights .insight');
    const insight = insightEl && !insightEl.classList.contains('ok') ? insightEl.textContent : null;
    if (pick) {
      return { label: pick.step.label, score: pick.result.score, prevBest: pick.prevBest ? pick.prevBest.score : null, warmup: false, tier: pick.run && pick.run.tier, prevTier: pick.prevTier, insight };
    }
    const e = seq.results[seq.results.length - 1];
    const label = seq.routine ? seq.routine.name : (e && e.step.label);
    const single = seq.results.length === 1 && e;
    return { label, score: single && e.step.scored ? e.result.score : null, prevBest: null, warmup: single ? e.step.warmup : false, insight };
  }

  function shareTargets(a) {
    const u = ST.account.user();
    const url = u && u.handle && ST.account.isMember() ? `${location.origin}/u/${encodeURIComponent(u.handle)}` : location.origin + '/';
    const text = `${a.title} on the survev aim trainer.`;
    const img = `/api/og?kind=achievement&id=${encodeURIComponent(a.id)}${u && u.handle ? '&handle=' + encodeURIComponent(u.handle) : ''}`;
    return { url, text, img };
  }

  async function copyImageAndLink(a) {
    const t = shareTargets(a);
    try {
      const blob = await (await fetch(t.img)).blob();
      if (!window.ClipboardItem || blob.type !== 'image/png') throw new Error('no image');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob, 'text/plain': new Blob([`${t.text} ${t.url}`], { type: 'text/plain' }) })]);
      ST.ui.toast('Image and link copied. Paste into Discord.');
    } catch (e) {
      try { await navigator.clipboard.writeText(`${t.text} ${t.url}`); ST.ui.toast('Link copied.'); } catch (e2) { ST.ui.toast('Copy failed.'); }
    }
  }

  // What this run earned, by kind: "+60 points · 30 practice · 30 new best".
  const KIND_WORDS = { practice: 'practice', best: 'new best', accuracy: 'sharper accuracy', plan: 'plan day' };
  function pointsLine(seq) {
    const ids = seq.results.map(e => e.run && e.run.id).filter(Boolean);
    if (seq.record) ids.push(seq.record.id);
    if (!ids.length) return '';
    const res = ST.onboarding.points();
    const by = {};
    let total = 0;
    for (const id of ids) {
      const f = ST.points.forRun(res, id);
      total += f.total;
      for (const [k, v] of Object.entries(f.by)) by[k] = (by[k] || 0) + v;
    }
    if (!total) return '';
    if (!seq.pointsTracked) { seq.pointsTracked = true; ST.events.track('points_awarded', { total }); }
    const parts = ['practice', 'best', 'accuracy', 'plan'].filter(k => by[k]).map(k => `${fmt(by[k])} ${KIND_WORDS[k]}`);
    return `<p class="hl-points"><b>+${fmt(total)} points</b>${parts.length > 1 ? ` <span>· ${parts.join(' · ')}</span>` : ''}</p>`;
  }

  // Of several achievements unlocked at once, the one to offer: the highest tier, so the prompt
  // agrees with the tier pill on screen; otherwise the latest.
  function pickFresh(fresh) {
    const tiers = fresh.filter(a => /^tier-/.test(a.id));
    if (tiers.length) return tiers.sort((a, b) => ST.achievements.TIER_ORDER.indexOf(cap(b.id.slice(5))) - ST.achievements.TIER_ORDER.indexOf(cap(a.id.slice(5))))[0];
    return fresh[fresh.length - 1];
  }
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

  function render(seq, extra = {}) {
    const el = $('headline');
    const after = snapshot();
    const b = before || after;
    const run = notableRun(seq);
    const survev = ST.survev.comparison();
    const h = extra.headline || ST.headline.pickHeadline({
      before: { streak: b.streak }, after: { streak: after.streak },
      run, challenge: extra.challenge || null, survev,
    });
    const fresh = ST.achievements.unlocked(b.achievements, after.achievements);
    let prompt = '';
    const up = ST.api.available();
    // A first finished routine asks to save the streak before anything is offered for sharing.
    if (up && seq.completed && !ST.account.isMember() && !prompted()) {
      prompt = `<div class="hl-prompt">
        <span class="hl-prompt-text">Your streak lives in this browser. Save it so it survives a cleared browser and follows you to other devices.</span>
        <button class="primary small" data-signin type="button">Save your streak</button>
      </div>`;
      markPrompted();
    } else if (fresh.length && up) {
      const a = pickFresh(fresh);
      const t = shareTargets(a);
      prompt = `<div class="hl-prompt" data-ach="${esc(a.id)}">
        <span class="hl-prompt-text">Unlocked <b>${esc(a.title)}</b>${fresh.length > 1 ? ` and ${fresh.length - 1} more` : ''}. Share it?</span>
        <button class="secondary small" data-share="copy" type="button">Copy image + link</button>
        <a class="ghost-link" data-share="x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(t.text)}&url=${encodeURIComponent(t.url)}">Post on X</a>
        <a class="ghost-link" data-share="reddit" target="_blank" rel="noopener" href="https://www.reddit.com/submit?url=${encodeURIComponent(t.url)}&title=${encodeURIComponent(t.text)}">Reddit</a>
      </div>`;
    } else if (up && extra.challengeSave && !ST.account.isMember()) {
      prompt = `<div class="hl-prompt"><span class="hl-prompt-text">Keep this score and start a streak of your own.</span><button class="primary small" data-signin="challenge" type="button">Save your score</button></div>`;
    }
    el.innerHTML = `<p class="hl-title">${esc(h.title)}</p>${h.detail ? `<p class="hl-detail">${esc(h.detail)}</p>` : ''}${pointsLine(seq)}${extra.challengeHtml || ''}${prompt}`;
    el.classList.remove('hidden');
    el.dataset.kind = h.kind;
    // The headline already says it; the Insights column keeps only what it has not said.
    if (h.kind === 'insight') {
      const dup = [...document.querySelectorAll('#insights .insight')].find(x => x.textContent === h.detail);
      if (dup) {
        dup.remove();
        const ins = $('insights');
        if (!ins.querySelector('.insight')) ins.insertAdjacentHTML('beforeend', '<div class="insight ok">Nothing else stands out.</div>');
      }
    }
    last = { seq };
    renderChallengeButtons(seq);
  }

  function prompted() { try { return localStorage.getItem('st.signinPrompted') === '1'; } catch (e) { return false; } }
  function markPrompted() { try { localStorage.setItem('st.signinPrompted', '1'); } catch (e) { /* ignore */ } }

  // Benchmark rows carry their run id; each can become a challenge with that run's seed and score.
  function renderChallengeButtons(seq) {
    if (!ST.api.available()) return;
    // A single Benchmark scenario (a challenge rematch, say) offers its own run as a new challenge.
    const only = seq.results.length === 1 ? seq.results[0] : null;
    if (only && !seq.challengeId && only.recorded && only.step.benchmark && only.run && only.run.seed !== null && ST.SCENARIOS[only.scenario] && ST.SCENARIOS[only.scenario].ref) {
      $('headline').insertAdjacentHTML('beforeend', `<p class="hl-detail"><button class="link ch-btn" type="button" data-challenge="${esc(only.run.id)}">Challenge a friend</button> to beat ${fmt(only.result.score)} on these exact spawns.</p>`);
    }
    for (const tr of document.querySelectorAll('#results-table tr[data-run]')) {
      if (tr.querySelector('.ch-btn')) continue;
      const td = tr.lastElementChild;
      td.insertAdjacentHTML('beforeend', ` <button class="link ch-btn" type="button" data-challenge="${esc(tr.dataset.run)}" title="Send a friend this exact scenario">Challenge</button>`);
    }
  }

  function start(app) {
    app.on('sequence-start', () => { before = snapshot(); });
    app.on('sequence-finish', (seq) => {
      if (seq.completed) ST.events.track('routine_complete', { routine: seq.routine.id });
      const now = ST.streak.computeStreak(ST.history.completionDays(), ST.history.today()).current;
      if (before && now > before.streak) ST.events.track('streak_extended', { streak: now });
    });
    app.on('results', (seq) => { if (!seq.challengeId) render(seq); });
    $('headline').addEventListener('click', (e) => {
      const s = e.target.closest('[data-share]');
      if (s) {
        ST.events.track('share_clicked', { target: s.dataset.share });
        if (s.dataset.share === 'copy') {
          const id = e.target.closest('[data-ach]').dataset.ach;
          const a = ST.achievements.evaluate(ST.history.all()).find(x => x.id === id);
          if (a) copyImageAndLink(a);
        }
        return;
      }
      const si = e.target.closest('[data-signin]');
      if (si) ST.account.openSheet(si.dataset.signin === 'challenge' ? 'challenge' : 'first');
    });
    $('headline').addEventListener('click', (e) => {
      const b = e.target.closest('[data-challenge]');
      if (b) ST.challenge.create(b.dataset.challenge, b);
    });
    $('results-table').addEventListener('click', (e) => {
      const b = e.target.closest('[data-challenge]');
      if (b) ST.challenge.create(b.dataset.challenge, b);
    });
  }

  return { start, render, last: () => last };
})();
