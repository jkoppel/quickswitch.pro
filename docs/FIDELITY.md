# Fidelity to survev, and licensing

The game (`js/`, `vendor/`) is GPL-3.0. `platform/` (accounts, streaks, challenges, progress) is
MIT, see `platform/LICENSE`. `CONTRIBUTING.md` says which applies to a change. The sprites and
sounds in `vendor/survev/` come from surviv.io via survev and remain their owners' property.

Definitions are survev's own, extracted verbatim into `vendor/survev/defs/`: guns and
bullets from `shared/defs/gameObjects/gunDefs.ts` and `bulletDefs.ts`, throwables and
explosions from `throwableDefs.ts` and `explosionsDefs.ts`, the stone and barrel
obstacles from `shared/defs/mapObjects/obstacles/mapObstacleDefs.ts`, and the constants
the simulation needs from `shared/gameConfig.ts`. The guide pages also use perks (`perkDefs.json`:
`perkDefs.ts`, each role's perks from `roleDefs.ts`, each map's `tier_perks` loot and the English
names and descriptions from `client/src/en.json`) and the puzzle codes (`puzzles.json`, from
`shared/defs/puzzles.ts`). The pictures of each puzzle room come from `puzzleRooms.json` and the
sprites in `vendor/survev/img/puzzles/`, both written by `tools/extract-puzzle-rooms.mjs` from the
building definitions, placed the way survev's client places floor art and obstacles. Player, gun, obstacle, projectile,
particle and crosshair sprites, gun and explosion sounds, and the Roboto Condensed font
are copied from the survev client into `vendor/survev/`. Player radius is 1 unit and
movement is 12 units/s.

survev is licensed under the GNU GPL v3, so this project is too: see `LICENSE` and
`vendor/survev/attribution.txt` for the third-party icon credits survev carries.

## Mechanics audit

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
| Stale saved settings | a setting saved by an older version that named something since renamed — a movement pattern, say — was assigned to its dropdown, which silently went blank, and the blank was then saved back as the real setting | selects reject values they do not have and keep the drill's own preset instead, and known renames are migrated. |
| Invincible bots | tracking drills used bots that could not be damaged at all | there is no such mode any more. Tracking bots have 500 HP: enough that the drill is about holding the stream on them, but they take damage and they die. |
| Auto-reload | a dry gun reloaded only when you pulled the trigger on it, so letting go of the mouse after the last round left you standing there empty | `fireWeapon` sets `scheduledReload = ammo <= 1` and `gunUpdate` starts it the moment the shot's `fireDelay` is up, trigger held or not. Switching away cancels the scheduled reload and switching back to an empty gun queues it again behind the switch delay. |
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
