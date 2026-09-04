# surviv-trainer

A browser aim trainer for [surviv.io](https://surviv.io) / [survev.io](https://survev.io).
Top-down view, absolute mouse cursor, WASD movement, and bullets that actually travel,
so you practice leading targets the way the real game demands.

Demo of a simulated user running the Benchmark, an adaptive Flick drill, the
Bullet-leads drill, and the Chase and Dodge drills: `demo/surviv-trainer-demo.mp4`.

## Run

No build step. Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

Use the Fullscreen button so pixel geometry matches the game.

## Routines

| Routine | What it is |
| --- | --- |
| Benchmark | 45 s warm-up, then nine 30 s scored scenarios: static, precision and dynamic clicking; precise and reactive tracking; speed and evasive switching; chase and dodge under fire. Fixed difficulty, no hints, so scores compare across weeks. |
| Daily 15 | Warm-up plus eight 75 s adaptive drills in shuffled order, one per category. |
| Clicking focus / Tracking focus / Moving focus | Category-specific adaptive sets. Moving focus is chase, dodge and a hard duel. |
| Bullet leads | Sniper drills with a lead marker that fades out during each run. |

## Drills

Tracking, Flick, 1v1 Duel, Shotgun Rush, Sniper Leads, Swarm, Pistol Tap, Chase, Dodge, Custom.

Chase: the enemy flees with jukes at 90% of your speed (faster as adaptive difficulty
rises) and gets away if you fall more than the leash distance behind, so you have to
shoot while running with moving spread. Dodge: a strafing enemy with hard aim that leads
your movement shoots back, so standing still or strafing predictably gets you hit.
Both report accuracy while moving versus standing, time spent moving, enemies that got
away, damage taken per minute and the share of damage taken while still.
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
- R: reload
- Esc: pause

## Fidelity and licensing

Gun and bullet definitions are survev's own, extracted verbatim from
`shared/defs/gameObjects/gunDefs.ts` and `bulletDefs.ts` into
`vendor/survev/defs/`. Player and gun sprites, rock and blood-splat sprites, the
bullet trail, the default crosshair, every gun's fire/reload/cycle sound, the hit and
bullet-whiz sounds, and the Roboto Condensed font are copied from the survev client
into `vendor/survev/`. The camera (pixels per unit = half the larger screen dimension
divided by the scope's zoom radius), the additive standing plus moving spread, hand and
gun placement, tracer colors, grass color and grid all follow the survev client and
server code. Player radius is 1 unit and movement is 12 units/s.

survev is licensed under the GNU GPL v3, so this project is too: see `LICENSE` and
`vendor/survev/attribution.txt` for the third-party icon credits survev carries.

## Demo bot

`demo/bot.mjs` is a simulated human player (reaction delay, Fitts-style movement
time, minimum-jerk flicks with endpoint noise and overshoot, corrective
submovements, partial lead). `demo/record.mjs` drives it through the trainer in
headless Chrome and writes the video.
