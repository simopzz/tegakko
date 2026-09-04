# PRD Quality Review — prd-tegakko-2026-09-02

## Overall verdict

This is a well-calibrated hobby-scale PRD: it has a genuine thesis (recall vs. recognition), features and success metrics trace back to that thesis, scope is honestly bounded with a good assumption/open-question discipline, and the document is appropriately light where the brief says it should be (single persona, single-sentence UJs, no stakeholder apparatus). The one real gap is Done-ness clarity on the product's own stated highest-stakes bet: the pen-feel/latency requirement (FR-3) is left in adjective form ("low enough latency... feel like real handwriting") despite §4.2 calling it "the make-or-break quality bar." Everything else is fixable-if-needed rather than blocking.

## Decision-readiness — strong

Decisions are stated as decisions, not smuggled in as considerations. The web-over-native call is asserted as settled ("That bet is already de-risked," §1) with the trade-off basis named (pressure-to-width control range) and correctly deferred to the addendum rather than re-litigated, per the PRD's own scoping note in §0. `[NOTE FOR PM]` callouts land at genuine tensions, not safe checkpoints — e.g. §4.1's note that this PRD silently extends the brief's kana scope to include yoon, and §4.5's note that the PoC's storage schema is *not* a direct carry-over for v1 (grid-relative, card/attempt-grouped storage is "new work"). The seven Open Questions (§8) are genuinely unresolved, not rhetorical — e.g. Q1 ("how does 'already learned' travel forward into kanji/vocab scope") has no answer smuggled into the next sentence. No instance found of the "everything balances" red flag the rubric warns about.

### Findings
None — no findings needed for a strong dimension.

## Substance over theater — strong

