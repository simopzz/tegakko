---
title: 'Attempt Recording'
type: 'feature'
created: '2026-09-06'
status: 'done'
route: 'dispatch'
baseline_commit: 'b7e6fc0b1e45902407c04e8a08ca61ed563ec5ea'
review_loop_iteration: 0
context: [
  '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md',
]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every completed prompt cycle on the Drill screen (grade tap) currently vanishes the instant the next card appears — there is no `attempts` store, so the app has no real data yet to power future weak-spot selection (Story 1.7), tallies (1.6), or history (1.10).

**Approach:** Add an `idb`-backed `attempts` store and `IdbAttemptRepository` (`add`/`listBySession`/`listAll`/`deleteLast`), and wire `Drill.svelte` to persist one `Attempt` record — with its embedded, grid-relative `strokes[]` — every time Missed or Correct is tapped. This requires extending the `InkSurface` port's `onStrokeComplete` callback to also carry `widthPreset` (per AD-4's persisted `Stroke` shape) and pointer-accurate `startedAt`/`endedAt` timestamps (per AD-2), since only the ink adapter itself sees the raw `pointerdown`/`pointerup` events needed to compute `timeToFirstStrokeMs` precisely.

</frozen-after-approval>

## Boundaries & Constraints

**Always:** `strokes[]` points stay grid-relative (0..1), never absolute pixels. IndexedDB failures resolve as `Result<T>` (never a raw `DOMException` past the adapter). `listAll()` returns the complete, unpaginated history. A grade (Missed or Correct) always persists an attempt, whether or not Reveal was used or any ink exists. `settings` and `attempts` share one `tegakko` IndexedDB database, opened at one shared, single version.

**Never:** No `sessions`/`tallies` store or repository (Stories 1.6/1.9). No UI surfaces any attempt data (no analysis UI in v1). Do not block advancing to the next prompt on the persistence write completing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grade after writing | Ink drawn, Missed/Correct tapped | Attempt persisted with `strokeCount > 0`, `strokes` embedding the drawn stroke(s) with their `widthPreset` | N/A |
| Grade from a blank reveal | Reveal tapped with no ink, then Missed/Correct | Attempt persisted with `strokeCount: 0`, `strokes: []`, `revealUsed: true` | N/A |
| Clear then write then grade | Clear discards prior ink, new stroke drawn, then graded | Only the post-Clear stroke(s) are persisted; `timeToFirstStrokeMs` measures from the post-Clear stroke | N/A |
| Reload after attempts exist | App reloads, then `listAll()` | Returns exactly the same attempts, strokes replaying correctly regardless of current viewport size | N/A |
| IndexedDB open/write fails | `openDB`/`db.add` rejects | `add()` resolves `{ok: false, error: Error}`; Drill logs it via `console.error` and still advances to the next prompt | Never throws past the repository |

</frozen-after-approval>

## Code Map

