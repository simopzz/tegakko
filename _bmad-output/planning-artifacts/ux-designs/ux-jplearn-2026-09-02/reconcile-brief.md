# Reconciliation — Product Brief + Addendum

Source: `briefs/brief-jplearn-2026-09-01/brief.md` + `addendum.md` (one linked document).

## Covered

- Free recall, not guided recognition (no tracing, no auto-shape-matching) → EXPERIENCE.md "Inspiration & Anti-patterns" (Rejected — Renshuu traced-stroke, Rejected — Duolingo auto-recognition), near-verbatim from the brief's "What Makes This Different."
- Script-aware content model (grapheme + script keys) → reflected in Scope picker's script/set toggles and live card-count recompute (EXPERIENCE.md Component Patterns); the underlying data-keying itself is correctly left to the PRD/architecture, not a UX-spine concern.
- Lightweight per-character miss tally, no due dates/intervals → EXPERIENCE.md "Weak-Spot Bias" section, explicit "no settings toggle, no standalone screen... invisible mechanism."
- Full 92-character kana set, hiragana/katakana interleaved → Scope picker script/set toggles + card-count copy in the import and spines (PRD's 158-card superset, see reconcile-prd.md, is the more precise number — brief's 92 is pre-yoon).
- Local-only, no accounts/sync → EXPERIENCE.md Foundation: "no accounts, no sync... no multi-tenant concerns anywhere in this spine."
- Rejected alternatives (full SRS/Leitner-SM2, native Android delivery) → EXPERIENCE.md "Inspiration & Anti-patterns" restates the SRS rejection almost verbatim; delivery-stack choice (web/PWA, Chromium-only, Delegated Ink Trails) → EXPERIENCE.md Foundation.
- No gamification / streaks / points / badges → EXPERIENCE.md Voice and Tone Don't column + Brand & Style ("nothing gamifies... would this belong on a well-made piece of stationery").
- Parked v2+ ideas (exportable notebook-page image, ink-blot-fades-abandon mechanic) → EXPERIENCE.md "Parked, not rejected (v2+)" bullet, explicitly flagging the ink-blot idea's streak-mechanic risk exactly as the addendum did.
- "Narrow by design, not by accident" posture → well-translated into DESIGN.md's Brand & Style framing ("quiet confidence, not encouragement... nothing celebrates a correct answer").

## Dropped or altered

- **Mnemonics contradiction.** The brief lists "Mnemonics, streaks/gamification" under "Explicitly out of v1" — a permanent-sounding exclusion, not a soft default. Yet EXPERIENCE.md's Voice and Tone table lists "Plain mnemonic tie-in: 'as in *kirin*'" as a sanctioned Do, and DESIGN.md's typography section names "mnemonic text ('as in *kirin*')" as an expected UI element. This looks like it was inherited uncritically from the design-import mockup (which shows "as in kirin" on every drill-loop screen) rather than reconciled against the brief's explicit boundary. Unexplained — flag for a human call: either the brief's exclusion was meant to be softened during PRD/UX work (worth stating explicitly somewhere) or the spines need to drop it. See reconcile-prd.md for the sharper version of this (PRD §5.2 repeats the same exclusion).
- Open question "does the miss-tally need decay/reset" and "how does 'already learned' travel into kanji/vocab" — correctly left unaddressed in both spines (no UI invented for either), consistent with the brief leaving them open for v1. Not a gap, just noting they remain unresolved by design.

## Qualitative ideas at risk

- **"Ink quality as the actual product... the emotional hook and the technically riskiest part."** The brief frames ink feel as the product's actual center of gravity, worth building and de-risking first. DESIGN.md treats the genkouyoushi cell as one component among several (a token spec: background, border, radius, guide) with no language conveying that this is *the* thing the whole product is riding on. Nothing in DESIGN/EXPERIENCE is wrong here, but a reader of the spines alone wouldn't sense that ink feel is the make-or-break bet — that framing lives only in the brief/PRD now.
- **"Building on a tablet with a real stylus is part of that appeal too, not just a means to an end."** This is a distinct, almost affectionate claim — the hardware itself is part of the emotional pitch. EXPERIENCE.md's Foundation section states the same fact ("used with a stylus in portrait orientation") purely as a technical constraint, with none of the original appeal framing. Worth a human check on whether that's fine to lose (it's arguably out of scope for a behavioral/visual spec) or whether it should show up somewhere in Brand & Style.
- **"A morning ritual, not an engagement product"** and the quiet-uncertainty framing of the Problem statement translate well into DESIGN.md's Brand & Style and the EXPERIENCE.md Key Flows (Flow 1's "before he's opened a single work tool that morning" beat) — flagging this as a positive: this is the one piece of brief "spirit" that made the trip successfully and explicitly, worth noting as a model for how the mnemonics/ink-feel gaps above could be closed the same way.
