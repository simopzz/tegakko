---
name: Kana Practice
description: Personal kana (hiragana/katakana) recall-drill app for tablet + stylus (tegakko v1). Warm washi-paper surface, brush-ink glyph rendering, one terracotta accent.
status: final
updated: 2026-09-02
colors:
  page-bg: '#E6D9C1'
  surface-card: '#F5EAD8'
  surface-card-secondary: '#EBDDC5'
  surface-canvas: '#F9F4ED'
  ink: '#201E1D'
  ink-muted: 'rgba(32,30,29,0.55)'
  ink-faint: 'rgba(32,30,29,0.16)'
  ink-hairline: 'rgba(32,30,29,0.1)'
  accent: '#C67139'
  accent-strong: '#8C491A'
  accent-deep: '#B2622D'
  accent-on-peach: '#643312'
  positive-bg: '#E1EECC'
  positive-fg: '#3D472B'
  positive-accent: '#56633F'
  missed-bg: '#FFE1D0'
  missed-fg: '#643312'
  grid-guide: '#CCDBB2'
typography:
  display:
    fontFamily: 'Noto Serif JP'
    fontWeight: '600'
    note: 'Reserved for the single largest number or word on a screen — e.g. the session accuracy percentage. At most one per surface.'
  heading:
    fontFamily: 'Noto Serif JP'
    fontWeight: '600'
    letterSpacing: '-0.02em'
    note: 'Screen titles, section titles, all interactive button labels, all numeric readouts (counts, percentages, timers)'
  glyph-ink:
    fontFamily: 'Yuji Syuku'
    tilt: '-1.2deg'
    note: 'Brush-style Japanese font. Used ONLY to render an actual kana grapheme as inked handwriting (the reference glyph and the "yours" comparison view) — never for UI chrome, never for romaji. A slight consistent tilt keeps it reading as brushed rather than typeset.'
  body:
    fontFamily: 'Figtree'
    fontWeight: '400'
    note: 'Sentences, captions, secondary copy'
  label:
    fontFamily: 'Figtree'
    fontWeight: '700'
    letterSpacing: '0.1em'
    note: 'Uppercase micro-labels above grouped controls, e.g. "SCRIPT", "WRITE FROM MEMORY", "YOURS" / "REFERENCE"'
rounded:
  sm: 10px
  md: 12px
  lg: 14px
  xl: 18px
  squircle: 34px
  full: 9999px
spacing:
  '1': 8px
  '2': 12px
  '3': 18px
  '4': 24px
  '5': 32px
  '6': 40px
  '7': 56px
  '8': 72px
components:
  card-surface:
    background: '{colors.surface-card}'
    radius: '{rounded.xl}'
    shadow: 'card, see Elevation & Depth'
  genkouyoushi-cell:
    background: '{colors.surface-canvas}'
    border: '1px solid {colors.grid-guide}'
    radius: '{rounded.lg}'
    guide: 'dashed cross-guide in {colors.grid-guide}; center dot in {colors.positive-bg} on the empty state only'
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.surface-card}'
    radius: '{rounded.md}'
    minHeight: '88px'
  button-neutral:
    background: 'transparent'
    border: '1px solid {colors.ink-faint}'
    foreground: '{colors.ink}'
    radius: '{rounded.md}'
    minHeight: '88px'
  button-dimmed:
    note: 'button-primary or button-neutral at 45% opacity, pointer-events disabled — the not-yet-available state, never a distinct color'
  chip-tag:
    radius: '{rounded.sm}'
    variants: 'positive: {colors.positive-bg} bg / {colors.positive-fg} text · missed: {colors.missed-bg} bg / {colors.missed-fg} text · neutral: rgba(32,30,29,0.07) bg / {colors.ink} text'
  pill-toggle-group:
    background: '{colors.surface-card-secondary}'
    radius: '{rounded.sm}'
    activeSegment: '{colors.accent} fill, {colors.surface-card} text, {rounded.md} inset radius'
  stat-tile:
    background: '{colors.surface-card-secondary}'
    radius: '{rounded.lg}'
  progress-bar:
    track: '{colors.ink-hairline}'
    fill: '{colors.accent}'
    radius: '{rounded.full}'
    height: '6px'
  history-bar:
    radius: '{rounded.full}'
    scale: 'five-step accuracy ramp from {colors.grid-guide} (lowest) through positive-accent tones to {colors.accent} reserved for the single most recent bar'
  history-row:
    padding: '{spacing.4} {spacing.1}'
    divider: '1px solid {colors.ink-faint}, omitted on the last row'
    accuracyColor: '{colors.accent-deep}, dims to {colors.ink-muted} on idle-closed rows'
  toast-banner:
    background: '{colors.missed-bg}'
    foreground: '{colors.accent-on-peach}'
    radius: '{rounded.xl}'
    shadow: 'card, see Elevation & Depth'
    action:
      foreground: '{colors.accent-strong}'
      note: 'the single required action (Undo, or the import-replace confirm) — text-only, no fill, no border'
