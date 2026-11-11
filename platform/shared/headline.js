// The one headline at the top of the results screen, chosen by a fixed priority so the most
// meaningful thing a run produced always wins. MIT, see platform/LICENSE.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.ST = root.ST || {}; root.ST.headline = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'];
  const MILESTONES = [1, 3, 7, 14, 30, 50, 100, 150, 200, 365];
  const isMilestone = (n) => MILESTONES.includes(n) || (n > 365 && n % 100 === 0);
  // Whole numbers in the reader's locale where Intl exists (browser and Node both have it).
  const round = (v) => (typeof Intl !== 'undefined' ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(v)) : String(Math.round(v)));

  // Inputs (all optional except run):
  //   before / after: { streak }            streak length before and after this run
  //   run:            { label, score, prevBest, warmup, tier, prevTier, insight }
  //   challenge:      { name, theirScore, yourScore }   a friend this run overtook
  //   survev:         compareWarmVsCold() result
  // Priority: streak milestone > benchmark tier up > personal best > friend overtaken >
  //           real-game change > run insight.
  function pickHeadline({ before = {}, after = {}, run = {}, challenge = null, survev = null } = {}) {
    const s0 = before.streak || 0, s1 = after.streak || 0;
    if (s1 > s0 && isMilestone(s1)) {
      return s1 === 1
        ? { kind: 'streak', title: 'Streak started', detail: 'Day 1. Finish a routine tomorrow to keep it going.' }
        : { kind: 'streak', title: `${s1}-day streak`, detail: `${s1} days in a row with a finished routine.` };
    }
    if (!run.warmup && run.tier && run.prevTier && TIER_ORDER.indexOf(run.tier) > TIER_ORDER.indexOf(run.prevTier)) {
      return { kind: 'tier', title: `${run.tier} on ${run.label}`, detail: `Up from ${run.prevTier}. Tiers are provisional thresholds.` };
    }
    if (!run.warmup && run.prevBest !== null && run.prevBest !== undefined && run.score > run.prevBest) {
      return { kind: 'best', title: `New best on ${run.label}`, detail: `${round(run.score)}, up ${round(run.score - run.prevBest)} from ${round(run.prevBest)}.` };
    }
    if (challenge && challenge.yourScore > challenge.theirScore) {
      return { kind: 'friend', title: `You passed ${challenge.name}`, detail: `${round(challenge.yourScore)} to their ${round(challenge.theirScore)}.` };
    }
    if (survev && survev.enough && survev.diff !== null) {
      const d = survev.diff;
      return {
        kind: 'survev',
        title: `${d >= 0 ? '+' : ''}${round(d)} damage per minute after warming up`,
        detail: `In survev: ${round(survev.warm.dmgPerMin)} in ${survev.warm.n} games within an hour of a routine, ${round(survev.cold.dmgPerMin)} in ${survev.cold.n} games without.`,
      };
    }
    if (run.insight) return { kind: 'insight', title: 'One thing to work on', detail: run.insight };
    return { kind: 'done', title: run.label ? `${run.label} done` : 'Run done', detail: run.score !== null && run.score !== undefined && !run.warmup ? `Score ${round(run.score)}.` : '' };
  }

  return { pickHeadline, isMilestone };
});
