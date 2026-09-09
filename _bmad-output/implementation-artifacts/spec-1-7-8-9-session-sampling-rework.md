---
title: 'Session-Sampling Rework (Stories 1.7/1.8/1.9 Course Correction)'
type: 'feature'
created: '2026-09-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md']
baseline_commit: 'f160b6ea36074bc8a39e412edb917b43ff30fcc0'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Drill's card selection (`selectNext`) picks one weighted, with-replacement card per prompt, so the "N/total" counter and full-scope closure are probabilistic — full coverage of a scope takes ~4-6x the displayed total in practice, making `EXPERIENCE.md`'s "session closes on the last card" flow effectively unreachable at real scope sizes. Undo and History's closure copy still assume that old per-draw model. The already-shipped session-size control (Story 1.2 rework) is fully wired in the UI but never consumed — comments in `App.svelte`/`ScopePicker.svelte` say `sampleSessionCards` "is what eventually reads it."

**Approach:** Per `sprint-change-proposal-2026-09-08.md` and the already-amended `ARCHITECTURE-SPINE.md` (AD-10/AD-13), replace `selectNext` with `sampleSessionCards(attempts, scope, sessionSize): Card[]` — sampled once at session start, weighted-without-replacement, then uniform-shuffled. Drill advances through this fixed queue; closure fires on queue exhaustion (exact, never probabilistic); History's "Whole scope" chip becomes "Session complete" uniformly. Undo needs no queue manipulation (see Boundaries).

## Boundaries & Constraints

**Always:**
- Reuse `score()` in `domain/drill.ts` unchanged for weighting (7-day half-life, `1 + score` floor).
- Reuse `AttemptRepository.listAll()`/`deleteLast()` and `TallyRepository` unchanged (AD-9 — no port signature changes).
- Sample exactly once per session, at Drill mount, from the `attempts` prop as loaded (not re-fetched or appended to mid-session).
- After weighted-without-replacement draw, uniform-shuffle the sampled set so weight never determines presentation order (AD-10).
- Undo needs **no** queue-reinsertion logic: per AD-13, Drill's deferred-advance pattern (grade shown as a toast; the queue pointer only advances on "Next character") already guarantees the pointer hasn't passed the undone card while Undo is offered. Follow AD-13 verbatim — do not add reinsertion/reordering code even though the original proposal (§4.2, informal, pre-architecture-pass) described it that way.
- `full-scope` stays the internal `ClosureReason` value; only display copy changes (History chip only — `SessionSummary.svelte` already renders full-scope/inactivity identically).
- The `SizeChoice` ('all' | 0.25 | 0.5 | 0.75) → count formula (`'all'` ⇒ full scoped count, else `Math.max(1, Math.round(choice * scopedCount))`) must live in one place and produce identical results wherever it's used.

