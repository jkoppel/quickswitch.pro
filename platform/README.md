# platform/

Accounts, sync, streaks, challenges, boards, achievements, real-game stats, reminders and
feedback for the trainer. Everything in `platform/` is MIT-licensed (see `platform/LICENSE`);
the game in `js/` and `vendor/` is GPL-3.0.

The trainer must keep working with no backend at all: opened from `index.html` on disk, or
served by `python3 -m http.server`, it is a guest-only local trainer exactly as before. Every
platform feature degrades to "not shown" when `/api/health` does not answer.

## Shape

```
index.html, js/, style.css        the game (static, no build step)
platform/*.js                     browser side, classic scripts on window.ST (no build step)
platform/shared/*.js              pure logic used by both browser and server (UMD: window.ST.* or module.exports)
api/index.js                      one Vercel function; routes every /api/* call
api/og.js                         share-card PNGs (@vercel/og)
api/page.js                       index.html with Open Graph tags for /u/<handle> and /c/<id>
lib/*.js                          server modules (db, session, auth, handlers)
db/schema.sql                     idempotent schema (CREATE TABLE IF NOT EXISTS ...)
sw.js                             service worker: web push only, no caching
vercel.json                       rewrites + crons
tests/unit/*.test.mjs             node --test, pure logic and handlers
tests/e2e/*.mjs                   patchright + system Chrome against a URL
```

Vercel Hobby allows 12 functions per deployment; keep it to the three in `api/`.

## Identity

- Every browser has an anonymous id (`st.anonId`, a random UUID in localStorage) used for
  analytics events only.
- A **user row** is created lazily the first time the browser needs server state: the first
  completed run while the API is reachable, creating a challenge, opening one, or subscribing to
  reminders. `POST /api/session` creates an `anon` user and sets the session cookie.
- **Signing in** attaches a credential to the current user: a verified email address (a six-digit code) or Discord.
  Signing in on a new device with a credential that already belongs to another user switches the
  session to that user and **merges** the current anon user's runs, friendships, challenges and
  push subscriptions into it, then deletes the anon user.
- Session cookie `st_session` = `base64url(userId).issuedAtSeconds.hmacSha256`, HttpOnly, Secure,
  SameSite=Lax, Path=/, 400-day max age. Secret: `SESSION_SECRET`.
- Discord login is enabled only when `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are set;
  `GET /api/health` reports which sign-in methods are available. The sheet always lists Discord
  and email; until Discord is configured its button is disabled and marked as coming soon.
  Scopes: `identify guilds`. Guild ids and names are stored so server boards work; nothing else
  from Discord is kept beyond username, global name and avatar hash.

## Database (Postgres on Neon, `DATABASE_URL`)

```
users(id uuid pk, kind text check in ('anon','member'), handle text unique, display_name text,
      discord_id text unique, discord_avatar text, survev_slug text, tz text, remind_hour int,
      created_at timestamptz, last_seen_at timestamptz)
runs(id uuid pk, user_id uuid fk, client_id text, ts timestamptz, day date, key text,
     label text, score real null, duration real, warmup bool, benchmark bool,
     routine_completed bool, data jsonb, unique(user_id, client_id))
challenges(id text pk -- 8 chars base62
     , creator_id uuid fk, scenario text, key text, seed bigint, score real, created_at)
challenge_results(challenge_id text fk, user_id uuid fk, score real, created_at,
     primary key(challenge_id, user_id))
friendships(a uuid, b uuid, created_at, primary key(a,b))   -- stored with a < b
user_guilds(user_id uuid fk, guild_id text, guild_name text, guild_icon text,
     primary key(user_id, guild_id))
push_subscriptions(endpoint text pk, user_id uuid fk, p256dh text, auth text, created_at,
     last_sent_day date, last_kind text)
