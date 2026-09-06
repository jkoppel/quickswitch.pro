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

Nothing in the trainer stands there and takes it. Every bot is armed, in every drill and every
benchmark scenario. Where the drill is about your aim rather than a duel — tracking, flicks, the
swarm, pistol taps, the grenade drills — the bots carry a sidearm and aim loosely, which is enough to
punish standing in the open without deleting you while you work. Where the drill is a fight, they
carry what the fight calls for. Against a simulated player who moves and shoots back, that lands at
zero to nine deaths a minute across the aim drills.

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
- R: reload
- Esc: pause

## Fidelity and licensing

Definitions are survev's own, extracted verbatim into `vendor/survev/defs/`: guns and
bullets from `shared/defs/gameObjects/gunDefs.ts` and `bulletDefs.ts`, throwables and
explosions from `throwableDefs.ts` and `explosionsDefs.ts`, the stone and barrel
obstacles from `shared/defs/mapObjects/obstacles/mapObstacleDefs.ts`, and the constants
the simulation needs from `shared/gameConfig.ts`. Player, gun, obstacle, projectile,
particle and crosshair sprites, gun and explosion sounds, and the Roboto Condensed font
are copied from the survev client into `vendor/survev/`. Player radius is 1 unit and
movement is 12 units/s.

survev is licensed under the GNU GPL v3, so this project is too: see `LICENSE` and
`vendor/survev/attribution.txt` for the third-party icon credits survev carries.

### Mechanics audit

Every rule below was checked line by line against survev's source (`server/src/game/objects/bullet.ts`,
`server/src/game/weaponManager.ts`, `server/src/game/objects/explosion.ts` and `projectile.ts`,
`client/src/objects/player.ts`, `client/src/game.ts`, `client/src/animData.ts`).

Already correct, left alone: the spread formula (`shotSpread`, plus `moveSpread` while moving,
deviation `random(-0.5, 0.5) * spread`), shotgun pellet jitter and its 1.11 multiplier, muzzle
position from `barrelOffset` and `barrelLength`, gun sprite anchoring and `worldImg.scale * 0.5`,
the idle hand pivots for rifle, bullpup and pistol poses, recoil decay, reloading `maxReload`
rounds per `reloadTime`, tracer colours, grass colour, grid size, scope zoom radii, casing physics
and blood-splat particles.

Wrong, now fixed:

