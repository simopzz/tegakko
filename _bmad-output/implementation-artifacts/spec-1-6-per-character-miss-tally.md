---
title: 'Per-Character Miss Tally'
type: 'feature'
created: '2026-09-06'
status: 'done'
route: 'dispatch'
baseline_commit: '5d965021e58dca7d6c5a604c37d77b26e11b6112'
review_loop_iteration: 0
context: [
  '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md',
]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app has no persistent record of which kana a learner keeps missing — every self-graded "incorrect" is lost the instant the next prompt appears, leaving Story 1.7's weak-spot selection and Story 1.8's undo with no `missCount` to read or decrement.

**Approach:** Add an `idb`-backed `tallies` store and `IdbTallyRepository` (`getAll`/`increment`/`decrement`, atomic via one transaction), and wire `Drill.svelte` to call `increment(cardId)` on every self-graded Missed — never on Correct. `decrement` is implemented per AD-9 but stays uncalled until Story 1.8.

## Boundaries & Constraints

**Always:** `Tally` carries exactly two fields, `cardId` and `missCount`. `increment`/`decrement` run atomically (one transaction, no separate get-then-put race). `decrement` clamps at zero. IndexedDB failures resolve as `Result<T>`, never a raw `DOMException`. `settings`/`attempts`/`tallies` share one `tegakko` database at one version (`openTegakkoDb()`); `DB_VERSION` must bump for existing installs to grow the new store.

**Never:** No UI surfaces the tally — Story 1.8 owns the toast, Story 1.7 the shaky badge. No `selectNext`/weighting logic (Story 1.7). Do not block advancing on the tally write completing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First miss | No prior tally, graded Missed | `{cardId, missCount: 1}` created | N/A |
| Repeat miss | Existing tally, graded Missed again | `missCount` +1 | N/A |
| Correct grade | Existing or absent tally, graded Correct | Tally unchanged | N/A |
| Decrement below zero | `missCount: 0` or absent, `decrement(cardId)` | Stays `0` / stays absent, no fabricated record | N/A |
| Reload | App reloads, then `getAll()` | Same miss counts as before reload | N/A |
| IndexedDB fails | `openDB`/transaction rejects | `{ok: false, error}`; Drill logs via `console.error`, still advances | Never throws past the repository |

</frozen-after-approval>

## Code Map

- `src/domain/tally.ts` (**new**) -- `Tally { cardId: string; missCount: number }`, mirrors `domain/attempt.ts`'s style.
- `src/ports/tally-repository.ts` (**new**) -- `TallyRepository { getAll, increment(cardId), decrement(cardId) }`, `Result`-wrapped like `ports/attempt-repository.ts`.
- `src/adapters/persistence/db.ts` -- add `TALLIES_STORE = 'tallies'`; add `tallies: { key: string; value: Tally }` (keyPath `cardId`) to `TegakkoDb`; bump `DB_VERSION` `2` -> `3` (`upgrade()` only re-fires past the stored version, same reasoning as the prior `1`->`2` bump); guard creation with `objectStoreNames.contains`, like the other two stores.
- `src/adapters/persistence/tally-repository.ts` (**new**) -- `IdbTallyRepository`, same open/try/catch/finally shape as `IdbAttemptRepository`. `increment`/`decrement` run inside one `db.transaction(TALLIES_STORE, 'readwrite')` (`get` -> compute -> `put` -> `tx.done`) so concurrent calls can't race and lose an update. `increment`: `(current?.missCount ?? 0) + 1`. `decrement`: no-op when no record exists; otherwise `Math.max(0, current.missCount - 1)`. `getAll()` mirrors `listAll()`.
- `src/adapters/ui/Drill.svelte` -- new `tallyRepository: TallyRepository` prop. In `handleGrade`, when `grade === 'incorrect'`, fire `void tallyRepository.increment(card.cardId).then(...)` (log `!result.ok`, same never-awaited pattern as `attemptRepository.add`); Correct never calls it.
- `src/app/App.svelte` -- instantiate `IdbTallyRepository` beside `attemptRepository`; pass into `<Drill>`.
- `src/adapters/persistence/tally-repository.test.ts` (**new**) -- round-trip (create, repeat-increment, `getAll` survives a fresh instance) + clamp-at-zero + one `vi.doMock('idb', ...)` failure test per method, mirroring `attempt-repository.test.ts`.
- `src/adapters/ui/Drill.test.ts` -- add `fakeTallyRepository()` (mirrors `fakeAttemptRepository`) to `renderDrill`'s defaults; assert Missed calls `increment(cardId)` once, Correct never calls it.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/tally.ts` -- add `Tally`.
- [x] `src/ports/tally-repository.ts` -- `TallyRepository` port.
- [x] `src/adapters/persistence/db.ts` -- add `tallies` store, bump `DB_VERSION` to `3`.
- [x] `src/adapters/persistence/tally-repository.ts` -- `IdbTallyRepository` against the shared `tallies` store.
- [x] `src/adapters/persistence/tally-repository.test.ts` -- round-trip, clamp-at-zero, migration, and failure-path coverage.
- [x] `src/adapters/ui/Drill.svelte` -- call `increment` on every Missed grade.
- [x] `src/adapters/ui/Drill.test.ts` -- update fakes; assert increment-on-Missed / no-increment-on-Correct.
- [x] `src/app/App.svelte` -- wire `IdbTallyRepository` into `<Drill>`.