---

## Brand & Style

Kana Practice is a morning ritual, not an engagement product. It opens the same way a notebook opens: a blank cell, a prompt, and nothing standing between the two. The visual language borrows from washi paper and brush ink rather than screens — warm, slightly textured neutrals; a single accent that behaves like a wax seal, not a UI color system; kana rendered in a brush-style face so the "correct answer" reads as handwriting, not as a UI label.

The posture is quiet confidence, not encouragement. Nothing celebrates a correct answer and nothing scolds a missed one beyond a plain count — nothing gamifies. Every visual decision should ask "would this belong on a well-made piece of stationery," not "would this belong in a habit-tracking app."

## Colors

The palette has exactly one chromatic accent; everything else is warm neutral paper tones plus two quiet semantic tints.

- **Page (`{colors.page-bg}`, `#E6D9C1`)** is the outermost warm tan ground the app sits on — never a surface itself, only the space around cards.
- **Card surface (`{colors.surface-card}`, `#F5EAD8`)** is the paper every screen is written on — cream, slightly lighter than the page behind it. **Secondary surface (`{colors.surface-card-secondary}`, `#EBDDC5`)** sits one shade warmer/darker, used for grouped controls and stat tiles nested inside a card.
- **Canvas (`{colors.surface-canvas}`, `#F9F4ED`)** is reserved for the one place ink actually gets laid down: the genkouyoushi cell. It is the lightest surface in the palette on purpose — the writing area should read as the cleanest page.
- **Ink (`{colors.ink}`, `#201E1D`)** is primary text and the drawn stroke color. Never pure black — warmer, closer to sumi ink than to print.
- **Accent (`{colors.accent}`, `#C67139`, terracotta)** is the only color that means "primary action" or "this is the thing happening right now" — the Correct grade button, the progress fill, the primary CTA, the most recent history bar. It does not appear as decoration.
- **Accent-strong (`{colors.accent-strong}`, `#8C491A`)** is the secondary-text-link color: header nav links (Back, History, Settings) and the Undo action inside a toast banner. It marks "you can tap this, but it isn't the primary action" — one step down from `{colors.accent}`.
- **Accent-deep (`{colors.accent-deep}`, `#B2622D`)** is reserved for one specific readout: an accuracy value rendered in `{typography.display}` or `{typography.heading}` — the Session summary hero percentage and a History row's accuracy figure (except on idle-closed rows, which dim to `{colors.ink-muted}` instead per the History row state rules).
- **Positive tint (`{colors.positive-bg}` / `{colors.positive-fg}`, sage `#E1EECC` / `#3D472B`)** marks a contextual, non-urgent good state: script/set tags, the pen-check "stylus found" chip, the "whole scope" history tag. It is not the Correct button's color — that's `{colors.accent}`.
- **Missed tint (`{colors.missed-bg}` / `{colors.missed-fg}`, peach `#FFE1D0` / `{colors.accent-on-peach}` `#643312`)** marks a miss-tally chip, the reference-glyph panel on the Reveal screen, and the post-grade toast. It reads as "attention," not as an error state — this app never flags a wrong stroke red, as if it were a failure.
- **Grid guide (`{colors.grid-guide}`, `#CCDBB2`)** is the dashed cross-guide and border inside the genkouyoushi cell, and doubles as the low end of the history accuracy ramp.

Avoid: a second chromatic accent, red/error fills anywhere (a missed grade is not an error), gradients, and using `{colors.accent}` for anything that isn't the single primary action on its screen.

**Contrast:** every load-bearing text/background pairing meets WCAG AA (4.5:1 for body/label text, 3:1 for `{typography.display}`/`{typography.heading}` at large size) — verified for `{colors.ink}` on `{colors.page-bg}`/`{colors.surface-card}`/`{colors.surface-card-secondary}`, `{colors.missed-fg}` on `{colors.missed-bg}`, `{colors.positive-fg}` on `{colors.positive-bg}`, `{colors.accent-on-peach}` on `{colors.missed-bg}`, and `{colors.surface-card}` text on `{colors.accent}`/`{colors.accent-strong}` buttons.

## Typography

Three families, each with one job. **`{typography.heading}`** (Noto Serif JP, 600) carries every screen title, button label, and numeric readout — it is the app's structural voice and appears far more often than `{typography.display}`. **`{typography.display}`** is the same face reserved for the one largest number on a screen (the session accuracy hero). **`{typography.glyph-ink}`** (Yuji Syuku) is never UI text — it renders only an actual kana grapheme as if brushed onto the page, at large sizes (190–430px) in the drill cell and reveal comparison, and at chip scale for a missed-character glyph. **`{typography.body}`** and **`{typography.label}`** (both Figtree) carry sentences and uppercase micro-labels respectively.

