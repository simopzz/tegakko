---
title: 'Undo Last Grade'
type: 'feature'
created: '2026-09-07'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: 'dad378d4de72090782420bb76fb9e09d693a72aa'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Grading is immediate and irreversible — a mis-tap or hasty grade permanently records the attempt and bumps the tally with no way back. The Drill screen has no toast/undo affordance at all yet (`Drill.svelte:193`: "No toast is shown (Story 1.8 owns that)").

**Approach:** Add a domain `undoLastGrade(sessionId, cardId, wasIncorrect, attemptRepository, tallyRepository)` that atomically sequences `AttemptRepository.deleteLast()` then a conditional `TallyRepository.decrement()`. Defer Drill's post-grade advance (the `selectNext`/clear/reset step) behind a new "graded" state showing a toast (Undo, plus the new tally on a Missed grade) until the user taps Undo or "Next character".

## Boundaries & Constraints

**Always:**
- `undoLastGrade` lives in `src/domain/drill.ts` beside `selectNext`: pure orchestration over injected port interfaces (`import type` only, no runtime adapter coupling), matching AD-13's framing of it as one atomic domain operation.
- Grading still builds the `Attempt`, pushes it to `sessionAttempts`, and fires `attemptRepository.add()`/`tallyRepository.increment()` exactly as today — but no longer clears ink, resets `revealed`/`strokes`, or calls `selectNext`. That advance moves into a new `handleNext`, run only when "Next character" is tapped.
- Undo awaits the same grade's `add()`/`increment()` promises before calling `deleteLast`/`decrement`, so it can never race the write it's meant to reverse.
- Undo pops the just-pushed attempt off `sessionAttempts` and, for an `'incorrect'` grade, decrements the local tally-display map — both unconditionally, regardless of the repository calls' outcome.
- Missed/Correct/Reveal are disabled while the toast is showing. The toast always offers Undo; it shows the new cumulative miss tally only when the grade was `'incorrect'`.
- `tallies` loads once via `tallyRepository.getAll()` at drill entry (mirrors `attempts`, fails open to `[]`) and passes into `Drill` alongside `attempts`; Drill tracks it in-memory the same way it tracks `sessionAttempts`, never re-fetching mid-session.

**Ask First:** none — pinned by the epic's frozen ACs and AD-13.

