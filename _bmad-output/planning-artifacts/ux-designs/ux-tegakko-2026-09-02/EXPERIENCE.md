---
name: Kana Practice
status: final
sources:
  - {planning_artifacts}/prds/prd-tegakko-2026-09-02/prd.md
  - {planning_artifacts}/briefs/brief-tegakko-2026-09-01/brief.md
  - {planning_artifacts}/briefs/brief-tegakko-2026-09-01/addendum.md
updated: 2026-09-02
---

# Kana Practice — Experience Spine

> Single-surface Chromium PWA, one user, one known device. Paired with `DESIGN.md`. Glossary terms (grapheme, script, kana, yoon, card, scope, prompt, attempt, session, self-grade, reveal, miss tally, genkouyoushi grid) are used verbatim from the PRD throughout.

## Foundation

Single-surface web app, installed as a PWA to a Chromium-based Android tablet's home screen, used with a stylus in portrait orientation. No UI system — bespoke; `DESIGN.md` is the visual identity reference — this spine is the experience. Fully offline after install (no network calls in the drill, history, or settings flows). Single-user, single-device, local-only: no accounts, no sync, no multi-tenant concerns anywhere in this spine.

Curly-brace references (`{colors.accent}`, `{components.card-surface}`) resolve against `DESIGN.md`'s frontmatter tokens throughout this document.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| First run | App install / first open | Confirms stylus + pressure range, offers install-to-home-screen |
| Scope picker | App open (warm) / "Another round" on Session summary | Choose script + set, see live card count, start a session |
| Drill loop | Scope picker → "Start writing" | The core prompt → write → (reveal) → self-grade cycle, repeated |
| Session summary | Any session-closure condition | Accuracy, time, reveal count, this session's misses |
| History | Scope picker header / Session summary | Past sessions, reverse-chronological, accuracy trend |
| Settings | Scope picker header | Ink width, idle-close threshold, export/import |

Single-column, one screen visible at a time; no tab bar, no drawer, no modal deeper than one layer (the import-replace confirmation is the only modal in v1).

