---
title: 'Extract Drill.svelte session/grade/idle bookkeeping into a plain-TS controller'
type: 'refactor'
created: '2026-09-23'
status: 'done'
baseline_commit: 'a197521e24a146b9c70c46ef501dfbe67db3ab4b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `Drill.svelte` (1005 lines, ~510 of script) holds ~10 responsibilities; Epic 1 retro action item 2 (`epic-1-retro-09-10-2026.md` F3) requires extracting its queue/idle/grade logic before Epic 2 piles export/import onto it.

**Approach:** Move all non-rendering session bookkeeping — sampled queue, idle detection, closure, grade/undo persistence and in-memory mirrors — into a framework-free `DrillSession` class in `src/adapters/ui/drill-session.ts`, unit-tested directly. `Drill.svelte` keeps only render state, focus management, ink-surface wiring and markup, delegating to one `DrillSession` instance. Pure refactor: zero user-visible or persisted-data change.

## Boundaries & Constraints

**Always:**
- `Drill.test.ts` passes **unmodified** — it is the behavior-preservation oracle.
- `Drill.svelte`'s `Props` interface and `App.svelte` stay unchanged.
- Preserve exact `console.error` messages (`'Failed to persist attempt:'`, `'Failed to increment tally:'`, `'Failed to undo grade:'`, `'Failed to persist session:'`) and the microtask depth of every fire-and-forget write (`.then(...).catch(...)` attached directly to the repository promise — tests flush with a single `await Promise.resolve()`).
- Keep every existing invariant and its guard: `closed` closes exactly once; `recordInteraction`/`checkIdleOnResume`/explicit close are all dropped while an undo is in flight; undo awaits pending writes and only calls `undoLastGrade` when `add()` resolved `ok`, passing `wasIncorrect` only when `increment()` resolved `ok`; in-memory mirrors are reversed unconditionally; idle closure backdates to `lastInteractionAt`; `timeMs` clamps at 0; `sampleSessionCards` is called exactly once per drill entry.
- `$state.snapshot(scope)` happens in the component (runes are unavailable in plain `.ts`); `DrillSession` receives plain data.
- Carry over the load-bearing rationale comments (AD/Story references) to wherever the code lands; don't duplicate them in both places.

**Never:**
- No `.svelte.ts`/runes inside `drill-session.ts`; no Svelte import there.
- No behavior fixes folded in (DW-21/22/23/31 stay open as-is); no CSS or markup changes.
- No new domain functions or port changes; no sibling-adapter imports (AD-1).

</frozen-after-approval>

## Code Map

