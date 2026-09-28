---
title: 'Story 2.2: Import Progress Data with Confirmation'
type: 'feature'
created: '2026-09-28'
status: 'done'
baseline_commit: '5ba885229ec0c55b25f2ce5b9a17f663bc044cea'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.1's export produces a backup file, but nothing can restore it. After storage is cleared or the app is reinstalled, the backup is useless.

**Approach:** Add an "Import" control to Settings. It takes a file, validates it against the 2.1 envelope (`version`, `AttemptExport` schema), and shows a modal-weight warning toast with the current data's date and the file's `exportedAt`. On confirm, it replaces all tallies, attempts and sessions in one atomic IndexedDB transaction and expands compact strokes back to `Stroke`. Cancel and rejection touch nothing.

**Decision (2026-09-28, user):** "the current local data's date" is the newest activity, meaning the latest attempt `timestamp` or session `date`. The warning shows it as "On this device: last practiced {date}", or "On this device: nothing yet" when both stores are empty. No new stored marker and no `DB_VERSION` bump.

## Boundaries & Constraints

**Always:**
- Validation is a pure `domain/` function taking `unknown`. It runs before any write and builds fresh records field by field, so unknown extra fields are dropped and never spread through.
- It rejects:
  - `version !== EXPORT_VERSION`
  - a missing or non-array `tallies`/`attempts`/`sessions`
  - a wrong primitive type, or a non-finite number
  - an out-of-union `selfGrade`, `closureReason`, `widthPreset`, `scope.scripts` or `scope.units` value
  - a `cardId` not in `CARDS`
  - an unparseable `timestamp`, `date` or `exportedAt`
  - a point that is not a 3-number array
  - duplicate attempt/session `id`s or tally `cardId`s
- It does not range-check `x`/`y`, because live strokes can leave the cell.
- The replace runs as one `readwrite` transaction over the three stores: clear, then put. Any failure calls `tx.abort()`, so the old data survives intact.
- Boundaries hold: `io` reaches persistence only through a new port, and `ui` reaches `io` only through a port. Wiring happens in `App.svelte`. Every failure resolves as a `Result`.
- Tap targets are at least 56px. Copy is plain, with no exclamation marks and no red fills.