→ Composition reference: `imports/Kana Practice UX.dc.html` — a full visual + screen-flow mockup covering all six surfaces above (9 screen states total), imported from Claude Design project `2ad5912f-38df-4863-b1a0-2529b353f24f` ("Kana Practice UX"). The local copy is self-contained and canonical for reference; the source project may have since changed. **Spine wins on conflict.** One known conflict: the mockup's Scope picker screen still shows an ink-width preset picker — that control was moved to Settings-only after review (see Component Patterns) and should be treated as removed when the mockup is used as a reference.

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md.Brand & Style`.

| Do | Don't |
|---|---|
| "I'm done." / "Start writing." | "Let's go!" / "Ready to practice?" |
| "Your call — nothing is checking the shape." | "Great job!" / any praise on a correct grade |
| "Revealing doesn't grade it. Compare, then still say what it was." | "Nice try!" on a miss |
| "き · hiragana — missed 3 times now, so it'll come round sooner." | Streak language, encouragement, exclamation marks |
| "Importing replaces everything here — tallies, attempts, history." | Soft-pedaling a destructive action |
| Prompt is romaji + script name only | Mnemonics, example words, or any memory-aid copy (standing exclusion — brief §Rejected, PRD §5.2) |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Card surface | Every screen | `{components.card-surface}` is static chrome — never itself interactive, scrollable as a whole, or dismissible. It has no behavior beyond containing its screen's content. |
| Grade buttons | Drill loop | Reveal uses `{components.button-neutral}` and is active from the moment the prompt appears (PRD FR-5) — a genuinely blank recall still needs a way to see the answer. Missed uses `{components.button-neutral}`, Correct uses `{components.button-primary}`; both render as `{components.button-dimmed}` and are non-interactive until either at least one stroke exists on the canvas or Reveal has been tapped — whichever happens first. A blank, un-revealed cell cannot be graded; a blank, revealed cell can (tapping Reveal on nothing is itself an honest "I don't know," and PRD FR-5 exists precisely for that case). |
| Genkouyoushi cell | Drill loop | Center dot (`{components.genkouyoushi-cell}`) shows only while empty, signaling the write-here point; disappears on first stroke. Clear affordance appears once ink exists, next to a plain "Your call — nothing is checking the shape" line — clearing never auto-advances or auto-grades. |
| Reveal | Drill loop | Shows the user's ink and the canonical reference glyph side by side (never overlaid, never replacing the user's stroke). Does not assign a grade — the grade buttons remain live and required afterward. Whether Reveal was used on an attempt is recorded (PRD FR-8) regardless of the eventual grade. |
| Pill toggle group | Scope picker (script, set), Settings (idle-close threshold, ink width) | Exactly one segment active per group; tapping a segment commits immediately, no separate confirm step. Scope picker's script/set toggles drive a live "N cards in scope" recompute on every tap. |
| Card count + shaky badge | Scope picker | Recomputes on every script/set toggle. The "N shaky" badge (missed-variant chip) counts cards in the current scope whose miss tally exceeds a running-average threshold — informational only, does not affect selection order (see Weak-Spot Bias below). |
| Chip tag | Scope picker, Drill loop header, Session summary, History rows | Always read-only, never tappable. Positive variant for script/set/status metadata; missed variant wherever a count is inherently negative (shaky count, miss tally). Card position ("12 / 46") is plain text, not a chip — reserve the chip treatment for categorical/status metadata only. |
| Stat tile | Session summary | Paired label/value, always read-only, always exactly two per session (time, reveal count) — not a variable-length list. |
| Progress bar | Drill loop header | Paired with an "N / total" counter using the session's scope size as total; advances by one on every completed grade, including grades given after a Reveal. |
| Toast banner (grade confirmation) | Drill loop, immediately post-grade | Shows the card, its new cumulative miss tally (only on a Missed grade), and an Undo action. Stays visible until the user taps "Next character" or Undo; Undo reverts the grade and tally increment and returns to the graded card's written state (not a blank cell). |
| Toast banner (import warning) | Settings → Import | Modal-weight variant: states that the replace is destructive, shows both the current-data date and the incoming file's date, requires an explicit confirm tap — the only two-step destructive action in the app. |
| History row | History | Reverse-chronological. Idle-closed sessions get a neutral "closed on idle" chip; full-scope-completed sessions get a positive "whole scope" chip; manually-closed sessions carry no chip. Accuracy value dims (via `{colors.ink-muted}`, not omitted) on idle-closed rows so a skim of the list doesn't read them as equal-weight signals. |
| History bar (sparkline) | History | Last 10 sessions (or fewer if history is shorter), height = that session's accuracy, color per the `history-bar` ramp in `DESIGN.md`. Idle-closed sessions still appear in the sparkline (excluding them would misrepresent "last 10 sessions") but are not called out differently there — only the list rows below distinguish them. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Stylus found | First run | Pen-check chip (positive), live pressure readout (0–1) updates on touch. |
| Install declined / unsupported | First run | Not modeled — acceptable for a personal single-device tool. If `beforeinstallprompt` isn't available or the user dismisses it, "Just use it here" already covers every practical case; no distinct fallback state is needed. |
| Stylus not detected | First run | Not shown in the mockup or specified in the PRD; confirmed with the user. Chip reads "no pressure input detected," pressure readout hidden, both install and "just use it here" paths stay available — the app does not hard-block on stylus absence since mouse/touch is a reasonable dev/testing fallback (Pointer Events reports a fixed default pressure for non-pen input). |
| Blank | Drill loop | Empty genkouyoushi cell, center dot visible. Reveal is active; Missed and Correct render as `{components.button-dimmed}`. |
| Written, pre-grade | Drill loop | Ink present, center dot gone, all three grade buttons active, Clear available. |
| Revealed, from written | Drill loop | Yours/reference side-by-side layout replaces the single-cell layout; Reveal itself becomes a dimmed "Revealed" label; Missed/Correct are (already) active and required. |
| Revealed, from blank | Drill loop | Same side-by-side layout, but the "yours" panel shows the empty canvas (center dot, no stroke) instead of an inked glyph — there is nothing to compare, only to acknowledge. Revealing itself activates Missed/Correct (see Grade buttons, Component Patterns); in practice this path ends in Missed, since nothing was written, but Correct is not artificially blocked. |
| Graded | Drill loop | Prompt area and cell dim to background (opacity-reduced, not hidden — the next prompt is already visible underneath, signaling forward motion); toast banner floats above the action row; action row collapses to Reveal (dimmed) + "Next character" (primary, wide). |
| Manual closure | Session summary | "you ended it" chip (positive); reached via the always-available "I'm done" control. |
| Full-scope closure | Session summary | No special chip on the summary itself — closure reason is only distinguished later, in History. Reached automatically on the last card of the scope. |
| Idle closure | Session summary → History | Session still produces a full summary (same layout as manual/full-scope) but is written to history with the idle chip; this is a History-surface distinction, not a different Session-summary layout. |
| Empty history | History | Not shown in the mockup (which only depicts a populated 14-session list); confirmed with the user. Sparkline area hidden, single centered line — "No sessions yet. Finish a drill to see it here." — no CTA needed since History is only reachable once the app is otherwise in use. |
| Import pending confirmation | Settings | Modal toast-banner variant (see Component Patterns) blocks the Import action until explicitly confirmed or canceled; canceling leaves current data untouched. |
| Import rejected | Settings | Malformed/unrecognized file: inline error text under the Import control, no data touched, no modal (there's nothing to confirm). |
| Export failure | Settings | Not modeled — acceptable for a personal single-device tool; a blocked/failed browser download has no app-level recovery to specify beyond retrying the tap. |

## Interaction Primitives

- **Pen-first.** The genkouyoushi cell is the only freeform-drawing surface; every other interaction is a single tap.
- **Tap targets:** every button and toggle segment sits well above `{components.button-primary}`'s `minHeight` floor — sized for a stylus tapping on a tablet resting on a desk, not for a phone thumb.
- **No swipe, no drag, no long-press anywhere in v1** — advancing, undoing, and navigating are always explicit taps on a labeled control.
- **Undo** is available only in the graded state, only until "Next character" is tapped — it is not a general-purpose history undo, only a one-step reversal of the grade just given.
- **Clear** (drill canvas) removes ink but never advances the prompt; it returns Missed/Correct to dimmed (cell is blank again) but leaves Reveal active throughout.

## Accessibility Floor

Behavioral; visual contrast lives in `DESIGN.md`. This is a single-user hobby tool built for one person on one known tablet — the floor here is proportionate diligence, not compliance engineering:

- Tap targets meet or exceed Android's 48dp minimum by a wide margin (see Interaction Primitives) — deliberate, since a missed tap mid-stroke is more disruptive here than in a typical list-based app.
- Grade and closure states are never color-only: every chip pairs its tint with text (a count, a label, a reason) per `DESIGN.md.Colors`.
- Basic mouse/touch operability (not just stylus) is supported for development and testing convenience, confirmed with the user — Pointer Events degrades gracefully to a default pressure value for non-pen input, so the drill loop stays usable, if not full-fidelity, without a stylus attached.

## Weak-Spot Bias (data-driven, no dedicated screen)

The miss-tally bias mechanism (PRD FR-6/FR-7) has no settings toggle and no standalone screen — it is an invisible mechanism, surfaced only at its two edges:

1. **Scope picker's "N shaky" badge** — a read-only preview of how many cards in the current scope are currently miss-heavy, before the session even starts.
2. **Session summary's "missed this time" chips** — each chip's count is the card's running cumulative tally (explicitly labeled as such in the copy — see Voice and Tone), not the day's count, making clear to the user that this number is what drives next-session selection.

No UI ever exposes the bias algorithm's weighting or lets the user manually adjust a card's tally (beyond the one-step Undo immediately after a grade).

## Inspiration & Anti-patterns

- **Rejected — Renshuu's traced-stroke-path model:** guiding the hand along a known-correct path tests recognition, not recall. Kana Practice never renders a template under the ink.
- **Rejected — Duolingo's approximate-shape auto-recognition:** even lenient auto-grading substitutes the tool's judgment for the user's own honest self-assessment. Grading here is always an explicit, manual tap.
- **Rejected — full SRS scheduling (due dates, review intervals):** the miss tally biases selection probabilistically; it never queues, blocks, or schedules a card (carried from brief/addendum Rejected Alternatives).
- **Rejected — streaks, points, badges, daily-use nudges:** a standing product boundary (PRD §5.2), not a v1-only omission. No component in this spine may introduce a streak, a point, a badge, or a daily-use nudge.
- **Parked, not rejected (v2+):** exportable notebook-page image artifact; an ink-blot-fades abandon mechanic (explicitly flagged in the brief as a streak mechanic in disguise if built carelessly) — neither is designed against in this spine, both are simply absent.

## Key Flows

### Flow 1 — Morning full session (Simo, before starting work)

Realizes UJ-2 (accuracy-trend confirmation) at the scale Simo actually uses the app: a deliberate, complete session rather than a single quick check.

1. Simo opens the installed app; it launches straight to the Scope picker (no cold "first run" — that only happens once).
2. Both scripts, "All" set selected (or narrowed to one script on a lighter morning) — the live "N cards in scope" count updates as he taps.
3. Taps "Start writing." Drill loop begins: prompt shown, he writes the card from memory on the genkouyoushi cell.
4. Most cards: writes, taps Correct, next prompt appears immediately (progress bar advances).
5. A shaky card comes up (weak-spot bias surfacing it more often, per the scope picker's earlier "N shaky" preview): he blanks, taps Reveal, compares yours-vs-reference side by side, honestly taps Missed.
6. This repeats until the scope is exhausted — session closes automatically on the last card, no explicit "I'm done" needed today.
7. **Climax:** Session summary appears — accuracy hero percentage, time, reveal count, and the missed-chip list with running tallies. That accuracy percentage is the concrete, current-day answer to "is this actually still working" — before he's opened a single work tool that morning.

Failure path: idle interruption (something before work pulls him away mid-session) — after ~5 minutes idle, the session auto-closes exactly as if finished, but is recorded and later shown in History with the idle chip, so a truncated session never quietly inflates or deflates the accuracy trend he's tracking.

### Flow 2 — Mid-day single-character check (Simo, unsure about one card)

Realizes UJ-1 literally: a fast, low-friction single-prompt gut-check, not a full session.

1. Simo opens the app mid-day, already installed and offline-capable — no loading delay.
2. Scope picker: narrows to a single script (or leaves the default) and taps Start writing without dwelling on the screen.
3. First prompt is the character he's unsure about (or close to it, given weak-spot bias) — he writes it from memory.
4. Genuinely blanks partway through: taps Reveal, sees the reference glyph, recognizes what he wrote was wrong.
5. **Climax:** taps Missed — an honest, un-fudged answer recorded in under a minute, exactly the fast gut-check UJ-1 describes; the miss tally updates so this character surfaces sooner next time.
6. Taps "I'm done" immediately rather than continuing through the rest of the scope — session closes on the explicit control, summary shows one attempt.

Failure path: none distinct from Flow 1's error surface — Clear is available if the stroke goes wrong before grading, and a mis-tapped grade can always be reversed with the immediate Undo.