**Never:** a general-purpose history undo (only the just-graded attempt is ever reversible); a new `InkSurface` port method to restore ink (unnecessary once clearing is deferred to "Next character"); persisting a `Session` entity (Story 1.9's territory).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|-----------------------------|-----------------|
| Undo after Missed | Toast showing, grade was `'incorrect'` | `deleteLast()` + `decrement(cardId)` both run; attempt removed from `sessionAttempts`; tally-display decremented; ink/strokes/revealed untouched | Logged, never blocks return to written state |
| Undo after Correct | Toast showing, grade was `'correct'` | `deleteLast()` only, no `decrement`; attempt removed from `sessionAttempts` | Same |
| "Next character" tapped | Toast showing | Toast clears; `selectNext(sessionAttempts, scope)` draws the next card; ink/strokes/revealed reset; position advances; Undo no longer available | N/A |
| Undo races a slow `add()` | Grade fires, Undo tapped before `add()`/`increment()` resolve | Undo awaits the pending promises first, then calls `deleteLast`/`decrement` | Never races the store it's undoing |
| `deleteLast`/`decrement` fails | Rejected promise or `{ok:false}` | Logged via `console.error`; toast still clears and Drill still returns to the written state | Silent fallback, mirrors existing persistence-failure handling |
| `tallyRepository.getAll()` fails at drill entry | `Result.ok === false` or rejects | Falls back to `tallies: []`; toast still computes a correct count from that empty baseline | Silent fallback, mirrors `listAll()`'s existing fallback |

</frozen-after-approval>

## Code Map

- `src/domain/drill.ts` -- add `undoLastGrade(sessionId: string, cardId: string, wasIncorrect: boolean, attemptRepository: AttemptRepository, tallyRepository: TallyRepository): Promise<Result<void>>`: `await attemptRepository.deleteLast(sessionId)`, return early on `!ok`; else if `wasIncorrect`, `return tallyRepository.decrement(cardId)`; else `return ok(undefined)`. Import the two port interfaces (`import type`) and `ok`/`Result` from `./result`.
- `src/domain/drill.test.ts` -- new `undoLastGrade` suite: deletes+decrements on an incorrect grade; deletes only on correct; propagates a `deleteLast` failure without calling `decrement`; propagates a `decrement` failure.
- `src/adapters/ui/Drill.svelte` -- add `tallies: Tally[]` prop; `const cardTallies = new Map(untrack(() => tallies.map((t) => [t.cardId, t.missCount])));` (plain, mirrors `sessionAttempts` at `:66`). Add `let graded = $state<{ cardId: string; grade: SelfGrade; tallyCount: number | null } | null>(null);` and plain `pendingAttemptWrite`/`pendingTallyWrite: Promise<Result<void>> | undefined`. In `handleGrade` (`:145-204`): keep building/pushing `attempt` and firing `add()`/`increment()` (capture each call's promise into the pending vars), but replace the final advance block (`:196-203`) with setting `graded` from the attempt just built (`tallyCount` from `cardTallies` when incorrect, else `null`). Add `handleNext()` containing exactly that removed advance block plus `graded = null` and clearing the pending vars. Add `async function handleUndo()`: await `pendingAttemptWrite`/`pendingTallyWrite` (swallowing rejection), `sessionAttempts.pop()`, decrement `cardTallies` when the grade was incorrect, call `undoLastGrade(...)`, `console.error` on failure, then clear `graded` and the pending vars. Disable the three grade buttons (`:271-300`) while `graded` is set (extend the existing `btn--dimmed`/`disabled` pattern). Render a toast when `graded` is set: Undo button (`onclick={handleUndo}`), the tally text when `graded.tallyCount !== null`, and a "Next character" button (`onclick={handleNext}`, reusing `.btn`/`.btn--primary`).
- `src/adapters/ui/Drill.test.ts` (large rewrite) -- `renderDrill`'s overrides gain `tallies?: Tally[]` (default `[]`), passed through to `render(Drill, {...})`. Delete the "shows no post-grade toast or Undo" test (`:318-327`; that invariant is superseded). Add `nextCharacter()`/`undo()` helpers mirroring `grade()` (`:138-140`). Every existing test that grades and then asserts next-prompt/position/state now inserts `await fireEvent.click(nextCharacter())` between grading and that assertion. New tests per the I/O matrix: Undo after Missed restores the tally/attempt list and re-enables grade buttons without clearing ink; Undo after Correct skips `decrements`; the toast shows a tally only on Missed; grade buttons stay disabled while the toast is showing.
- `src/app/App.svelte` -- add `let drillTallies = $state<Tally[]>([]);`. In `handleStart` (`:75-101`), alongside the existing `attemptRepository.listAll()` fetch, fetch `tallyRepository.getAll()` the same fail-open way and assign `drillTallies`. Pass `tallies={drillTallies}` into `<Drill>` (`:139-147`).
- `src/app/App.test.ts` -- no expected changes: happy-dom's `IdbTallyRepository.getAll()` fails closed the same way `listAll()` already does, so `drillTallies` falls back to `[]`. Re-run to confirm.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/drill.ts` -- add `undoLastGrade`.
- [x] `src/domain/drill.test.ts` -- new suite for `undoLastGrade`.
- [x] `src/adapters/ui/Drill.svelte` -- add `graded` state, toast, `handleNext`/`handleUndo`, `tallies` prop.
- [x] `src/adapters/ui/Drill.test.ts` -- rewrite fixtures/assertions for the deferred-advance flow.
- [x] `src/app/App.svelte` -- load `drillTallies`, wire `tallies` prop into `<Drill>`.
- [x] `src/app/App.test.ts` -- re-run to confirm no regressions.

**Acceptance Criteria:**
- Given a grade was just submitted, when the user taps Undo, then `undoLastGrade(sessionId, ...)` runs, deleting the last attempt and — only if the grade was incorrect — decrementing the tally, both visible immediately and removed from `sessionAttempts`.
- Given the toast is showing, when the user taps "Next character" instead of Undo, then Undo is no longer available and the drill advances exactly as grading used to advance immediately.
- Given a Missed grade, when the toast appears, then it shows the new cumulative tally and Undo; given a Correct grade, then it shows Undo without a tally readout.
- Given the toast is showing, then Missed/Correct/Reveal stay disabled until Undo or "Next character" resolves.

## Spec Change Log

## Design Notes

- **Why grading no longer clears ink at grade time:** deferring the clear/reset to "Next character" means Undo needs no restore mechanism — the cell already shows exactly what it did pre-grade, so the `InkSurface` port needs no new replay/render method.
- **Why `pendingAttemptWrite`/`pendingTallyWrite`:** `add()`/`increment()` are deliberately fire-and-forget so grading doesn't block the toast; without awaiting them first, a fast Undo could call `deleteLast`/`decrement` before the record they're meant to remove even exists.
- **Why `tallies` loads once via a prop, like `attempts`:** mirrors Story 1.7's `sessionAttempts` precedent — the toast needs the pre-increment count without a new port method or a mid-session re-fetch.

## Verification

**Commands:**
- `just check` -- lint, typecheck (`tsc --noEmit` + `svelte-check`), full Vitest suite all pass.

## Suggested Review Order

**Domain: reversing a grade**

- Entry point: atomically sequences `deleteLast` then a conditional `decrement`.
  [`drill.ts:115`](../../src/domain/drill.ts#L115)

**Drill wiring: deferred-advance state machine**

- Grading no longer advances immediately -- it sets `graded` and a toast gates the next step.
  [`Drill.svelte:189`](../../src/adapters/ui/Drill.svelte#L189)
- Review-loop patch: the tally is committed here, not just computed, so a second same-session miss counts correctly.
  [`Drill.svelte:254`](../../src/adapters/ui/Drill.svelte#L254)
- The advance block moves here, run only when "Next character" is tapped.
  [`Drill.svelte:263`](../../src/adapters/ui/Drill.svelte#L263)
- Review-loop patch: re-entrancy guard, then only reverses what the store actually persisted (skips `deleteLast`/`decrement` over a write that never landed).
  [`Drill.svelte:281`](../../src/adapters/ui/Drill.svelte#L281)

**Accessibility: toast focus and busy state**

- Review-loop patch: focus moves to Undo when the toast appears, mirroring Reveal's existing focus pattern.
  [`Drill.svelte:260`](../../src/adapters/ui/Drill.svelte#L260)
- Review-loop patch: Undo/Next character disabled while a reversal is in flight, closing the double-tap race.
  [`Drill.svelte:453`](../../src/adapters/ui/Drill.svelte#L453)

**Composition root: tallies wiring**

- Tallies load once at drill entry, mirroring the existing `attempts` fail-open pattern.
  [`App.svelte:101`](../../src/app/App.svelte#L101)
- Wired into `<Drill>` alongside `attempts`.
  [`App.svelte:155`](../../src/app/App.svelte#L155)

**Tests**

- `undoLastGrade`'s delete/decrement/failure-propagation suite.
  [`drill.test.ts:222`](../../src/domain/drill.test.ts#L222)
- Undo/toast suite: the I/O matrix plus the review-loop's regression tests (double-tap, repeat-miss count, failed-write skip).
  [`Drill.test.ts:827`](../../src/adapters/ui/Drill.test.ts#L827)
