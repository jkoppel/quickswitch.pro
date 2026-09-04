# surviv-trainer

A browser aim trainer for [surviv.io](https://surviv.io) / [survev.io](https://survev.io).
Top-down view, mouse aim, WASD movement, and bullets that actually travel, so you
practice leading targets the way the real game demands.

## Run

No build step. Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

## Drills

| Drill | What it trains |
| --- | --- |
| Tracking | Keeping an SMG/AR stream on a strafing enemy |
| Flick | Snapping to targets that pop up and vanish after 1.5 s |
| 1v1 Duel | Hitting a juking enemy who shoots back while you dodge |
| Shotgun Rush | Point-blank M870 timing against chargers |
| Sniper Leads | Mosin at 8x against long-range strafers |
| Swarm | Target selection against three jukers |
| Pistol Tap | Semi-auto click discipline with the M9 |
| Custom | Anything: weapon, scope, enemy count, movement, HP, return fire |

Every drill's settings can be tweaked before starting. Results show accuracy,
time-to-kill, reaction time, and damage per second, with per-drill bests saved
in the browser.

## Controls

- Mouse: aim, left click: shoot (hold for automatic weapons)
- WASD / arrows: move
- R: reload
- Esc: pause

## Fidelity notes

Weapon numbers (damage, fire delay, bullet speed, range, standing/moving spread,
magazine, reload) are approximations of the survev gun definitions. Player radius
is 1 unit, movement is 12 units/s, and scope zoom levels use the game's 1x/2x/4x/8x/15x
view sizes. See `js/weapons.js`.
