# Reconciliation — PRD

Source: `prds/prd-jplearn-2026-09-02/prd.md`

Lead with two concrete contradictions found between the PRD's own functional requirements and what the spines (EXPERIENCE.md in particular) actually specify — both are testable, both look unintentional.

## Contradictions (lead items)

1. **Reveal-button gating contradicts FR-5.** FR-5 states: "The reveal control is available on every prompt, **from when it appears** until self-grade is submitted" — i.e. Reveal should be usable on a still-blank cell, which matters for the "genuinely can't produce anything" case the whole product exists to catch honestly. But EXPERIENCE.md's Component Patterns says all three grade buttons, Reveal included, "render as `button-dimmed` and are non-interactive **until at least one stroke exists** on the canvas," and the State Patterns table repeats this for the Blank state. This directly contradicts FR-5's letter. It also contradicts the design import itself: the import's "A1 blank" screen shows Reveal fully active (not dimmed) while Missed/Correct are dimmed — so the mockup that EXPERIENCE.md was distilled from actually got this right, and the spine's prose diverged from its own source. This reads like a drafting slip in EXPERIENCE.md, not a deliberate override, but it's a real functional gap: as written, a user who blanks completely on a character has no way to reveal it without first faking a stroke.
2. **Mnemonic copy contradicts §5.2's permanent boundary.** PRD §5.2 (Out of Scope — Permanent) states: "Not a gamified or streak-driven product. No points, badges, **mnemonics**, or daily-use pressure mechanics" — listed as a standing boundary, not a v1-only omission (§5.2 elsewhere is explicit about this distinction). Yet EXPERIENCE.md's Voice and Tone table sanctions "Plain mnemonic tie-in: 'as in *kirin*'" as a Do, and DESIGN.md's typography section names mnemonic text as an expected UI element. Same root cause as the brief version of this finding (see reconcile-brief.md) — looks inherited from the design-import mockup without being checked against §5.2. Worth a explicit human call: either §5.2 gets a carve-out for plain etymological tie-ins (arguably different in spirit from "mnemonics" as memory-device gamification), or the spines drop it.

## Covered

- FR-1 (script-aware kana + yoon, 158 cards) → Scope picker card-count copy ("92 cards in scope of 158") and Settings ("158 cards · ...") in the import/spines.
- FR-2 (scope selection: script + base/yoon) → EXPERIENCE.md Component Patterns, Scope picker pill-toggle groups, matches PRD's "Default taken" assumption exactly.
- FR-3 (pen canvas + genkouyoushi grid, pressure range, width presets) → DESIGN.md `genkouyoushi-cell` component + Subtle/Expressive/Calligraphy presets in Settings.
- FR-4/FR-5 (prompt → write → self-grade, with reveal, no auto-grading) → EXPERIENCE.md Drill loop component patterns and Inspiration & Anti-patterns (Rejected — Duolingo auto-recognition), modulo the Reveal-gating contradiction above.
- FR-6/FR-7 (miss tally, weak-spot-biased selection, probabilistic not scheduled) → EXPERIENCE.md "Weak-Spot Bias" section, explicit that no UI exposes the algorithm's weighting.
- FR-8 (per-attempt data collection) → correctly has **no** dedicated UI surface, consistent with the PRD's own note ("No analysis UI beyond FR-11 is scoped for v1").
- FR-9 (session closure: explicit / full-scope / idle) → EXPERIENCE.md State Patterns table covers all three closure reasons distinctly, including the idle-closure history treatment.
- FR-10/FR-11 (session accuracy capture, browsable history, idle-closed sessions visually distinguishable) → History row/sparkline component patterns, dimmed accuracy on idle rows, "closed on idle" / "whole scope" chips.
- FR-12 (lossless local persistence) → correctly not a UX-spine concern; no contradiction.
- FR-13 (export/import, replace not merge, malformed-file rejection) → Settings screen's import-warning toast-banner variant and "Import rejected" state in EXPERIENCE.md's State Patterns, matching the PRD's "Default taken: replace, not merge" assumption and the destructive-action copy example almost verbatim.
- FR-14 (installable, offline, HTTPS) → EXPERIENCE.md Foundation ("Fully offline after install... no network calls").
- UJ-1 and UJ-2 → EXPERIENCE.md's Key Flows 2 and 1 respectively, each explicitly annotated with which FRs they realize.
- SM-1/SM-2/SM-3 (fast honest read, accuracy trend, weak-spot bias surfacing) → realized structurally by the Drill loop, History, and Weak-Spot Bias sections.

## Dropped or altered

- **Idle-close threshold quietly became user-configurable.** PRD FR-9 assumes a single fixed idle threshold ("`[ASSUMPTION]` ~5 minutes — confirm or adjust", also §7 item 5, "Default taken: ~5 minutes"). The spines instead specify a Settings pill-toggle group offering 2 min / 5 min / 10 min / **Never** (EXPERIENCE.md Component Patterns row: "Pill toggle group | ... Settings (idle-close threshold, ink width)"). This is a materially different design than the PRD describes — notably, "Never" means idle auto-closure can be disabled entirely, which the PRD's FR-9 (idle closure as one of three defined closure conditions) doesn't anticipate. This is a reasonable UX refinement, but the PRD's §7 assumption #5 was never updated to reflect it — worth a note back to the PRD so the document doesn't quietly go stale on this point.
- FR-8's field list (stroke count, first-stroke latency, etc.) is captured silently per the PRD's own "no analysis UI" note — correctly dropped from any visible component, not a concerning gap (see reconcile-import.md for a related point: the import mockup itself shows a live "3 strokes · 6.2s" readout during writing, which the spines correctly did *not* carry forward, since displaying it live would arguably violate the PRD's "no analysis UI" and "no automated stroke evaluation feels like grading" spirit).

## Qualitative ideas at risk

- **FR-3's felt-quality acceptance bar** ("Ink latency and feel must match or exceed the validated web PoC's self-rated feel... a felt/qualitative bar elsewhere") is a deliberately non-numeric, experiential requirement. Nothing in DESIGN/EXPERIENCE contradicts it, but nothing preserves the *reasoning* either — a future implementer working only from the spines could reasonably (and wrongly) assume any pressure-reactive canvas satisfying the token spec is "done," without the felt-comparison-to-PoC bar the PRD insists on.
- **The PRD's "gut-check, not a chore" framing (SM-4)** risks the same fate as in the brief: DESIGN.md's Brand & Style captures the aesthetic posture well but doesn't carry forward the specific claim that ink feel is what makes reaching for the app *wanted*. Same finding as reconcile-brief.md, restated here since the PRD is where it's promoted to a named success metric (SM-4).
