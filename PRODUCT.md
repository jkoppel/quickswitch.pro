# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static site: plain HTML, CSS and browser JavaScript with no build step and no
server. Confirmed by the user as the preferred shape ("static site would be
nice"). Data persists in the browser's localStorage only. Opens from `index.html`
directly or from any static host.

## Users

Primary user: the author, a surviv.io / survev.io player, practicing aim at a desk
with a mouse and keyboard in short sessions before or between games.

Secondary audience (confirmed as possible, not yet active): other surviv/survev
players the author may share the app with. Skill level of that audience is
undecided; the app should not assume beginners or experts.

## Product Purpose

A browser aim trainer whose motor task matches surviv/survev rather than a 3D
shooter: top-down view, absolute OS cursor, bullets with travel time, per-weapon
standing and moving spread, WASD movement while shooting, and the game's scope
zoom levels. Success is measurable improvement in the player's throughput
(hits per second at acceptable accuracy) on scenarios that transfer to the real
game, with honest measurement rather than marketing claims.

## Positioning

The only aim trainer built for surviv's 2D absolute-cursor mechanics. KovaaK's,
Aimlabs and similar tools train mouselook, which the specificity-of-practice
literature says transfers poorly to a cursor game. The measurement layer follows
the evidence: throughput over hit rate, warm-up exclusion, diminishing-returns
budget, benchmark as a reliable ruler rather than a leaderboard. The user
confirmed this as the claim future work should protect.

## Operating Context

- Played in a desktop browser, fullscreen recommended so pixel geometry matches
  the real game.
- Routines run in sequence with rest screens; a Benchmark (fixed difficulty) is
  meant weekly, adaptive drills daily.
- All progress data lives in the browser; there is no account, server, or sync.
- The research and design rationale lives in `docs/RESEARCH.md`; drill and
  routine definitions in `js/modes.js` and `js/benchmark.js`; weapon numbers in
  `js/weapons.js`.

## Capabilities and Constraints

- Drills: Tracking, Flick, 1v1 Duel, Shotgun Rush, Sniper Leads, Swarm, Pistol
  Tap, Chase, Dodge, Custom. Routines: Benchmark, Daily 15, Clicking focus,
  Tracking focus, Moving focus, Bullet leads.
- Analytics: throughput score, flick kinematics from the cursor path (reaction,
  movement time, overshoot gain, submovements, direction rose), moving vs
  standing accuracy, damage taken while still, adaptive difficulty reached,
  per-scenario trend chart, personal bests, provisional benchmark tiers.
- Weapon values approximate survev gun definitions and should stay tied to
  them; player radius 1 unit, run speed 12 units/s.
- Terminology follows the games: scopes 1x/2x/4x/8x/15x, weapon names as in
  survev, "units" for world distance.
- Must remain a static site with no build step (confirmed).
- Undecided: deploy target and URL; whether touch/mobile play is supported
  (survev has a mobile mode, but the trainer is mouse-and-keyboard today);
  whether the real games' names may appear in a shared/public version
  (trademark question not yet considered); public name of the app.
- Benchmark tier thresholds are hand-set placeholders until real player data
  exists; do not present them as normed.

## Brand Commitments

Working title "Surviv Aim Trainer"; not confirmed as final. No logo or brand
assets exist. Visual references the real game's look (grass field, grid, tan
player circles, weapon tracers) for fidelity, not as a binding brand.

## Evidence on Hand

- `docs/RESEARCH.md`: literature review and critique with sources (Listman et
  al. 2021, KovaaK's reliability pilot, Aimlabs kinematics study, Sala & Gobet
  2018, contextual-interference meta-analysis, and others).
- `demo/surviv-trainer-demo.mp4` and `demo/moving-drills-demo.mp4`: recordings
  of a simulated user (`demo/bot.mjs`) running the Benchmark and drills.
- No real player data, testimonials, or transfer-to-game results exist. Do not
  fabricate improvement claims, user counts, or comparisons.

## Product Principles

1. Specificity first: every drill must be a task the real game actually
   demands, in the real game's geometry and physics.
2. Measure what improves: throughput, kinematics and moving accuracy, not
   vanity accuracy or reaction-time marketing.
3. Feedback after the run, not during it; the only mid-run feedback is what the
   game itself gives.
4. Short, daily, and honest: warm-up excluded, session budget visible, tiers
   labeled provisional until data exists.
5. Stay light: static files, no accounts, works from a double-click on
   `index.html`.
