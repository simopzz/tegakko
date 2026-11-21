# tegakko design

How tegakko looks and behaves. Terms are as defined in [`GLOSSARY.md`](../GLOSSARY.md). Token values (colours, fonts, radii, spacing) live in [`src/app/theme.css`](../src/app/theme.css); this doc names them and says what each is for.

## Foundation

- **One device class.** A Chromium-based Android tablet held portrait (~800×1280 CSS px) with a stylus, using the app as an installed PWA. No phone layout, no iPad/Safari, no responsive breakpoints. Delegated Ink Trails is Chromium-only, so this boundary holds until the tablet in use changes.
- **Web, not native**, for the pressure range: see [ADR-0002](adr/0002-ink-adapter-owns-its-canvas.md).
- **HTTPS origin.** Delegated Ink Trails and PWA install both need a secure context; the app is served from Cloudflare's `*.workers.dev` origin.
- **Offline after install.** Drill, History and Settings make no network calls. A new build takes over silently on next load; there is no update prompt.
- **Local-only, single learner.** No accounts, no sync, no multi-user data. Export/import is the only way data leaves the device ([ADR-0003](adr/0003-import-replaces-never-merges.md)).
- **Mouse and touch still work** for development: Pointer Events reports a fixed pressure for non-pen input, so the drill stays usable without a stylus, just not at full fidelity.

## Brand and voice

A morning ritual, not an engagement product. It opens like a notebook: a blank cell, a prompt, nothing in between. The look borrows from washi paper and brush ink: warm neutrals, one accent that behaves like a wax seal, kana rendered in a brush face so the answer reads as handwriting. Ask "would this belong on good stationery?", not "would this belong in a habit tracker?".

Quiet confidence, not encouragement. Nothing celebrates a correct grade or scolds a missed one beyond a plain count.

Examples of the voice, not all of them literal app copy:

| Do | Don't |
|---|---|
| "I'm done." / "Start writing." | "Let's go!" / "Ready to practice?" |
| "Your call — nothing is checking the shape." | "Great job!" or any praise on a correct grade |
| "Revealing doesn't grade it. Compare, then still say what it was." | "Nice try!" on a miss |
| "き · hiragana — missed 3 times now, so it'll come round sooner." | Streaks, encouragement, exclamation marks |
| "Importing replaces everything here — miss counts, attempts, history." | Soft-pedalling a destructive action |
| Prompt is romaji + script name; ぢ/づ/ヂ/ヅ, whose Hepburn romaji collides with another card's, add their written-form romaji in parentheses | Mnemonics, example words or any memory-aid copy |

## Colour

One chromatic accent; everything else is warm paper neutrals plus two quiet tints.

| Token | Role |
|---|---|
| `--color-surface-card` | The cream paper. The whole viewport is this surface — no separate ground colour exists. |
| `--color-surface-card-secondary` | One shade warmer: grouped controls and stat tiles nested in a card. |
| `--color-surface-canvas` | Only the genkouyoushi cell. The lightest surface, so the writing area reads as the cleanest page. |
| `--color-ink` | Text and stroke colour. Warm sumi, never pure black. |
| `--color-ink-muted` / `-faint` / `-hairline` | Secondary text; borders and dividers; progress track. |
| `--color-accent` | Terracotta. Only "the primary action" or "what's happening now": the Correct button, primary CTA, progress fill, newest History bar. Never decoration. |
| `--color-accent-strong` | Secondary text links (Back, History, Settings) and the toast's action (Undo, confirm). One step below the accent. |
| `--color-accent-deep` | Accuracy readouts only: the Summary hero percentage and History row accuracy. |
| `--color-positive-bg` / `-fg` / `-accent` | Sage. Non-urgent good state: script/set tags, "stylus found", "Session complete". Not the Correct button. |
| `--color-missed-bg` / `-fg`, `--color-accent-on-peach` | Peach. Miss-count chips, the Reveal reference panel, the grade toast. Reads as attention, not error. |
| `--color-grid-guide` | Genkouyoushi border and dashed cross-guide; low end of the History accuracy ramp. |