- `src/adapters/ui/Drill.svelte:71-510` -- script to slim. Moves out: `sessionId`, `sessionStartedAt`, `lastInteractionAt`, `closed`, `thisSessionAttempts`, `cardTallies`, `queue` sampling, `pendingAttemptWrite`/`pendingTallyWrite`, attempt construction + timing math in `handleGrade`, write/log chains, `handleUndo`'s await/reverse body, `closeSession`, idle checks. Stays: `queueIndex`/`position`/`card`/`hasInk`/`revealed`/`graded`/`undoing` `$state`, `strokes`/`promptShownAt`/`firstStrokeStartedAt` (per-prompt ink bookkeeping, may alternatively move — implementer's call), `cell`/`missedButton`/`undoButton` focus refs, `onMount` ink + `visibilitychange`/`focus` listeners, markup, styles.
- `src/domain/session.ts` -- `isSessionIdle`, `buildSummary`, `buildSessionRecord`: reuse, don't change.
- `src/domain/drill.ts` -- `sampleSessionCards`, `undoLastGrade`: reuse, don't change.
- `src/ports/{attempt,tally,session}-repository.ts` -- constructor dependencies.
- `src/adapters/ui/Drill.test.ts` -- fakes (`fakeAttemptRepository` etc.) worth mirroring in the new unit test; must not be edited.

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/ui/drill-session.ts` -- create `DrillSession` class. Constructor takes `{ scope, sessionSize, attempts, tallies, idleTimeoutMs, attemptRepository, tallyRepository, sessionRepository, onClose }`; exposes `queue: readonly Card[]`, `recordInteraction(): boolean`, `checkIdleOnResume(): void`, `closeExplicit(): void`, `isLastCard(index): boolean` / full-scope close, `recordGrade({ card, grade, strokes, revealed, promptShownAt, firstStrokeStartedAt }): number | null` (returns toast tally count), `undoLastGrade(): Promise<void>` (owns the authoritative in-flight flag + re-entrancy guard), and a reset of pending writes on advance. Factor the three duplicated write/log chains and the two catch-to-`Result` blocks into small private helpers. -- one testable home for all non-rendering drill logic.
- [x] `src/adapters/ui/drill-session.test.ts` -- unit-test the I/O matrix below with in-memory fake repos and `vi.useFakeTimers()`. -- covers logic at unit level instead of only via DOM.
- [x] `src/adapters/ui/Drill.svelte` -- construct one `DrillSession` (inside `untrack`, with `$state.snapshot(scope)`), delegate every handler; keep the `undoing` `$state` as a render-only mirror set synchronously around the awaited `undoLastGrade()`. -- caps the component's growth.

**Acceptance Criteria:**
- Given the refactor, when `just check` runs, then lint, typecheck and all tests pass, including `Drill.test.ts` byte-identical to `main`.
- Given the new `Drill.svelte`, when its script is inspected, then it contains no direct `attemptRepository`/`tallyRepository`/`sessionRepository` method calls and no imports of `isSessionIdle`/`buildSummary`/`buildSessionRecord`/`undoLastGrade`/`sampleSessionCards`, and its `<script>` block is at most ~260 lines.
- Given `just build`, when it runs, then it succeeds.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Idle interaction | `recordInteraction()` after `idleTimeoutMs` | returns `false`, `onClose` once with `closureReason: 'inactivity'`, record date backdated | N/A |
| Busy/closed guard | `recordInteraction()` / `checkIdleOnResume()` / `closeExplicit()` while undo in flight or after close | no-op, no second `onClose` | N/A |
| Missed grade | `recordGrade` incorrect, card tally 2 | returns 3; `add` + `increment` fired | failure logged, never thrown |
| Undo after failed add | `add` resolved `{ok:false}` | mirrors reversed; `deleteLast` not called | N/A |
| Undo, failed increment | `add` ok, `increment` rejected | `undoLastGrade` called with `wasIncorrect=false` | `'Failed to undo grade:'` logged if it fails |
| Double undo | two concurrent `undoLastGrade()` | second is a no-op | N/A |
| Full scope | close on last card | `onClose` with `'full-scope'`, summary counts only this session's attempts | session write failure logged |

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Route / evidence |
|---|---|---|---|---|
| 1 | verification-gap | No verification gaps | — | Drill.test.ts (unchanged) exercises every moved behavior; DrillScopeHarness test asserts `structuredClone(record)` with a proxied scope. |
| 2 | verification-gap (other) | Undo after failed add + successful increment never reverses the persisted tally | medium | defer — pre-existing: original `handleUndo` had the same `attemptWriteResult?.ok` gate; logged to deferred-work.md. |
| 3 | edge-case | `deleteLast`/`decrement` rejection inside domain undo leaves `lastGrade` set; retry double-pops mirrors | low | reject — pre-existing identical behavior (original threw before `graded = null`); repos resolve `Result` by convention, rejection needs an adapter bug; fix adds branches. |
| 4 | edge-case | `handleUndo` has try/finally, no catch → unhandled rejection | low | reject — same root and reachability as #3, unchanged from original. |
| 5 | edge-case + blind | `closeFullScope`/`recordGrade` don't self-guard `closed`/`undoing` | low | reject — only caller gates each via `recordInteraction()` (false while closed/undoing) and Next/grade buttons are disabled then; fix adds guards for an undemonstrated path. |
| 6 | blind | Queue owned by session, index owned by component | low | reject — design split sanctioned by spec (`queueIndex` stays render state); no named divergence. |
| 7 | blind | `advance()` misnamed | low | patch — renamed `clearUndoable()`. |
| 8 | blind | Unit test grades twice without advance | low | patch — test now clears between grades. |
| 9 | blind | Component `undoing` called "render-only" yet guards | low | patch — comment corrected. |
| 10 | blind | `close()` ignores `closedAt` except inactivity | low | patch — default param, special case removed. |
| 11 | blind | `cardTallies` comment "mirrors thisSessionAttempts" is false | low | patch — reworded. |
| 12 | blind | `logOnFailure` microtask claim wrong for rejections | low | patch — comment corrected; exact-timing tests kept deliberately (spec requires preserving microtask depth). |
| 13 | blind | recordGrade timing/ink fields untested | false | Drill.test.ts:604-740 assert `timeToFirstStrokeMs`, `totalTimeMs`, `revealUsed`, `strokes`/`strokeCount` through the component. |
| 14 | blind | No test for undoing a Correct grade | low | patch — unit test added. |
| 15 | blind | `$state.snapshot` fix untested | false | Drill.test.ts DrillScopeHarness case (~1173) drives a proxied scope and asserts `structuredClone(record)`. |
| 16 | blind | `vi.spyOn` on ESM namespace is fragile | low | reject — works under the project's configured happy-dom/Vite transform; rewrite adds test surface. |
| 17 | blind | Unseeded random sampling in tests | low | reject — assertions are card-agnostic; no flakiness demonstrated. |
| 18 | blind | Component lost guard rationale on `handleExplicitClose`/`checkIdleOnResume` | low | patch — pointer comments added. |
| 19 | blind | Spec/sprint artifacts not in diff | false | Diff was scoped to `src/`; the spec and retro bookkeeping are committed at finalize. |

## Design Notes

Why `adapters/ui` and not `domain`: the class owns `crypto.randomUUID()`, `console.error` fire-and-forget logging and repository orchestration — UI-adapter concerns per the spine's Deferred note ("a UI-adapter-owned timer calling domain's closure logic"). Pure pieces it calls already live in `domain/`.

Why a plain class, not a `.svelte.ts` rune store: none of the moved state renders; keeping it rune-free makes it testable without mounting and keeps reactivity (and the `untrack`/`state_referenced_locally` subtleties) confined to the component.

## Verification

**Commands:**
- `just check` -- expected: all green; `git diff main -- src/adapters/ui/Drill.test.ts` empty.
- `just build` -- expected: succeeds.
- `wc -l src/adapters/ui/Drill.svelte` -- expected: well below 1005.