feedback(id bigserial pk, user_id uuid null, anon_id text, text text, context jsonb, created_at)
events(id bigserial pk, anon_id text, user_id uuid null, name text, props jsonb, ts timestamptz)
```

`runs.client_id` is the local history entry's id, so re-syncing is idempotent.

## HTTP API (all JSON; errors are `{error}` with a 4xx/5xx status)

| Method + path | Body / query | Returns |
| --- | --- | --- |
| `GET /api/health` | — | `{ok, signIn: {discord: bool, email: bool}}` |
| `POST /api/session` | — | creates an anon user if no session; `{user}` |
| `GET /api/me` | — | `{user: {id, kind, handle, displayName, avatarUrl, survevSlug, tz, remindHour, signIn: {discord: bool, email: bool}}}` or `{user: null}` |
| `PATCH /api/me` | `{handle?, displayName?, survevSlug?, tz?, remindHour?, plan?}` | `{user}`; handle `^[a-z0-9_]{3,20}$`, unique; `plan` is the week plan from `platform/shared/plan.js` |
| `GET /api/auth/discord/start?return=/path` | — | 302 to Discord |
| `GET /api/auth/discord/callback` | Discord's `code`, `state` | 302 back to `return` (state is HMAC-signed, carries return path) |
| `POST /api/auth/email/start` | `{email}` | sends a six-digit code through Neon Auth; `{ok, email}`; at most 5 an hour, 30 s apart |
| `POST /api/auth/email/verify` | `{code}` | `{user, merged}`; the address becomes this account's sign-in, or switches to the account that owns it |
| `POST /api/auth/logout` | — | clears cookie |
| `POST /api/runs` | `{runs: [historyEntry...]}` (max 200) | `{accepted: n}` upsert by `(user_id, client_id)` |
| `GET /api/runs?since=iso` | — | `{runs: [historyEntry...]}` for the session user |
| `GET /api/users/:handle` | — | public profile: `{user: {handle, displayName, avatarUrl, survevSlug}, streak, longestStreak, practiceDays: [day...], bests: {key: score}, achievements: [...]}` |
| `POST /api/challenges` | `{scenario, key, seed, score}` | `{id, url}` |
| `GET /api/challenges/:id` | — | `{id, scenario, key, seed, score, creator: {handle, displayName, avatarUrl}, results: [{handle, displayName, score}]}` |
| `POST /api/challenges/:id/result` | `{score}` | `{beat: bool, creatorScore, yourScore, friendshipCreated: bool}` |
| `GET /api/boards` | — | `{friends: Board, guilds: [{id, name, icon, board: Board}]}` where `Board = {streak: [{handle, displayName, avatarUrl, value, you}], benchmark: {scenarioKey: [{..., value}]}}`; a guild board appears only if 2+ users share it |
| `POST /api/push/subscribe` | `{subscription, tz, remindHour}` | `{ok}` |
| `POST /api/push/unsubscribe` | `{endpoint}` | `{ok}` |
| `GET /api/push/key` | — | `{publicKey}` (VAPID) |
| `POST /api/feedback` | `{text, context}` | `{ok}` |
| `POST /api/e` | `{anonId, events: [{name, props, ts}]}` (max 50) | `{ok}`; no session needed |
| `GET /api/cron/reminders` | header `Authorization: Bearer $CRON_SECRET` | sends due pushes |
| `GET /api/cron/digest` | header `Authorization: Bearer $CRON_SECRET` | emails yesterday's usage report to `DIGEST_TO` (`?dry=1` returns it unsent, `?day=YYYY-MM-DD` picks the day) |
| `GET /api/admin/kpis` | header `Authorization: Bearer $ADMIN_TOKEN` | funnel, D1/D7/D30 cohorts, streak distribution, challenges, recent feedback, recent errors |

Rate-limit nothing in Phase 1 beyond body-size caps; validate every input.

## Shared pure logic (`platform/shared/`, unit-tested)

- `streak.js`: `computeStreak(days: string[] /* 'YYYY-MM-DD' local days with a completed
  routine */, today: string) → {current, longest, practicedToday}`. A streak survives until the end
  of the day after the last practice day. **No freezes, no repairs.**
- `achievements.js`: `evaluate(runs) → [{id, title, desc, earnedAt}]`, pure, deterministic.
  Set: first routine; streaks 3/7/30/100; first Benchmark; Benchmark tier up (using
  `ST.benchmarkTier` thresholds, labeled provisional); personal best on any scored key; beat a
  friend's challenge (from a run flag); first ricochet hit; 10 quick-switch shots in one run.
- `headline.js`: `pickHeadline({before, after, run, challenge, survev}) → {kind, title, detail}`
  in fixed priority: streak milestone > benchmark tier up > personal best > friend overtaken >
  real-game change > run insight.
- `warmup.js`: `compareWarmVsCold(matches, routineCompletions, windowMin = 60) → {warm: {n,
  dmgPerMin}, cold: {n, dmgPerMin}, diff, enough: warm.n >= 10 && cold.n >= 10}`. A match is warm
  if a routine completed within `windowMin` before the match started (`end_time - time_alive`).

## Browser modules (`platform/*.js`)

- `api.js`: fetch wrapper with `credentials: 'include'`; `ST.api.available` resolved once from
  `/api/health` (1.5 s timeout).
- `router.js`: `pushState` routes `/`, `/play/<routine-id>`, `/results`, `/u/<handle>`,
  `/c/<id>`, `/profile`. Sets `<base href="/">` only on http(s) so file:// still works.
- `account.js`: session bootstrap, sign-in sheet (email code, plus Discord once it is configured), merge of
  local history into the server on first sign-in, `ST.account.user`.
- `sync.js`: after every `ST.history.add`, queue the entry and `POST /api/runs`; on load,
  `GET /api/runs` and merge into local history by `client_id` (history entries gain an `id`).
- `home.js`: the landing view. One primary button, **Start today's 5**, the current streak, and
  "practiced today" state; the full routine/drill picker stays one click away.
- `results-headline.js`: renders `pickHeadline` at the top of the results screen and, for an
  achievement, one share prompt (copy image + link, X intent, Reddit). Never more than one.
- `profile.js`: practice calendar, Benchmark trend per scenario, throughput over time, moving vs
  standing accuracy, achievements, and the survev panel (link username → damage per minute per
  game, warm vs cold comparison when `enough`). Charts reuse `js/charts.js`.
- `survev.js`: client-side fetch of `https://api.survev.io/api/match_history` (10 per page,
  `teamModeFilter: 7`), up to 100 matches, ≤ 20 requests/minute, cached in localStorage for 10
  minutes.
- `challenge.js`: "Challenge a friend" on Benchmark-scenario results; the `/c/<id>` landing
  (creator, score, Start); seeded run; comparison; save prompt.
- `boards.js`: friends and Discord-server boards (streak, Benchmark bests).
- `reminders.js`: opt-in prompt from day 2, permission request on click only, `sw.js`
  registration, hour picker defaulting to the median local hour of past practice.
- `feedback.js`: a small "Feedback" button on menu/results/profile; textarea; sends context
  (route, last run key, user agent).
- `analytics.js`: PostHog (EU cloud, project "Surviv Aim Trainer") and Google Analytics 4
  (`G-NE05TEV8GY`), loaded only on the production host, never for automated browsers or
  `st.noTrack`. Every `events.js` event is mirrored to both; identity is our user id, never an email.
  GA starts with storage denied in the EEA, UK and Switzerland (Consent Mode); PostHog keeps no cookie.
- `events.js`: batched analytics to `/api/e`; `window.onerror` and `unhandledrejection` become
  `error` events.

Events: `landing`, `routine_start`, `routine_complete`, `signup` `{method}`, `streak_extended`,
`reminder_opt_in`, `challenge_created`, `challenge_opened`, `challenge_completed`,
`survev_linked`, `share_clicked` `{target}`, `feedback_sent`, `error`.

## Game hooks (`js/`)

- `ST.seededRandom(seed)` swaps `Math.random` for a mulberry32 stream until `restore()`;
  challenge runs use it so both players get the same spawns.
- History entries gain `id` (uuid), `routineCompleted` (routine records only, false if ended
  early), `accMoving`, `accStill`, `dmgTakenPerMin`, `quickSwitchShots`, `ricochetHits`,
  `scenario`, and `challengeId` when applicable.

## Rules

- No ads, no ad code, no ad placeholders.
- No streak freezes or repairs.
- Visual language follows `DESIGN.md`. One accent (tracer yellow), dark range-card panels.
- Everything must keep working as a guest with the API down.
- Secrets live only in Vercel env vars: `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_TOKEN`,
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`, `DATABASE_URL`, `APP_ORIGIN`, and for the daily report `RESEND_API_KEY` and
  `DIGEST_TO` (optional `DIGEST_FROM`, `DIGEST_TZ`, default America/New_York).
