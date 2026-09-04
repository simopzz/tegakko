---
title: "Reconciliation: Brief/Addendum vs PRD"
created: 2026-09-02
---

# Reconciliation: Brief + Addendum vs PRD (Kana Writing Practice)

Sources checked:
- brief.md — `_bmad-output/planning-artifacts/briefs/brief-tegakko-2026-09-01/brief.md`
- addendum.md — `_bmad-output/planning-artifacts/briefs/brief-tegakko-2026-09-01/addendum.md`
- prd.md — `_bmad-output/planning-artifacts/prds/prd-tegakko-2026-09-02/prd.md`

Known, deliberate PRD additions (excluded from this report per instructions): yoon expansion (FR-1), Reveal (FR-4), session-level tracking (FR-7/8/9/10), JSON export/import (FR-12), explicit PWA installability (FR-13).

## Gaps: substantive content missing from the PRD

### 1. No FR for "pick a scope" (session scope selection)

Brief §Solution: "An on-demand, self-graded handwriting drill: **pick a scope (or take the full 92-character set)**, get a prompt, write the character from memory..." This describes a real setup step in the core loop — the user chooses what subset of kana to drill (or the whole set) before/at the start of a session.

The PRD has no functional requirement covering this. FR-3 ("Prompt → write → self-grade loop") starts from "the user is shown a prompt" with no mention of how the pool of eligible cards for that prompt is chosen. FR-8's consequence text — "the user completes every card in the session's selected scope" — *presupposes* a "selected scope" concept exists and is user-controlled, but nothing in §4 (Features) or the FR list defines what scopes are offered (e.g., full set / hiragana only / katakana only / a custom subset) or how the user picks one. This reads as an FR-shaped gap: either the PRD intends "scope" to always mean "the full 158-card set" (in which case the brief's "pick a scope" language should be explicitly narrowed/confirmed as out-of-v1), or scope selection is a real capability that got lost between brief and PRD.

Recommend: add an explicit FR (or amend FR-3) covering scope selection, or add an `[ASSUMPTION]`/Open Question explicitly stating v1 has no scope picker and every session always draws from the full card set.

### 2. Two of the brief's four Success Criteria didn't make it into PRD §7 Success Metrics

Brief §Success Criteria lists four bullets:
- (a) fast, honest answer when unsure about a character
- (b) weak-spot bias actually surfacing shaky characters
- (c) **"The ink feel being satisfying enough to want to reach for it, rather than a chore."**
- (d) **"The script-aware data model holding up cleanly as a foundation once kanji and vocabulary are added — this is a build-quality goal as much as a product one, since getting it wrong now would mean redoing it later under a bigger content set."**

PRD §7 Success Metrics has SM-1 (≈ a), SM-3 (≈ b), SM-2 (a PRD-original addition about session-history trend, fine), and SM-C1 (counter-metric). Neither (c) nor (d) appears as a success metric anywhere in the PRD.

(c) is a first-class product-identity claim in the brief ("What Makes This Different" also calls ink quality "the emotional hook") — it's a felt/qualitative bar distinct from FR-2's functional consequences ("stylus pressure visibly and continuously affects stroke width," latency feels real). FR-2 covers *that it works*, not *that it's good enough to want to use*. Losing it from Success Metrics drops the qualitative bar the brief cared about most.

(d) is explicitly framed by the brief as a success criterion, not just a design description. The PRD's FR-1 description references the same idea in passing ("so the same model extends cleanly to kanji/vocabulary later") but only as a feature rationale, not as something success will be judged against later.

Recommend: add SM-4 (ink feel — subjective, "reach for it not a chore") and SM-5 (script-aware model held up cleanly when kanji/vocab work starts) to §7, or fold them explicitly into existing SMs with a note that they're carried from the brief.

### 3. Two of the addendum's four "Parked Ideas (v2+)" dropped from PRD §6.2