No persona theater: §2 has exactly one user (the creator), grounded in real JTBD quotes, not an archetype built to look thorough. No innovation theater: the Renshuu/Duolingo comparison in §1 is specific about *how* each falls short (Renshuu traces the stroke path, Duolingo auto-recognizes an approximate shape) rather than a generic differentiation paragraph. No NFR boilerplate — the two NFRs stated (Chromium-only in FR-3's Out of Scope, HTTPS requirement under FR-14) are both specific and falsifiable, not "must be scalable/secure" filler. The Vision statement (§1) could not swap into another PRD unchanged — it's anchored in a specific, already-tested technical bet (pressure-to-width control range) and a specific competitive gap.

### Findings
None — no findings needed for a strong dimension.

## Strategic coherence — strong

The thesis — genuine free-recall production, not guided recognition — is stated once (§1) and every feature traces to it: the self-grade loop (FR-4) exists specifically to keep an automated recognizer from doing the remembering; Reveal (FR-5) exists so a blank draw doesn't corrupt the recall signal; weak-spot bias (FR-6/FR-7) is explicitly scoped down from a full SRS to avoid becoming a second product. Success Metrics validate the thesis rather than measuring raw activity: SM-1/SM-2 are about signal honesty and accuracy trend, not usage volume, and SM-C1 explicitly excludes daily-use frequency as a target, naming the exact way an engagement metric would fight the Non-Goals ("optimizing for more sessions would fight the Non-Goal of avoiding gamification/streak pressure"). This is a rare case of a counter-metric doing real work rather than being a checkbox.

### Findings
None — no findings needed for a strong dimension.

## Done-ness clarity — adequate

Most FRs pass the testability bar cleanly: FR-4's "no grading logic evaluates the drawn stroke," FR-9's enumerated closure conditions with a distinct `endReason: inactivity` flag, and FR-12's grid-relative (not viewport-pixel) storage requirement are all independently verifiable by an engineer with no further interpretation needed.

The exception is FR-3, and it's the one that matters most. §4.2 states plainly: "Pen feel is the make-or-break quality bar here." Yet FR-3's latency consequence reads: "Ink renders with low enough latency to feel like real handwriting on the target device." This is exactly the "reasonable performance" pattern the rubric calls out — it gives no number (frame budget, input-to-ink ms, dropped-stroke tolerance) an engineer or a future self doing QA could check against. Every other quantifiable claim in this FR *does* get a bound (full pressure range, at least three named width presets) — only the latency clause is left as pure adjective, on the single requirement the PRD itself says is the hardest bet.

### Findings
- **high** Unbounded latency/feel requirement on the PRD's own "make-or-break" NFR (FR-3, §4.2) — "low enough latency to feel like real handwriting" has no measurable bound, unlike the rest of FR-3's consequences (explicit pressure range, three named presets). Since ink-feel is framed as a felt/qualitative bar elsewhere (SM-4, §7's "success is a felt outcome, not a dashboard"), a numeric ms threshold may be the wrong fix — but the PRD should then say explicitly what the acceptance test *is* (e.g. "matches or exceeds the PoC's self-rated feel on the same device," or a specific frame-drop tolerance). *Fix:* Add either a measurable latency/frame bound or an explicit felt-quality acceptance test (e.g. side-by-side comparison to the validated PoC) to FR-3's consequences.
- **medium** Inconsistent NFR treatment across FRs — FR-14 gets a dedicated "Feature-specific NFRs" subsection (HTTPS requirement); FR-3, which carries the PRD's highest-stakes non-functional concern (ink latency), does not get the same structural treatment and instead buries its NFR inside an ordinary consequence bullet. *Fix:* Either give FR-3 the same "Feature-specific NFRs" subsection treatment as FR-14, or fold the pattern into a single short NFR/Performance section covering both.
- **low** "Validly-exported file" left undefined (FR-13) — the consequence "Import from a validly-exported file restores..." doesn't say what validation happens on import (schema check? version check? silent failure on malformed JSON?). Low stakes for a single-user local tool, but it's the one place FR-13's testability is soft. *Fix:* One sentence on what import validates before applying (or an explicit note that validation is deferred/out of scope).

## Scope honesty — strong

Non-Goals (§5) does real work rather than being decorative — six explicit exclusions, each with a reason and most with a pointer back to the brief/addendum (e.g. "deliberately dropped during brief discovery," "per addendum"). All five inline `[ASSUMPTION: …]` tags (FR-1 yoon scope, FR-2 scope granularity, FR-8 field list, FR-9 idle threshold, FR-13 replace-vs-merge) round-trip cleanly into the §9 Assumptions Index — verified one-to-one, no drift either direction. Open-items density (7 Open Questions + 5 Assumptions + 3 `[NOTE FOR PM]`s against 14 FRs) is high in absolute terms but appropriately so: this is a solo-developer PRD that is its own decision-maker, not a green-light-to-others document, and the rubric explicitly treats high density as fine at low stakes.

### Findings
None — no findings needed for a strong dimension.

## Downstream usability — strong

The Glossary (§3) is doing real disambiguation work, not filler — "Card" vs. "Grapheme" vs. "Script" specifically exists to prevent hiragana/katakana or base/yoon pairs from silently merging, and FR-1's consequences enforce that distinction explicitly ("Same-sound hiragana/katakana pairs...never merge into one card or one miss-tally entry"). FR IDs (FR-1–FR-14), UJ IDs (UJ-1, UJ-2), and SM IDs (SM-1–SM-5, SM-C1) are contiguous with no gaps or duplicates, and cross-references resolve correctly (e.g. UJ-1 "Realizes FR-2, FR-3, FR-4, FR-5, FR-6" — checked against each FR's actual content, all five are genuinely realized by that journey). Terminology stays consistent across sections — "attempt," "session," "scope," "reveal" are used identically wherever they appear, matching their Glossary definitions with no case or synonym drift found.

This PRD is closer to chain-top than fully standalone — §0 frames it as locking down v1 "before building further," i.e. feeding the solo developer's own architecture/build work directly — so this discipline matters more here than the rubric's "standalone PRDs" carve-out would suggest, and it holds up.

### Findings
None — no findings needed for a strong dimension.

## Shape fit — strong

This is the correct shape for a single-operator hobby tool, and the PRD is explicit about calibrating to it rather than defaulting to template weight: §2.3 states UJs are "kept to single-sentence JTBD form per the template's lighter scope dial," §0 explains the document's own purpose is personal lock-down rather than stakeholder alignment, and there's no monetization, compliance, or multi-stakeholder apparatus to force. The one persona is the real individual (the creator), not an archetype — appropriate here since there's no invented user to synthesize. The Glossary and Assumptions Index are the heaviest formal machinery in the document, but both earn their place: the domain genuinely needs script/grapheme disambiguation (feeds forward into the kanji/vocab expansion named in §1), and the assumptions are real build-blocking ambiguities rather than manufactured completeness.

### Findings
None — no findings needed for a strong dimension.

## Mechanical notes

- **ID continuity**: FR-1 through FR-14 contiguous, no gaps/duplicates. UJ-1, UJ-2 contiguous. SM-1–SM-5 plus SM-C1 contiguous. No dangling cross-references found (all `(FR-n)` / `(UJ-n)` / `(SM-n)` references point to IDs that exist).
- **Assumptions Index roundtrip**: All 5 inline `[ASSUMPTION: …]` tags (FR-1, FR-2, FR-8, FR-9, FR-13) are indexed in §9, and all 5 §9 entries have a corresponding inline tag. Clean roundtrip, no drift.
- **Glossary drift**: None found. "Kana," "Card," "Grapheme," "Script," "Attempt," "Session," "Reveal," "Scope," "Prompt," "Miss tally" are used consistently in case and meaning everywhere they appear, including in FR consequence text (not just headers).
- **Content-set arithmetic**: FR-1's "158 cards total" checks out (92 base + 66 yoon [33 combinations × 2 scripts] = 158), and this figure is used consistently in FR-2's consequence ("all 158 cards, FR-1").
- **UJ protagonist naming**: Both UJs name "the creator" as protagonist — the real individual rather than an archetype, appropriate for this product shape (see Shape fit above); not a violation of the rubric's intent even though it isn't a proper name.
- **Required sections for stakes/type**: All sections the rubric would expect for a hobby/solo capability-spec-shaped PRD are present (Vision, Target User/JTBD, Glossary, Features/FRs, Non-Goals, MVP Scope, Success Metrics, Open Questions, Assumptions Index); sections explicitly and correctly omitted per the brief (stakeholders, monetization, compliance) are absent as intended.