**Acceptance Criteria:**
- Given a pre-existing v2 (`settings`+`attempts`) database, when the app boots, then the v2->v3 upgrade creates `tallies` with no `VersionError`.
- Given a card is graded Missed, when no prior tally exists, then `{cardId, missCount: 1}` is created before the next prompt is selected.
- Given a card already has a tally, when graded Missed again, then `missCount` increments by exactly one; Correct never touches it.
- Given `increment()` rejects or resolves `{ok: false}`, when Missed is submitted, then Drill still advances and logs via `console.error`.

## Implementation Notes

- `src/adapters/persistence/db.ts`: `tallies` added as a third store in the shared `TegakkoDb` schema (`keyPath: 'cardId'`, out-of-band from `settings`'s out-of-line key and `attempts`'s `id`-keyed store). `DB_VERSION` bumped `2` -> `3`; `upgrade()` guards `tallies`' creation with `objectStoreNames.contains` exactly like the other two stores, so a pre-existing v2 (settings+attempts) database grows `tallies` on next boot with no `VersionError`.
- `src/adapters/persistence/tally-repository.ts`: `increment`/`decrement` each open one `db.transaction(TALLIES_STORE, 'readwrite')` and do `get` -> compute -> `put` -> `await tx.done` inside it, so two calls racing on the same `cardId` can't interleave a get-then-put and lose an update (`idb`'s transaction serializes the store access). `decrement` reads first and only `put`s when a record already exists -- no fabricated `{cardId, missCount: 0}` row is ever created for a card that was never missed.
- `src/adapters/ui/Drill.svelte`: `tallyRepository.increment(card.cardId)` is fired only inside `if (grade === 'incorrect')`, using `card.cardId` captured *before* `handleGrade` reassigns `card` to the next prompt. Same never-awaited `.then()` + `console.error`-on-`!result.ok` pattern as the existing `attemptRepository.add()` call, so a slow or failing tally write can never block advancing.
- `src/app/App.svelte`: `IdbTallyRepository` instantiated once beside `attemptRepository`/`settingsRepository` in the composition root and passed as `tallyRepository` into `<Drill>`.
- `src/adapters/persistence/tally-repository.test.ts`: round-trip (first increment creates `missCount: 1`, repeat increments accumulate, a fresh repository instance's `getAll()` sees prior writes, multiple cards tally independently), clamp-at-zero (decrement on a nonexistent tally stays absent -- not a fabricated zero record; decrement never goes below `0`), a v2->v3 migration test (pre-creates a raw v2 `settings`+`attempts` database, asserts `increment()` against it still succeeds), and one `vi.doMock('idb', ...)` failure test per method (`getAll`/`increment`/`decrement`), mirroring `attempt-repository.test.ts`'s persist-failure suite.
- `src/adapters/ui/Drill.test.ts`: added `fakeTallyRepository()` (mirrors `fakeAttemptRepository`, recording `increment`/`decrement` calls and taking an injectable `Result` for the failure-path test) and wired it into `renderDrill`'s defaults. Added three tests: Missed calls `increment(cardId)` exactly once, Correct never calls it, and a failed/rejected-as-`{ok:false}` `increment()` still advances the screen and logs via `console.error` (mirrors the existing `attemptRepository` failure test).
- `just check` (lint, `tsc --noEmit` + `svelte-check`, full Vitest suite) passes: 15 test files, 169 tests, 0 lint/typecheck errors.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `db.ts`'s module header comment (lines 1-8) still says "`settings` and `attempts` are one `tegakko` database" and never mentions the new third store, `tallies` | low | patch | Confirmed: this diff rewrote only the per-version inline comment above `DB_VERSION`, not the header comment above it, which predates `tallies`. Fixed: header comment updated to name all three stores. |
| 2 | No test drives two concurrent `increment(cardId)` calls (e.g. via `Promise.all`) to prove the atomicity claim repeated in the spec's Approach/Boundaries/code comments | low | rejected | Real gap, but not a live defect: IndexedDB serializes readwrite transactions with overlapping scope regardless of which connection opened them, so the existing get-then-put-in-one-transaction shape is provably race-free even under concurrent calls. A `Promise.all` test would add real setup to prove something the platform already guarantees, for a single-user local app where two simultaneous grades on the same card are not a realistic user action anyway. |
| 3 | The I/O matrix's "`openDB`/transaction rejects" row is only tested via `openDB()` rejecting; no test simulates a failure inside an already-open transaction (e.g. `store.put` throwing after `store.get` succeeds) | low | rejected | The existing failure test already proves the entire method body -- transaction included -- is wrapped in try/catch and resolves as `Result`; a mid-transaction failure would hit the identical catch path, so a second mock would re-prove the same code path for no new information. |
| 4 | `increment()` has no doc comment describing its create-or-+1 behavior, asymmetric with `decrement()` in the same interface | low | patch | Confirmed: `ports/tally-repository.ts`'s `decrement` carries a doc comment, `increment` does not. Fixed: added a matching doc comment. |
| 5 | `getAll()` has no "order not guaranteed" doc comment, unlike the `AttemptRepository` methods this port says it mirrors | low | patch | Confirmed: `ports/attempt-repository.ts`'s `listAll`/`listBySession` both carry this warning; `tally-repository.ts`'s `getAll()` doesn't, and a future consumer (1.7's shaky badge) could wrongly assume a stable order. Fixed: added the same warning. |
| 6 | `tally-repository.test.ts`'s `resetDb()` hardcodes the literal `'tegakko'` instead of the already-imported `DB_NAME` constant | low | patch | Confirmed: the file imports `DB_NAME` (used in the migration test) but `resetDb()` uses a literal string. Fixed: use `DB_NAME`. |
| 7 | The `Drill.test.ts` tally-failure test only asserts `console.error` was called generically, never checking it logged the tally-specific message | low | patch | Confirmed: `expect(consoleError).toHaveBeenCalled()` has no argument check, so it would silently pass even if the wrong message (or the attempt-repository's message) were logged instead. Fixed: assert the call included `'Failed to increment tally:'`. |
| 8 | No integration-level test proves the I/O matrix's "Correct grade -> tally unchanged" row against real storage; today it's only checked via the fake's `increment` never being called | low | rejected | The existing Drill-level assertion (guard branch) and `tally-repository.test.ts`'s own direct-storage round-trip tests already jointly cover both ends of this row (branch taken/not-taken, and storage behavior when it is). A combined real-IndexedDB-plus-Drill integration test would re-prove already-proven facts for meaningfully more setup. |
| 9 | `DB_VERSION`'s bump (now reachable via the new `tally-repository.ts` consumer too) has no `blocked` handler on `openDB` -- a stale connection held open in another tab can hang the upgrade, and every persistence call, indefinitely | medium | defer | Confirmed: `openTegakkoDb()` defines only `upgrade()`, no `blocked` handler -- identical to the pre-existing 1->2 bump this replicates. Not introduced by this story and not tally-specific: it affects `settings`/`attempts`/`tallies` equally, so the fix belongs in `db.ts` for all three at once, not in this diff. |
| 10 | The spec's AC wording "`missCount` increments... before the next prompt is selected" reads as if the tally write is sequenced/blocking, but `Drill.svelte` fires `increment()` without awaiting it | false | rejected | The phrase is inherited verbatim from `epics.md` and, read alongside this same spec's own Boundaries ("Do not block advancing on the tally write completing") and the identical, already-accepted fire-and-forget pattern `attemptRepository.add()` established in Story 1.5, describes the write taking effect within that grade cycle, not synchronous blocking -- the code is correct as written. Any fix here would only be spec wording, which is out of scope for a code loopback. |

## Verification

**Commands:**
- `just check` -- expected: lint, typecheck, and the full Vitest suite (including the new `tally-repository.test.ts` and updated `Drill.test.ts`) all pass.

**Manual checks (if no CLI):**
- In a browser, grade a card Missed twice and once Correct, reload, and inspect IndexedDB devtools to confirm the `tallies` store holds `{cardId, missCount: 2}` for that card and no record changed on the Correct grade.
