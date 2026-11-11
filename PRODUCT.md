# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static front end: plain HTML, CSS and browser JavaScript with no build step
("static site would be nice"). It still opens from `index.html` directly or from any
static host and is then a complete guest trainer with history in localStorage.

Since Phase 1 (2026-11-10) there is also a small backend for accounts and the
engagement loop: three Vercel functions (`api/`) over Postgres on Neon, live at
https://surviv-trainer.vercel.app. It adds email and Discord sign-in, history sync,
streaks, challenges, friend and Discord-server boards, the survev match-history panel,
web-push reminders, feedback and first-party analytics. `platform/README.md` is its spec.

Reuses survev (the open-source surviv.io continuation, GPL-3.0) as much as
possible, at the user's request: gun, bullet, throwable, explosion, obstacle and
GameConfig definitions extracted verbatim to `vendor/survev/defs/`, the client's
sprites, sounds and font under `vendor/survev/`, and its camera, spread, damage
falloff, headshot, ricochet, blast, throw-physics, weapon-switch, hand/gun placement,
tracer and particle rules re-implemented in plain JavaScript in `js/game.js`. Every one
of those rules has been audited against survev's source; the results, including the
deliberate deviations, are the "Mechanics audit" table in `README.md`. The project is
therefore GPL-3.0 (`LICENSE`). The platform layer (`platform/`, `api/`, `lib/`,
`db/`) is MIT so it can be reused by other trainers; `CONTRIBUTING.md` has the split.

## Users

Primary user: the author, a surviv.io / survev.io player, practicing aim at a desk
with a mouse and keyboard in short sessions before or between games.

Secondary audience (the launch audience as of 2026-11-10): other surviv/survev
players, reached mainly through the survev Discord. Skill level of that audience is
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
- Progress lives in the browser first. Signing in (email or Discord) is optional and
  only adds sync, streak protection across devices, boards and challenges.
- The research and design rationale lives in `docs/RESEARCH.md`; drill and
  routine definitions in `js/modes.js` and `js/benchmark.js`; weapon numbers in
  `js/weapons.js`.

## Capabilities and Constraints

- Drills: Tracking, Flick, 1v1 Duel, Shotgun Rush, Quick Switch, Sniper Leads,
  Swarm, Pistol Tap, Chase, Dodge, Spin Dodge, Frag Lob, Cooked Frag, Ricochet,
  Barrel Trap, Custom. Ricochet is played inside a real survev bunker, drawn at random each
  run from four of them, against a bot that holds cover and shoots back. Routines: Daily 5, Benchmark, Clicking focus, Tracking focus,
  Moving focus, Utility focus, Bullet leads. Every routine but the Benchmark is five
  minutes end to end including rests, computed from the steps rather than written down.
- Analytics: throughput score, flick kinematics from the cursor path (reaction,
  movement time, overshoot gain, submovements, direction rose), moving vs
  standing accuracy, damage taken while still, adaptive difficulty reached,
  per-scenario trend chart, personal bests, provisional benchmark tiers. Plus, for the
  mechanics beyond aim: accuracy and damage taken spinning vs steady, switches that
  beat the primary's own fire delay and the gap they produced, damage per grenade and
  cook time, ricochet hits and self-inflicted ricochet damage.
- Benchmark history is keyed by `ST.BENCHMARK_VERSION`. Scenario settings changed when
  the scopes were fixed, so pre-v2 runs are kept but never mixed into new bests.
- Enemy behaviour is centrally owned: eight movement patterns and three aim skills live in
  `js/behaviors.js`, and drills reference them by name rather than defining their own. Spinning is
  handled inside the shared aim solution, so it behaves identically in every drill.
- No drill uses invincible bots. Tracking drills use 500 HP bots that take damage and die.
- Drills where bots shoot back space respawns by a full reload of the player's weapon.
- Weapon, throwable, explosion, obstacle and config values are survev's definitions
  verbatim (`vendor/survev/defs`) and should be refreshed from upstream rather than
  edited; player radius 1 unit, run speed 12 units/s.
- Scopes are not free choices. A 16:9 view reaches `zoomRadius` units sideways but only
  `zoomRadius · 9/16` up and down, so any drill whose spawn range exceeds the short axis
  spawns targets only to the left and right. `ST.scopeForDistance` picks the scope, and
  the menu warns when a hand-set one does not fit.
- Terminology follows the games: scopes 1x/2x/4x/8x/15x, weapon names as in
  survev, "units" for world distance.
- The front end must remain static with no build step (confirmed), and must stay fully
  playable with the backend down.
- First run (2026-11-10 redesign, `platform/ONBOARDING.md`): one 30 s aim test, then an
  optional 5 × 30 s diagnostic, then a one-week plan with a daily reminder; skippable at every
  step. Points reward practice time, plan days, new bests and accuracy at the same speed, never
  sharing or signing in. Custom weapons and settings require a verified email (codes sent by Neon
  Auth); presets are open to everyone, and nothing is locked without a backend.
- The streak has no freezes or repairs (user decision, 2026-11-10). No ads or ad code until
  the user decides to turn ads on.
- Undecided: final domain (currently surviv-trainer.vercel.app); whether touch/mobile play is supported
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
- `demo/surviv-trainer-demo.mp4`: one recording of a simulated user (`demo/bot.mjs`)
  running the Benchmark, Flick, Sniper Leads, Chase and Dodge drills. Recorded before
  the mechanics audit, so it does not show the barrels, grenades, weapon slots or the
  survev-style menu.
- The spinning model's effect size was measured in the headless harness, not assumed:
  against a hard-aim bot and a target juking every 0.45 s it cut the bot's hit rate from
  28% to 20%, and against a target running straight it did nothing.
- Ricochet was measured the same way, and the mirror's shape decides its worth. Off a
  convex barrel roughly one firing angle in ten reaches a target beside it and none at all
  reaches one behind it. Off the flat metal walls of a bunker it turns corners properly:
  in `bunker_hydra_compartment_02`, five of eight sampled positions with no line of sight
  were reachable, in three-to-eighteen-degree windows. That measurement is why the Ricochet
  drill is set in that bunker and not in an open barrel field; eight survev bunkers were
  scored the same way before it was chosen.
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
5. Stay light: static files, accounts optional, works from a double-click on
   `index.html`.