**Never:**
- No merging, and no changes to settings.
- No per-store sequencing from the UI or `io`.
- No new dependency, no compression and no schema migration of older versions.
- No change to existing repository ports or to `DB_VERSION`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid file | 2.1 export picked | Warning toast: "Importing replaces everything here — tallies, attempts, history.", "On this device: last practiced {date}" (or "nothing yet") and "In the file: {exportedAt date}", with Replace and Cancel actions. Nothing written yet. | N/A |
| Confirm | Toast open, Replace tapped | Stores hold exactly the file's records. Strokes are expanded (`[x,y,p]` → `{x,y,pressure}`) with order preserved. The toast closes and the inline note reads "Imported. Your progress now matches the file." | N/A |
| Cancel | Toast open, Cancel tapped | The toast closes. There are zero writes and no note. | N/A |
| Round trip | Export, then import, then export | The second file's tallies, attempts and sessions deep-equal the first file's | N/A |
| Empty file data | Valid envelope with `[]` arrays | Toast shows, and confirming empties all three stores | N/A |
| Rejected | Non-JSON, wrong/missing `version`, bad shape, unknown `cardId` | No toast and no writes. The inline note under Import reads "That file isn't a tegakko backup -- nothing was changed." | `console.error` |
| Local read fails | Reading current data for the date fails | No toast and no writes. The note reads "Couldn't import -- nothing was changed." | `console.error` |
| Replace fails | The transaction aborts or `apply` rejects | The toast closes and the old data stays intact. The note reads "Couldn't import -- nothing was changed." | `console.error` |
| Same file twice | Pick, cancel, then pick the same file | The picker fires again, because the input value resets after every pick | N/A |
| Double tap | Replace tapped twice | Exactly one `apply` call | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/export.ts` -- `EXPORT_VERSION`, `ExportEnvelope`, `AttemptExport`, `StrokeExport`, `ATTEMPT_EXPORT_KEYS`. Reuse these and never redefine them.
- `src/domain/cards.ts` -- `CARDS`, `Script`, `CardKind` for validation. `WidthPreset` is in `domain/settings.ts`, `SelfGrade` in `attempt.ts` and `ClosureReason` in `session.ts`.
- `src/domain/result.ts` -- `ok`/`err`.
- `src/ports/progress-exporter.ts` -- the doc-comment model for the new ports.
- `src/adapters/persistence/db.ts` -- `openTegakkoDb`, store-name constants and `toError`. `tally-repository.ts` is the model for the open/try/catch/finally shape.
- `src/adapters/persistence/test-reset-db.ts` -- `resetDb()` for IndexedDB tests (fake-indexeddb).
- `src/adapters/io/json-progress-exporter.ts` -- the model for deps-object constructors with `Pick<>` port types and local `toError`.
- `src/adapters/ui/Settings.svelte` -- the Backup section, `runExport` guard pattern and `.action`/`.note` styles. Put Import below Export.
- `src/adapters/ui/Drill.svelte:392-760` -- `.toast` markup and CSS (peach `missed-bg`, `accent-on-peach`, `accent-strong` action, `radius-xl`, card shadow). Copy the styles; do not import them.
- `src/adapters/ui/format-date.ts` -- `formatDate(iso)` for both dates.
- `src/adapters/ui/Settings.test.ts` -- every `render(Settings, …)` needs the new prop and uses a `vi.fn()` fake.
- `src/app/App.svelte` -- composition root. ScopePicker and History re-read on mount, so the UI needs no cache invalidation after an import.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/import.ts` -- define:
  - `ImportData = { tallies: Tally[]; attempts: Attempt[]; sessions: Session[] }`
  - `validateImport(input: unknown): Result<{ exportedAt: string; data: ImportData }>`, which applies every Always rule and expands strokes. Error messages name the first failing path.
  - `latestActivity(attempts, sessions): string | null`
- [x] `src/domain/import.test.ts` -- cover a round trip of `buildExportEnvelope` output through `validateImport`, each rejection rule, stripping of extra fields, preservation of stroke and point order, and `latestActivity` including the empty case.
- [x] `src/ports/progress-replacer.ts` -- `ProgressReplacer { replaceAll(data: ImportData): Promise<Result<void>> }`, documented as all-or-nothing.
- [x] `src/ports/progress-importer.ts` -- `PendingImport { fileDate: string; localDate: string | null; data: ImportData }` and `ProgressImporter { prepare(json: string): Promise<Result<PendingImport>>; apply(p: PendingImport): Promise<Result<void>> }`. Invalid-file errors must be distinguishable from read errors, using a `kind: 'invalid' | 'failed'` on the error or a separate result tag.
- [x] `src/adapters/persistence/progress-replacer.ts` -- `IdbProgressReplacer`: one transaction; clear all three stores, then put every record; catch → `tx.abort()` (guarded) → `err`.
- [x] `src/adapters/persistence/progress-replacer.test.ts` -- cover the replace (old records gone, new ones present) and the atomic failure: seed data, then pass an attempt without an `id` so `put` throws. Assert `err` and that all seeded records are intact in all three stores.
- [x] `src/adapters/io/json-progress-importer.ts` -- `JsonProgressImporter` with deps `attempts: Pick<…,'listAll'>`, `sessions: Pick<…,'list'>` and `replacer`. `prepare` runs `JSON.parse` in a try block, then validates, then reads the local date. `apply` delegates to the replacer. Nothing throws out.
- [x] `src/adapters/io/json-progress-importer.test.ts` -- cover valid, invalid JSON, invalid shape (distinguished as `invalid`), a read failure or rejection (`failed`, replacer not called), and `apply` success and failure.
- [x] `src/adapters/ui/Settings.svelte` -- add a `progressImporter` prop and an "Import" `.action` button that clicks a hidden `<input type="file" accept=".json,application/json">`. Read the file with `file.text()`, call `prepare`, and reset `input.value`. Show the warning as a fixed toast over a full-screen scrim with `role="alertdialog"` and `aria-modal="true"`; it blocks the rest of the screen, and focus goes to Cancel. Use text-only actions: "Replace everything" in `accent-strong` and "Cancel" in `ink-muted`. Add in-flight guards and an `importNote`.
- [x] `src/adapters/ui/Settings.test.ts` -- add a fake importer everywhere, plus tests for these matrix rows: valid → toast with both dates, cancel → no `apply`, confirm → one `apply` plus a note, rejected → note with no toast, `apply` failure → note, and double-tap confirm.
- [x] `src/app/App.svelte` -- wire `IdbProgressReplacer` and `JsonProgressImporter` into `<Settings>`.

