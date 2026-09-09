---
title: 'Dakuten/Handakuten Catalog Expansion'
type: 'feature'
created: '2026-09-09'
status: 'done'
review_loop_iteration: 0
baseline_commit: '00b2b4856927e660d0570c27567668f5c2667fed'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The shipped 158-card catalog treats the plain 46-character seion gojūon table as "base" per script, omitting the 25 dakuten/handakuten characters (が/ざ/だ/ば/ぱ-series) even though their yoon derivatives (gya/ja/bya/pya rows) already ship as cards. Identified via Correct Course (2026-09-08) as an oversight, not a deliberate exclusion.

**Approach:** Add the 25 dakuten/handakuten base graphemes (+ Hepburn romaji) to `src/domain/cards.ts`, growing the catalog from 158 to 208 cards (71 base hiragana, 71 base katakana, 33/33 yoon unchanged), and update every place that hardcodes a catalog-derived card count so the suite stays green.

## Boundaries & Constraints

**Always:**
- Keep `HIRAGANA_BASE`/`KATAKANA_BASE`/`HIRAGANA_ROMAJI` index-parallel (`baseCards()` reads romaji by index) — insert the 25 new entries at the same relative position in all three arrays, in identical relative order between the two scripts (the `reads a hiragana card and its katakana counterpart identically` test compares `hiragana[index]` to `katakana[index]`).
- Never reorder the existing 46 entries.
- Hepburn romaji per existing convention: が→ga/ぎ→gi/ぐ→gu/げ→ge/ご→go, ざ→za/じ→ji/ず→zu/ぜ→ze/ぞ→zo, だ→da/ぢ→ji/づ→zu/で→de/ど→do (ぢ/づ intentionally duplicate じ/ず's romaji — standard Hepburn), ば→ba/び→bi/ぶ→bu/べ→be/ぼ→bo, ぱ→pa/ぴ→pi/ぷ→pu/ぺ→pe/ぽ→po.
- Every hardcoded catalog-derived count in the test suite (see Code Map) must be updated so `just check` is fully green — this is mechanical fallout of the content change, not new behavior, and must not be left for Story 1.2 to inherit.
- New cardIds stay unique against the existing 158; no same-sound collision.

**Ask First:** None anticipated — this is a mechanical content + test-fixture change with no architectural ambiguity.

**Never:**
- Touch `ScopePicker.svelte`, `Drill.svelte` runtime logic, or any adapter/UI behavior — this story is catalog-content only. The session-size control and other Scope-picker UI work belong to Story 1.2.
- Add extended/loanword yoon graphemes or any dakuten/handakuten yoon row beyond the existing 11 rows (ぎ/じ/び/ぴ already have yoon rows).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Catalog load | App loads amended `cards.ts` | `CARDS` has 208 entries: 71/71 base, 33/33 yoon | N/A |
| Dakuten base lookup | grapheme `が`, script `hiragana` | card exists, `kind: 'base'`, `romaji: 'ga'` | N/A |
| Id uniqueness | full `CARDS` array | no duplicate `cardId` across all 208 | N/A |
| ぢ/づ romaji | grapheme `ぢ` / `づ` | `romaji: 'ji'` / `'zu'` (duplicates じ/ず — standard Hepburn) | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/cards.ts` -- add 25 entries to `HIRAGANA_BASE`/`KATAKANA_BASE` (lines 33-45, 48-60) and matching readings to `HIRAGANA_ROMAJI` (lines 65-77): が/ざ/だ/ば/ぱ-rows, 5 graphemes each, same order in both scripts. Update doc comments at lines 1-7, 31-32, 139-140 (158→208, 46→71).
- `src/domain/cards.test.ts` -- line 10 `toHaveLength(158)`→`208`; lines 13-15 (title + both base-bucket assertions) `46`→`71`; yoon assertions (16-17) unchanged. Fix the stale comment at lines 47-50 (ぎ/じ/び/ぴ no longer lack a base card — the guarded `if (baseCard)` branch at line 78 now executes for all 11 rows; update prose only, logic is already correct). Leave the `gojuon` fixture (line 166, `toHaveLength(46)`) untouched — a fixed 46-entry seion-only Hepburn-mapping fixture, unrelated to the base-bucket count.
- `src/adapters/content/card-repository.test.ts` -- lines 6, 8, 16: `158`→`208`.
- `src/domain/scope.test.ts` -- lines 6-7 (full scope) `158`→`208`; lines 10-13 (hiragana+base) `46`→`71`; lines 17-20 (katakana+yoon) unchanged; lines 24-26 (both scripts, base only) `92`→`142`; lines 29-31 (hiragana, both units) `79`→`104`.
- `src/app/App.test.ts` -- 9× `'1 / 158'` (lines 79,104,128,157,262,277,283,300,336)→`'1 / 208'`; line 177 `'1 / 46'`→`'1 / 71'`; lines 188,212 `'1 / 79'`→`'1 / 104'`; line 200 `'79 cards in scope'`→`'104 cards in scope'`; lines 241,319 (`'66 cards in scope'`, yoon-only) unchanged.
- `src/adapters/ui/ScopePicker.test.ts` -- lines 68/77,239,259,342,365,406 (`'158 cards in scope'`)→`208`; lines 105/117 (title+assertion, hiragana+base) `46`→`71`; lines 120/131 (katakana both-units) `79`→`104`; lines 134/145,277 (yoon-only, `33`/`66`) unchanged.
- `src/adapters/ui/Drill.test.ts` -- default scope is `HIRAGANA_BASE_SCOPE` (46→71): update its defining comment (line 26) and every `'N / 46'`/`aria-valuemax('46')` occurrence (lines 259,267-268,337,350,492,516,532,633,654,759,780,850,908,1527) to 71; update illustrative comments at lines 792,1509,1532 (46-card→71-card). `HIRAGANA_YOON_SCOPE` (33-card) occurrences (lines 27,1177,1206) and line 21's "(minimum 33 cards)" comment are unchanged.
- `src/domain/session.test.ts` -- line 14 comment only (`// 46 cards`→`// 71 cards`); no assertion depends on the literal.
- `src/adapters/ui/Drill.svelte` -- line 170's `("47 / 46")` comment example is illustrative prose; update to `("72 / 71")` for consistency (cosmetic only). Line 942's `rgba(46, 43, 37, 0.18)` is an unrelated CSS color — do not touch.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/cards.ts` -- add 25 dakuten/handakuten graphemes + romaji, index-parallel across `HIRAGANA_BASE`/`KATAKANA_BASE`/`HIRAGANA_ROMAJI` -- delivers the 208-card catalog.
- [x] `src/domain/cards.test.ts` -- update bucket-count assertions and the stale no-base-card comment.
- [x] `src/adapters/content/card-repository.test.ts` -- update `getAll()` length assertions.
- [x] `src/domain/scope.test.ts` -- update scope-derived length assertions for every affected combination.
- [x] `src/app/App.test.ts` -- update hardcoded progress-counter and scope-count text assertions.
- [x] `src/adapters/ui/ScopePicker.test.ts` -- update hardcoded scope-count text assertions and test titles.
- [x] `src/adapters/ui/Drill.test.ts` -- update `HIRAGANA_BASE_SCOPE`-derived counter/`aria-valuemax` assertions and comments.
- [x] `src/domain/session.test.ts` -- update the `HIRAGANA_BASE_SCOPE` comment.

**Acceptance Criteria:**
- Given the static kana catalog (`domain/cards.ts`), when the app loads, then exactly 208 distinct cards exist -- 71 base hiragana (46 seion + 25 dakuten/handakuten), 71 base katakana, 33 hiragana yoon, 33 katakana yoon -- each keyed by a unique `"<grapheme>:<script>"` id, with no same-sound collision across script or base/yoon.
- Given `cards.test.ts`'s bucket-count assertions, when updated, then they assert 71/71/33/33 instead of 46/46/33/33, and continue to assert id uniqueness and no same-sound collision across the expanded set.
- Given the full test suite, when run after this change, then every test asserting a catalog-derived card count reflects the new 208/71/104/142 figures and the suite is fully green -- no incidental breakage left for Story 1.2 to inherit.

## Implementation Notes

- `just check` verified: lint 0 errors, typecheck 0 errors, 304/304 tests passing (up from 303 at baseline).
- Matrix Test Audit (step-03) caught a gap in the subagent's delivery: no test asserted a fixed expected romaji for any specific dakuten/handakuten grapheme (matrix rows "Dakuten base lookup" and "ぢ/づ romaji") -- existing tests only checked non-emptiness and hiragana/katakana cross-consistency, which would pass even if both scripts shared the same wrong reading. Added `cards.test.ts`'s "maps every dakuten/handakuten base grapheme..." test (hand-typed 25-row fixture, independent of `cards.ts`'s declaration order) to close the gap; re-verified green at 304 tests.

## Spec Change Log

## Design Notes

- Sub-row order within the 25 new entries: が-row, ざ-row, だ-row, ば-row, ぱ-row (gojūon consonant order), each 5 graphemes in vowel order (a/i/u/e/o) -- matches the existing seion block's internal ordering convention.
- ぢ and づ deliberately romanize identically to じ (`ji`) and ず (`zu`) per standard Hepburn -- not a bug, don't "fix" by inventing a distinguishing romaji.

## Verification

**Commands:**
- `just check` -- expected: lint 0 errors, typecheck 0 errors, full Vitest suite green with updated counts (no `158`/`46`-derived assertion left unupdated).

## Suggested Review Order

**Catalog data**

- Entry point: the 25 dakuten/handakuten graphemes join `HIRAGANA_BASE`, index-parallel with the readings below.
  [`cards.ts:47`](../../src/domain/cards.ts#L47)

- Katakana mirror, same relative order as hiragana -- required for the cross-script index-identity test to hold.
  [`cards.ts:67`](../../src/domain/cards.ts#L67)

- Hepburn readings for the new entries; ぢ/づ deliberately duplicate じ/ず (`ji`/`zu`), not a typo.
  [`cards.ts:90`](../../src/domain/cards.ts#L90)

- Updated catalog-shape doc comment: 208 total, 71 base per script.
  [`cards.ts:157`](../../src/domain/cards.ts#L157)

**Catalog correctness tests**

- New fixture asserting each of the 25 dakuten/handakuten graphemes' exact romaji and `kind: 'base'`, independent of declaration order.
  [`cards.test.ts:177`](../../src/domain/cards.test.ts#L177)

- Bucket-count assertions raised from 46/46 to 71/71 base per script; yoon counts unchanged.
  [`cards.test.ts:13`](../../src/domain/cards.test.ts#L13)

- Review-pass patch: the yoon-row base-card lookup is now asserted unconditionally, since all 11 rows are guaranteed a base card post-expansion.
  [`cards.test.ts:79`](../../src/domain/cards.test.ts#L79)

**Mechanical ripple (catalog-size literals)**

- Scope-derived length assertions recomputed for every affected script/unit combination (46→71, 158→208, 92→142, 79→104).
  [`scope.test.ts:6`](../../src/domain/scope.test.ts#L6)

- Repository-level full-catalog length assertions.
  [`card-repository.test.ts:9`](../../src/adapters/content/card-repository.test.ts#L9)

- Scope-count display text and progress-counter assertions updated across narrowed and full-scope scenarios.
  [`ScopePicker.test.ts:68`](../../src/adapters/ui/ScopePicker.test.ts#L68)

- Progress-counter text assertions across full and narrowed-scope drill entries.
  [`App.test.ts:79`](../../src/app/App.test.ts#L79)

- Default test scope's derived counter/`aria-valuemax` assertions, updated throughout the file.
  [`Drill.test.ts:259`](../../src/adapters/ui/Drill.test.ts#L259)

- Illustrative code comment updated for consistency with the new scope size (cosmetic only).
  [`Drill.svelte:170`](../../src/adapters/ui/Drill.svelte#L170)

- Comment-only scope-size note; no assertion depends on the literal.
  [`session.test.ts:14`](../../src/domain/session.test.ts#L14)

### Review Findings

Code review 2026-09-09 (branch `feat/1-11-dakuten-handakuten-catalog-expansion`, baseline `00b2b48`..HEAD, 13 files +305/-126). Layers: blind-hunter, verification-gap, acceptance-auditor ran; edge-case-hunter returned empty (treated as failed layer — review may be incomplete on the claims-vs-code axis).

- [x] [Review][Patch] Drill.svelte with-replacement comment contradicts without-replacement sampling model [src/adapters/ui/Drill.svelte:169]
- [x] [Review][Patch] cards.test.ts stale guarded-if prose contradicts the new unconditional assertion [src/domain/cards.test.ts:49]
- [x] [Review][Defer] AD-3 still states 158-card / 46-base figures [ARCHITECTURE-SPINE.md:79] — deferred: fix edits a planning artifact; already tracked in deferred-work.md (spec-1-11 entry, pre-existing in this diff)
- [x] [Review][Defer] epic-1-context pressure-varying stroke-width requirement dropped — deferred: maybe-false, needs check against epics.md/PRD source of truth; fix edits an agent-context file

Rejected:
- false: epic-1-context IDB compression — fields preserved in compressed form (tallies/attempts/sessions/settings + atomic increment/decrement + always-complete unpaginated listAll all still present).
- false: sprint-status `review` vs spec header `done` — different trackers (sprint workflow vs spec implementation status), not a contradiction; `generated` is a file-generation stamp.
- false: spec Verification vs AD-3 grep — Verification scopes to the test suite ("no 158/46-derived assertion left unupdated"); AD-3 is prose docs, explicitly deferred.
- false: dakuten test missing cardId assertions — global `keys every card by a unique cardId` test covers all 208 including the 25 new; cross-script identity test covers index-parallel romaji/kind.
- false: no seion-only/dakuten-only scope split — feature request outside frozen scope; spec Never reserves Scope-picker UI work to Story 1.2.
- false: full-scope 208 fatigue/session length — out of scope; spec Approach is mechanical count updates only, no session-length AC violated.
