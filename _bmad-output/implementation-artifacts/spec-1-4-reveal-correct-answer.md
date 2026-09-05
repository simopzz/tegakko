---
title: 'Reveal Correct Answer'
type: 'feature'
created: '2026-09-05'
status: 'done'
route: 'oneshot'
baseline_commit: '12a26e769cc29692315e0e253fd998f49792e8ee'
review_loop_iteration: 0
context: [
  '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md',
]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Drill screen (Story 1.3) only offers Missed/Correct, with no honest way to see the answer when a learner genuinely blanks — they're forced to guess blind or fudge their own grade. Epic 1's self-grading is only sacred if reveal never assigns a grade for them.

**Approach:** Add a Reveal control to `src/adapters/ui/Drill.svelte`'s grade row (Reveal · Missed · Correct — `.btn--neutral`/`.btn--neutral`/`.btn--primary`, matching the existing button classes), active the instant a prompt appears (before any stroke). Tapping it sets local `revealed` state that (a) turns the cell area into a side-by-side "Yours" / "Reference" layout — the existing ink `.cell` node stays mounted exactly where it is in the DOM (only its CSS box changes) so `CanvasInkSurface.mount()`/`destroy()` still fire exactly once per drill entry; a new sibling panel renders `card.grapheme` in `var(--font-glyph-ink)` ('Yuji Syuku') on the `--color-missed-bg`/`--color-missed-fg` tint per DESIGN.md, (b) turns Reveal itself into a dimmed, disabled "Revealed" label (same `.btn--dimmed` pattern already used for Missed/Correct), and (c) unlocks Missed/Correct even with a blank cell (`disabled = !hasInk && !revealed`). Revealing from blank shows an empty "Yours" panel (center dot, no stroke) — never an inked glyph. The cell-footer's Clear button and disclaimer line, which only make sense for the pre-reveal single-cell state, hide once revealed (nothing in the frozen states re-enables Clear after a reveal). Grading (Missed or Correct) resets `revealed` to `false` for the next prompt exactly like it already resets `hasInk`. No `AttemptRepository` exists yet (Story 1.5) — there is nothing to set a `revealUsed` flag on this story; the obligation here is purely behavioral (reveal never auto-grades, and grading stays required afterward), and Story 1.5 will read whatever local reveal signal it needs when it adds persistence. `src/adapters/ui/Drill.test.ts`'s "shows no Reveal control" test (written to protect 1.3's scope boundary) is removed and replaced with reveal-specific coverage: Reveal present and active from render; unlocks Missed/Correct from blank; shows Yours/Reference panels with the correct glyph on reveal-from-written and an empty Yours panel on reveal-from-blank; becomes a dimmed disabled "Revealed" label; a subsequent grade advances the prompt/counter and resets to the pre-reveal single-cell state for the new card.

</frozen-after-approval>

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | A two-character yoon grapheme (e.g. きゃ) clips against `.reference-cell`'s `overflow: hidden` -- `.glyph`'s width cap was sized for one character | high | patch | Confirmed: `min(60cqw, 60cqh)` per character with no allowance for a second glyph; 66/158 cards (all yoon) are two characters, so the reveal would hide part of the very answer it exists to show. Fixed with `.glyph--yoon` (`min(34cqw, 60cqh)`), verified by a test asserting the class is applied for `きゃ`. |
| 2 | Nothing locks the ink surface after reveal -- a learner can keep drawing on, or trace over, the just-revealed reference glyph | medium | patch | Confirmed: no `pointer-events` change and no guard in `onStrokeComplete`. This diff introduces the first state where post-reveal drawing is even meaningful, so it's caused by this change. Fixed with `.cell--locked { pointer-events: none }` plus an `if (revealed) return` guard in the stroke callback; the CSS lock has a dedicated test. |
| 3 | The revealed side-by-side layout has no narrow-viewport stacking fallback | false | rejected | The project's UX spine is explicit: "Single-surface portrait target, ~800×1280 logical px (Android tablet + stylus, held portrait). No responsive breakpoints -- this is one app on one known device class" (EXPERIENCE.md). A narrow-viewport fallback would contradict a stated constraint, not fix a gap. |
| 4 | Setting `disabled` on the just-clicked Reveal button drops keyboard focus to `<body>` right as Missed/Correct become interactive | low | patch | Confirmed standard browser behavior (disabling the focused element blurs it) and no focus management existed. Simple, contained fix: move focus to Missed after `tick()`; not rejected as low-and-skip because the fix is a simple correction, not new complexity. Verified by a test asserting `document.activeElement`. |
| 5 | `## Implementation Notes` was left empty despite the feature being fully coded | low | patch | Valid housekeeping gap in this story's own in-progress spec (not another story's or a rules file, so the "edits to specs route to defer" carve-out doesn't apply). Filled in directly above. |
| 6 | No test asserted `inkSurface.clears` stays `0` when revealing from written ink -- a regression that silently wiped the "Yours" ink on reveal would pass unnoticed | low | patch | Confirmed gap in the existing "shows the Yours ink..." test. Added the assertion directly to that test. |
| 7 | The "Yours"/"Reference" captions aren't programmatically tied to their panels (no `aria-label`/`aria-labelledby`), unlike this file's own `aria-label="Cards written"` precedent | low | patch | Confirmed. Added `role="group"` + `aria-labelledby` on both panels' cell/reference-cell, pointed at the caption's `id`; verified by a test. |
| 8 | No test exercises a stroke landing while already revealed -- an undefined interaction path given the ink surface wasn't locked | medium | patch | Same root cause as #2 -- fixed by the same `onStrokeComplete` guard. Not separately tested: once revealed, `hasInk` has no observable effect on rendered output (Missed/Correct are already enabled via `revealed`, and Clear/disclaimer are hidden outright), so there is nothing distinguishable to assert beyond the `.cell--locked` test covering #2. |
| 9 | No test covers reveal-from-*written*-ink followed by a grade (only reveal-from-blank was exercised) resetting cleanly for the next prompt | low | patch | Confirmed gap; the written-ink path is arguably the more common real usage. Added a dedicated test mirroring the existing reveal-from-blank reset test. |

## Implementation Notes

- `src/adapters/ui/Drill.svelte`: the ink `.cell` div stays in one fixed spot in the markup (never inside an `{#if}`); only its enclosing `.panel`'s CSS box changes on reveal, so `CanvasInkSurface.mount()`/`destroy()` still fire exactly once per drill entry (AD-2 preserved).
- `.cell`/`.reference-cell`'s `cqw`/`cqh` sizing moved from `.cell-wrap` onto a new `.panel` wrapper (each panel is its own container-query context) -- with one panel this is identical to the old measurement; with two (revealed) each measures its own half, not the full wrapper.
- Clear and the disclaimer line hide entirely once revealed (`{#if !revealed}`) -- they belong to the pre-reveal single-cell state, and nothing in the frozen states re-enables them after a reveal.
- No `AttemptRepository` exists yet (Story 1.5), so there is nothing to set a `revealUsed` flag on; this story's obligation is purely behavioral (reveal never auto-grades, grading stays required afterward).
- Review added: `.cell--locked` (`pointer-events: none`) plus an `if (revealed) return` guard in the `onStrokeComplete` callback, so a learner cannot draw over or trace the just-revealed reference; `.glyph--yoon` gives two-character yoon graphemes (e.g. きゃ) a smaller width-based cap so they don't clip against `.reference-cell`'s `overflow: hidden`; `role="group"`/`aria-labelledby` ties the "Yours"/"Reference" captions to their panels; focus moves to Missed after Reveal fires (its own `disabled` would otherwise drop focus to `<body>`).

