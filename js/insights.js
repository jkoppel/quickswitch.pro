// Post-run insights derived from kinematics and shot data. One or two actionable sentences, never mid-run.
window.ST = window.ST || {};

ST.insights = function (r, s) {
  const out = [];
  const k = r.kinematics || { n: 0, sectors: [] };
  const w = ST.WEAPONS[s.weapon];
  const DIRS = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
  const pct = (v) => Math.round(v * 100);

  if (k.n >= 6 && k.gain !== null) {
    if (k.gain > 1.12) out.push({ sev: 3, text: `You overshoot flicks by ${pct(k.gain - 1)}% on average. Aim to land just short and finish with a small correction; experts land hypometric on precision tasks.` });
    else if (k.gain < 0.82) out.push({ sev: 3, text: `Your first movement stops ${pct(1 - k.gain)}% short of the target and you finish with corrections. Commit to a larger initial move.` });
  }
  if (k.n >= 6 && k.sectors.length) {
    const valid = k.sectors.map((sec, i) => ({ ...sec, i })).filter(sec => sec.n >= 2 && sec.firstHit !== null);
    if (valid.length >= 3 && k.firstHit) {
      const worst = valid.reduce((a, b) => (b.firstHit > a.firstHit ? b : a));
      if (worst.firstHit > k.firstHit * 1.3) {
        out.push({ sev: 2, text: `Flicks toward the ${DIRS[worst.i]} take ${pct(worst.firstHit / k.firstHit - 1)}% longer than your average. Spend a clicking drill deliberately choosing targets in that direction.` });
      }
      const worstGain = valid.filter(sec => sec.gain !== null).reduce((a, b) => (a === null || Math.abs(b.gain - 1) > Math.abs(a.gain - 1) ? b : a), null);
      if (worstGain && Math.abs(worstGain.gain - 1) > 0.2 && !(k.gain > 1.12 || k.gain < 0.82)) {
        out.push({ sev: 2, text: `${worstGain.gain > 1 ? 'Overshooting' : 'Undershooting'} by ${pct(Math.abs(worstGain.gain - 1))}% specifically on ${DIRS[worstGain.i]} flicks.` });
      }
    }
  }
  if (k.n >= 6 && k.peaks !== null && k.peaks > 2.2) {
    out.push({ sev: 2, text: `Averaging ${k.peaks.toFixed(1)} separate movements per target. A flick should be one ballistic move plus at most one correction. Slow down the first move slightly and trust it.` });
  }
  if (k.n >= 6 && k.reaction !== null && k.reaction > 0.42) {
    out.push({ sev: 2, text: `You take ${k.reaction.toFixed(2)}s to start moving after a target appears. That is decision time, not reflexes: pick the next target before the current one dies.` });
  }
  if (w && r.shots >= 10 && w.moveSpread > w.spread * 1.5 && r.movingShotFrac > 0.4) {
    out.push({ sev: 3, text: `${pct(r.movingShotFrac)}% of your shots were fired while moving. The ${w.name} spreads ${w.moveSpread}° moving vs ${w.spread}° standing. Stop for the shot, then move.` });
  }
  if (s.invincible && r.firingFrac <= 0.1) {
    out.push({ sev: 3, text: `You held fire ${pct(1 - r.firingFrac)}% of the time. Tracking drills are about keeping the stream on the target: hold the trigger and steer.` });
  }
  if (s.invincible && r.firingFrac > 0.1) {
    if (r.onTargetFrac < 0.45) out.push({ sev: 3, text: `Cursor was on the target only ${pct(r.onTargetFrac)}% of the time. Track the body, not the gun, and move with the target rather than chasing it.` });
    else if (r.accuracy < r.onTargetFrac - 0.2) out.push({ sev: 2, text: `Your cursor was on target ${pct(r.onTargetFrac)}% of the time but only ${pct(r.accuracy)}% of bullets hit: you are aiming where the target is, not where it will be. Lead by about ${(s.maxDist / w.speed).toFixed(2)}s at this range.` });
  }
  if (s.ttl > 0 && r.expired >= 3 && r.expired > r.kills * 0.3) {
    out.push({ sev: 2, text: `${r.expired} targets timed out. Snap and commit; a missed flick reset to center costs less than a slow approach.` });
  }
  if (r.shots >= 15 && r.accuracy > 0.85 && (w.auto || s.ttl > 0) && !s.invincible) {
    out.push({ sev: 1, text: `Accuracy ${pct(r.accuracy)}% is high enough. Hit rate plateaus in days; speed keeps improving for months. Push tempo and let accuracy drop toward 70%.` });
  }
  out.sort((a, b) => b.sev - a.sev);
  return out.slice(0, 2);
};

// The expert signature: movement time rises under the precision condition (Aimlabs kinematics study).
ST.strategyCheck = function (stepResults) {
  const speed = stepResults.find(x => x.scenario && ST.SCENARIOS[x.scenario].condition === 'speed');
  const prec = stepResults.find(x => x.scenario && ST.SCENARIOS[x.scenario].condition === 'precision');
  if (!speed || !prec) return null;
  const ks = speed.result.kinematics, kp = prec.result.kinematics;
  if (!ks || !kp || ks.n < 5 || kp.n < 5 || ks.moveTime === null || kp.moveTime === null) return null;
  const ratio = kp.moveTime / ks.moveTime;
  const adapted = ratio > 1.15;
  return {
    ratio, adapted,
    text: adapted
      ? `You slowed your movement by ${Math.round((ratio - 1) * 100)}% for the precision condition. That adaptation to task demands is the expert pattern.`
      : `Your movement time barely changed between the speed (${ks.moveTime.toFixed(2)}s) and precision (${kp.moveTime.toFixed(2)}s) conditions. Experts slow down and land short on small targets; try it.`,
  };
};