**Acceptance Criteria:**
- Given the Settings screen, when it renders, then an "Import" button shows under Backup next to Export.
- Given `just check` and `just build`, when run, then lint (including the hexagonal boundary), typecheck, tests and build all pass.

## Implementation Notes

- The `invalid`/`failed` distinction is a domain `ImportError` class (`kind` field) in `src/domain/import.ts`; the UI checks it with `isInvalidImportError`.
- `cardId`s are NFC-normalized before the `CARDS` lookup (matching `cards.ts`), and the normalized id is what gets stored.
- While the warning is open, `<main>` is `inert` under a full-screen scrim; Escape cancels. A `file.text()` failure shows the "Couldn't import" note.
- `IdbProgressReplacer` attaches a no-op `.catch` to every queued request and to `tx.done`, so an abort's cascade of rejections is never reported as unhandled.

## Spec Change Log

## Review Triage Log

Pass 1 (blind-hunter BH, edge-case-hunter EC, verification-gap VG):

| # | Finding | Verdict | Evidence / route |
|---|---------|---------|------------------|
| 1 | BH+EC: `isoDate` accepts any `Date.parse`-able string (`"2026"`, `"Sep 1 2026"`), and History sorts `date` as raw strings | low | Real: `history.ts:16` compares strings, so a non-ISO date misorders History. Every date the app writes is `toISOString()` (`drill-session.ts:211,307`, `export.ts` `exportedAt`), so an exact round-trip check can't reject a real backup. Direct correction → **patch** |
| 2 | BH+EC: numbers only `isFinite`-checked (negative/fractional `missCount`, counts, durations; `accuracy` outside [0,1]; `pressure`) | low | Real only for hand-edited files. 2.1's export can't produce them, and the worst outcome is a visual oddity (bar height/colour). The fix adds range helpers and guards → rejected (unlikely, adds complexity) |
| 3 | BH+EC: no cross-check of `attempt.sessionId` against sessions or of tallies against incorrect attempts | false | Orphan attempts are legitimate: attempts persist per grade, but a session record is written only on closure, so a killed session leaves attempts with no session. Rejecting them would refuse real backups. The tally mismatch is hand-edit only |
| 4 | BH: empty-string `id` accepted | low | IndexedDB accepts `""` as a key with no harm, and real ids are `randomUUID()`. Guard only → rejected |
| 5 | BH: `prepare()` loads every attempt with its strokes just to find the latest date | low | Real cost, roughly ~10 KB/attempt, read locally once before the toast. The fix needs a new narrow port method (public surface) → rejected |
| 6 | BH: round trip not tested through real IndexedDB | low | The domain round trip covers the matrix row. The replacer puts validated records as-is and export reads `getAll`, so there's no transform to drift. Adds integration test surface → rejected |
| 7 | BH: atomicity tested only for a synchronous `put` throw | low | VG confirmed the abort path is verified (the test fails with `tx.abort()` removed). An async request error aborts the tx by IndexedDB default. Rejected |
| 8 | VG+BH: Escape-to-cancel and `<main inert>` untested | low | Pre-verified by VG (removing either binding passes every test). Two small tests → **patch** |
| 9 | VG+BH: a `file.text()` rejection is untested | low | Pre-verified. Caused by this change, and the fix is one small test → **patch** (VG suggested defer; it's cheap enough to do now) |
| 10 | VG: NFC normalization of `cardId` untested | low | Pre-verified. Agent-added rule with no pin. One test → **patch** |
| 11 | BH: the double-tap test passes on `disabled`, never reaching the `applying` guard | low | Real, but the matrix behaviour (exactly one `apply`) is verified either way; the guard is belt-and-braces. Rejected |
| 12 | BH: a stale `exportNote` can sit beside a successful `importNote` (and vice versa) | low | Real: neither handler clears the other's note, so "Couldn't export" can show next to "Imported.". Clearing both notes at the start of each action is a direct correction → **patch** |
| 13 | BH: no warning when the file is older than local data | low | UX asks only for both dates to be shown. A new flag is a design addition → rejected |
| 14 | BH: 2-1 still `review` in sprint-status though merged; spec `in-review` vs sprint `in-progress` | low | The 2-2 mismatch is false (the workflow syncs at present). 2-1 `review` is pre-existing drift from Story 2.1 → **defer** |
| 15 | BH: scrim/shadow colours hard-coded rather than tokens | low | Pre-existing pattern: `Settings.svelte` `.card` and `Drill.svelte` `.toast` hard-code the same shadow. Rejected |
| 16 | BH: em dash vs `--` in copy | low | The copy is fixed by the frozen matrix; the fix edits this spec → rejected |
| 17 | BH: nothing added to `deferred-work.md` | false | No deferral had been decided before triage; this log's defer rows are now recorded there |
| 18 | BH: thin Given/When/Then ACs | low | The fix edits this build's spec → rejected |
| 19 | EC: empty or duplicate `scope.scripts`/`units` | low | Hand-edit only; guard → rejected |
| 20 | EC: a very large file freezes the tab | low | Single-user backups (~10 KB/attempt) are well within tablet memory; a size cap is a guard → rejected |
| 21 | EC: focus falls to `body` when the warning closes | low | Real: the focused Cancel button unmounts, and nothing refocuses. Returning focus to the Import button is a small, standard modal correction → **patch** |
| 22 | EC: Escape stops working if focus leaves the toast (a click on the scrim) | low | Keyboard-less stylus tablet target, and Cancel stays visible. Fix adds listeners → rejected |
| 23 | EC: local data changes in another tab between prepare and apply | low | Single user; a second tab practising mid-dialog is unlikely. Fix adds a re-read branch → rejected |
| 24 | EC: Back tapped while `prepare` is in flight | false | Nothing is written: `pending` lands on an unmounted component and is dropped. No bad outcome |
| 25 | EC: Import "next to Export" is stacked below it | false | It sits in the same Backup section, directly beneath Export, which reads as "next to" in a single-column layout. The UX specifies no side-by-side row |

## Design Notes

**Two ports:** `ProgressReplacer` is persistence's new atomic capability, and `ProgressImporter` is what `ui` calls. `io` owns parsing and orchestration, and `domain` owns the schema. This mirrors 2.1: adapters never import each other.

**Why `tx.abort()` is explicit:** a synchronous throw from `put()` (a `DataError` or `DataCloneError`) rejects the async function, but the already-queued `clear()` requests would still auto-commit. Only an explicit abort guarantees nothing is lost.

**Unknown `cardId` is rejected:** consumers such as `CardRepository.getById` throw on unknown ids, and the catalog only ever grows. So a real backup never contains one, and an imported one would break screens.

## Verification

**Commands:**
- `just check` -- expected: lint, typecheck and all tests pass
- `just build` -- expected: build succeeds

**Manual checks:**
- In `just dev`: export, draw one more attempt, then import the earlier file. Confirm the toast shows both dates, History shows the file's sessions, and the extra attempt is gone. Cancel leaves the data unchanged.