**Never:**
- Don't change `ScopePicker`'s `onStart(scope)` signature. `App.svelte` already tracks `sessionSize: SizeChoice` reactively via `onSessionSizeChange`; resolve it inside `handleStart` from that existing state.
- Don't touch IndexedDB schema/`DB_VERSION` or `Session`/`Attempt`/`Tally` shapes — no new field needed (`cardsAttempted` already captures the sampled count, per AD-4).
- Don't touch pen-check, ink, idle-detection (`isSessionIdle`), or shaky-badge (`countShaky`) logic — unrelated to this change.
- Don't add overshoot-handling for the counter/bar — without-replacement sampling makes it always exact now.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal session | scope=46 cards, sessionSize resolves to 20 | Queue of 20 distinct, shuffled cards; counter "1/20"→"20/20"; closes `full-scope` after the 20th grade | N/A |
| `sizeChoice = 'all'` | scope=208 cards | Resolved size = 208 (matches prior default behavior exactly) | N/A |
| Tiny scope + percent choice | scope=3 cards, choice=0.25 | `Math.max(1, Math.round(0.25*3))` = 1, then `min(1, 3)` clamp in the sampler — queue has exactly 1 card | N/A |
| Undo before "Next character" | Grade just submitted, toast showing, queue pointer not yet advanced | Attempt deleted, tally decremented only if undone grade was incorrect; queue/pointer untouched — no repeat, no skip | Repository failure still logs via `console.error`; toast still clears (existing fire-and-forget pattern) |
| Undo on the session's last card | Queue pointer at final index, toast showing | Same as above — session has not yet closed, nothing queue-side to restore | N/A |
| Idle or explicit close mid-queue | User idles past threshold, or taps explicit end, before queue exhausted | `closureReason` `inactivity`/`explicit` as today, unaffected by queue state | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/drill.ts` -- replace `selectNext` with `sampleSessionCards(attempts, scope, sessionSize): Card[]`; extract its cumulative-weight single-draw logic into a private helper called in a loop (remove drawn candidate from the pool, recompute total weight, repeat `min(sessionSize, candidates.length)` times), then uniform-shuffle the result; keep `score()` and `undoLastGrade` verbatim; rewrite the stale file-header comment (lines 1-9).
- `src/domain/scope.ts` -- add exported `type SessionSizeChoice = 'all' | 0.25 | 0.5 | 0.75` and pure `resolveSessionSize(choice: SessionSizeChoice, scopedCount: number): number` (moves `ScopePicker`'s inline `effectiveSessionSize` formula here); keep `cardsInScope`/`FULL_SCOPE` unchanged.
- `src/domain/session.ts` -- remove `isScopeComplete` (lines 70-75; only call site becomes dead once Drill switches to queue-exhaustion); keep `ClosureReason`, `isSessionIdle`, `buildSummary`, `buildSessionRecord` unchanged.
- `src/domain/history.ts` -- update `closureChipVariant`'s docstring (lines 50-54) from "Whole scope" to "Session complete" wording.
- `src/adapters/ui/Drill.svelte` -- new `sessionSize: number` prop; at mount (`untrack`), compute `queue = sampleSessionCards(attempts, scope, sessionSize)`, `queueIndex = $state(0)`, seed `card` from `queue[0]`; `handleNext` (~line 359) advances `queueIndex` and closes with `'full-scope'` when `queueIndex + 1 >= queue.length`, replacing the `isScopeComplete` check; drop `selectNext`/`isScopeComplete` imports (line 28/31) and the now-unused live-appended `sessionAttempts` mirror (lines 98, 422-423) — sampling reads the `attempts` prop once, nothing appends to it mid-session; counter/progress denominator (currently `cards.length`, line ~513/175) becomes `queue.length`; `handleUndo` keeps its existing `thisSessionAttempts.pop()` / tally-decrement / `undoLastGrade` sequence unchanged, no new reinsertion logic (per AD-13, see Boundaries).
- `src/adapters/ui/ScopePicker.svelte` -- replace the local `SizeChoice` type (line 82) and inline `effectiveSessionSize` derivation (lines 124-126) with the new `domain/scope.ts` exports; `onStart` stays `(scope: Scope) => void`, unchanged.
- `src/app/App.svelte` -- in `handleStart` (~line 100), resolve `resolveSessionSize(sessionSize, cardsInScope(CARDS, chosenScope).length)` from the already-tracked `sessionSize: SizeChoice` state and pass the result as `<Drill sessionSize={...}>` (~line 192); delete the stale "eventually consumes it" comment (lines 51-54).
- `src/adapters/ui/History.svelte` -- line ~93 chip copy `"Whole scope"` → `"Session complete"`.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/drill.ts` -- add `sampleSessionCards`, extract weighted-draw helper, remove `selectNext` -- implements AD-10's sampling contract
- [x] `src/domain/scope.ts` -- add `SessionSizeChoice`/`resolveSessionSize` -- single source of truth for size resolution
- [x] `src/domain/session.ts` -- remove `isScopeComplete` -- dead after queue-exhaustion closure
- [x] `src/domain/history.ts` -- update `closureChipVariant` docstring -- copy accuracy only
- [x] `src/adapters/ui/Drill.svelte` -- switch to queue-based sampling/advance/closure, drop unused `sessionAttempts` mirror -- implements AD-10/AD-13 in the UI layer
- [x] `src/adapters/ui/ScopePicker.svelte` -- reuse the domain size-resolution export -- removes duplicated formula
- [x] `src/app/App.svelte` -- resolve and pass `sessionSize` into `<Drill>` -- closes the "not yet threaded" gap
- [x] `src/adapters/ui/History.svelte` -- "Whole scope" → "Session complete" -- FR-9 amendment
- [x] `src/domain/drill.test.ts` -- rewrite the `selectNext` suite against `sampleSessionCards` (weighted-without-replacement, shuffle, `min(sessionSize, candidates.length)` clamp) -- covers the I/O matrix
- [x] `src/adapters/ui/Drill.test.ts` -- rewrite selection/closure/counter/undo suites for the queue model; remove the now-false "can repeat the same card back-to-back" test; added a partial-`sessionSize` closure test (matrix row 1) during verification
- [x] `src/adapters/ui/ScopePicker.test.ts` -- no change needed: file references no `ScopePicker`-exported type and exercises only public props/DOM, so it keeps passing unmodified against the new `resolveSessionSize`-backed formula; the "never threads size into `onStart`" assertion still holds
- [x] `src/app/App.test.ts` -- assert `handleStart` resolves and passes `sessionSize` to `<Drill>`
- [x] `src/domain/session.test.ts` -- remove the `isScopeComplete` suite
- [x] `src/domain/history.test.ts` / `src/adapters/ui/History.test.ts` -- update expected chip copy to "Session complete"

