# What aim trainers do, what the science says, and what survives scrutiny

This document is the design rationale for the second iteration of the trainer.
Part 1 catalogs features of existing aim trainers. Part 2 gives the cognitive
science story each feature is usually justified with. Part 3 goes back to the
primary literature and cuts what doesn't hold up. Part 4 maps the survivors onto
a top-down 2D cursor game like surviv.io / survev.io.

## 1. Twenty features and ideas from existing aim trainers

Sources: KovaaK's, Aimlabs, Voltaic benchmarks and routines, 3D Aim Trainer,
aimtrainer.io, plus the Kr4m KovaaK's guide.

1. **A skill taxonomy.** Voltaic splits aim into clicking (static, dynamic),
   tracking (precise, reactive) and target switching (speed, evasive). Every
   scenario is tagged with one, and routines are built to cover all six.
2. **Benchmarks with rank tiers.** A fixed set of six scenarios (three tracking,
   three clicking in KovaaK's) with score thresholds for Bronze through
   Grandmaster. Voltaic recommends running the set four times and re-testing
   monthly.
3. **Playlists and routines.** Fixed sequences of short scenarios, typically
   10 minutes each, grouped by experience level with a suggested timeline
   before moving up.
4. **Timed challenge mode.** 60-second scored runs feed leaderboards. A
   separate free-play mode is unscored.
5. **Accuracy-weighted scoring** so that spam-clicking doesn't win. Aimlabs'
   Gridshot score penalizes misses; KovaaK's scenarios subtract for misses.
6. **Target size variants.** Gridshot vs Sixshot (14% smaller targets), and the
   "small" variants of KovaaK's scenarios, create a precision axis separate
   from a speed axis.
7. **Timed-out targets.** Spidershot-style targets vanish if not hit in time,
   forcing reaction and commitment rather than careful approach.
8. **Invincible bots** for pure tracking scenarios, so the drill never resets
   and the metric is time-on-target.
9. **Scripted strafing bots** with configurable speed, strafe length, and
   direction-change frequency (Close Long Strafes, Fast Strafes, vertical
   variants, "Air" for 3D).
10. **Smooth vs reactive tracking**: predictable sinusoidal motion versus
    sudden unpredictable reversals, trained as different skills.
11. **Target switching** scenarios with many low-HP targets (1wall6targets,
    Tile Frenzy) that force fast re-acquisition.
12. **Sensitivity tools**: converters between games and "sensitivity finders"
    that recommend a sens from performance data. The Kr4m guide also suggests
    training at a quarter of your sensitivity to force faster arm movements.
13. **Per-target analytics**: reaction time, time-to-kill, "gain" (ratio of
    overshoot to undershoot), precision (variance of error).
14. **Spatial heatmaps** of reaction time and accuracy by screen region, to
    find weak directions.
15. **Long-term trends**: personal bests, per-run history filtered by week,
    month, year.
16. **Kinematic assessment**: Aimlabs' research group measures the
    speed-accuracy trade-off across conditions and reports whether the player
    adapts strategy to task demands ("swipiness", overshoot).
17. **Difficulty tiers and adaptive modes** that scale target size, speed, or
    count as you improve.
18. **Visual minimalism**: plain backgrounds, high-contrast targets, dot
    crosshair, hidden weapon model, no on-screen stats during the run.
19. **Immediate augmented feedback**: hit sounds, kill sounds, hitmarkers,
    score ticking up.
20. **Cognitive add-ons**: Detection, Audiospatial, Decisionshot (shoot/no-shoot
    by color), working-memory tasks, marketed as training "game sense".
21. **Movement-integrated scenarios** such as wall peeking and 1v1 bots that
    require keyboard movement plus shooting, and game-specific weapon
    simulations (Valorant, Apex bots with recoil).
22. **Community and motivation layer**: leaderboards, ranks, Discord rank
    roles, coaching, daily challenges, and advice to practice daily
    (20 minutes daily beats 2 hours weekly).

## 2. The cognitive-science story usually told for these features

- **Fitts's law and the speed-accuracy trade-off.** Movement time grows with
  the log of distance over target width. Small-target variants (6) and
  separate speed vs precision scenarios (16) supposedly train both ends of the
  curve. Analytics like gain and precision (13) come from the two-phase model
  of aimed movement: a fast primary submovement followed by a corrective
  submovement. Experts fire earlier in the trajectory with less overshoot.
- **Motor adaptation vs skill learning.** The first few runs each day show a
  warm-up effect attributed to re-calibrating to sensitivity; the slow
  multi-week gain is the actual skill (Listman et al. 2021). Sensitivity tools
  (12) and warm-ups (3) follow from this.
- **Contextual interference.** Practicing task variants in random rather than
  blocked order hurts performance during practice but improves retention and
  transfer. This justifies mixed playlists (3) and target switching (11).
- **Variability of practice / schema theory.** Practicing many distances,
  sizes, and speeds builds a generalizable motor program rather than a single
  rote movement. Justifies scenario variety (1, 9, 10).
- **Specificity of practice.** Learning is tied to the sensory conditions of
  practice. Justifies matching sensitivity and FOV to the game (12), and
  game-specific bots (21).
- **Challenge point framework** (Guadagnoli & Lee 2004). Learning is maximal
  when task difficulty matches the learner's capacity. Justifies tiers and
  adaptive difficulty (17).
- **Augmented feedback and knowledge of results.** Immediate feedback
  (19) drives error correction. The guidance hypothesis warns that feedback on
  every trial can create dependency and hurt retention when it is removed.
- **Distributed practice and consolidation.** Spaced sessions and sleep
  consolidate motor memory; micro-offline gains between short bouts account
  for much of early learning. Justifies "daily short sessions" (22) and rest
  between scenarios.
- **Deliberate practice.** Targeted, effortful, feedback-rich practice on
  weaknesses. Benchmarks (2) identify the weak category; routines (3) target
  it.
- **External focus of attention** (Wulf). Attending to the target rather than
  the hand improves motor learning. Justifies "look at the target" coaching
  and minimal UI (18).
- **Perceptual learning and visual search.** Experienced FPS players show
  narrower gaze distributions and faster reaction; training visual detection
  is supposed to transfer (20).
- **Gamification and motivation.** Leaderboards, ranks and streaks (22) keep
  people practicing.
- **Reaction time training.** Timed-out targets (7) and reaction-time
  analytics (13) are marketed as making you faster to react.

## 3. Critique: going back to the literature

I read or checked: Listman et al. 2021 (Frontiers Hum Neurosci, 7,174 Aimlabs
players, 682k runs); the Aimlabs kinematics paper on 32 professionals (PMC
9744923); the KovaaK's reliability pilot (Frontiers Sports Act Living 2024);
the Aimlabs focus-of-attention study (PLOS One 2023); the 2024 contextual
interference meta-analysis (PMC 11237090, 54 studies); Sala, Tatlidil & Gobet
2018 on video-game far transfer; the 2021 Chua et al. external-focus
meta-analysis; Winstein & Schmidt 1990 and later guidance-hypothesis work;
Proteau's specificity-of-practice studies; Macnamara et al. 2014 on deliberate
practice; Sailer & Homner 2020 on gamification; the arXiv VALORANT gaze study;
and the Guadagnoli & Lee challenge-point paper.

### What is actually well supported

- **Aim trainers measure reliably.** KovaaK's metrics had ICCs of 0.95 to
  0.995 across sessions in ten players. That is the strongest empirical fact
  about aim trainers: they are a good ruler. Whether they are a good gym is a
  separate question.
- **Hits per second keeps improving for months; hit rate does not.** In
  Listman et al., hit rate plateaued around 86 to 90% within about five days,
  improving 0.03% per day after that, while hits per second rose ~39% from day
  1 to day 60 and was still climbing. Accuracy percentage is a poor progress
  metric. Speed at a fixed acceptable accuracy (throughput) is the right one.
- **Diminishing returns within a day.** About 90% of the daily learning
  benefit came from 30 to 50 minutes of practice, peaking near 60 to 75
  minutes. Marathon sessions are mostly wasted.
- **Day-to-day retention is partial.** Roughly 65% of a day's improvement was
  retained the next day early on, dropping to about 40% at plateau. Expect
  regression between sessions and judge progress over weeks.
- **Warm-up is real.** Performance rises sharply over the first few runs of a
  day. Cold runs should not be compared to warm ones.
- **Experts change strategy with task demands.** In the kinematics study,
  better players fired earlier in the trajectory on speed tasks but moved
  slower and landed short (hypometric) on precision tasks. Adapting to the
  task, not a single fast style, distinguishes them.
- **Specificity of practice is strong for aiming tasks.** Proteau's work
  shows that aiming skill acquired with particular sensory feedback collapses
  when that feedback changes. Training conditions should match the game.
- **The speed-accuracy trade-off is real, but Fitts's law fits FPS poorly.**
  The Aimlabs authors found mouselook performance "poorly characterized by
  Fitts' law". For a 2D cursor game this matters less: 2D pointing is the
  original Fitts paradigm, so the law and its submovement analytics apply
  more cleanly to surviv than to Valorant.
- **Distributed practice and sleep consolidation** are well replicated for
  motor sequence learning. Short, repeated sessions beat massed ones.

### What is overclaimed or wrong

- **"Muscle memory."** Muscles store nothing. Skill is cortical, striatal and
  cerebellar. The harm of the phrase is the implication that raw repetition
  volume is the lever, when the data say volume saturates within an hour and
  quality of the measured trade-off matters more.
- **Far transfer from cognitive add-ons.** Sala, Tatlidil & Gobet's three
  meta-analyses (k = 310, 315, 359) found small-to-null effects of video-game
  training on cognitive ability. Detection, audiospatial and working-memory
  tasks are not going to give you "game sense". Cut them.
- **Reaction time training.** Simple reaction time is mostly stable. What
  improves is anticipation, cue detection, and how quickly you start the
  movement, and those gains are task-specific. Timed-out targets are fine as
  a task; "we train your reflexes" is marketing.
- **Contextual interference as a law.** The 2024 meta-analysis found a large
  effect in lab tasks (SMD ~0.9) but a small one in applied settings (0.23 to
  0.35), negligible in under-18s, with 90% heterogeneity and only three
  studies of decent quality. Interleaving is cheap and probably mildly
  helpful for adults, so do it, but it is not the secret.
- **The guidance hypothesis applied to hit sounds.** The reduced-feedback
  studies used lab tasks where the augmented feedback was the *only* error
  signal. In a shooter the game itself shows you where the bullet went; a hit
  sound in the trainer matches a hit sound in the game. Removing it would
  violate specificity for no gain. The valid residue: detailed analytics
  should come after the run, not during it, and any *guidance* the real game
  does not provide (for example a lead marker) must be faded out.
- **External focus.** The meta-analytic effect is medium for retention
  (g ~0.58), but the one study that tested it in an aim trainer found nothing
  (F < 1, partial eta squared 0.02) and suggested continuous visual feedback
  swamps verbal focus instructions. Not worth building features around.
- **Deliberate practice explains most of skill.** Macnamara et al. put
  deliberate practice at ~26% of performance variance in games, and the
  definition is inconsistent across studies. Aim mechanics are a fraction of
  FPS skill. An aim trainer should be positioned as a measured supplement, not
  the path to getting good.
- **Leaderboards and ranks make you learn.** Sailer & Homner found small
  gamification effects (g 0.25 to 0.49), with reward-and-status mechanics the
  weakest design. The real value of benchmarks is *measurement* (see the ICC
  result), not the badge.
- **Sensitivity finders.** Optimal-sensitivity research shows a broad plateau
  of comparable performance, and the day-one "warm-up" is largely sensitivity
  re-adaptation. For surviv this whole category is moot: the game uses the OS
  cursor at an absolute screen position, so there is no in-game sensitivity
  to find. What matters is pixel geometry: resolution, window size, and scope
  zoom.
- **A widely quoted "study".** Several SEO articles cite an "Esports
  Performance Institute 2023 study of 120 CS2 players" showing 27% K/D gains
  from aim training. I could not find the study, the institute, or any
  primary source. Treat it as fabricated.
- **Transfer from 3D aim trainers to surviv.** The specificity literature
  cuts the other way here: KovaaK's trains mouselook (relative rotation, FOV
  projection). Surviv is 2D absolute-cursor pointing with bullet travel time
  and per-weapon spread. The motor task is different enough that a dedicated
  2D trainer is the defensible choice.

