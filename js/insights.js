// Post-run insights derived from kinematics and shot data. One or two actionable sentences, never mid-run.
window.ST = window.ST || {};

ST.insights = function (r, s) {
  const out = [];
  const k = r.kinematics || { n: 0, sectors: [] };
  const w = ST.WEAPONS[s.weapon];
  const DIRS = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
  const pct = (v) => Math.round(v * 100);

  const mustMove = s.behavior === 'flee' || s.enemyShoots;
  // Flick kinematics are measured in screen space; when the player runs, the camera moves the target too, so skip them.
  if (!mustMove && k.n >= 6 && k.gain !== null) {
    if (k.gain > 1.12) out.push({ sev: 3, text: `You overshoot flicks by ${pct(k.gain - 1)}% on average. Aim to land just short and finish with a small correction; experts land hypometric on precision tasks.` });
    else if (k.gain < 0.82) out.push({ sev: 3, text: `Your first movement stops ${pct(1 - k.gain)}% short of the target and you finish with corrections. Commit to a larger initial move.` });
  }
  if (!mustMove && k.n >= 6 && k.sectors.length) {
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
  if (!mustMove && k.n >= 6 && k.peaks !== null && k.peaks > 2.2) {
    out.push({ sev: 2, text: `Averaging ${k.peaks.toFixed(1)} separate movements per target. A flick should be one ballistic move plus at most one correction. Slow down the first move slightly and trust it.` });
  }
  if (!mustMove && k.n >= 6 && k.reaction !== null && k.reaction > 0.42) {
    out.push({ sev: 2, text: `You take ${k.reaction.toFixed(2)}s to start moving after a target appears. That is decision time, not reflexes: pick the next target before the current one dies.` });
  }
  if (!mustMove && w && r.shots >= 10 && w.moveSpread > w.spread * 1.5 && r.movingShotFrac > 0.4) {
    out.push({ sev: 3, text: `${pct(r.movingShotFrac)}% of your shots were fired while moving. The ${w.name} spreads ${w.moveSpread}° moving vs ${w.spread}° standing. Stop for the shot, then move.` });
  }
  if (s.invincible && r.firingFrac <= 0.1) {
    out.push({ sev: 3, text: `You held fire ${pct(1 - r.firingFrac)}% of the time. Tracking drills are about keeping the stream on the target: hold the trigger and steer.` });
  }
  if (s.invincible && r.firingFrac > 0.1) {
    if (r.onTargetFrac < 0.45) out.push({ sev: 3, text: `Cursor was on the target only ${pct(r.onTargetFrac)}% of the time. Track the body, not the gun, and move with the target rather than chasing it.` });
    else if (r.accuracy < r.onTargetFrac - 0.2) out.push({ sev: 2, text: `Your cursor was on target ${pct(r.onTargetFrac)}% of the time but only ${pct(r.accuracy)}% of bullets hit: you are aiming where the target is, not where it will be. Lead by about ${(s.maxDist / w.speed).toFixed(2)}s at this range.` });
  }
  if (s.behavior === 'flee') {
    if (r.expired >= 2) out.push({ sev: 3, text: `${r.expired} enemies got away. Keep W held and let the crosshair do the work; stopping to line up a shot costs more distance than the shot is worth.` });
    if (r.movingFrac < 0.5) out.push({ sev: 2, text: `You were moving only ${pct(r.movingFrac)}% of the time in a chase. The runner is nearly as fast as you, so every pause is distance lost.` });
  }
  if (r.accMoving !== null && r.accStill !== null && r.movingPellets >= 10 && r.pellets - r.movingPellets >= 10 && r.accMoving < r.accStill - 0.25) {
    out.push({ sev: 2, text: `Accuracy drops from ${pct(r.accStill)}% standing to ${pct(r.accMoving)}% moving. Close the distance before firing while running, or fire in short bursts at direction changes.` });
  }
  if (s.enemyShoots && r.dmgTaken >= 40) {
    if (r.stillDmgFrac !== null && r.stillDmgFrac > 0.5) out.push({ sev: 3, text: `${pct(r.stillDmgFrac)}% of the damage you took landed while you were standing still. A hard bot leads movement but cannot lead a stop-start juke; keep changing direction.` });
    else if (r.movingFrac > 0.85 && r.deaths > 0) out.push({ sev: 2, text: `You moved ${pct(r.movingFrac)}% of the time and still died ${r.deaths}×: constant motion in one direction is predictable. Break rhythm with short stops and reversals.` });
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

// Insights for the mechanics the trainer added on top of aim: spinning, quick switching,
// throwables and ricochet. Same rule as the rest, one actionable sentence each, after the run only.
ST.utilityInsights = function (r, s) {
  const out = [];
  const pct = (v) => Math.round(v * 100);

  // Spinning is a trade, so it is only worth reporting as a trade.
  if (r.spinFrac > 0.03) {
    const paid = r.accSpinning !== null && r.accNotSpinning !== null && r.accSpinning < r.accNotSpinning - 0.05;
    const bought = r.dmgTakenPerMinSpinning !== null && r.dmgTakenPerMinSteady !== null
      && r.dmgTakenPerMinSpinning < r.dmgTakenPerMinSteady * 0.8;
    if (paid && bought) {
      out.push({ sev: 2, text: `Spinning worked: ${Math.round(r.dmgTakenPerMinSteady - r.dmgTakenPerMinSpinning)} less damage per minute while you whirled. It cost ${pct(r.accNotSpinning - r.accSpinning)} points of accuracy, so keep spinning to the moments you are crossing ground rather than trading.` });
    } else if (paid && !bought) {
      out.push({ sev: 3, text: `You spun ${pct(r.spinFrac)}% of the time and it did not lower the damage you took, but it did cost ${pct(r.accNotSpinning - r.accSpinning)} points of accuracy. Spinning only helps if you change direction under it: against a straight line the bot's stale read and its live read are the same.` });
    } else if (r.spinFrac > 0.5) {
      out.push({ sev: 2, text: `You spent ${pct(r.spinFrac)}% of the run spinning. It is a way to cross open ground, not a way to fight: settle the cursor before you shoot.` });
    }
  }
  // Quick switching: the whole point is beating the primary's own fire delay.
  if (s.secondary && r.switches >= 2) {
    const w = ST.WEAPONS[s.weapon], sec = ST.WEAPONS[s.secondary];
    const sameGroup = w && sec && w.deployGroup !== undefined && w.deployGroup === sec.deployGroup;
    if (sameGroup) {
      out.push({ sev: 2, text: `${w.name} and ${sec.name} share a deploy group, so survev charges you the full ${sec.switchDelay}s switch. This pairing cannot be quick-switched; carry something from another class.` });
    } else if (r.quickSwitchShots === 0) {
      out.push({ sev: 3, text: `You switched ${r.switches} times but never fired the second gun inside the first one's ${w.fireDelay + (w.pullDelay || 0)}s cycle. The switch has to come straight after the shot, not after you have already waited.` });
    } else if (r.avgSwitchGap !== null) {
      out.push({ sev: 1, text: `You landed ${r.quickSwitchShots} shots that beat the ${w.name}'s own cycle, averaging ${r.avgSwitchGap.toFixed(2)}s between the two guns. The floor is ${ST.GC.player.baseSwitchDelay}s.` });
    }
  } else if (s.secondary && r.switches < 2) {
    out.push({ sev: 3, text: `You barely used the second weapon. Key 2 or Q after every shot from the ${ST.WEAPONS[s.weapon].name}: the free switch costs ${ST.GC.player.baseSwitchDelay}s against its ${ST.WEAPONS[s.weapon].fireDelay}s fire delay.` });
  }
  // Throwables.
  if (s.throwable && r.nadesThrown >= 3) {
    const t = ST.THROWABLES[s.throwable];
    if (r.nadeSelfDmg > 20) out.push({ sev: 3, text: `Your own grenades did ${Math.round(r.nadeSelfDmg)} damage to you. The blast is full strength out to ${t.radMin} units and only stops at ${t.radMax}: throw further, or put an obstacle between you and it.` });
    else if (r.nadeDmgPerThrow !== null && r.nadeDmgPerThrow < 20) out.push({ sev: 3, text: `${Math.round(r.nadeDmgPerThrow)} damage per grenade. A frag does ${t.dmg} inside ${t.radMin} units, so nearly every throw is landing wide or late: lead the throw and cook it so it bursts on arrival.` });
    else if (r.avgCookTime !== null && r.avgCookTime < 0.5) out.push({ sev: 2, text: `You threw with an average cook of ${r.avgCookTime.toFixed(2)}s, so each frag sat live for about ${(t.fuseTime - r.avgCookTime).toFixed(1)}s before going off. Anyone who sees it simply walks away; hold the pin longer.` });
  }
  // Ricochet: report it as what it is, a low-percentage tool and a real hazard.
  if (s.barrels > 0 && (r.ricochetPellets > 0 || r.ricochetSelfDmg > 0)) {
    if (r.ricochetSelfDmg > 15) out.push({ sev: 3, text: `Your own ricochets did ${Math.round(r.ricochetSelfDmg)} damage to you. A barrel is a round mirror pointed back at you: stop firing through one at close range.` });
    else if (r.ricochetHits > 0) out.push({ sev: 1, text: `${r.ricochetHits} of ${r.ricochetPellets} bounced rounds connected for ${Math.round(r.ricochetDmg)} damage, at half damage each. That is about the ceiling for ricochet; treat it as a bonus, not a plan.` });
  }
  out.sort((a, b) => b.sev - a.sev);
  return out;
};
