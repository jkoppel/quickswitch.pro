# First run, the week plan, points and the advanced gate

Design spec for the 2026-11-10 redesign. The look stays (DESIGN.md: the range card over survev's
field, survev orange for one action, tracer yellow for data). What changes is how much is on screen
and in what order. The critique behind it is `.impeccable/critique/2026-11-10T18-10-02Z__index-html.md`.

## Principles

1. **One decision per screen for a first-timer.** Every screen in the first-run path has one
   primary action and at most one quiet alternative ("Skip to all drills" / "Not now").
2. **Value before signup.** Nobody is asked for an account before they have a score and a plan.
   Signing in is offered when there is something to keep (the plan, a streak).
3. **Staged disclosure.** Aim test, then the diagnostic, then the plan, then the full trainer.
   Each stage is skippable; nothing is hidden behind the stages except the advanced settings.
4. **Points inform, they don't bribe.** Every award says what earned it (practice, a new best,
   sharper accuracy, a plan day). No points for sharing, signing in, or opening the app.
5. **Honest numbers.** Tiers stay labelled provisional. No percentiles, no "top X%", no claims
   about improvement that the data doesn't show.

## Stages (derived, never stored as truth)

The stage comes from history plus `st.plan`, so clearing either resets cleanly:

| Stage | Condition | Home shows |
| --- | --- | --- |
| `new` | no scored run, not skipped | the aim-test invitation |
| `tested` | an aim test (`staticClick` benchmark key) but no plan | your score + the diagnostic invitation |
| `planned` | `st.plan` exists and the week isn't over | today's plan session |
| `free` | skipped (`st.skipOnboarding`), or the week is over with no new plan, or history without a test (returning pre-redesign players) | the cleaned-up classic home |

A returning player with history from before the redesign lands in `free`, never in `new`.

## Screens

### 1. First visit (`new`)
- Wordmark, then a short intro in place of the tagline: an aim trainer for survev.io, built on
  its guns, bullets and spread, training cursor aim on a top-down field.
- What you'll train: the four skills the diagnostic measures (Clicking, Tracking, Switching,
  Moving), one line each, plus a line for the utility drills.
- How it starts: the three stages as a ruler (aim test 30 s, weak spots 3 min, your week 5 min a
  day), the first marked in orange because the button starts it.
- **One button: "Take the 30-second aim test"**, with "Free, no sign-up. Needs a mouse and
  keyboard." under it.
- One quiet line under that: `Skip to all drills` · `Sign in` (for players arriving on a second
  device). No streak widget, no zero, no feedback link, no progress link.
- Fits a 1280×720 window without scrolling.
- **Phones and touch-only devices:** instead of the button, "This trainer needs a mouse and
  keyboard." with "Remind me on my computer" hidden unless push is supported, and a quiet
  "Try anyway".

### 2. Briefing (before the first ever drill only)
- One card over the field, three lines: Mouse to aim, click to shoot · "Three targets at a time.
  Hit as many as you can in 30 seconds. Misses cost you." · Esc pauses.
- Button: "Start" (Enter works). The countdown follows.

### 3. Aim test result ("a nice message")
Replaces the dense results screen for this run only (details stay one click away).
- Big score number (tracer yellow, Headline style) with "aim score" label.
- One warm, specific sentence built from the run: e.g. "34 hits at 97% accuracy. That's Silver on
  our provisional scale." Pick wording by tier; never claim percentiles.
- One coaching line: the run's top insight if there is one, else the scenario tip.
- Primary: **"Find your weak spots · 5 tests, 3 minutes"** → the diagnostic.
- Quiet: `Not now` → home in `tested` stage. `See details` → the classic results tables.

### 4. Diagnostic (routine `diagnostic`)
- Five fixed-difficulty 30 s scenarios, one per skill not yet measured, 8 s rests:
  `dynamicClick` (Clicking), `reactiveTrack` (Tracking), `speedSwitch` (Switching), `chase`
  (Moving), `dodge` (Moving under fire). No warm-up step: the aim test already warmed them up.
  Seeded per step so results are comparable on the re-test.
- Rest screens show "Test 2 of 5" and the next test's one-line tip.
- Finishing it counts as finishing a routine (streak day 1).

### 5. Your profile and week (diagnostic result)
- **Skill bars:** Clicking, Tracking, Switching, Moving, each as a horizontal bar of
  `score / ref` (the provisional tier scale), labelled with the tier name. One series colour
  (tracer yellow). Strongest and weakest called out in words ("Strongest: Clicking. Work on:
  Moving.").
- **The week:** seven compact rows or a 7-cell strip: Day 1 Diagnostic (done), Days 2-6 routines
  from `ST.plan.buildPlan`, Day 7 Re-test. Each with its `why`.
- **Reminder setup (primary action):** "Remind me each day at [hour select, default 18:00 or the
  current hour if later in the day] → **Set my daily reminder**". On success: "Reminder set for
  6 pm." If push is unsupported or denied, say so in one line and offer nothing else.
