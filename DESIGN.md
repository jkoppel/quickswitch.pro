---
name: Surviv Aim Trainer
description: A dark range-card interface laid over surviv's grass field, with one yellow tracer accent.
colors:
  field-grass: "#507a32"
  field-edge: "#3f6128"
  night-floor: "#1a1f16"
  panel-moss: "#23291f"
  chart-well: "#1c2118"
  input-well: "#161b13"
  list-moss: "#2e3629"
  list-moss-hover: "#38422f"
  moss-line: "#3c4634"
  tracer-yellow: "#ffd35c"
  tracer-yellow-hover: "#ffe08a"
  sage-label: "#9fb48c"
  sage-tip: "#b7d3a0"
  ink: "#eeeeee"
  ink-bright: "#e8e8e8"
  skin-tan: "#f8c574"
  hit-green: "#61d15b"
  hit-green-text: "#9cff9c"
  warn-orange: "#ffb080"
  danger-red: "#ff5b5b"
  blood: "#b8181b"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "30px"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "3px"
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "56px"
    fontWeight: 900
    lineHeight: 1
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "2px"
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.5px"
  hud:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "1px"
rounded:
  xs: "4px"
  sm: "5px"
  md: "6px"
  lg: "10px"
  pill: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  panel: "26px 30px"
components:
  button-primary:
    backgroundColor: "{colors.tracer-yellow}"
    textColor: "{colors.night-floor}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.tracer-yellow-hover}"
    textColor: "{colors.night-floor}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "{colors.list-moss}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.list-moss-hover}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  list-item:
    backgroundColor: "{colors.list-moss}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  list-item-active:
    backgroundColor: "{colors.tracer-yellow}"
    textColor: "{colors.night-floor}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  input:
    backgroundColor: "{colors.input-well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  panel:
    backgroundColor: "{colors.panel-moss}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.panel}"
  insight-card:
    backgroundColor: "{colors.chart-well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "10px 12px"
  tier-badge:
    backgroundColor: "{colors.moss-line}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "1px 7px"
---

# Design System: Surviv Aim Trainer

## Overview

**Creative North Star: "The Range Card"**

A range card is the small dark notebook a marksman keeps beside the rifle: distances,
holds, wind, what worked. This interface is that card laid on top of surviv's grass.
The game field is the only bright, saturated thing on screen. Everything the player
reads before and after a run sits on dark mossy panels that take their greens from the
field itself, one step darker, so the chrome reads as belonging to the world rather than
floating over it. The single accent is the yellow of a 9mm tracer, spent sparingly:
one primary action, one active selection, one line on a chart.

Density is Operate density. Menus are lists and forms; results are tables with a few
cards. Nothing decorative competes with the numbers, and the copy does the
personality work: drill tips are written like a coach who plays the game. During a run
the interface almost disappears: a survev-shaped HUD (health bar, weapon, magazine,
timer) and nothing else.

Confirmed anti-references: no leaderboards, no rank celebration, no marketing gloss
over provisional numbers. Honesty markers (warm-up, provisional thresholds) are part
of the visual system, not fine print.

**Key Characteristics:**
- Field-derived greens for every surface; the grass is the brightest green on screen.
- One yellow accent, used as a tracer: rare, directional, meaning "go" or "this one".
- System font throughout, heavy weights for numbers and titles, uppercase sage labels.
- Dark tonal layering instead of shadows, except the one deep shadow under a floating panel.
- HUD copies survev's layout so a player's eyes need no retraining.

## Colors

A dark moss palette pulled from the grass field, one tracer-yellow accent, and a small
set of reserved status colors that mirror in-game meanings.

### Primary
- **Tracer Yellow** (`{colors.tracer-yellow}`): the primary button, the active list item,
  the trend line, the rose wedges, the countdown numeral, the reload bar, new-best
  marks. Hover lightens to `{colors.tracer-yellow-hover}`.

### Neutral
- **Night Floor** (`{colors.night-floor}`): the page background behind the field and the
  ink color on yellow surfaces.
- **Panel Moss** (`{colors.panel-moss}`): every floating panel (menu, pause, rest,
  results).
- **Chart Well** (`{colors.chart-well}`) and **Input Well** (`{colors.input-well}`): sunken
  surfaces one and two steps darker than the panel, for charts, insight cards and fields.
- **List Moss** (`{colors.list-moss}`) rising to **List Moss Hover**
  (`{colors.list-moss-hover}`): list items and secondary buttons.