**Acceptance Criteria:**
- Given a scope of N cards and a resolved session size K≤N, when a session starts, then the sampled queue has exactly `min(K,N)` distinct cards and the counter/bar reach exactly that total with no overshoot.
- Given `sizeChoice = 'all'`, when a session starts, then the resolved size equals the full scoped count, matching prior default behavior.
- Given the last queue entry is graded, when the grade is confirmed, then the session closes with `closureReason: 'full-scope'`, shown in History as "Session complete" regardless of whether the sample equaled the full scope.
- Given Undo is tapped before "Next character", when it completes, then the attempt is deleted, the tally is decremented only if the undone grade was incorrect, and the queue/pointer are unchanged.
- Given `just check` runs, then lint, typecheck, and the full Vitest suite pass with no reference to `selectNext` or `isScopeComplete` remaining anywhere in `src/`.

## Implementation Notes

- `just check` (lint, `tsc`+`svelte-check`, full Vitest suite) passes; `grep -rn "selectNext\|isScopeComplete" src/` returns no matches.
- Confirmed a pre-existing, unrelated test flake surfaced during repeated `just check` runs: `Drill.test.ts`'s `currentCard()` helper resolves the displayed prompt by romaji, which collides for じ/ぢ and ず/づ since Story 1.11's dakuten/handakuten catalog expansion. Not introduced or worsened by this rework (verified the collision's per-card mount probability is unchanged by the shuffle); logged to `deferred-work.md` rather than expanding scope to fix test infra.
- Added one Drill.test.ts case beyond the original file list during the Matrix Test Audit: a partial-`sessionSize` (10 of 33) end-to-end closure test, closing a gap where the "normal session" I/O matrix row (queue size + counter + closure all tracking a session size smaller than the scope) had no single covering test.
- Review pass (2026-09-09): one `patch` finding applied -- `sampleSessionCards` computed each candidate's `score()` fresh on every draw instead of once; moved the weight computation outside the draw loop, `weights`/`pool` now spliced in lockstep. No signature/behavioral change. `just check` clean after (22 files, 317 tests). Two findings deferred (`deferred-work.md`); full triage in `## Review Triage Log` below.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `sampleSessionCards` (`drill.ts`) recomputes every remaining pool candidate's `score()` from scratch on each of its `drawCount` draws, even though a candidate's score depends only on `attempts` (fixed for the call), not on which other cards remain -- O(sessionSize × poolSize × attempts.length) instead of scoring each candidate once. | medium | patch | Confirmed by reading `sampleSessionCards`: `weights = pool.map((card) => 1 + score(card, attempts))` runs inside the `for (i < drawCount)` loop. Real, avoidable, and now runs synchronously at every session mount (was previously amortized across many separate `selectNext` calls under the old with-replacement model). Smallest fix (precompute each candidate's score once, reuse across draws) is contained entirely inside `sampleSessionCards`, no signature/API change. |
| 2 | This diff's own rewritten/added `HIRAGANA_BASE_SCOPE` + `currentCard()` tests are exposed to the known じ/ぢ, ず/づ romaji-collision flake (deferred-work.md), same as ~15 pre-existing call sites in the same file. | false | -- | Checked each test this diff actually touches: "seeds the sampled queue..." targets `cards[10]` = さ (`sa`), not a colliding character, by fixed catalog order (`HIRAGANA_BASE` array, `cards.ts:35-52`); "shows a cumulative tally..." never calls `currentCard()`; "never shows the same card twice..." uses `HIRAGANA_YOON_SCOPE`, whose 33 romaji are all distinct (no dakuten/handakuten collisions in yoon). The residual exposure lives entirely in ~15 untouched pre-existing call sites, already captured by the existing deferred-work.md entry. |
| 3 | `Drill.svelte`'s progress bar dropped its old `Math.min`/`Math.max` clamps; a future closure-condition change could push `position`/`aria-valuenow` out of range with nothing at the render layer to catch it. | false | -- | Names a hypothetical future regression, not a current one. `queueIndex` is structurally bounded today: `handleNext` closes the session instead of incrementing once `queueIndex + 1 >= queue.length`, proven by the "reaches exactly 100% with no overshoot" test -- no code path in this diff produces `position > queue.length`. |
| 4 | `App.svelte` derives a scope's card count from the static `CARDS` import while `ScopePicker.svelte` derives it from `cardRepository.getAll()`; the "can never drift" claim in both files' comments rests on an unenforced assumption that they match. | false | -- | `InMemoryCardRepository.getAll()` (`adapters/content/card-repository.ts:11-15`) returns `[...CARDS]`, the same static array, and its own doc comment states "content never changes at runtime in v1" (AD-3) -- there is exactly one `CardRepository` implementation in this codebase, over the same data. Not an unenforced assumption; a documented architecture invariant. |
| 5 | `_bmad-output/implementation-artifacts/spec-1-10-session-history-view.md` (an earlier, already-`done` spec) still describes the History chip copy as "Whole scope" in three places, now contradicted by this rework, with no pointer to the fix. | low (real) | defer | Confirmed via `grep -n "Whole scope" _bmad-output/implementation-artifacts/spec-1-10-session-history-view.md`. Same pattern as this repo's existing precedent (e.g. the AD-3/`cards.ts` staleness entry logged during Story 1.11's review) -- a later story's change makes an earlier `done` spec's historical text stale; logged rather than editing the old spec, matching established convention. |
| 6 | This spec's own `## Spec Change Log` / `## Review Triage Log` sections were left as empty headings even though a real spec correction (the AD-13 "reinsert" language override) and a scope decision (deferring the romaji-collision flake) happened, folded into Design/Implementation Notes instead. | -- | rejected | Fix is to edit this build's spec -- explicitly out of scope per the triage rules regardless of merit. |
| 7 | `resolveSessionSize` (`scope.ts`) has no guard for a zero/empty `scopedCount`; would silently return `1` rather than failing loudly, unlike `sampleSessionCards`'s explicit empty-scope throw. | false | -- | `scopedCount` is always `cardsInScope(...).length` from one of the Scope picker's fixed buckets {33, 66, 71, 104, 142, 208} (script × base/yoon combinations) -- the picker's own pill groups always leave at least one script and one unit active, so `0` is not a value any caller in this codebase can produce today. |
| 8 | `Drill.svelte` reads `queue[0]!`/`queue[queueIndex]!` via non-null assertions with no fallback UI if `sampleSessionCards` throws (e.g. an empty scope reaching Drill). | low (real) | defer | Verified this risk is unchanged from before this diff: the prior code (`card = $state<Card>(untrack(() => selectNext(sessionAttempts, scope)))`) would propagate an identical empty-scope throw out of component initialization the same way. Pre-existing, not caused by this story. |
| 9 | The percent-preset formula (`Math.max(1, Math.round(choice * scopedCount))`) isn't guaranteed monotonic for small scope counts, e.g. `resolveSessionSize(0.25, 2) === resolveSessionSize(0.5, 2) === 1`, letting two distinct pills resolve to the same size. | false | -- | The claim is arithmetically true but `scopedCount` never reaches `2` in this codebase -- verified all six actually-reachable bucket sizes {33, 66, 71, 104, 142, 208} produce four distinct values each across {0.25, 0.5, 0.75, 'all'} (e.g. 33 → 8/17/25/33; 208 → 52/104/156/208). No reachable collision. |
| 10 | Inline comments across `Drill.svelte`/`ScopePicker.svelte`/`App.svelte` inconsistently mix "Story 1.7" and "AD-10" references after the rename pass. | false | -- | Finding itself concedes "harmless" -- no bad outcome named, purely stylistic. |
| 11 | `sampleSessionCards(attempts, scope, sessionSize)`: a `sessionSize <= 0` or `NaN` input yields an empty queue via `Math.min(sessionSize, pool.length)`, and `Drill.svelte`'s `queue[0]!` then feeds an undefined `card` into the template, throwing on mount. | false | -- | Unreachable: the sole caller path is `App.svelte`'s `handleStart` → `resolveSessionSize`, which always returns a positive integer (`'all'` ⇒ a positive `scopedCount`; percent presets ⇒ `Math.round(...)` floored at `Math.max(1, ...)`). Every `Drill.test.ts`/`DrillScopeHarness` call site also supplies a positive integer. No path in this codebase produces `sessionSize <= 0`. |
| 12 | A non-integer `sessionSize` (e.g. `2.5`) makes the draw loop's `i < drawCount` condition run one extra (ceil'd) iteration, breaking the documented `min(sessionSize, candidates.length)` contract. | false | -- | Same reachability argument as #11: `resolveSessionSize`'s only two branches (`scopedCount`, an integer count; `Math.round(...)`) always return integers. No caller in this codebase can produce a fractional `sessionSize`. |
| 13 | Reproduced (via an actual `just check` run) the currentCard() romaji-collision flake, which contradicts this spec's own Acceptance Criteria claim that "the full Vitest suite pass." | -- | rejected | Fix is to edit this build's spec's Acceptance Criteria wording -- explicitly out of scope per the triage rules. The underlying flake itself is real but pre-existing and already logged to deferred-work.md (Implementation Notes); not re-logged here to avoid duplication. |

## Design Notes

AD-13 (amended 2026-09-08) explicitly resolves a tension in the original sprint-change-proposal: §4.2's Story 1.8 diff describes undo as needing to "reinsert the card into the not-yet-attempted queue," but that was written before the architecture pass. AD-13's actual rule text says the opposite — Drill's deferred-advance pattern (grade → toast → queue only advances on explicit "Next character") already means the queue pointer never passes the undone card while Undo is reachable, so there is nothing to reinsert. Follow the ratified architecture doc, not the informal proposal language.

The weighted-without-replacement sampler reuses `selectNext`'s existing cumulative-weight single-draw walk as its inner primitive (AD-10 says explicitly not to invent a new algorithm) — extract that walk into a helper taking a shrinking candidate pool, call it `min(sessionSize, candidates.length)` times, each time removing the drawn card and recomputing total weight, then uniform-shuffle the accumulated result before returning.

## Verification

**Commands:**
- `just check` -- expected: lint, `tsc --noEmit` + `svelte-check`, and the full Vitest suite all pass, 0 errors.
- `grep -rn "selectNext\|isScopeComplete" src/` -- expected: no matches.