| What | Was | survev |
| --- | --- | --- |
| Camera zoom | `max(w, h) / (2 · zoomRadius)` | `maxScreenDim = max(min(w,h)·16/9, max(w,h))`. Anything in a window narrower than 16:9 was drawn at the wrong size. |
| Damage falloff | not applied at all | `damage *= remap(traveled / distance, 0, 1, 1, falloff)`. Buckshot has `falloff` 0.3, so an M870 pellet went from 12.5 flat to 12.5 near and 3.75 at its 27-unit limit. |
| Headshots | none | 15% chance per hit (`GameConfig.player.headshotChance`) times the gun's `headshotMult`: ×2 for most, ×1.5 for shotguns. |
| Bullet range jitter | none | every non-shotgun bullet's range is jittered ±1 unit in 16 steps (`distAdj`). |
| First-shot accuracy | none | a gun idle longer than its `recoilTime` fires the next shot with zero spread. |
| Backpack sprite | drawn about twice too wide | `(0.4 + level·0.03) · 0.5` on the 148 px circle sprite, which is slightly smaller than the body. |
| Gun recoil | moved both hands | `handRContainer.position.x -= gunRecoilR · 1.125`; the right hand only, and the gun rides along with it. |
| Stone size | random radius 1.6–3.2 | `stone_01` is a 1.6-unit collider scaled 1.0–1.2. |
| Sprite world sizes | every sprite assumed to be 144 px | each sprite's own pixel size at the client's scale, at 16 px per unit. |
| Gun artwork | `worldImg.tint` never applied, so the AK-47, Mk 12, M39 and M870 all drew the same untinted `gun-long-01` | most guns share a generic silhouette and are told apart only by their tint, which the client applies as a PIXI tint. Guns with their own artwork carry `0xffffff`, so one code path covers both. The DP-28's pan magazine (`worldImg.magImg`) was also never drawn. |
| Passive bots | eight of fifteen drills had enemies that never fired a shot: they ran around as targets rather than opponents | every drill and scenario now returns fire, sized to the drill (see above). |
| Stale saved settings | a setting saved by an older version that named something since renamed — a movement pattern, say — was assigned to its dropdown, which silently went blank, and the blank was then saved back as the real setting | selects reject values they do not have and keep the drill's own preset instead, and known renames are migrated. |
| Invincible bots | tracking drills used bots that could not be damaged at all | there is no such mode any more. Tracking bots have 500 HP: enough that the drill is about holding the stream on them, but they take damage and they die. |
| Respawn timing | every bot respawned 0.5 s after dying, including in drills where they shoot back, so the next fight started while you were still reloading | drills with return fire now wait for a full reload of your own weapon — 2.9 s behind an AK, 4.2 s behind an M870, which reloads a shell at a time. |
| Drill settings | `readSettings()` read only the form fields, so any setting without a control — `arena`, `throwableCount`, `enemyWeapon`, `fleeSpeed`, `leash` — was dropped when a drill was started from the menu | the form now overrides the drill's preset instead of replacing it. |
| Scope choices | several drills spawned targets further away than the scope could show | a 16:9 view reaches `zoomRadius` sideways but only `zoomRadius · 9/16` up and down, so targets past that only ever appeared to the left and right. Every drill and scenario now picks the smallest scope that shows its spawn range in every direction, and the menu says so if you set one that does not. |
| Arena size | fixed ±100 units | scales with the scope, because at 15x the view is 104 units wide and you could see past the edge of the world. |

Missing, now implemented: ricochet at `maxReflect` 3 with half damage per bounce, off everything
survev makes of metal — barrels in the open and the walls, columns and control panels of a bunker,
all of which inherit `reflectBullets` from the `metal` material in `mapObjectHelpers.ts`. Rectangular
colliders came with them, since walls are AABBs rather than circles, and they are honoured by
bullets, movement, grenade bounces and line of sight alike. Also: barrel and control-panel
detonation, frag grenades with survev's throw physics, fuse and cooking, explosion damage that is
flat inside `rad.min`, ramps to zero at `rad.max` and is blocked by obstacles, shrapnel, and weapon
slots with survev's exact switch rule.

Buildings are laid out from survev's own `mapObjects` lists (`vendor/survev/defs/bunkerDefs.js`),
mirrored on import because survev's y axis points up and the trainer's points down. What is *not*
imported is the rest of the building system: no floors-and-ceilings layering, no doors, no stairs,
and the walls are painted from their material rather than from the client's per-building floor and
ceiling artwork, which the trainer has no atlas for. The colliders, materials and positions are
survev's; the paint is not.

Deliberate deviations, and why:

- **Bots push each other apart.** survev players pass through one another; its movement collision
  loop only considers obstacles. Overlapping bots make a drill degenerate, so the trainer separates
  them.
- **No armour, helmets, perks, building layers, or muzzle clipping against obstacles.** None of them
  change the aiming task, and all of them would need map and inventory systems the trainer does not
  have.
- **Benchmark scores from before the scope fix are not comparable.** The scenarios changed, so
  benchmark history is keyed by `ST.BENCHMARK_VERSION`; old runs are kept but are not mixed into new
  bests or trends.

## Demo bot

`demo/bot.mjs` is a simulated human player (reaction delay, Fitts-style movement
time, minimum-jerk flicks with endpoint noise and overshoot, corrective
submovements, partial lead). `demo/record.mjs` drives it through the trainer in
headless Chrome and writes the video.
