---
title: 'Add blocked/blocking handlers to openTegakkoDb() so a future DB_VERSION bump is not blocked forever'
type: 'bugfix'
created: '2026-09-10'
status: 'done'
baseline_revision: '75bdcb4826613d7c7bec1ee5153cc993858b2317'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      deferred-work.md still lists DW-2 and DW-20 as status: open even
      though this bundle's changes resolve them.
    evidence: |-
      This diff never touches deferred-work.md; the invocation's own
      instructions explicitly forbid editing the deferred-work ledger from
      within this build ("Do NOT edit the deferred-work ledger; the
      orchestrator records resolution"), so updating DW-2/DW-20's status is
      the orchestrator's responsibility, not this build's.
    location: >-
      _bmad-output/implementation-artifacts/deferred-work.md (DW-2, DW-20 entries)
    severity: low
  - summary: >-
      resetDb()'s indexedDB.deleteDatabase(...).onblocked resolves as
      success instead of surfacing the block, so a connection leaked by an
      earlier failing test silently "succeeds" at reset without actually
      deleting the database, masking the real cause of any resulting
      cascading test failures.
    evidence: |-
      This is the exact same pre-existing pattern already used verbatim by
      tally-repository.test.ts's resetDb() helper (onblocked => resolve()),
      copied into the new db.test.ts per the spec's own Code Map instruction
      to follow that file's structure; the new tests in db.test.ts are more
      likely than most to exercise this weakness since they deliberately
      hold connections open mid-test to test the blocked/blocking handshake
      itself.
    location: >-
      src/adapters/persistence/db.test.ts:6-13 (same pattern in
      tally-repository.test.ts:8-15, session-repository.test.ts,
      attempt-repository.test.ts, settings-repository.test.ts)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `openTegakkoDb()` (`src/adapters/persistence/db.ts:50-71`) defines only an `upgrade()` callback. If a second tab/window holds a connection open (mid persistence call, or simply idle) while another tab opens the db at a higher `DB_VERSION` (currently 4, already bumped twice), the newer open's IndexedDB `versionchange` transaction stalls: the browser fires `blocked` on the new request and `versionchange` on the old connection, but with no listeners either event is silently swallowed -- the new open (and thus every persistence call in that tab) hangs indefinitely.

**Approach:** Pass `blocked` and `blocking` callbacks to the single `openDB()` call in `openTegakkoDb()`. `blocking` is the actual fix: it fires on *this* connection when another tab requests a newer version, and must call `close()` on it so that other tab's upgrade can proceed. `blocked` is diagnostic only (this connection's own open is the one being stalled by another tab); log it, no new UI.

## Boundaries & Constraints

**Always:**
- Keep `openTegakkoDb()`'s public signature (`(): Promise<IDBPDatabase<TegakkoDb>>`) and existing `upgrade()` body unchanged -- only add `blocked`/`blocking` callbacks to the same `openDB()` call.
- The `blocking` callback must close the resolved connection object returned by this same `openDB()` call (not a new/different connection) so a real cross-tab upgrade can complete.
- Preserve today's error-boundary contract: `openTegakkoDb()` must keep resolving/rejecting exactly as before for every existing caller (`settings-repository.ts`, `attempt-repository.ts`, `tally-repository.ts`, `session-repository.ts`) -- adding the callbacks must not change what the returned promise resolves or rejects with.

