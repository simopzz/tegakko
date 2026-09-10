---
title: 'Replace the duplicated resetDb() onblocked=>resolve() pattern in persistence tests with a shared, retrying helper'
type: 'chore'
created: '2026-09-10'
status: 'done'
baseline_revision: 'b90cbec7ade3036b3174418507827f00c7cb6b67'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      db.test.ts's own local resetDb() still resolves on onblocked instead of
      retrying/rejecting, the exact bug this bundle fixes in the other four
      persistence test files.
    evidence: |-
      grep -rn "onblocked" src/ shows exactly one remaining occurrence of the
      old `req.onblocked = () => resolve()` pattern: db.test.ts:11. Three
      independent review layers (Blind Hunter, Verification Gap Reviewer,
      Intent Alignment Auditor) converged on this. Out of this bundle's
      authority to fix: the verbatim intent enumerates exactly four files
      (attempt/settings/tally/session-repository.test.ts) and never names
      db.test.ts, so it is excluded by the intent itself, not just by this
      spec's scope section.
    location: >-
      src/adapters/persistence/db.test.ts:6-13
    severity: medium
  - summary: >-
      A persistent block causes resetDb() to reject after exhausting
      retries, but the original deleteDatabase request it gave up on keeps
      running in the background; a later resetDb() call for the same
      database queues behind it and hangs for the full test timeout instead
      of getting its own bounded rejection.
    evidence: |-
      Reproduced directly: a first resetDb() call against a permanently
      open competing connection rejects at ~102ms as designed, but a second
      resetDb() call issued afterward (simulating the next test's
      beforeEach) times out at 20000ms, queued behind the still-pending
      first request. Reproduced the identical hang against the pre-existing
      onblocked => resolve() pattern this bundle replaces (first call
      falsely resolves at 0ms, second call still times out at 20000ms) --
      this is an inherent property of IndexedDB's per-database-name delete
      queue, not something this change introduces or something any
      resetDb() retry strategy can route around from the calling side.
      Fixing it for real would need a different test-isolation strategy
      (e.g. per-test database names), well beyond this bundle's scope.
    location: >-
      src/adapters/persistence/test-reset-db.ts (onblocked handler)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `attempt-repository.test.ts`, `settings-repository.test.ts`, `tally-repository.test.ts`, and `session-repository.test.ts` each define their own byte-for-byte identical `resetDb()` helper, whose `req.onblocked = () => resolve()` treats a blocked `deleteDatabase` as a successful reset. If a connection is ever left open (e.g. a leaked connection from a prior failing test), the next test's `beforeEach` silently "succeeds" without actually deleting the database, letting that test run against stale data instead of surfacing a clear failure.

**Approach:** Extract one shared `resetDb()` into a new test-only module in the same directory, and have its `onblocked` handler retry the delete a bounded number of times (short delay between attempts) instead of resolving; if it is still blocked after all retries, reject with a descriptive error so the block is a loud test failure, not a silent pass. Replace each file's local `resetDb()` definition with an import of the shared one. Test-only -- does not touch `openTegakkoDb()` or any production persistence code (that fix is the separate `indexeddb-blocked-versionchange-guard` bundle, already shipped).

## Boundaries & Constraints

