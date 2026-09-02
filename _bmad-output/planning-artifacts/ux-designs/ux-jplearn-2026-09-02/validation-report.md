# Validation Report — Kana Practice (jplearn)

- **DESIGN.md:** `/Users/simopzz/dev/jplearn/_bmad-output/planning-artifacts/ux-designs/ux-jplearn-2026-09-02/DESIGN.md`
- **EXPERIENCE.md:** `/Users/simopzz/dev/jplearn/_bmad-output/planning-artifacts/ux-designs/ux-jplearn-2026-09-02/EXPERIENCE.md`
- **Run at:** 2026-09-02T21:15:00

## Overall verdict

The spine pair is close to a clean downstream-ready contract: shape fit is exact, flow coverage is complete, and the two previously-flagged contradictions (Reveal-gating vs PRD FR-5, mnemonic copy vs the standing gamification exclusion) are now fixed consistently everywhere both terms appear — no residual mentions found anywhere in either file. What's left is a small set of real, independently-discovered gaps: two color tokens (`accent-strong`, `accent-deep`) that are defined with hex values but have no prose story or component wiring anywhere despite being visibly load-bearing colors in the reference mockup; a complete absence of stated contrast targets in DESIGN.md despite EXPERIENCE.md's Accessibility Floor explicitly pointing there for it; a genuine unresolved contradiction between Component Patterns and State Patterns over what happens when Reveal is tapped on a still-blank cell; and a couple of component-coverage gaps (`card-surface`, `History row`) that leave one-word-or-absent behavioral/visual specs.

None of these are critical — nothing blocks a downstream consumer from extracting the bulk of the contract — but the three high-severity items should be resolved before this is marked final, since they're exactly the kind of gap a story-dev session would either silently guess at or stall on.

## Category verdicts

- Flow coverage — strong
- Token completeness — thin
- Component coverage — thin
- State coverage — adequate
- Visual reference coverage — adequate
- Bloat & overspecification — strong
- Inheritance discipline — strong
- Shape fit — strong

## Findings by severity

### Critical (0)
None.

### High (3)

**Token completeness** — accent-strong / accent-deep defined with hex but no story or usage anywhere (DESIGN.md:16–17, §Colors)
`accent-strong` (#8C491A) and `accent-deep` (#B2622D) are defined in frontmatter but appear in zero `{colors.*}` references and zero Colors-section prose anywhere. Both are visibly load-bearing in the reference mockup: #8c491a is the nav-link (Back/History/Settings) and Undo-button text color; #b2622d is the accuracy-hero color on Session summary and the default History-row accuracy color. A downstream implementer has no spec basis for either and would likely substitute `{colors.accent}` or `{colors.ink}`, diverging from the mockup.
Fix: Add a one-line Colors-section story for each and wire them into the relevant components (toast-banner action text, accuracy hero/history-row accuracy color).

**Token completeness** — No contrast targets stated anywhere, despite EXPERIENCE.md pointing to DESIGN.md for them (EXPERIENCE.md:93; DESIGN.md §Colors/§Do's and Don'ts absent)
EXPERIENCE.md's Accessibility Floor says "visual contrast lives in DESIGN.md," but DESIGN.md states no ratio or pass/fail target for any load-bearing pairing (ink-on-page-bg, missed-fg-on-missed-bg, positive-fg-on-positive-bg, surface-card-text-on-accent).
Fix: Add a short contrast note to DESIGN.md, e.g. a target ratio per pairing family, proportionate to the hobby-scale posture but not absent.

**State coverage** — Unresolved contradiction: grade-button state when Reveal is tapped on a still-blank cell (EXPERIENCE.md:53 vs EXPERIENCE.md:72,74)
Component Patterns states "a blank cell cannot be graded, but it can be revealed," and the Blank state row confirms Missed/Correct render dimmed while Reveal is active. But the Revealed state row then states unconditionally "Missed/Correct remain active and required," with no state modeling Reveal tapped directly from Blank (zero ink). Unclear whether grading activates on reveal-alone (breaking the stated rule) or stays dimmed inside the Revealed layout (contradicting "remain active"), and unclear what the "yours" panel shows. Neither Key Flow exercises this path.
Fix: Add an explicit "Revealed, blank" state row (or a qualifying clause) stating whether grade buttons activate on reveal-alone and what the "yours" panel renders.

### Medium (3)

**Component coverage** — card-surface has a DESIGN.md visual spec but no EXPERIENCE.md behavioral row (DESIGN.md §Components; EXPERIENCE.md §Component Patterns absent)
Full-text search confirms "card surface" / "card-surface" returns zero hits in EXPERIENCE.md — no behavioral rule for whether it's ever interactive, scrollable, or dismissible.
Fix: Add a one-line Component Patterns row, or explicitly note in DESIGN.md that it's chrome-only with no behavioral spec.

**Component coverage** — History row is behaviorally specified but has no DESIGN.md visual entry (EXPERIENCE.md:63; DESIGN.md §Components absent)
EXPERIENCE.md gives "History row" real behavioral rules (ordering, idle/whole-scope chips, dimmed accuracy on idle rows), but DESIGN.md.Components only defines "History bar" (the sparkline) — the row's own layout and default accuracy-value color are unspecified.
Fix: Add a `history-row` entry to DESIGN.md.Components, or fold it explicitly into an existing entry.

**Component coverage** — Toast banner's mandatory action (Undo / confirm) has no visual spec (DESIGN.md §Components toast-banner; EXPERIENCE.md:61–62)
DESIGN.md's toast-banner token only defines background/foreground/radius/shadow, not the action button/link's own color, border, or radius — even though Component Patterns requires "a single clear action." Likely tied to the orphaned `accent-strong` token, but the connection is never made explicit.
Fix: Add an `action` sub-token to the toast-banner component entry.

### Low (4)

**State coverage** — No state for a declined/unsupported install prompt (EXPERIENCE.md §State Patterns, First Run)
Only "stylus not detected" is covered; a browser that doesn't support `beforeinstallprompt`, or a user dismissal, isn't modeled.
Fix: State this is out of scope (acceptable for a personal single-device tool), or add a one-line fallback.

**State coverage** — No export-failure state (EXPERIENCE.md §State Patterns, Settings)
Import pending-confirmation and Import-rejected are covered, but a blocked/failed export download isn't.
Fix: Add an explicit "not modeled, acceptable" note given the hobby-scale posture already established elsewhere.

**Visual reference coverage** — Screen-count claim is off by one (EXPERIENCE.md:31; imports/Kana Practice UX.dc.html)
EXPERIENCE.md claims the mockup covers "10 screen states total." Counting `data-screen-label` elements directly gives 9: A1 blank, A2 written, A3 revealed, A4 graded, First run, Scope picker, Session summary, History, Settings.
Fix: Correct "10" to "9," or — if a 10th state was intended (e.g. a distinct "revealed-from-blank" screen, see State coverage) — close both gaps together.

**Inheritance discipline** — Glossary pointer line omits "yoon" and "kana" (EXPERIENCE.md:13)
The named glossary list omits "yoon," even though it's heavily used throughout (base-vs-yoon toggles, Scope picker's Base/Yoon segment, Weak-Spot Bias). Not a resolution error — usage is consistent with the PRD's definition — just an incomplete pointer list.
Fix: Add "yoon" (and optionally "kana") to the glossary line.

## Reviewer files
- `review-rubric.md`
