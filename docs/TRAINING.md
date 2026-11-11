# How the trainer works

Routines, drills, enemy behavior, controls and what you see after a run.

## Streaks, challenges and progress

- **First visit:** one button, a 30-second aim test. Then an optional five-test diagnostic
  (3 minutes) that builds a one-week plan around your weakest skill and offers a daily reminder.
  "Skip to all drills" goes straight to the full trainer. The flow is specified in
  `platform/ONBOARDING.md`.
- **Points** for training (10 a minute, up to the 45-minute daily budget), for finishing a plan
  day, for beating your best score, and for sharper accuracy at the same speed
  (`platform/shared/points.js`).
- Finishing any routine extends your streak; ending one early doesn't count, and there are no
  streak freezes.
- **Custom weapons and settings** unlock with a verified email (a six-digit code; no password).
  Every preset drill and routine is open to everyone, and with no backend nothing is locked.
- **Sign in** with an email code or Discord (once it's configured) to keep your streak and history
  if the browser is cleared, and to carry them to another device. You can play without it.
- **Challenge a friend** from any Benchmark result: the link replays the same scenario on the same
  spawns, and playing it makes you friends on the boards.
- **Progress** shows a practice calendar, Benchmark trends, throughput, moving vs standing accuracy,
  friends and Discord-server boards, and, if you link your survev name, damage per minute in your
  real games, split by whether you warmed up within the hour before.
- Reminders are opt-in web push, offered from your second day.

## Routines

Every routine except the Benchmark is five minutes end to end, rests included. The lengths shown
in the menu are computed from the steps rather than written down, so they cannot drift.

| Routine | What it is |
| --- | --- |
| Daily 5 | 30 s warm-up plus six 32 s adaptive drills in shuffled order, one from each of clicking, tracking, switching and moving. 5 minutes. |
| Benchmark | 30 s warm-up, then nine 30 s scored scenarios: static, precision and dynamic clicking; precise and reactive tracking; speed and evasive switching; chase and dodge under fire. Fixed difficulty, no hints, so scores compare across weeks. Weekly, not daily. |
| Clicking focus / Tracking focus / Moving focus | Category-specific adaptive sets, 5 minutes each. Moving focus is chase, dodge, spin dodge and a hard duel. |
| Utility focus | Quick switching, frag placement, barrels and spinning. 5 minutes. |
| Bullet leads | Sniper drills with a lead marker that fades out during each run. 5 minutes. |

## Drills

Tracking, Flick, 1v1 Duel, Shotgun Rush, Quick Switch, Sniper Leads, Swarm, Pistol Tap, Chase,
Dodge, Spin Dodge, Frag Lob, Cooked Frag, Ricochet, Barrel Trap, Custom.

**Quick Switch and Shotgun Rush** carry two guns. survev gives you one free weapon switch a second
that costs `baseSwitchDelay` (0.25 s) instead of the gun's own switch delay, so after an M870 shell
you can be firing an MP5 a quarter of a second later instead of waiting out the 0.9 s pump. Two guns
that share a `deployGroup` — both shotguns do — are charged the full delay instead, which is exactly
why the pairing has to be a shotgun plus something from another class. The result screen reports how
many shots actually beat the primary's own cycle.

**Frag Lob and Cooked Frag** are grenade drills. Hold left mouse with the throwable out to pull the
pin, release to throw; throw strength is your cursor's distance from you over survev's
`throwableMaxMouseDist` of 18 units, which works out to about 19 units of flight. A frag does 125
damage out to 5 units and falls to nothing at 12, an obstacle in the way stops the blast dead, and
the 4 s fuse runs whether or not you cooked it — so Cooked Frag is about holding the pin long enough
that the thing bursts on arrival instead of announcing itself for four seconds.

**Ricochet** is played inside a real survev bunker, drawn at random each run from four of them
(Crossing, Conch, Hydra, Chrysanthemum), laid out from those buildings' own object lists. Everything
that bounces a bullet in survev is made of metal — `metal` is the only material whose
`reflectBullets` is true — and the metal is nearly all indoors: bunker walls, columns and control
panels, plus barrels out in the field. The shape of the mirror decides what the technique is worth:

- A **barrel is convex**, so it scatters rounds back into your own half of the field. It can catch
  someone hugging the barrel and it will put your own rounds back into you at close range, but it can
  never bend a shot around behind itself.
- A **bunker wall is flat**, so it reflects at the mirror angle and genuinely turns corners. Aim at
  the wall as far past the corner as the enemy is behind it.

The bot in there holds cover: it walks to a spot that breaks your line of sight, stays until that
cover stops working, and leans out for half a second at a time to shoot back. Because it re-solves
whenever the cover fails, walking around the corner does not end the problem — it repositions too.
Across the four bunkers the straight shot is unavailable 64–73% of the time while the bot still
fires 126–169 rounds a run, so banking one off the wall is the answer that is actually available
rather than a trick you could ignore.

Those four were chosen by simulation, not by eye. Every survev bunker with six or more metal walls
was played out against a bot holding cover and a player who keeps moving to re-take the shot; the
ones that hid better than these stopped shooting back, and the ones that shot more stopped being
cover. Bounced rounds do half damage (survev divides by `reflectCount + 1`), ignore the surface they
came off, bounce up to three times, and can hit you.

**Barrel Trap** is the other half of the same lesson, out in the open: a barrel has 150 HP and
detonates for 125 damage inside 5 units, so popping the one an enemy is about to run past is usually
worth more than any ricochet. The Hydra bunker's control panels are metal and detonate the same way.

**Spin Dodge** is the spinning drill: see below.

Chase: the enemy flees with jukes at 90% of your speed (faster as adaptive difficulty
rises) and gets away if you fall more than the leash distance behind, so you have to
shoot while running with moving spread. Dodge: a strafing enemy with hard aim that leads
your movement shoots back, so standing still or strafing predictably gets you hit.
Both report accuracy while moving versus standing, time spent moving, enemies that got
away, damage taken per minute and the share of damage taken while still.

## Enemy movement and aim

Every bot moves with one of eight patterns and aims with one of three skills, defined once in
`js/behaviors.js`. Drills pick them by name and never define their own, so a change to how bots dodge
or lead lands everywhere at once.

| Pattern | What it does |
| --- | --- |
| Hold | Stands still. Pure clicking. |
| Strafe | Runs across you, flipping direction unpredictably. Reactive tracking. |
| Orbit | Circles at a steady speed and distance. Predictable, for smooth tracking. |
| Juke | Sharp direction changes and dead stops, like a player dodging. |
| Push | Closes the distance and dances at point-blank. |
| Crossing runs | Ignores you and runs straight lines across the field, stopping and cutting back. |
| Hold cover | Keeps a wall between you and it, leaning out to shoot. |
| Flee | Runs away with jukes; you have to chase while shooting. |

Only three of them circle you, and they do it at different tempos. Measured over 30 seconds against
a stationary player, crossing runs turn around you at 29°/s while swinging between 5 and 24 units of
range, where orbit turns at 53°/s and holds 13–14 units; push closes from 14 units to half a unit,
and flee opens from 14 to 38. That spread is the point: before this there were three variants of
running in a semicircle.

Aim skills carry their difference in two numbers — how loosely they aim (9°, 6°, 4° of error) and how
late they see you (0.6 s, 0.35 s, 0.2 s). All three try to lead, because every player does.

## Spinning

Spinning the cursor is a real surviv habit, and the trainer models the reason it works rather than
handing out a dodge bonus. A player's facing is the strongest tell they give: you strafe across the
way you are looking and back off along it, so an opponent watching your gun already knows which way
you are about to break. The bots lead you with a blend of the velocity they can still see — sampled
one reaction time ago — and the velocity they can anticipate from your facing. Spinning collapses
that blend onto the stale sample, so on every direction change they shoot where you were going
rather than where you are going. Two smaller effects come with it: they aim at the centre of your
silhouette, which your gun swings around as you turn, and they re-read that silhouette late.

The consequences are the honest ones, and they are what the drill teaches:

- Spinning only pays if you also change direction. Against a straight line the stale read and the
  live read are the same vector, so it buys nothing.
- It costs you your own aim, because your cursor is your aim. You spin to cross ground and settle to
  shoot.
- It matters most against good opponents. Anticipation is 1.0 for the hard bots, 0.4 for normal and
  0 for easy, so there is nothing to take away from a bot that was not reading you anyway.

It is one shared implementation: the same aim solution runs for every bot in every drill, so
spinning cannot behave one way in one drill and differently in another.

Measured over ten trials per condition against a target juking at random intervals, spinning cut the
bots' hit rate by 19% at hard aim and 17% at normal. Against easy bots it does nothing measurable,
and that is the honest result rather than a gap: a bot with 9° of aim error is already missing by
about two body widths at fighting range, so there is no careful tracking left to disturb. Against a
target running in a straight line it does nothing at any skill, because stale and current velocity
are the same vector. The results screen reports accuracy spinning versus steady and damage taken per
minute spinning versus steady, so the trade is visible rather than assumed.
Every setting is editable: weapon, scope, enemy count and movement, HP or invincible
bots, return fire, adaptive difficulty, lead marker, obstacles.

## What you get after a run

- Score = 100 × hits per second × √accuracy. Hit rate plateaus within days while
  speed keeps improving for months, so the score follows throughput.
- Flick kinematics from the cursor path: reaction time, movement time, overshoot
  gain, movements per target, and a direction rose of time-to-first-hit.
- One or two insights derived from that data (overshoot, weak directions, shooting
  while moving, aiming where the target is instead of where it will be).
- Benchmark tiers (provisional thresholds), a strategy check comparing your speed
  and precision conditions, and a per-scenario trend chart over runs.
- Warm-up handling: the first 40 s of practice each day is flagged and excluded
  from bests. A session counter turns amber after 45 minutes.

The research behind these choices, including what was cut and why, is in
`docs/RESEARCH.md`.

## Controls

- Mouse: aim, left click: shoot (hold for automatic weapons)
- WASD / arrows: move
- Right click or Q: swap to your last weapon
- 1 / 2: primary and secondary weapon, 4 or G: throwable
- With a throwable out, hold left mouse to cook and release to throw; cursor distance is throw strength
- R: reload — an empty gun also reloads by itself, as in survev
- Esc: pause