Addendum lists four parked ideas: (1) exportable image/notebook-page artifact, (2) ink-blot-fades abandon-session mechanic, (3) KanjiVG as a future content source, (4) radical-based character grouping.

PRD §6.2 Out of Scope for MVP carries forward (1) and (2) verbatim ("Exportable image / notebook-page artifact of a day's writing (parked, v2+ per addendum)"; "Ink-blot-fades abandon-session mechanic (parked, v2+ per addendum...)") but omits (3) KanjiVG and (4) radical-based grouping entirely — they appear nowhere in the PRD.

This is plausibly deliberate (both are kanji-specific, and kanji itself is already out of v1 scope, so listing them may have seemed redundant) — but the selective carry-forward is inconsistent with how the other two parked ideas were handled, and worth a conscious call rather than a silent drop, especially since (4) radical-based grouping also has anticipated relevance to the "script-aware content model... foundation... once kanji is added" thread noted in gap #2(d) above.

## Drift / softened phrasing (not missing, but reworded in a way that loses precision)

### 4. Renshuu vs Duolingo distinction blurred

Brief §Executive Summary is specific: "Renshuu makes you trace the correct stroke path; Duolingo auto-recognizes an approximate finger-drawn shape but still guides your hand along it." Two different failure modes for two different tools.

PRD §1 Vision compresses both into one generic sentence: "Existing tools (Renshuu, Duolingo) confirm you can trace or approximate a shape with guidance." The distinction (guided tracing vs. leniently-graded auto-recognition) is lost. Low-stakes, since the PRD's overall claim is still accurate, but it's a slight softening of the competitive-gap argument that was more precise in the brief.

## Minor dropped "why" / qualitative nuance

### 5. "Creator has already nearly memorized the full kana set" not restated

Brief §Vision: "The creator has already nearly memorized the full kana set, so kanji and vocabulary support are expected to follow soon after v1 ships." This is the reasoning that makes v1 a *confirm* tool rather than a *teach* tool, and explains why kana specifically is a low-risk, fast starting scope. PRD §1 Vision keeps the "kanji/vocab follow within months" claim but drops the "already nearly memorized" premise behind it. Worth a one-clause restatement since it's load-bearing for why self-grading (rather than any teaching aid) is sufficient for v1.

### 6. "Building on a tablet with a real stylus is part of the appeal too, not just a means to an end" — not reflected anywhere

Brief §What Makes This Different: this line is about the creator's own enjoyment of the build medium, not a functional requirement. It has no obvious FR-shaped home, and is genuinely optional flavor — flagging for completeness only, not recommending an FR. If the PRD's Vision section is meant to preserve tone/why context (it does try to, e.g. keeping "emotional hook" language for ink quality), this is the one first-person motivational aside that fell out.

## Orphaned content check (deep technical rationale with nowhere to live)

None found. The addendum's PoC findings, rejected-alternatives detail (native Android, full SRS, alternate one-feature candidates) all remain live and reachable — the PRD explicitly references brief.md and addendum.md rather than re-deriving them (§0 Document Purpose), and the PRD's own new assumptions/open questions (yoon scope, inactivity threshold, export/import replace-vs-merge) are already captured in the PRD's own §8/§9. No content was found that is substantive, PRD-relevant, and currently unreachable from either document.

## Summary of gaps for compact reply

1. No FR for "pick a scope" / session scope selection (brief §Solution) — FR-8 presupposes a "selected scope" that no FR defines.
2. Brief's success criteria (c) "ink feel satisfying enough to want to reach for it" and (d) "script-aware model holding up cleanly" are absent from PRD §7 Success Metrics.
3. Addendum's parked ideas KanjiVG and radical-based grouping dropped from PRD §6.2, unlike the other two parked ideas which were carried forward.
4. (minor) Renshuu/Duolingo distinct failure-mode framing blurred into one generic sentence in PRD §1.
5. (minor) "Creator has already nearly memorized the full kana set" premise (brief §Vision) not restated in PRD §1.
