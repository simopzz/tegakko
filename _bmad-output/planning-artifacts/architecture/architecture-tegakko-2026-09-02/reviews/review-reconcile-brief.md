---
title: "Reconciliation Review: ARCHITECTURE-SPINE.md vs. brief.md + addendum.md"
type: review
target: architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md
sources:
  - briefs/brief-tegakko-2026-09-01/brief.md
  - briefs/brief-tegakko-2026-09-01/addendum.md
created: 2026-09-03
---

# Reconciliation Review — tegakko Architecture Spine vs. Brief + Addendum

## Verdict: Minor gaps

The spine is faithful to the brief/addendum on almost every load-bearing decision — the delivery-stack choice, the single-user/no-accounts/no-sync boundary, the "not a full SRS" boundary, the ink-latency isolation rationale, and every rejected alternative are all correctly reflected or correctly left un-reintroduced. One numeric contradiction and one dropped PoC-derived technical constraint are worth fixing before this spine is treated as final.

---

## Real gaps / contradictions

### 1. Card count contradicts the brief's settled scope (92 vs. 158) — unreconciled

The brief states the v1 content scope explicitly and repeatedly:

- Executive Summary: "Content is the full 92-character kana set, hiragana and katakana interleaved and kept script-distinct."
- Scope (In v1): "Full 92-character kana set (hiragana and katakana, interleaved), keyed on grapheme and script."

AD-3 in the spine states: "the 158-card catalog is a TypeScript module compiled into the bundle." 158 is not 92 — nor a number derivable from 92 by an obvious, stated rule (e.g., 92 base kana + dakuten/handakuten + yōon combinations lands somewhere in the 140s–150s depending on which extended forms are included, but the spine doesn't show its work). Nowhere in the spine — not in AD-3, not in Deferred, not in a footnote — is this expansion acknowledged as a deliberate departure from the brief's stated 92, explained, or sourced to a PRD-level scope decision. As written, a reader who has only the brief and the spine sees a flat contradiction on the single scope number the brief was most explicit about.

This may well be an intentional, PRD-stage scope expansion (dakuten/handakuten/yōon variants folded in) that simply never got backfilled into the brief or annotated in the spine — but that reconciliation gap is exactly what's missing. Recommend either: (a) the spine notes the delta and its source ("PRD FR-1 expands the brief's 92-character core set to include N dakuten/handakuten/yōon variants — see PRD §..."), or (b) the number is corrected if 158 is an error.

### 2. PoC-discovered single-canvas constraint not captured as an architectural invariant

The addendum's PoC Findings record a specific, hard-won gotcha: "An initial two-canvas layout (opaque grid layer + transparent ink layer on top) turned the canvas black the instant `navigator.ink.requestPresenter` took over compositing for the ink layer. Merging both into a single, always-opaque canvas fixed it."

This is exactly the shape of thing AD-2 exists to guard ("Prevents: a future refactor moving stroke rendering into Svelte state/props, reintroducing the exact re-render-on-the-hot-path risk the web-vs-native PoC decision was made to avoid") — but AD-2's rule only covers ownership of the canvas node outside Svelte's reactive tree; it says nothing about single-canvas-vs-layered-canvas. A builder who didn't read the addendum could easily reach for the "obvious" grid-layer + ink-layer split (it's a natural way to separate static genkouyoushi grid rendering from dynamic ink) and silently reintroduce the black-canvas bug the PoC already paid down. This is a quiet, PoC-earned constraint that didn't make it into the spine's invariants or its Deferred/structural-seed notes.

Recommend folding "single, always-opaque canvas (grid + ink on one surface)" into AD-2's rule or adding a dedicated AD entry, since Delegated Ink Trails' compositing takeover is the specific mechanism at fault and it's non-obvious.

## Minor / worth a note

### 3. Chromium-only / no-Safari boundary not carried into the spine

The addendum is explicit and blunt: "Chromium-only (Chrome/Edge/Samsung Internet on Android) — **no Safari support**, so this would not run on iPad without a different approach later." This is a real deployment/runtime boundary directly downstream of the Delegated Ink Trails dependency AD-2/AD-8 build on. The spine's Stack table and Deferred section don't mention it anywhere (Deferred talks about custom domain/DNS and CI, not browser support). Since this is a single-user app for a known device (Galaxy Tab + Chrome), this is low-stakes — but it's the kind of boundary that's easy to forget was ever a deliberate trade-off once the PWA "just works" for its one user. Worth a one-line note in Deferred or the Stack table so it isn't silently rediscovered later ("why doesn't this work on my iPad").

### 4. Tilt data (tiltX/tiltY) named in the addendum's API surface but absent from the persisted Stroke shape

The addendum lists the Pointer Events surface in use as "`pressure`, `tiltX`/`tiltY`, `pointerType: 'pen'`) for pressure-sensitive stylus detection." AD-4's `Stroke` type is `{ points: {x, y, pressure}[], widthPreset }` — no tilt. This is low-confidence as an actual gap (the addendum lists tiltX/tiltY as available API surface for stylus *detection*, not necessarily as data that must be captured per-point for rendering/replay), so it may be a correct, deliberate narrowing rather than a drop. Flagging only so it's a conscious choice rather than an oversight, since the addendum's PoC-findings section treats the *replay-through-the-same-draw-routine* persistence strategy as load-bearing, and tilt could plausibly matter for that if the ink adapter ever uses tilt for stroke shape.

---

## Confirmed clean (checked, no issue found)

- **Delivery stack (web/PWA over native)**: fully and correctly reflected — Pointer Events + Delegated Ink Trails (AD-2), HTTPS/secure-context requirement (AD-8), IndexedDB-based local persistence matching the PoC's "lossless, hand-rolled point-stream + preset replay" approach (AD-4, Stack).
- **Single-user / no accounts / no sync / local-only boundary**: Consistency Conventions explicitly states "No auth/session concept beyond the practice `Session` entity — single local user throughout," and no cloud/sync adapter exists anywhere in the structural seed.
- **"Not a full SRS" boundary**: the domain only contains a "weak-spot selection algorithm" and a flat `TALLY { cardId, missCount }` — no due-date, interval, or scheduling-state-machine concept anywhere, matching the addendum's explicit rejection of Leitner/SM-2-lite.
- **No gamification / no streaks**: brief's Success Criteria explicitly disclaims "engagement metrics... a daily-use streak"; nothing in `SESSION`, `ATTEMPT`, or `TALLY` tracks streaks, and AD-7's no-update-prompt rule is framed around single-user simplicity, not engagement.
- **Script-aware content model as extensibility foundation**: AD-3's `cardId = "<grapheme>:<script>"` keying and the static-catalog-as-pure-data approach directly serve the brief's success criterion about the data model "holding up cleanly as a foundation once kanji and vocabulary are added," and the spine's Deferred section correctly punts the actual kanji/vocab extension without pretending to design it now — matching the brief's own Open Questions, which leave this deliberately unresolved for v1.
- **Miss-tally decay/reset**: brief leaves this open for v1 ("may not matter yet"); spine's flat cumulative `missCount` with no decay logic matches that non-decision rather than silently deciding it.
- **Rejected alternatives correctly stay rejected**: no native/Kotlin/androidx.ink trace anywhere in the spine; no trace of a pure-sketch or no-self-grade flip-card flow (self-grade loop is FR-4, `selfGrade` field is in `ATTEMPT`).
- **Export/import boundary**: AD-5's exclusion of raw ink data from the export shape lines up with the brief/addendum's framing of export as a backup/portability feature, not a full data dump concern (though this is mostly a PRD-level FR-13 concern rather than a brief-level one).