- **Moss Line** (`{colors.moss-line}`): every border and divider.
- **Sage Label** (`{colors.sage-label}`) and **Sage Tip** (`{colors.sage-tip}`): section
  labels, form labels, chart axes and coaching tips. Never body text.
- **Ink** (`{colors.ink}`): body text and values.

### Status (reserved)
- **Hit Green** (`{colors.hit-green}`, text form `{colors.hit-green-text}`): healthy,
  improvement, an insight that says you did the expert thing.
- **Warn Orange** (`{colors.warn-orange}`): regressions, escaped targets, the session
  budget once past 45 minutes.
- **Danger Red** (`{colors.danger-red}`): empty magazine, low health, deaths.
- **Blood** (`{colors.blood}`): in-field hit particles only.

### Field (canvas only)
- **Field Grass** (`{colors.field-grass}`) inside the arena, **Field Edge**
  (`{colors.field-edge}`) outside it, **Skin Tan** (`{colors.skin-tan}`) for every
  player body. Ammo tracer colors are defined per ammo type in `js/weapons.js`.

### Named Rules
**The One Tracer Rule.** Yellow appears on at most one action and one selection per
screen, plus data marks. If two buttons are yellow, one of them is wrong.

**The Field Is Brighter Rule.** No panel surface may be lighter or more saturated than
the grass. The chrome recedes; the field is the subject.

**The Reserved Status Rule.** Green, orange and red mean good, caution and danger
everywhere, and always travel with a word, a sign or a number. They are never used as
series colors.

## Typography

**Display Font:** system-ui (with -apple-system, Segoe UI, Roboto, sans-serif)
**Body Font:** same stack

**Character:** Utilitarian and heavy where it counts. Titles are black-weight uppercase
with wide tracking, like a stencil on a crate; numbers are bold and tabular; labels are
small uppercase sage. There is no second family, and none is wanted: the game itself
uses a plain sans, and the trainer should feel like part of the same toolkit.

### Hierarchy
- **Display** (900, 30px, letter-spacing 3px, uppercase, yellow): screen titles only
  (`SURVIV AIM TRAINER`, `RESULTS`, `PAUSED`, `REST`).
- **Headline number** (900, 56px, yellow): a single hero figure such as the rest
  countdown. Reserved for one number per screen.
- **HUD number** (800, 28 to 30px, white with `0 1px 3px rgba(0,0,0,.8)` text shadow):
  the timer and magazine count over the field.
- **Title** (600, 15px, uppercase, letter-spacing 2px, sage): section headers such as
  `DRILL`, `INSIGHTS`.
- **Body** (400, 14 to 15px, ink, line-height 1.45): descriptions, table labels, insight
  text. Keep insight cards under ~60 characters per line.
- **Label** (400, 12px, uppercase, letter-spacing 0.5px, sage): form labels, chart
  headers. Checkbox labels are the exception: 14px, sentence case, ink.
- **Caption** (400, 11 to 12px, ink at 50 to 60% opacity): legends, footers, HUD hints.

### Named Rules
**The Heavy Numbers Rule.** Any number the player is meant to compare is at least
weight 700 and uses tabular figures. Prose stays regular weight.

## Layout

Screens are full-viewport overlays centered on a dark floor; the game canvas sits
beneath everything. A panel is `min(980px, 100%)` wide for the menu and results and
`min(520px, 100%)` for pause and rest, with `26px 30px` internal padding and 20px of
screen padding around it. Panels must scroll inside the viewport when taller than it;
they are never allowed to clip at the top.

The menu and results use a two-column split: a fixed 230px left column for lists (menu)
or a fixed 260px right column for insights (results), and a fluid main column. Below
760px both collapse to a single column, the form grid drops from two columns to one,
and fixed column widths reset.

Spacing rhythm is a 4px base: 4, 6, 8, 12, 16, 24. Lists use 6px gaps, form grids
8px row and 16px column gaps, button rows 10px, and 14 to 18px between blocks. The HUD
pins the timer and step label to the top center, the health bar and magazine to the
bottom center, and hints to the bottom corners at 8 to 12px insets.

## Elevation & Depth

Depth is tonal. Surfaces step darker as they sink: panel, then chart or card well, then
input well, each separated by a 1px Moss Line border. The one true shadow belongs to
floating panels: `0 10px 40px rgba(0,0,0,.5)`, reinforcing that the panel hovers above
the field. Over the field, text uses a `0 1px 3px rgba(0,0,0,.8)` text shadow instead
of a box, and HUD boxes use `rgba(0,0,0,.55)` fills.