**Never:**
- Do not add a `terminated` handler or any new fallback UI/toast -- out of scope for this bundle (DW-2/DW-20 ask only for `blocked`/`blocking` + versionchange-close).
- Do not change `DB_VERSION` or the store/upgrade schema.
- Do not add per-repository caching/singleton connection reuse -- each repository still opens and `close()`s its own connection per call (unchanged existing pattern); this fix only covers the window while a connection is legitimately open.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cross-tab version bump while a connection is open | A connection from `openTegakkoDb()` is open (not yet closed); another connection then opens the same DB at a higher version | The open connection's `blocking` handler fires and closes it; the higher-version open then proceeds past `blocked` and resolves normally | No error thrown on either side |
| This tab's own open is blocked by another (older, unmanaged) open connection | Another connection is open at a lower version with no handlers; `openTegakkoDb()` is then called | `openTegakkoDb()`'s `blocked` handler fires (logged) while the request waits; once the older connection closes, `openTegakkoDb()` resolves normally | No error thrown; `openTegakkoDb()`'s promise stays pending only until the older connection closes |
| No competing connection (today's common case) | Only one connection open at a time, single tab | Behavior identical to before this change -- `blocked`/`blocking` never fire | No error expected |

</intent-contract>

## Code Map

- `src/adapters/persistence/db.ts:50-71` -- `openTegakkoDb()`. Currently `return openDB<TegakkoDb>(DB_NAME, DB_VERSION, { upgrade(db) {...} })`. Convert to an `async` function that keeps a local reference to the resolved connection, passes `blocked` and `blocking` callbacks alongside the existing `upgrade`, and has `blocking` call `.close()` on that local reference. `upgrade`'s body (lines 52-69) is unchanged.
- `node_modules/idb/build/entry.d.ts` -- `OpenDBCallbacks<DBTypes>`: `blocked?(currentVersion: number, blockedVersion: number | null, event: IDBVersionChangeEvent): void` and `blocking?(currentVersion: number, blockedVersion: number | null, event: IDBVersionChangeEvent): void`.
- `node_modules/idb/build/index.cjs:169-190` -- `openDB()` internals confirm the wiring: `blocked` is attached to the underlying `IDBOpenDBRequest`'s `blocked` event immediately; `blocking` is attached to the *resolved* database's `versionchange` event inside `openPromise.then(...)`, which is registered before `openTegakkoDb()`'s own `await` on the same promise resumes -- so assigning the local connection reference immediately after `await openDB(...)` is safe: the `versionchange` listener is already live by then, and no real cross-tab event can fire before that assignment runs (single-threaded microtask ordering).
- `src/adapters/persistence/settings-repository.ts`, `attempt-repository.ts`, `tally-repository.ts`, `session-repository.ts` -- every existing caller of `openTegakkoDb()`; each already opens a fresh connection per call and `close()`s it in a `finally` block (e.g. `settings-repository.ts:19-28`). None of these files need changes -- they only need `openTegakkoDb()`'s returned promise to keep behaving as it does today.
- `src/adapters/ink/canvas-ink-surface.ts:336,350` -- existing `console.warn(...)` convention for a recoverable/fallback condition (not a hard failure); follow this same style for the new `blocked`/`blocking` logging rather than `console.error` (reserved elsewhere in the codebase for failures surfaced to the user, e.g. `Settings.svelte:71`).
- `src/adapters/persistence/tally-repository.test.ts:1-20,106-146` -- existing pattern for fake-indexeddb-backed persistence tests in this directory: `import 'fake-indexeddb/auto'`, a `resetDb()` helper that deletes `DB_NAME` via raw `indexedDB.deleteDatabase` in `beforeEach`, and direct use of `idb`'s `openDB` alongside `openTegakkoDb` to simulate a second, independently-versioned connection (as the v2-schema migration test at line 106 already does). The new `db.test.ts` should follow this same structure rather than mocking `idb`.
- No `db.test.ts` exists yet under `src/adapters/persistence/`.

## Tasks & Acceptance

**Execution:**
- `src/adapters/persistence/db.ts` -- add `blocked` and `blocking` callbacks to the `openDB()` call inside `openTegakkoDb()`; convert the function to `async`, keep a local `connection` reference, have `blocking` call `connection?.close()`, have `blocked` log via `console.warn` -- closes DW-2 and DW-20.
- `src/adapters/persistence/db.test.ts` (new file) -- fake-indexeddb-backed tests covering both I/O-matrix scenarios (see Verification below for the exact assertions).

**Acceptance Criteria:**
- Given the existing `upgrade()` behavior (store creation, index creation, idempotent `objectStoreNames.contains` guards), when `openTegakkoDb()` is called against a fresh or already-current-version database, then behavior is unchanged from before this change.
- Given every existing repository's open-then-`close()`-in-`finally` pattern, when any repository method runs with no competing connection, then `blocked`/`blocking` never fire and the method's `Result` outcome is unaffected.

## Design Notes

The two idb callbacks solve two different halves of the same event pair, and both are needed (per DW-20's own reasoning): `blocked` fires on the request that *cannot proceed*; `blocking` fires on the connection that is *in the way*. A connection can only unblock another tab's upgrade by closing itself in `blocking` -- `blocked` alone (DW-2's original framing) has nothing to close, since it doesn't hold a connection to close; it only observes that it is waiting.

```ts
export async function openTegakkoDb(): Promise<IDBPDatabase<TegakkoDb>> {
  let connection: IDBPDatabase<TegakkoDb> | undefined;
  connection = await openDB<TegakkoDb>(DB_NAME, DB_VERSION, {
    upgrade(db) { /* unchanged */ },
    blocked(currentVersion, blockedVersion) {
      console.warn(`[tegakko] openTegakkoDb() blocked: an existing connection at version ${currentVersion} is preventing the upgrade to version ${blockedVersion}`);
    },
    blocking(currentVersion, blockedVersion) {
      console.warn(`[tegakko] openTegakkoDb() closing this connection (version ${currentVersion}): another connection is opening version ${blockedVersion}`);
      connection?.close();
    },
  });
  return connection;
}
```

## Spec Change Log

## Review Triage Log

### 2026-09-10 — Review pass
- verdicts: 15 findings — high 0, medium 1, low 9, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind Hunter: new `console.warn` calls in `db.ts` use a `[tegakko] ` prefix with no precedent anywhere else in the codebase (`canvas-ink-surface.ts:336,350`, `Settings.svelte:71`, `FirstRun.svelte`, `Drill.svelte` are all unprefixed) — evidence: grepped every existing `console.warn`/`console.error` call site, confirmed none use any prefix. Applied: dropped the `[tegakko] ` prefix from both messages.
  - `[low]` `[defer]` Blind Hunter: `deferred-work.md` still lists DW-2/DW-20 as `status: open`; this diff never touches it — evidence: confirmed via diff inspection. Deferred, not fixed: the invocation's own instructions explicitly forbid editing the deferred-work ledger from this build ("Do NOT edit the deferred-work ledger; the orchestrator records resolution"), so this is the orchestrator's responsibility.
  - `[low]` `[reject]` Blind Hunter: `db.test.ts`'s first test deviates from the spec's literal Verification-section text (it doesn't assert the second connection's own `blocked` callback fired) with no entry in the spec's `## Spec Change Log` — evidence: read the test's own inline comment explaining the deviation, and confirmed the deviation is real. Rejected: the only available fix is editing this build's spec (either the Verification text or adding a Spec Change Log entry for a non-bad_spec judgment call); the test itself is correct — `blocked` genuinely cannot fire in that scenario once `blocking` closes synchronously, which real IndexedDB/fake-indexeddb both confirm, so forcing the literal assertion would only pass for a broken, delayed-close implementation.
  - `[medium]` `[defer]` Blind Hunter: `resetDb()`'s `indexedDB.deleteDatabase(...).onblocked` resolves as success instead of surfacing the block, so a connection leaked by an earlier failing test silently "succeeds" at reset without actually deleting the database, masking the real cause of any resulting cascading failures — evidence: read `db.test.ts:6-13`. Deferred, not fixed: this is the exact same pre-existing pattern already used verbatim by `tally-repository.test.ts:8-15` (and the other persistence test files), copied into the new file per the spec's own Code Map instruction to follow that file's structure — not introduced by this story, even though the new tests (which deliberately hold connections open) are more likely than most to exercise it.
  - `[false]` `[reject]` Blind Hunter: no test covers `openDB()` itself rejecting (e.g. an error inside `upgrade()`) now that `blocked`/`blocking` are wired up, leaving the "rejection contract unchanged" claim unverified — evidence: disproven — `blocked`/`blocking`/`upgrade` are side-channel event listeners in `idb`'s implementation (`index.cjs:169-190`) that never affect whether the underlying `openPromise` resolves or rejects; the pre-existing, unmodified persist-failure test suites (`tally-repository.test.ts:154-223` and equivalents in every other repository test file) already assert the reject-to-`Result` contract and all still pass unchanged.
  - `[false]` `[reject]` Blind Hunter: the safety argument for referencing `connection` inside `blocking` before its `const` binding is proven safe by `idb`'s internal ordering is asserted but never pinned by a test — evidence: disproven — `db.test.ts`'s first test (`expect(() => firstConnection.transaction(...)).toThrow()`) only passes if `connection` was already bound to the real database object at the moment `blocking` fired and called `.close()` on it; a mis-timed binding would leave `firstConnection` open and that assertion would fail. This is also `idb`'s own documented canonical usage pattern (`let db; db = await openDB(..., { blocking() { db?.close(); } })`), not an unstated implementation accident.
  - `[low]` `[patch]` Blind Hunter / Edge Case Hunter (grouped, same root cause): the second test's `blocked`-fired assertion (`expect(warnSpy).toHaveBeenCalled()`) checks no message content, unlike the first test, so a regression swapping/corrupting the `blocked` handler's message text would go uncaught — evidence: read both assertions directly. Applied: changed the assertion to `expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('blocked'))`.
  - `[false]` `[reject]` Blind Hunter: the unused third `event: IDBVersionChangeEvent` callback parameter is undocumented, "worth a one-line note" — evidence: disproven as a defect — omitting unused trailing callback parameters is standard, idiomatic TypeScript and matches the existing `upgrade(db)` callback in the same function, which likewise omits its own available trailing params (`oldVersion`, `newVersion`, `transaction`, `event`); no concrete harm was named beyond vague "worth a note."
  - `[low]` `[patch]` Edge Case Hunter: `blocking` fires from a cross-tab `indexedDB.deleteDatabase(DB_NAME)` call (not only a version-bump open), which sets `blockedVersion` to `null`, producing a misleading "...opening version null" log — evidence: per the IndexedDB spec, `deleteDatabase()` also fires `versionchange` on other open connections with `event.newVersion === null`; this repo's own `resetDb()` test helpers call `indexedDB.deleteDatabase(DB_NAME)` directly, so the path is reachable, not purely theoretical. Applied: `blocking`'s log now branches on `blockedVersion === null` and logs "a database deletion" in that case instead of "version null".
  - `[low]` `[patch]` Edge Case Hunter (2 grouped findings, same root cause): in both new tests, the connection-opening `await`s (and, in the second test, `vi.waitFor(...)`) run before the `try` block starts, so a failure or timeout during those steps leaves the already-opened connection(s) unclosed, leaking into later tests' `beforeEach` cleanup — evidence: read both tests' control flow directly; confirmed the `try`/`finally` scope starts only after the setup awaits complete. Applied: widened both tests' `try` blocks to wrap the full test body, including the opening awaits and the `waitFor`, so `finally` closes every opened connection regardless of where a failure occurs.
  - `[low]` `[reject]` Edge Case Hunter: the I/O matrix's row 1 wording ("the higher-version open then proceeds past `blocked` and resolves normally") implies `blocked` fires on the newer request in this scenario, which the shipped test disproves (`blocked` deterministically never fires when `blocking` closes synchronously) — evidence: same root cause as the Blind Hunter Spec-Change-Log finding above; grouped with it. Rejected for the same reason: the only fix is editing this build's spec text, and the shipped code/test is correct, not broken.
  - `[false]` `[reject]` Intent Alignment Auditor: Reading C (DW-2's "with no fallback UI" phrase read as requiring a user-facing fallback signal) diverges from the diff, which explicitly excludes new UI — evidence: disproven as an intent gap — the bundle's own synthesized Intent section scopes the deliverable to "blocked/blocking handlers... ensure open connections close on versionchange," with no request for UI; DW-2's "no fallback UI" clause describes the pre-fix risk's severity, not an unmet requirement, and this diff's `blocking`-closes-the-connection fix is precisely what turns an indefinite hang into one that resolves once the blocking tab closes.
  - `[false]` `[reject]` Intent Alignment Auditor: Reading D (a cross-tab/browser-level "stale, idle tab" scenario) is not exercised by any real multi-tab/Service-Worker test, only by same-process `fake-indexeddb` connections — evidence: disproven as an actionable gap — `blocked`/`blocking`/`versionchange` are connection-scoped IndexedDB events per the Web IDL spec, not tab/process-scoped, and `fake-indexeddb` faithfully emulates that exact contract (independently confirmed by the Verification Gap Reviewer); no test anywhere in this codebase exercises real multi-tab browser behavior for any IndexedDB behavior, and the auditor's own report concedes the mechanism is "mechanistically sound regardless of tab vs. same-process."
  - `[low]` `[defer]` Intent Alignment Auditor: same ledger-not-updated observation as the Blind Hunter finding above — evidence: identical claim, independently reported. Same root cause and defer reason.

## Verification

**Commands:**
- `npm run lint` -- expected: exits 0, no violations.
- `npm run typecheck` -- expected: exits 0 (`tsc --noEmit && svelte-check`), no errors.
- `npm run test` -- expected: all test files pass, including the new `db.test.ts`, which must assert real (not mocked) behavior via `fake-indexeddb`:
  - Scenario 1 (`blocking` closes the open connection): open a connection via `openTegakkoDb()`, keep it open (do not `close()` it), then open a second connection via `idb`'s `openDB(DB_NAME, DB_VERSION + 1, { upgrade() {} })` with its own `blocked` callback that records whether it fired. Assert the second open resolves (does not hang/timeout) and that its `blocked` callback did fire (proving the scenario genuinely exercised a real block, not a vacuous pass). Close the second connection afterward.
  - Scenario 2 (`blocked` fires on this module's own open, and it still resolves once unblocked): open a raw connection via `idb`'s `openDB(DB_NAME, DB_VERSION - 1, { upgrade() {} })` and keep it open with no handlers. Spy on `console.warn`. Call `openTegakkoDb()`, assert `console.warn` was called (the `blocked` handler fired) before closing the raw connection, then close the raw connection and assert the `openTegakkoDb()` promise resolves.
  - Both tests must call `resetDb()` (delete `DB_NAME`) in `beforeEach`, matching `tally-repository.test.ts`'s existing convention, and must close every connection they open by the end of the test (including on assertion failure, where practical) so later tests in the same file are not left with a database at an unexpected version.

**Manual checks (if no CLI):** none beyond the commands above.

## Auto Run Result

**Summary:** Closes DW-2 and DW-20. `openTegakkoDb()` (the single shared IndexedDB opener in `src/adapters/persistence/db.ts`) now passes `blocked` and `blocking` callbacks to its `openDB()` call, alongside the pre-existing `upgrade()`. `blocking` closes this connection when another connection (another tab, or a `deleteDatabase()` call) needs it out of the way, so a future `DB_VERSION` bump is no longer able to hang forever; `blocked` is diagnostic-only logging for the symmetric case where this connection's own open is the one waiting. A synchronous subagent implemented the change and a new `db.test.ts`, four review layers (Blind Hunter, Edge Case Hunter, Verification Gap Reviewer, Intent Alignment Auditor) reviewed the diff against baseline `75bdcb4`, and the same implementation subagent was re-engaged to apply four low-severity patches the review surfaced.

**Files changed:**
- `src/adapters/persistence/db.ts` -- `openTegakkoDb()` converted to `async`; added `blocked`/`blocking` callbacks to the `openDB()` call, with `blocking` closing the resolved connection and both callbacks logging via `console.warn` (unprefixed, matching the codebase's existing convention; `blocking`'s message distinguishes a `deleteDatabase()`-caused block from a version-bump one).
- `src/adapters/persistence/db.test.ts` (new) -- two `fake-indexeddb`-backed tests: one proves `blocking` closes an open connection so a newer cross-tab open resolves instead of hanging; the other proves `blocked` fires (and logs) while this connection's own open waits on an older, unmanaged connection, and that it still resolves once that connection closes. Both tests' connection-opening/waiting steps run fully inside their `try` blocks so no connection leaks past a mid-test failure, and both assert on the logged message content, not just that a warning fired.

**Review findings breakdown (15 findings, this pass):**
- Patched (4 entries, all low, all re-verified working): `[tegakko] ` log prefix removed for consistency with the rest of the codebase (Blind Hunter); `blocking`'s log message no longer misreports a `deleteDatabase()`-caused block as "opening version null" (Edge Case Hunter); the second test's `blocked` assertion now checks message content, not just call count (Blind Hunter + Edge Case Hunter, grouped); both new tests' setup-phase awaits moved fully inside their `try`/`finally` scope so a failure can't leak an open connection (Edge Case Hunter, 2 grouped findings).
- Deferred (2, orchestrator/pre-existing, not this story's to fix): `deferred-work.md` still shows DW-2/DW-20 as `open` -- this build was explicitly instructed not to edit that ledger (low); the shared `resetDb()` test helper's `onblocked => resolve()` pattern can mask a leaked connection as a successful reset -- a pre-existing pattern copied from `tally-repository.test.ts`, not introduced here, though this bundle's new tests are more likely than most to exercise it (medium).
- Rejected (9): 5 `false` (no test for `openDB()` rejecting -- disproven, `blocked`/`blocking` don't affect promise settlement and the pre-existing reject-path tests still pass unchanged; the `connection` const-binding race -- disproven, the shipped test's `transaction()`-throws assertion only passes if the binding was already safe; the unused `event` callback parameter -- not a defect, matches the existing `upgrade(db)` callback's own style; the "no fallback UI" intent reading -- disproven, the bundle's own Intent section never asked for UI; the "no real multi-tab test" reading -- not actionable, these are connection-scoped IndexedDB events per spec, not tab-scoped, and no test anywhere in this repo exercises real multi-tab browser behavior for any IndexedDB behavior); 4 `low` rejected as spec-documentation drift (2 grouped pairs: the spec's Verification text/I/O-matrix wording implies `blocked` fires on the newer connection in the cross-tab-close scenario, which real IndexedDB semantics disprove -- the shipped test is correct, only the spec's literal wording is imprecise, and the only fix is editing this build's spec, which is out of scope for a reject-route finding).

**Verification performed:** `npm run lint` and `npm run typecheck` both exit 0. `npm run test` -- 321/321 tests pass (24 files), including the new `db.test.ts` (2 tests), re-run 3x clean after the patch pass; the new tests were also run 5x in isolation with no flakiness. One pre-existing flake in `src/adapters/ui/Drill.test.ts` (unrelated UI test, not persistence) was observed twice across ~8 full-suite runs during this session, always passing standalone -- confirmed independently (and earlier via `git stash` by the implementation subagent) to reproduce identically on unmodified `main`, so it is not a regression from this change.

**Follow-up review recommendation:** `false`. Every patched entry this pass was `low` severity (no `high`, and no `medium` patches, let alone two or more) -- the threshold for recommending a follow-up pass on a first-pass review.

**Residual risks:** The two deferred items are low/medium-severity, pre-existing, and outside this build's authority to fix (ledger bookkeeping is the orchestrator's; the `resetDb()` masking pattern spans every persistence test file, not just this one). The rejected spec-documentation-drift items mean the spec's own Verification/I/O-matrix text no longer precisely describes why `blocked` doesn't fire in the cross-tab-close scenario -- purely cosmetic, the shipped code and tests are correct.