Romaji prompts and script-name labels are set in `{typography.heading}`/`{typography.body}`, never in `{typography.glyph-ink}` — that face is reserved for the kana character itself, so its appearance always signals "this is a real, comparable grapheme." The prompt is romaji plus script name only — no mnemonic or example-word copy (standing exclusion, see brief and PRD §5.2).

## Layout & Spacing

Scale: `{spacing.1}`–`{spacing.8}` (8 → 72px). Small gaps (`{spacing.1}`–`{spacing.2}`) sit between tightly related elements inside one control (a chip's icon and count). Mid gaps (`{spacing.3}`–`{spacing.4}`) separate stacked elements inside a card. Large gaps (`{spacing.6}`–`{spacing.8}`) separate a card's outer padding from the page and separate major sections on a screen.

Single-surface portrait target, ~800×1280 logical px (Android tablet + stylus, held portrait). No responsive breakpoints — this is one app on one known device class, not a multi-viewport product.

## Elevation & Depth

Two elevation levels only. The page ground carries no shadow. Every card surface (`card-surface`, `toast-banner`) casts one soft, warm-tinted shadow — diffuse, low-contrast, closer to paper lifted slightly off a desk than to Material elevation (`0 12px 32px` at low opacity, ink-tinted rather than neutral gray). Nothing else casts a shadow: buttons, chips, and stat tiles sit flush on their parent surface and are distinguished by fill color alone, never by their own shadow.

## Shapes

Generous, consistent rounding reads as stationery rather than software: `{rounded.sm}`–`{rounded.md}` (10–12px) for chips, buttons, and small controls; `{rounded.lg}` (14px) for the genkouyoushi cell and stat tiles; `{rounded.xl}` (18px) for full card surfaces and the toast banner. `{rounded.full}` appears only on progress bars, history bars, and pill-toggle tracks — never on a rectangular button or card. The app icon is the one exception, a squircle at `{rounded.squircle}` (34px) sized well past standard button radii, distinguishing it as a mark rather than a control.

## Components

- **Card surface** — `{components.card-surface}`. The base container for every screen. One per screen at the outermost level; nested grouped controls use `{colors.surface-card-secondary}` instead of stacking a second shadowed card.
- **Genkouyoushi cell** — `{components.genkouyoushi-cell}`. The pen canvas. Dashed cross-guide always visible; center dot only on the empty (no-ink) state, removed once a stroke exists.
- **Grade buttons** — `{components.button-primary}` (Correct), `{components.button-neutral}` (Reveal / Missed), `{components.button-dimmed}` (any of the three, when not yet actionable). Always presented as a row of equal-width buttons directly under the canvas; Correct is the only one ever filled with `{colors.accent}`.
- **Pill toggle group** — `{components.pill-toggle-group}`. Segmented control for mutually exclusive choices (script, set, idle-timeout duration, ink-width preset in Settings). Segments are equal-width; exactly one is ever active.
- **Chip tag** — `{components.chip-tag}`. Small inline label. Positive variant for script/set/status tags; missed variant for per-character miss counts. Card position ("12 / 46") is plain `{typography.heading}` text, not a chip.
- **Stat tile** — `{components.stat-tile}`. Paired label (uppercase `{typography.label}`) over value (`{typography.heading}`), used in the session-summary time/reveal-count row.
- **Progress bar** — `{components.progress-bar}`. Thin, always paired with a fractional counter (e.g. "12 / 46") to its right — the bar is reinforcement, never the only signal of position.
- **History bar** — `{components.history-bar}`. Vertical bar in the accuracy sparkline; height maps to that session's accuracy, color maps to its position in the accuracy ramp, except the newest bar, which is always `{colors.accent}` regardless of its height.
- **History row** — `{components.history-row}`. One list entry in History; divided from the next by a hairline, omitted on the last row. Accuracy value uses `{colors.accent-deep}`, dimming to `{colors.ink-muted}` on idle-closed rows only.
- **Toast banner** — `{components.toast-banner}`. Floats above the bottom action row (post-grade "Marked missed," import-replace warning). Always paired with a single clear action (Undo, confirm) in `{colors.accent-strong}` text — never purely informational without a next step.

## Do's and Don'ts

Quick-reference recap of rules stated above, for a pre-build scan.

| Do | Don't |
|---|---|
| One accent (`{colors.accent}`) for the single primary action on screen | Use the accent for decoration, chrome, or more than one control per screen |
| Render kana glyphs in `{typography.glyph-ink}` at generous size | Set romaji, labels, or body copy in the brush face |
| Warm, ink-tinted shadows on card surfaces only | Shadow buttons, chips, or stat tiles |
| Treat a missed grade with the same visual calm as a correct one (peach tint, not red) | Use red, error iconography, or any "failure" visual language |
| Pair every progress/position signal with a plain-text count | Rely on a bar or ring alone to communicate position |
| `{rounded.full}` on bars and toggle tracks only | Pill-shape a button or card |