### Named Rules
**The Sink, Don't Lift Rule.** Nested content goes darker, never lighter, and never
gains a shadow. Only whole panels cast one.

## Shapes

Softly rounded rectangles: 10px on panels, 6px on buttons, list items and HUD boxes,
5px on inputs, 4px on cards and bars, and a 10px pill for tier badges. Borders are
1px Moss Line everywhere. Insight cards carry a 3px left rule in the accent (yellow) or
status color (green); it is the only asymmetric edge in the system. In the field,
everything is circles: bodies, hands, rocks, hit particles, the lead marker ring.

## Components

### Buttons
- **Shape:** 6px radius, 10px 20px padding, weight 700, no border.
- **Primary:** Tracer Yellow on Night Floor ink; hover to Tracer Yellow Hover. One per
  screen, always the right-most in a row.
- **Secondary:** List Moss with a Moss Line border, ink text; hover to List Moss Hover.
  Used for `Menu`, `End`, `Reset defaults`.
- **Small:** 6px 12px padding, 13px text (the Fullscreen toggle).
- **Focus:** visible ring required on every button and field; the ring should be the
  accent on dark surfaces and ink on yellow surfaces.

### List items (routines and drills)
- Full-width left-aligned buttons, 15px/600 title with a 12px sub-line at 75% opacity.
- Rest: List Moss with Moss Line border. Hover: List Moss Hover. Active: Tracer Yellow
  with Night Floor text; the sub-line stays legible at 85%.

### Inputs and selects
- Input Well background, 1px Moss Line border, 5px radius, 6px 8px padding, 14px ink
  text. Labels sit above as 12px uppercase sage. Checkboxes are 16px with the accent as
  their `accent-color`, in a horizontal label row.

### Panels
- Panel Moss, 1px Moss Line border, 10px radius, `26px 30px` padding, deep floating
  shadow. Titles in Display yellow with a one-line sub in ink at 80%.

### Insight cards
- Chart Well fill, 4px radius, 10px 12px padding, 14px text at 1.45 line height, 3px
  left rule in Tracer Yellow. Variants: `ok` (Hit Green rule), `muted` (Moss Line rule,
  60% ink) for framing lines.

### Tier badges
- Pill, 11px/700 uppercase, 1px 7px padding. Each tier has its own fill and carries its
  name as text; the fill is never the only signal.

### Charts
- Canvas, Chart Well background with a Moss Line border and 6px radius. One series in
  Tracer Yellow: 2px line, 8px markers (hollow for warm-up runs), dashed 18%-white day
  boundaries, 8%-white grid, 11px sage axis text. Direction rose: eight wedges in a
  single-hue yellow ramp, 2px gaps, direction letters outside, values inside. Tooltips
  are a fixed dark card (`#0f130d`, Moss Line border, 12px text) with the value in
  yellow.

### HUD (signature)
- Copies survev: 28px timer top center, 15px kills and accuracy line beneath, step
  label at 13px; 300px white health bar with the numeric HP overlaid and the fill
  turning yellow under 50 and red under 25; weapon name in 13px uppercase over a
  30px/800 magazine count in an `rgba(0,0,0,.55)` 6px box, red when empty; a 5px
  yellow reload bar beneath. All text has the field text shadow. Kill feed lines are
  15px/600 in status colors at top left and fade over 2.5 s.

## Do's and Don'ts

### Do:
- **Do** derive every new surface color from the field greens; step darker to nest.
- **Do** keep one yellow action per screen and put it right-most in the button row.
- **Do** write drill copy as a coach who plays: concrete units, real weapon names,
  numbers in the game's own terms (units, u/s, degrees of spread).
- **Do** mark honesty states visibly: `warm-up`, `provisional thresholds`, hollow
  markers.
- **Do** pair every status color with text, a sign or a number.
- **Do** give every chart a text or table alternative and a keyboard path.

### Don't:
- **Don't** add a second accent hue or use tier colors as a general palette.
- **Don't** show mid-run statistics the real game does not show; the HUD stays
  survev-shaped.
- **Don't** let a panel clip at the top of the viewport; scroll it instead.
- **Don't** add shadows to nested elements or lighten nested surfaces.
- **Don't** introduce webfonts or a display face; the system sans is the identity.
- **Don't** celebrate ranks with animation, confetti or badges beyond the tier pill.