**Always:**
- Keep `resetDb()`'s public contract identical for all four call sites: `(): Promise<void>`, called with no arguments in each file's `beforeEach`.
- Delete the exact same database every caller already deletes today: `DB_NAME` (`'tegakko'`, exported from `./db`) -- import `DB_NAME` in the new helper rather than re-hardcoding the literal.
- On the ordinary path (no block), preserve today's behavior exactly: `onsuccess` resolves, `onerror` rejects with `req.error`.
- On `onblocked`, retry the `deleteDatabase` call (do not resolve); after a bounded number of attempts still blocked, reject with an `Error` describing the stuck state, so a real leak fails the test loudly instead of masking it.
- For the new helper's own tests, simulate a real block the same way `db.test.ts` already does -- open a genuine competing connection via `idb`'s `openDB(DB_NAME, ...)` and close it to unblock -- and use real timers with `vi.waitFor(...)` polling (matching `db.test.ts:81-87`'s existing rationale: fake-indexeddb's async scheduling isn't tied to a fixed tick count). Do not introduce fake timers for this.

**Never:**
- Do not change `openTegakkoDb()` or `src/adapters/persistence/db.ts` -- out of scope (covered by the already-shipped `indexeddb-blocked-versionchange-guard` bundle).
- Do not touch `settings-repository.persist-failure.test.ts` or `db.test.ts` -- neither is one of the four files this bundle targets (the former has no `resetDb()`/`onblocked` pattern at all; the latter's own local `resetDb()` was not named in the DW-19 ledger entry's location list).
- Do not change any of the four test files' assertions, fixtures, or `beforeEach` call sites beyond swapping the local `resetDb()` definition for the shared import.
- Do not add a shared test-setup file that other, unrelated test suites are expected to adopt -- this helper is scoped to the four IndexedDB-backed persistence test files that already share this exact pattern.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No competing connection (today's common case) | `deleteDatabase(DB_NAME)` succeeds immediately | `resetDb()` resolves, no retry/log | No error expected |
| Transient block that clears | A connection is open when `resetDb()` is called; it closes before retries are exhausted | `onblocked` fires at least once (retry logged), then a later attempt succeeds once the connection closes | `resetDb()` resolves; no error |
| Persistent block | A connection is open and never closes for the duration of all retries | Every attempt fires `onblocked`; retries are exhausted | `resetDb()` rejects with a descriptive `Error` (not a silent resolve) |

</intent-contract>

## Code Map

- `src/adapters/persistence/attempt-repository.test.ts:1-14` -- imports `openDB` from `'idb'` (still used at line 137) and `DB_NAME` from `./db` (still used at line 137); local `resetDb()` at lines 8-14 to delete and replace with an import.
- `src/adapters/persistence/settings-repository.test.ts:1-12` -- no `DB_NAME`/`idb` imports today; local `resetDb()` at lines 6-12 to delete and replace with an import.
- `src/adapters/persistence/tally-repository.test.ts:1-14` -- imports `DB_NAME` from `./db` (still used at line 110); local `resetDb()` at lines 8-14 already uses `DB_NAME` (unlike the other three, which hardcode the `'tegakko'` string literal) -- delete and replace with an import, no other changes.
- `src/adapters/persistence/session-repository.test.ts:1-15` -- imports `DB_NAME` from `./db` (still used at line 68); local `resetDb()` at lines 9-15 to delete and replace with an import.
- `src/adapters/persistence/db.ts:16` -- `export const DB_NAME = 'tegakko';`, the constant the new shared helper imports.
- `src/adapters/persistence/db.test.ts:1-13,67-97` -- the pre-existing pattern for testing a real IndexedDB block/unblock with `fake-indexeddb`: open a raw connection via `idb`'s `openDB(...)`, spy on `console.warn`, poll with `vi.waitFor(...)` (real timers, no fixed tick count), then `close()` the raw connection to unblock. The new helper's own tests should follow this same structure. This file's own local `resetDb()` (lines 6-13) is untouched by this bundle (see Boundaries).
- New file `src/adapters/persistence/test-reset-db.ts` -- shared `resetDb()` helper. Named without a `.test.ts` suffix so `vitest.config.ts`'s `include: ['src/**/*.test.ts', '*.test.ts']` does not pick it up as its own (empty) test file.
- New file `src/adapters/persistence/test-reset-db.test.ts` -- unit tests for the new helper's retry/reject behavior (the I/O matrix above), since none of the four call sites' own suites exercise a genuine block in normal runs.

## Tasks & Acceptance

**Execution:**
- `src/adapters/persistence/test-reset-db.ts` (new) -- add a shared `resetDb(): Promise<void>` that deletes `DB_NAME`, resolving on `onsuccess`, rejecting on `onerror`, and retrying (bounded, short delay, logged via `console.warn` per attempt) on `onblocked` before rejecting with a descriptive `Error` if still blocked once retries are exhausted -- closes DW-19.
- `src/adapters/persistence/test-reset-db.test.ts` (new) -- cover all three I/O matrix rows using the `db.test.ts` blocking pattern (see Code Map).
- `src/adapters/persistence/attempt-repository.test.ts` -- remove the local `resetDb()` (lines 8-14) and its now-redundant blank line; add `import { resetDb } from './test-reset-db';`.
- `src/adapters/persistence/settings-repository.test.ts` -- remove the local `resetDb()` (lines 6-12) and its now-redundant blank line; add `import { resetDb } from './test-reset-db';`.
- `src/adapters/persistence/tally-repository.test.ts` -- remove the local `resetDb()` (lines 8-14) and its now-redundant blank line; add `import { resetDb } from './test-reset-db';`.
- `src/adapters/persistence/session-repository.test.ts` -- remove the local `resetDb()` (lines 9-15) and its now-redundant blank line; add `import { resetDb } from './test-reset-db';`.

**Acceptance Criteria:**
- Given no competing connection is open (today's common case, and every test in these four files), when any of the four test files' `beforeEach` calls `resetDb()`, then it resolves exactly as it does today (behavior on the non-blocked path is unchanged) and every existing test in all four files still passes unmodified.

## Design Notes

Bounded retry with a short fixed delay between attempts, using real timers (`setTimeout`, not `vi.useFakeTimers()` -- see Boundaries):

```ts
import { DB_NAME } from './db';

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 20;

export function resetDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    let attemptsLeft = MAX_ATTEMPTS;
    function attempt(): void {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error as DOMException);
      req.onblocked = () => {
        if (attemptsLeft <= 0) {
          reject(new Error(`resetDb(): deleteDatabase("${DB_NAME}") still blocked after ${MAX_ATTEMPTS} attempts`));
          return;
        }
        attemptsLeft -= 1;
        console.warn(`resetDb(): deleteDatabase("${DB_NAME}") blocked, retrying (${attemptsLeft} attempts left)`);
        setTimeout(attempt, RETRY_DELAY_MS);
      };
    }
    attempt();
  });
}
```

`MAX_ATTEMPTS`/`RETRY_DELAY_MS` are deliberately small: `blocked` is not expected to fire at all in normal runs (every repository closes its connection in `finally`, and `openTegakkoDb()`'s `blocking` handler already closes a lingering connection on `versionchange` per the already-shipped guard), so retries only add latency in the genuinely-stuck case this fix targets. The `console.warn` per retry gives the new tests something to poll for with `vi.waitFor(...)` (mirroring `db.test.ts`), and gives a real stuck-test run a breadcrumb before it ultimately fails loudly.

## Spec Change Log

## Review Triage Log

### 2026-09-10 — Review pass
- verdicts: 13 findings — high 0, medium 4, low 8, false 1, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind Hunter: the spec's Design Notes illustrative code re-issues `deleteDatabase()` on every retry, but the shipped `test-reset-db.ts` deliberately keeps the original request alive instead (with an inline comment explaining why re-issuing would silently hang) -- evidence: confirmed by reading both; empirically re-issuing would queue the new call behind the still-pending original per fake-indexeddb's per-name connection queue, so it would never even observe `onblocked` again. Rejected: the only fix is editing this build's spec's Design Notes to match the (correct) shipped mechanism.
  - `[low]` `[patch]` Blind Hunter: the retry/reject messages call each wait cycle an "attempt" (`"still blocked after 5 attempts"`), implying 5 separate `deleteDatabase()` calls were made, when only one request is ever issued and the loop is a bounded wait/poll on its `onblocked` settling -- evidence: read `test-reset-db.ts`'s single `req = indexedDB.deleteDatabase(...)` call versus the per-iteration message text. Applied: reworded the log/error text to describe waiting checks rather than "attempts", and exported the retry-count constant.
  - `[false]` `[reject]` Blind Hunter: claims the spec's single Acceptance Criterion leaves the blocked/retry/reject behavior uncodified -- evidence: disproven -- the I/O & Edge-Case Matrix already codifies exactly those three scenarios (no-block, transient-block, persistent-block) with expected behavior and error handling, and the spec template's own instructions say ACs must not duplicate I/O Matrix scenarios; step-03's Matrix Test Audit already required and verified a passing covering test for every row.
  - `[low]` `[patch]` Blind Hunter: `test-reset-db.test.ts` hardcodes the blocking connection as `openDB(DB_NAME, 1, { upgrade(db) { db.createObjectStore('settings'); } })` instead of the already-exported `DB_VERSION`/`SETTINGS_STORE` constants from `./db`, unlike `db.test.ts`'s own convention -- evidence: read both files' imports and connection setup. Applied: switched to `DB_VERSION` and `SETTINGS_STORE`.
  - `[medium]` `[defer]` Blind Hunter (grouped with Verification Gap Reviewer and Intent Alignment Auditor, same root cause): `db.test.ts`'s own local `resetDb()` (lines 6-13) still has the exact `onblocked = () => resolve()` bug this bundle fixes everywhere else, with no tracked follow-up -- evidence: `grep -rn onblocked src/` shows it as the only surviving instance. Deferred, not fixed: the verbatim intent enumerates exactly four files (and the ledger's own `location:` field lists only three, plus session-repository.test.ts per the bundle prose) -- `db.test.ts` is a fifth file the intent itself never names, so it is out of this story's scope per the "intent itself excludes it" rule. Recorded in `deferred:` below.
  - `[low]` `[defer]` Blind Hunter (grouped with Edge Case Hunter, same root cause): the third test's `finally` closes the blocking connection after asserting rejection but never awaits/asserts the abandoned original `deleteDatabase` request's own eventual `onsuccess`/`onerror` -- evidence: read the test; the request is left to settle in the background with no assertion covering it. Deferred alongside the related Edge Case Hunter finding below (same abandoned-request root cause).
  - `[low]` `[patch]` Blind Hunter: the persistent-block test asserts the literal string `"still blocked after 5 attempts"` instead of referencing the module's retry-count constant, so it would silently stop describing real behavior if that constant is ever tuned -- evidence: read the assertion versus the unexported `MAX_ATTEMPTS`. Applied: exported the constant and interpolated it into the assertion.
  - `[medium]` `[defer]` Edge Case Hunter (grouped with Blind Hunter and Edge Case Hunter's own second finding, same root cause): a persistent block causes `resetDb()` to reject after exhausting retries, but the original `deleteDatabase` request it gave up on keeps running in the background (IndexedDB serializes deletes per database name); empirically verified that a second `resetDb()` call issued afterward (simulating the very next test's `beforeEach`) queues behind that still-pending request and hangs for the full test timeout instead of getting its own bounded rejection -- evidence: reproduced directly against the shipped module (first call rejects at ~102ms, second call times out at 20000ms). Deferred, not fixed: reproduced the identical hang against the pre-existing `onblocked = () => resolve()` pattern too (first call falsely resolves at 0ms, second call still times out at 20000ms) -- this is an inherent property of IndexedDB's per-name delete-queue serialization, not something this change introduces or any `resetDb()` retry strategy can route around from the calling side; pre-existing and out of this story's authority to fix (would require a different test-isolation strategy, e.g. per-test database names). Recorded in `deferred:` below.
  - `[low]` `[reject]` Edge Case Hunter: the spec's Problem statement calls the four files' original `resetDb()` "byte-for-byte identical", but `tally-repository.test.ts`'s used `DB_NAME` while the other three hardcoded the `'tegakko'` literal -- evidence: confirmed via the Code Map's own line-by-line comparison. Rejected: the only fix is editing this build's spec's Problem statement wording; the shipped code is unaffected either way.
  - `[low]` `[reject]` Edge Case Hunter: same root cause as the Blind Hunter Design-Notes finding above -- the intent-contract's Boundaries text says `resetDb()` should "retry the `deleteDatabase` call" but the shipped code deliberately does not re-issue it -- evidence: identical claim, independently reported. Same root cause and reject reason (editing this build's spec is the only fix; the shipped mechanism is the correct one).
  - `[medium]` `[defer]` Verification Gap Reviewer: same `db.test.ts` gap as the grouped Blind Hunter finding above -- evidence: independently confirmed via `grep -rn onblocked src/`. Same root cause, same defer reason.
  - `[medium]` `[defer]` Intent Alignment Auditor: under "Reading B" (fix the defect class everywhere it appears), the diff leaves `db.test.ts`'s identical pattern unfixed -- evidence: independently reached the same conclusion via its own divergence analysis. Same root cause and defer reason as the grouped Blind Hunter/Verification Gap finding; the auditor itself judged "Reading A" (the intent's literal four-file enumeration) the more defensible reading, which the diff correctly implements.

## Verification

**Commands:**
- `npm run lint` -- expected: exits 0, no violations.
- `npm run typecheck` -- expected: exits 0 (`tsc --noEmit && svelte-check`), no errors.
- `npm run test` -- expected: all test files pass, including the new `test-reset-db.test.ts` and the four modified persistence test files (now importing the shared `resetDb()`).

**Manual checks (if no CLI):** none beyond the commands above.

## Auto Run Result

**Summary:** Closes DW-19. Extracted the byte-for-byte duplicated `resetDb()` test helper from `attempt-repository.test.ts`, `settings-repository.test.ts`, `tally-repository.test.ts`, and `session-repository.test.ts` into one shared `src/adapters/persistence/test-reset-db.ts`. The old helper's `onblocked = () => resolve()` treated a blocked `deleteDatabase` as a successful reset, silently letting the next test run against a stale database. The shared helper instead keeps the single outstanding delete request alive and, once it reports `onblocked`, waits through a bounded number of short checks (logging each) before rejecting with a descriptive error if still blocked — so a genuine connection leak now fails the affected test loudly instead of being masked. A synchronous subagent implemented the change and a new `test-reset-db.test.ts` covering all three I/O-matrix scenarios; four review layers (Blind Hunter, Edge Case Hunter, Verification Gap Reviewer, Intent Alignment Auditor) reviewed the diff against baseline `b90cbec`, and the same implementation subagent was re-engaged to apply three low-severity wording/consistency patches the review surfaced.

**Files changed:**
- `src/adapters/persistence/test-reset-db.ts` (new) — shared `resetDb(): Promise<void>`. Deletes `DB_NAME`; resolves on `onsuccess`, rejects on `onerror` exactly as before; on `onblocked`, waits through up to `MAX_ATTEMPTS` (exported, `5`) checks 20ms apart, logging each via `console.warn`, before rejecting with a descriptive `Error` if the block never clears. Keeps the original request alive rather than re-issuing `deleteDatabase()` on each check (re-issuing would queue behind the still-pending original and never observe its own `onblocked` — documented inline).
- `src/adapters/persistence/test-reset-db.test.ts` (new) — three tests covering the I/O matrix: resolves immediately with no competing connection; retries through a transient block and resolves once the blocking connection closes; rejects with a descriptive error once checks are exhausted against a persistent block. Uses the same real-`openDB`-connection-plus-`vi.waitFor` technique as `db.test.ts` (real timers, no fixed tick count).
- `src/adapters/persistence/attempt-repository.test.ts`, `settings-repository.test.ts`, `tally-repository.test.ts`, `session-repository.test.ts` — removed each file's local `resetDb()`; now import the shared one. No other lines changed.

**Review findings breakdown (13 findings, this pass):**
- Patched (3, all low, all re-verified working): retry/reject wording no longer implies repeated `deleteDatabase()` calls, and the retry-count constant is now exported (Blind Hunter); the test file's blocking-connection setup now uses `DB_VERSION`/`SETTINGS_STORE` instead of hardcoded `1`/`'settings'` (Blind Hunter); the persistent-block test's assertion now interpolates the exported retry-count constant instead of a hardcoded `5` (Blind Hunter).
- Deferred (2 grouped entries, both medium, pre-existing/out of this story's scope, recorded in frontmatter `deferred`): `db.test.ts`'s own local `resetDb()` still has the exact old `onblocked => resolve()` bug — three independent layers (Blind Hunter, Verification Gap Reviewer, Intent Alignment Auditor) converged on this, but the verbatim intent names exactly four files and never `db.test.ts`, so it's excluded by the intent itself, not just this spec's scope section; a persistent block leaves the original `deleteDatabase` request running in the background, so a later `resetDb()` call for the same database queues behind it and hangs for the full test timeout instead of getting its own bounded rejection (Blind Hunter + Edge Case Hunter, grouped) — empirically reproduced, and reproduced identically against the pre-existing `onblocked => resolve()` pattern this bundle replaces, confirming it's an inherent property of IndexedDB's per-database-name delete queue, not something this change introduces.
- Rejected (5, all low): the spec's Design Notes illustrative code re-issues `deleteDatabase()` per retry, which the shipped code deliberately does not do (Blind Hunter) and the intent-contract's Boundaries text literally says "retry the deleteDatabase call" for the same reason (Edge Case Hunter, grouped) — both rejected because the only fix is editing this build's spec text; the shipped mechanism is the one verified to actually work (re-issuing was proven to hang instead of ever rejecting). The spec's Problem statement calls the four original helpers "byte-for-byte identical", but `tally-repository.test.ts` used `DB_NAME` while the other three hardcoded `'tegakko'` (Edge Case Hunter) — rejected on the same "fix is a spec edit" basis. One `false`: the claim that the spec's Acceptance Criteria leave blocked/retry/reject behavior uncodified (Blind Hunter) — disproven, the I/O & Edge-Case Matrix already codifies exactly those three scenarios per the template's own no-duplication rule, and step-03's Matrix Test Audit already required and verified a passing covering test for each row.

**Verification performed:** `npm run lint` and `npm run typecheck` both exit 0 on the final (patched) tree. `npm run test` — 323/324 tests pass; the one failure is a pre-existing, unrelated flaky assertion in `src/adapters/ui/Drill.test.ts` (random-data-dependent UI test, untouched by this diff) — reproduces intermittently even run in isolation, confirming it's a flake rather than a regression, and it lies entirely outside this bundle's changed files. The new `test-reset-db.test.ts` (3 tests) and the four modified persistence files' suites were run 3x in a row with no flakiness (37/37 tests each run). Additionally verified empirically (outside the shipped test suite, via a temporary throwaway probe, removed before finishing) that a second `resetDb()` call queues behind and hangs on a truly persistent leak — reproduced identically against the pre-existing buggy pattern, which is what grounds the deferred item above rather than a patch.

**Follow-up review recommendation:** `false`. Every patched entry this pass was `low` severity (no `high`, and fewer than two `medium` patches) — below the threshold for recommending a follow-up pass on a first-pass review.

**Residual risks:** The two deferred items are both medium-severity, pre-existing or inherent to IndexedDB's delete-queue semantics, and outside this bundle's authority to fix (ledger bookkeeping and `db.test.ts`'s own copy are the orchestrator's/a future bundle's responsibility; the cascading-hang-on-permanent-leak property would need a different test-isolation strategy, e.g. per-test database names, to actually eliminate). The rejected spec-text findings mean this spec's Design Notes/Boundaries/Problem prose no longer precisely describes the shipped mechanism in three small ways — purely cosmetic, the shipped code and tests are correct and verified.