- `src/domain/ink.ts` -- `Stroke` (add `widthPreset: WidthPreset`), new `StrokeTiming { startedAt; endedAt }`. Persisted stroke shape (AD-4).
- `src/ports/ink-surface.ts` -- `onStrokeComplete`'s callback widens from `(stroke)` to `(stroke, timing)`.
- `src/adapters/ink/canvas-ink-surface.ts` -- `handlePointerDown`/`handlePointerEnd` capture `startedAt`/`endedAt` via `performance.now()` and pass `{points, widthPreset: this.currentPreset}` + timing to the callback. Collapses `Array<{stroke, preset}>` to `Stroke[]` (preset now lives on the stroke); `replay()` reads it from there.
- `src/adapters/persistence/db.ts` (**new**) -- shared `DB_NAME`/`DB_VERSION`/`TegakkoDb` schema (`settings` + `attempts`, keyPath `'id'`, index `sessionId`) and one `openTegakkoDb()`/`toError()`, replacing each repository's own copy. Two independently-versioned `openDB` calls against the same DB name risk a `VersionError` the moment either bumps its version -- this is why they must share one opener.
- `src/adapters/persistence/settings-repository.ts` -- switches to the shared opener; behavior/public API unchanged, existing tests untouched.
- `src/domain/attempt.ts` (**new**) -- `Attempt` + `SelfGrade = 'correct' | 'incorrect'`, per AD-4/FR-8's field list (Tasks below).
- `src/ports/attempt-repository.ts` (**new**) -- `AttemptRepository`, adapted to async+`Result` the same way `ports/settings-repository.ts` adapts AD-9's sync signature.
- `src/adapters/persistence/attempt-repository.ts` (**new**) -- `IdbAttemptRepository`, mirrors `IdbSettingsRepository`'s open/try/catch/finally shape. `listBySession` via `db.getAllFromIndex('attempts', 'sessionId', sessionId)`. `deleteLast(sessionId)` reads that list, deletes the max by `timestamp` (ISO-8601 sorts lexicographically); no-ops if empty.
- `src/adapters/ui/Drill.svelte` -- new `attemptRepository` prop. New locals: `sessionId` (minted once, same `untrack` pattern as `card`), `strokes: Stroke[]`, `promptShownAt`/`firstStrokeStartedAt` (plain `let`, unrendered). `onStrokeComplete` now takes `(stroke, timing)`. `handleClear` also resets `strokes`/`firstStrokeStartedAt`. `handleGrade(grade: SelfGrade)` builds and fires `void attemptRepository.add(attempt)` (logs `!result.ok` via `console.error`, never awaited) before resetting for the next card.
- `src/app/App.svelte` -- instantiate `IdbAttemptRepository` beside `settingsRepository`/`cardRepository`; pass into `<Drill>`.
- `src/adapters/ui/Drill.test.ts` -- `fakeInkSurface().landStroke()` calls back with `(stroke, timing)`; add `fakeAttemptRepository()` passed to every `render(Drill, ...)` call -- consider a `renderDrill(overrides)` helper to avoid repeating both fakes at ~20 call sites.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/ink.ts` -- add `widthPreset` to `Stroke`, add `StrokeTiming`.
- [x] `src/domain/attempt.ts` -- add `Attempt`/`SelfGrade`.
- [x] `src/ports/ink-surface.ts` -- widen `onStrokeComplete` to `(stroke, timing)`.
- [x] `src/adapters/ink/canvas-ink-surface.ts` -- capture timing, embed `widthPreset`, simplify stroke bookkeeping.
- [x] `src/adapters/persistence/db.ts` -- shared DB opener/schema/version.
- [x] `src/adapters/persistence/settings-repository.ts` -- switch to the shared opener.
- [x] `src/ports/attempt-repository.ts` -- `AttemptRepository` port (AD-9, async+`Result`-adapted).
- [x] `src/adapters/persistence/attempt-repository.ts` -- `IdbAttemptRepository` against the shared `attempts` store.
- [x] `src/adapters/persistence/attempt-repository.test.ts` (**new**) -- `fake-indexeddb` round-trip (`add`→`listAll`/`listBySession`, including strokes) + `deleteLast` (most-recent-by-timestamp, no-op when empty) + a `vi.mock('idb', ...)` failure test mirroring `settings-repository.persist-failure.test.ts`.
- [x] `src/adapters/ui/Drill.svelte` -- persist an `Attempt` on every grade.
- [x] `src/adapters/ui/Drill.test.ts` -- update the fakes; add assertions for the I/O matrix's four Drill-facing rows.
- [x] `src/app/App.svelte` -- wire `IdbAttemptRepository` into `<Drill>`.

**Acceptance Criteria:**
- Given the `attempts` store does not yet exist, when the app boots, then it is created via the shared `idb` opener alongside `settings` at one shared DB version, with no `VersionError` on either repository.
- Given a grade is submitted, when the attempt is built, then it includes `id` (`crypto.randomUUID()`), `sessionId`, `cardId`, an ISO-8601 `timestamp`, `timeToFirstStrokeMs`, `totalTimeMs`, `strokeCount`, `revealUsed`, `selfGrade`, and `strokes[]`.
- Given no stroke was ever drawn before grading (revealed-from-blank), when the attempt is built, then `timeToFirstStrokeMs` equals `totalTimeMs` (no first-stroke instant exists) rather than an undefined/negative value.
- Given `attemptRepository.add()` rejects or resolves `{ok: false}`, when a grade is submitted, then the Drill screen still advances to the next prompt and logs the failure via `console.error`.

## Implementation Notes

- `src/adapters/persistence/db.ts` (new): the single `openTegakkoDb()`/`toError()`/`TegakkoDb` schema shared by `settings-repository.ts` and the new `attempt-repository.ts` -- one `DB_VERSION`, one `upgrade()` that creates both `settings` (out-of-line key, unchanged) and `attempts` (`keyPath: 'id'`, `sessionId` index) so neither repository can independently bump the version and trigger a `VersionError` against the other.
- `src/domain/ink.ts`'s `Stroke` now carries `widthPreset` directly (the persisted shape), so `CanvasInkSurface` collapsed its old `Array<{stroke, preset}>` bookkeeping to plain `Stroke[]` -- `replay()` reads the preset off the stroke itself.
- `CanvasInkSurface` captures `startedAt` in `handlePointerDown` and `endedAt` in `handlePointerEnd` via `performance.now()`, and passes them as `StrokeTiming` to `onStrokeComplete`'s (now two-arg) callback -- this is the one place that sees the raw pointer events, so `Drill.svelte` never has to approximate timing from callback-invocation time.
- `Drill.svelte`: `sessionId` is a plain `crypto.randomUUID()` minted once at component creation (no `$state`/`untrack` needed -- it's never read reactively). `strokes`/`promptShownAt`/`firstStrokeStartedAt` are plain `let`, not `$state`, since nothing renders them (`hasInk` already drives the UI). `handleGrade(grade: SelfGrade)` captures the built `Attempt` by reference before reassigning `strokes = []` for the next card, so the reset never mutates the array already handed to `attemptRepository.add()`. The `add()` promise is chained with `.then()` (never `awaited`), so persistence can never block advancing to the next prompt; a `{ ok: false }` result (or, per the port contract, this never rejects) is logged via `console.error`.
- `timeToFirstStrokeMs` falls back to `totalTimeMs` whenever `firstStrokeStartedAt` is `undefined` (no stroke drawn before grading -- e.g. revealed-from-blank), satisfying the acceptance criterion that it's never left undefined/negative.
- `src/adapters/persistence/attempt-repository.test.ts` uses `vi.doMock('idb', ...)` + `vi.resetModules()` (rather than a separate file like `settings-repository.persist-failure.test.ts`) to scope the `openDB` failure mock to one test without shadowing `idb` for the fake-indexeddb round-trip tests sharing the file, per the spec's single-file Code Map entry.
- Review round (see Review Triage Log): `DB_VERSION` bumped `1` → `2` -- unchanged, it would have left `attempts` permanently uncreated for any pre-existing `tegakko` v1 (settings-only) database, since `upgrade()` only re-fires when the requested version exceeds the stored one. Added a migration test pre-creating a raw v1 database and asserting `add()` now succeeds against it. Also from review: failure-path tests added for `listBySession`/`listAll`/`deleteLast` (previously only `add()` had one); a `canvas-ink-surface.test.ts` test asserting real `StrokeTiming` (two sequential strokes get distinct `startedAt`s, real-clock timing -- `vi.spyOn(performance, 'now')` desynced against happy-dom's own internal `performance.now()` reads for `Event.timeStamp`); a `Drill.test.ts` test for `revealUsed: true` combined with `strokeCount > 0`; a `Drill.test.ts` test guarding that a graded attempt's `strokes` array isn't mutated by the next card's ink; `deleteLast`'s tie-break changed `>` → `>=`; doc comments added to `listAll`/`listBySession` noting their return order isn't guaranteed chronological.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `DB_VERSION` stays `1` while `attempts` is added to the shared schema, so IndexedDB's `upgrade()` never re-fires for a pre-existing v1 (settings-only) database | high | patch | Confirmed: `db.ts:15` `DB_VERSION = 1`, unchanged from the prior settings-only schema. `upgrade()` only runs on first creation or when the requested version exceeds the stored version, so any browser profile with a pre-Story-1.5 `tegakko` v1 DB never gets the `attempts` store; every `add()` fails permanently (falsifies AC 1). Fixed: `DB_VERSION` bumped to `2`, plus a migration test opening a pre-existing v1 (settings-only) DB and asserting `add()` now succeeds. |
| 2 | Same defect as #1, found independently (Blind Hunter) | high | patch | carried — same root cause as #1. |
| 3 | No test exercises opening an existing v1 (settings-only) database through `openTegakkoDb()` — exactly the scenario #1's bug lives in | high | patch | Confirmed: `attempt-repository.test.ts`'s `resetDb()` deletes the whole DB before every test, so `upgrade()` always runs fresh and never exercises the real-world upgrade path. Same fix as #1. |
| 4 | Same defect as #1, found independently (Edge Case Hunter, against AC 1) | high | patch | carried — same root cause as #1. |
| 5 | `CanvasInkSurface`'s emitted `StrokeTiming` (`startedAt`/`endedAt`) is never asserted against the real adapter — only `Drill.test.ts`'s fake fabricates its own timing | low | patch | Confirmed: no reference to `StrokeTiming`/`timing`/`startedAt`/`endedAt` anywhere in `canvas-ink-surface.test.ts`. Fixed: added a test asserting the callback's timing reflects real pointerdown/pointerup timing. |
| 6 | `listBySession`/`listAll`/`deleteLast` have no failure-path (mocked `idb` rejection) test coverage; only `add()` does | low | patch | Confirmed by reading `attempt-repository.test.ts`: one persist-failure test, covering only `add()`. Fixed: added the same failure-path test for the other three methods. |
| 7 | No test asserts a persisted `Attempt` with `revealUsed: true` and `strokeCount > 0` (draw ink, then Reveal, then grade) — a reachable state per the UI | low | patch | Traced `Drill.svelte`: `handleReveal` doesn't clear `strokes`/`hasInk`, so this combined state is reachable and already handled correctly, but was untested. Fixed with a dedicated test. |
| 8 | No test guards that `handleGrade`'s captured `attempt.strokes` reference survives the later `strokes = []` reset for the next card | low | patch | Traced `Drill.svelte`: current code reassigns (not mutates) `strokes`, so today's behavior is correct, but nothing would catch a future regression to in-place mutation (e.g. `strokes.length = 0`). Fixed with a regression test. |
| 9 | `listAll()`/`listBySession()` return attempts in insertion/key order, not chronological order, with no documentation of this | low | patch | Confirmed: the `attempts` store is keyed by random UUID `id`, so `getAll()`/`getAllFromIndex()` order isn't timestamp order. AD-9 doesn't specify an order, so this isn't a spec violation, but future callers (1.7/1.10) should be warned. Fixed with a doc comment on both port methods. |
| 10 | `deleteLast`/`list*` pull every matching record into memory rather than using a cursor | low | rejected | Real, but the reviewer's own assessment is "not urgent at today's scale" — a solo-user local practice app. The fix would trade the current simple `getAll()`/`getAllFromIndex()` call for cursor-based iteration, adding real complexity for a defect unlikely to be encountered in normal use. |
| 11 | `timestamp` (wall-clock) and `timeToFirstStrokeMs`/`totalTimeMs` (monotonic `performance.now()`) come from two different clocks that can drift apart | low | rejected | The measured durations themselves stay correct regardless (`performance.now()` is monotonic); only the anchor timestamp could be mildly inconsistent, and only during an exotic multi-second clock-adjustment/sleep window mid-prompt on a single local device. Unlikely in practice; no clean trivial fix. |
| 12 | No index on `cardId`; Story 1.7 ("weak-spot selection") will supposedly need to query by it | false | rejected | Refuted by AD-10: `selectNext` is a pure domain function fed by one bulk `AttemptRepository.listAll()` read per session, filtering in-memory — no per-card indexed query is ever needed for selection. |
| 13 | `deleteLast`'s max-by-timestamp scan uses strict `>`, so two attempts with an identical ISO timestamp resolve to the first-seen one, not a guaranteed most-recent | low | patch | Confirmed: `if (!latest \|\| attempt.timestamp > latest.timestamp) latest = attempt;`. Exact-millisecond ties require two grades within the same ISO millisecond (near-impossible via a human tap), but the fix (`>=`) is a one-character no-risk correction. Fixed. |
| 14 | `attemptRepository.add(attempt).then(...)` has no `.catch()`, so a rejected promise (not just an `{ok:false}` resolution) would never reach the promised `console.error` | false | rejected | Refuted: `IdbAttemptRepository.add()`'s entire body is wrapped in try/catch, so the returned promise provably only ever resolves (`{ok:true}` or `{ok:false}`), never rejects — matching the architecture's Result-wrapping contract ("a raw `DOMException` must never escape the adapter boundary"). |

## Design Notes

`timeToFirstStrokeMs` needs a timestamp from *when the pen actually touched down*, not from when the JS `onStrokeComplete` callback happens to run (which fires on pointerup, after Delegated Ink Trails' async rendering) -- only the ink adapter sees the raw `pointerdown` event, so it must be the timestamp authority. This is why the port signature widens instead of Drill computing timing itself from callback-invocation time.

## Verification

**Commands:**
- `just check` -- expected: lint, typecheck, and the full Vitest suite (including the new `attempt-repository.test.ts` and updated `Drill.test.ts`) all pass.

**Manual checks (if no CLI):**
- In a browser, run a full drill (write, grade; reveal-from-blank, grade), reload the page, and inspect IndexedDB devtools to confirm the `attempts` store holds both records with grid-relative points.