- Quiet: `Not now` (plan still saved) · and, when the API is up and the player isn't a member:
  "Save your plan to an account" → sign-in sheet.
- Stores the plan in `localStorage['st.plan']` and, when the API is up, `PATCH /api/me {plan}`.
  Server copy wins on a new device (if local has none).

### 6. Home for a planned player (`planned`)
- Header line: streak (only if > 0) · points this week.
- **One card: "Day 3 of 7 · Tracking focus · 5 min"** with its `why` and the primary
  **"Start"**. When today's day is done: "Day 3 done." + the next day's name, primary becomes a
  quiet "Train more" (secondary style).
- The week strip (7 cells, done/today/upcoming) under the card.
- Quiet row: `All drills` · `Progress` · account (Sign in / name).
- Day 7 done → "Your week: Clicking +12%, Tracking +4% …" (re-test vs diagnostic, per skill) and
  "Plan next week" (new plan from the re-test).

### 7. Classic home (`free`)
Today's cleaned-up home: streak only if > 0, points, "Start today's 5", quiet row
(All drills · Progress · account · Feedback). The "Run your first Benchmark" link becomes
"Get your plan · 3-minute diagnostic" when there is no plan.

## Points

`platform/shared/points.js` (pure, unit-tested) decides every award; the browser only displays.
- Practice 10/min (cap 45 min/day), plan day +50, best score 2 per % (cap 100), accuracy 2 per
  point when the hit rate holds (cap 50). First run on a drill is a baseline.
- **Results screen:** a single line under the headline: "+60 points · 30 practice · 30 new best".
- **Home:** "1,240 points · 310 this week".
- **Progress:** a points-per-day bar strip for the last 14 days, plus the all-time total.
- Accuracy note for the owner: points follow score and accuracy-at-speed, not raw accuracy,
  because raw accuracy rewards slowing down, which the throughput score exists to discourage.

## Advanced settings gate

- **Locked until the account has a verified email** (`user.emailVerified`): weapon, secondary,
  throwable, scope, duration and barrels fields; the scenario settings disclosure; the Custom
  drill. Every preset drill and routine stays playable by everyone.
- Locked UI: the drill shows its preset as read-only text ("MP5 · 2x · 60 s"), and one line:
  "Custom weapons and settings unlock with a verified email. **Verify email**" → email sheet.
- **No backend (file://, static server, API down): nothing is locked**, since there are no
  accounts to verify. Self-hosters and forks get the whole trainer.
- Email sheet: address → "Send code" → six-digit code field (one input, `inputmode=numeric`,
  `autocomplete=one-time-code`) → "Verify". Errors from the API shown verbatim in the sheet.
  Also listed in the sign-in sheet as **"Continue with email"** (it is a full sign-in method:
  verifying an address that belongs to an account switches to it).
- API: `POST /api/auth/email/start {email}` → `{ok, email}`; `POST /api/auth/email/verify
  {code}` → `{user, merged}`. `/api/health` reports `signIn.email`. `/api/me` has `email`,
  `emailVerified`, `pendingEmail`, `plan`.

## Fixes from the critique (all in scope)

- `isWarmup()` threshold 0.65 → 0.5 minutes so the second step of a routine isn't warm-up; the
  aim test, diagnostic and re-test steps are never flagged warm-up (they are tests).
- Day-1 results: "6 baselines set" instead of "0 new bests"; no "your weakest step" label with
  nothing behind it; no Challenge link on unscored rows; the share prompt's tier matches the pill.
- The first finished routine shows the save prompt, not a share of "First routine".
- "Done" returns to where the run started (picker or home).
- Picker: routines first, then drills grouped Clicking / Tracking / Moving / Utility; advanced
  gate as above. Remember the selected drill.
- Results action buttons stay visible at 1280×720 (sticky footer inside the panel).
- Briefing card before a player's first drill; controls listed.
- Blurry picker chart: size canvases when shown, not while hidden.
- Precise tracking tip: drop "Invincible bot" (bots have 500 HP).
- Button fills: `#c84f00` (white text 4.6:1), hover `#b84900`; survev `#d45500` stays for the
  wordmark dot and selection edges. 11 px text → 12 px minimum.
- Results at the end of a routine lead with the points line and the headline; tables collapse
  behind "All measurements" for routine summaries.
- A new routine `switching` (Switching focus): warm-up, then `speedSwitch` and `evasiveSwitch`
  adaptive at 50 s, plus one of each with a different weapon (e.g. `mp5` 1x, `ak47`).
- A `retest` routine: `staticClick` plus the five diagnostic scenarios, seeded like the diagnostic.

## Events

Add `onboarding_step` `{step: 'aim_test_start'|'aim_test_done'|'diagnostic_start'|'diagnostic_done'|'plan_created'|'reminder_set'|'skipped'}`,
`points_awarded` `{total}` (per results screen), `email_verified`, `advanced_locked_click`.
