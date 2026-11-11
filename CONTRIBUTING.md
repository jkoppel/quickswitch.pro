# Contributing

Two licenses live in this repository. Which one covers your change depends on where it lands.

| Path | License | What it is |
| --- | --- | --- |
| `js/`, `vendor/`, `index.html`, `style.css`, `demo/` | GPL-3.0 (`LICENSE`) | The trainer: drills, mechanics, rendering, survev definitions |
| `platform/`, `api/`, `lib/`, `db/`, `sw.js`, `admin.html`, `tests/` | MIT (`platform/LICENSE`) | Accounts, sync, streaks, challenges, boards, progress, reminders, feedback, the server |

By opening a pull request you agree that your contribution is licensed under the license of the
path it changes.

The sprites, sounds and art under `vendor/survev/` were made for surviv.io and came to this
project through survev. Neither license above covers them. Don't add art or sound from any other
game.

## Ground rules

- The trainer must keep working with no backend: opened from `index.html`, every account feature
  hides and the game is unchanged.
- Weapon, bullet, throwable and obstacle numbers are survev's own, extracted verbatim. Refresh them
  from upstream (`github.com/survev/survev`, branch `master`) rather than editing them by hand.
- Measure what you claim. If a change affects how a drill plays or what a number means, say how
  you checked it.
- `npm test` must pass. For UI changes, run `node tests/e2e/smoke.mjs` against `vercel dev` or a
  static server and look at the screenshots.