## 4. What survives, transported to a top-down cursor shooter

| Principle | Feature in this trainer |
| --- | --- |
| Reliable measurement, tiered benchmark | A six-scenario **Benchmark** (static clicking, dynamic clicking, precise tracking, reactive tracking, speed switching, evasive switching), 30 s each, always run after a warm-up scenario, scored on throughput. Tiers are relative to your own history plus provisional thresholds, and labeled as such. No leaderboard. |
| Throughput beats hit rate | The headline **score is hits per second weighted by sqrt(accuracy)**. Hit rate is shown but not treated as the progress metric. |
| Speed-accuracy strategy adaptation | Benchmark pairs a **speed condition** (1x, close) with a **precision condition** (4x, far, so targets are ~40% smaller on screen). Results report whether your movement time rose in the precision condition, the expert signature. |
| Submovement analytics (2D Fitts applies cleanly) | The cursor path is sampled every frame. Per target: reaction time (spawn to first movement), movement time, **overshoot/undershoot gain**, and number of corrective submovements. |
| Spatial weakness | **Direction heatmap** of time-to-first-hit by the 8 compass directions of the flick, in the results screen. |
| Warm-up effect | First two runs of each calendar day are flagged **warm-up** and excluded from personal bests. |
| Diminishing returns, distributed practice | A **session budget**: the menu shows today's practice minutes and turns amber after 45 min, plus 20 s rest screens between routine scenarios. |
| Retention and trends | Every run is stored. The menu shows a **trend chart** of throughput over your last runs per scenario, grouped by day. |
| Challenge point | **Adaptive difficulty**: a staircase on target lifetime (clicking), dodge rate (tracking) and spawn distance, holding success near 75%. On by default in drills, off in the Benchmark so it stays a ruler. |
| Specificity | Same scope zooms, absolute cursor, bullet travel time, weapon spread, obstacles, and a **fullscreen button** so pixel geometry matches the game. Bots use real weapon definitions and shoot back. |
| Anticipation (bullet travel) with faded guidance | Optional **lead marker** showing where a bullet fired now would meet the target. It fades out over the run so you don't become dependent on it, and it is disabled in the Benchmark. |
| Interleaving (small but free) | **Routines** run scenarios in shuffled order by default, with a blocked option. A 20-minute **Daily** routine covers all six categories. |
| Post-run feedback, not mid-run | Analytics stay off-screen during the run. Afterwards the results screen gives one **insight** derived from the data (e.g., "you overshoot upward flicks by 22%; slow the last 10% of the move"). |
| Cut | Sensitivity finder, cognitive add-on tasks, reaction-time marketing, leaderboards, and the fake CS2 study. |