No second accent, no gradients, and no red anywhere: a missed grade is not an error.

Every load-bearing text/background pair meets WCAG AA (4.5:1 body, 3:1 large heading/display): ink on every surface, missed-fg and accent-on-peach on missed-bg, positive-fg on positive-bg, surface-card on accent and accent-strong.

## Type

| Token | Face | Use |
|---|---|---|
| `--font-heading` | Noto Serif JP 600 (−0.02em on titles) | Screen and section titles, every button label, every numeric readout. The structural voice. |
| `--font-display` | Noto Serif JP 600 | The single largest number on a screen (Summary accuracy). At most one per screen. |
| `--font-glyph-ink` | Yuji Syuku, tilted −1.2° | Only an actual grapheme, rendered as brushed ink: the reference glyph, sized to fill its cell, and missed-card chips. Never UI text, never romaji, so its appearance always means "a real grapheme". |
| `--font-body` | Figtree 400 | Sentences, captions. |
| `--font-label` | Figtree 700, uppercase, 0.1em | Micro-labels over grouped controls ("SCRIPT", "YOURS" / "REFERENCE"). |

## Layout, depth, shape

- **Full-height screens.** The shell (`App.svelte`'s `.app`) is fixed to the visible viewport (`100dvh`, nothing scrolls at the shell level): the top bar takes its own height and the screen below fills exactly the rest. Scrollable screens (everything but Drill) share one shell (`ScreenShell.svelte`): a `<main>` that scrolls in itself and centers its content horizontally (max-width 640px) and vertically (`margin: auto`, which degrades to top-aligned without clipping when content is taller than the screen); stacked elements in that column are one `--spacing-3` apart. The Drill is not scrollable: its writing area fills whatever room is left.
- **Spacing** `--spacing-1`…`-8` (8→72px): 1–2 inside one control, 3–4 between stacked elements, 6–8 for screen padding and between major sections.
- **Depth:** one level. The toast casts one soft, ink-tinted shadow (~`0 12px 32px`, low opacity), like paper lifted off a desk. Buttons, chips and tiles sit flush and differ by fill alone; screens are the paper itself, so they cast no shadow and have no radius.
- **Radii:** `--radius-sm`/`-md` for chips, buttons, small controls; `-lg` for the genkouyoushi cell and stat tiles; `-xl` for the toast; `-full` only on progress bars, History bars and pill tracks, never on a button or card. `-squircle` is for the app icon only.

## Screens

One screen at a time, single column, no tab bar or drawer, no router: one top-level `Screen` value picks what renders. Every screen shares one thin top bar (`TopBar.svelte`) with one back control and one placement for the History and Settings links; the bar's Back always returns to the Scope picker, even when History or Settings was opened from the Session summary. Drill renders its own instance of the same bar ("I'm done" — a session closure into Summary, not back-navigation — plus the progress readout) and offers no History/Settings links, so Settings stays unreachable while a drill is mounted. Entry focus lands on the bar's title on History and Summary. The only modal is the import confirmation; while it is open the bar is inert too, so there is no keyboard escape.

| Screen | Reached from | Purpose |
|---|---|---|
| First run | First open only | Check the stylus and pressure range; offer install. |
| Scope picker | App open; bar Back and "Another round" on Summary | Choose scope and session size, see the live card count, start. |
| Drill | Scope picker → "Start writing" | The prompt → write → (reveal) → self-grade loop. |
| Summary | Any closure | Accuracy, time, reveal count, this session's misses. |
| History | Bar links on Scope picker and Summary | Past sessions, newest first, accuracy trend. |
| Settings | Bar links on Scope picker and Summary | Ink width, idle-close threshold, export/import. |

## Components

| Component | Look | Behaviour |
|---|---|---|
| Top bar | Thin strip on the paper, hairline bottom rule; micro-label title in `--font-label`; Back as a bordered button; History/Settings as accent-strong text links at the far right | One instance per screen, rendered by the composition root (Drill renders its own with the progress readout). Back is absent on First run and Scope picker; links appear only where that screen offers them. Focus moves onto the title on History and Summary entry. Inert while the import warning is open. |
| Genkouyoushi cell | Canvas surface, one cell per character of the grapheme in a row (two for a yoon like チョ, one for a single kana; a kanji later gets one), solid rule between cells, dashed cross inside each, `-lg` | Centre dot in each cell only while the row is empty. Once ink exists, Clear appears next to "Your call — nothing is checking the shape". Clearing never advances or grades; it dims Missed/Correct again (the row is blank) while Reveal stays live. |
| Grade buttons | Correct: accent fill. Reveal, Missed: transparent with faint border. 88px min height, `-md`, equal widths in a row under the cell | Reveal is live from the moment the prompt shows. Missed and Correct are dimmed (40% opacity, not a different colour) until there is a stroke or Reveal was tapped. A blank revealed cell can be graded; a blank unrevealed one can't. |
| Reveal | Yours above Reference, the ink taking the larger share (2:1), both at full width in portrait; reference on peach, one reference cell per character in the same row shape the learner wrote in, grid-guide rule between cells; a small kana (the ョ in チョ) renders about half size in its own cell | Never overlaid, never replacing your strokes, never side by side in portrait (that halves both cells and leaves empty bands). Doesn't grade; Missed/Correct stay required. Whether Reveal was used is recorded on the attempt. |
| Pill toggle group | Secondary-surface track; active segment accent fill | Equal-width segments, exactly one active, commits on tap. On the Scope picker each tap recomputes the card count. |
| Chip | `-sm`; positive, missed or neutral tint, always with text | Read-only. Positive for script/set/status, missed where a count is inherently negative (shaky, miss count). Card position ("12 / 46") is plain heading text, not a chip. |
| Card count + shaky badge | Count in plain text; "N shaky" as a missed chip | "N shaky" counts shaky cards in the current scope. Informational; it doesn't feed selection. |
| Progress bar | 6px, hairline track, accent fill, `-full` | Always beside an "N / total" counter, total = the session's sampled size. Advances on every grade, reaches exactly 100%. |
| Grade toast | Peach, `-xl`, shadow, floats above the action row | Shows the graded card and, on Missed, its new miss count, plus Undo as text-only accent-strong (no fill, no border). Rides over the next prompt (one tap per card: the grade itself advances) until the learner commits to what's under it — the new prompt's first stroke, or a Reveal — or taps Undo. Undo reverts the attempt and miss count and brings the graded card back exactly as it was written: strokes, reveal panel and all. On the last card the toast stays over the frozen card until Undo or Finish. |
| Import warning | Toast, modal weight | Says the replace is destructive, shows the current data's date and the file's date, needs an explicit confirm. Cancel leaves current data untouched. The only two-step action in the app. |
| Stat tile | Secondary surface, `-lg`, label over value | Exactly two on Summary: time, reveal count. |
| History row | Hairline divider (none on the last row) | Newest first. Complete sessions get a positive "Session complete" chip, inactivity closures a neutral "Closed on idle" chip, explicit ones none. Accuracy in accent-deep, dimmed to ink-muted on inactivity rows. |
| History sparkline | Vertical `-full` bars | Last 10 sessions; height = accuracy, colour on a five-step ramp from grid-guide through positive-accent; the newest bar is always accent. Inactivity sessions are included and not marked. |

## Drill states

| State | Treatment |
|---|---|
| Blank | Empty cell with centre dot. Reveal live; Missed/Correct dimmed. |
| Written | Ink, no dot, all three buttons live, Clear available. |
| Revealed from written | The revealed pair replaces the single row: Yours over Reference, ink with the larger share, the reference mirroring the writing row cell for cell. Reveal becomes a dimmed "Revealed" label; Missed/Correct live. |
| Revealed from blank | Same layout, "yours" shows the empty cell. Revealing enabled grading; Correct isn't blocked. |
| Post-grade (mid-queue) | No visible state change to the drill itself: the grade advances straight to the next prompt, and the grade toast floats above it. Writing or revealing on the new prompt dismisses the toast; until then its Undo brings the graded card back with its ink and reveal panel intact. |
| Frozen closing card | Grading the last card freezes it: prompt and cell dim (not hidden), cell locked, Reveal becomes a dimmed "Revealed" label, and the wide control is "Finish". Undo or the toast's Undo reverses the grade; Finish closes the session as complete. |

## Other states

| State | Screen | Treatment |
|---|---|---|
| Stylus found | First run | Positive chip, live 0–1 pressure readout. |
| No pressure input | First run | Chip reads "No pressure input detected", readout hidden, both install and "Just use it here" stay available. No hard block. |
| Install declined or unsupported | First run | Not modelled; "Just use it here" covers it. |
| Explicit closure | Summary | Positive "You ended it" chip. "I'm done" — the drill bar's back control — is always reachable in the drill. |
| Complete / inactivity closure | Summary | Same summary layout, no chip. The distinction shows in History. Inactivity closes after the idle threshold (default 5 minutes, set in Settings). |
| Empty History | History | Sparkline hidden; "No sessions yet. Finish a drill to see it here." |
| Import rejected | Settings | Inline error under Import, nothing written, no modal. |
| Export failed | Settings | Not modelled; retry the tap. |

## Interaction

- **Pen first.** The cell is the only drawing surface; everything else is one tap on a labelled control. No swipe, drag or long-press.
- **Tap targets** sit well above Android's 48dp: a missed tap mid-session costs more here than in a list app.
- **One tap per card.** Grading is the only step between prompts: a grade shows the next prompt immediately; there is no "Next character". The last card's grade freezes it and offers Finish instead.
- **Undo** is a one-step reversal of the grade just given, available only while its toast is showing: until the next prompt's first stroke or Reveal, or — on the frozen closing card — until Undo or Finish. It is not a general history undo.
- **Never colour alone:** every chip pairs its tint with text.

## Weak spots

The weak-spot bias ([ADR-0004](adr/0004-session-sampled-once-by-weakness.md)) has no screen or toggle and is never explained in the UI. It shows only at its edges: the Scope picker's "N shaky" badge before a session, and Summary's missed chips, whose counts are the card's lifetime miss count, not this session's. The learner can't edit a miss count beyond the immediate Undo.

## Key flows

**Morning session.** Open the app → Scope picker (both scripts, all sets, or narrowed on a lighter day) → Start writing. Write each card from memory and grade it; the grade moves straight to the next prompt. On a shaky card, blank, Reveal, compare, honestly tap Missed. Grading the last card freezes it; tapping Finish closes the session as complete, and Summary's accuracy answers "is this still working?". If interrupted, it closes on inactivity and History marks it, so a truncated session doesn't skew the trend.

**Single-card check.** Unsure about one card mid-day: open, narrow the scope or not, Start writing, write it, Reveal, grade, "I'm done". An honest answer in under a minute.

## Not planned

Rejected on purpose:

- **Traced stroke paths** (Renshuu): guiding the hand tests recognition, not recall. No template is ever drawn under the ink.
- **Spaced repetition**: no due dates, intervals or scheduling; weakness only biases sampling.
- **Accounts, sync, other platforms**: see Foundation.

Not planned, but not ruled out:

- **Automatic grading** (shape, stroke-order or OCR recognition, as in Duolingo). Today grading is always the learner's own explicit tap.
- **Gamification** (streaks, points, badges, daily nudges).
- An exportable notebook-page image of a day's writing; an ink-blot-fades abandon mechanic (watch that it doesn't become a streak in disguise); analysis UI over attempt data beyond History.
