---
title: 'Story 2.1: Export Progress Data'
type: 'feature'
created: '2026-09-23'
status: 'done'
baseline_commit: 'ab4bfb110da8a38c0fca6e79ed7ffedccc2940b9'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** All progress (tallies, attempts, sessions) lives only in this browser's IndexedDB; clearing storage loses it with no backup path.

**Approach:** Add an "Export" control to Settings that downloads one plain JSON file with the AD-5 envelope `{version, exportedAt, tallies, attempts: AttemptExport[], sessions}` — every persisted record, attempts **including their strokes** in compact form. The envelope type and mapping are defined once in `domain/` so Story 2.2's import validates (and restores) exactly what this produces.

**Decision (2026-09-23, user):** stroke/ink data is included in the export (planning docs amended — SPEC CAP-13, PRD FR-13, AD-5, epics 2.1/2.2). Plain JSON, no compression; gzip is deferred (deferred-work.md) until export and import are validated in use.

## Boundaries & Constraints

**Always:** `adapters/io` reads data only through `AttemptRepository.listAll()`, `TallyRepository.getAll()`, `SessionRepository.list()` (port types) and is wired with concrete repos only in `src/app/App.svelte`. `Settings.svelte` sees only a new port type, never `adapters/io`. `AttemptExport` is built field-by-field (explicit allowlist), never by spreading `Attempt`. Strokes export as `{ widthPreset, points: [x, y, pressure][] }` with each number rounded to 4 decimals. `version` is the number `1` (`EXPORT_VERSION`). Dates are ISO 8601 (`exportedAt = now.toISOString()`). Works offline — no network. Tap target ≥56px, matching the existing `.back`/`.pill` controls.

**Never:** No settings-store data in the file. No compression. No import, validation, or replace logic (Story 2.2). No success toast/modal and no download-failure recovery UI. No red/error fill. No new dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Stores hold tallies, attempts (with strokes), sessions | One file `tegakko-export-YYYY-MM-DD.json` (local date) downloads; contains every record; each attempt's strokes as compact rounded `[x, y, pressure]` triples, stroke order and point order preserved | N/A |
| No-ink attempt | Revealed-from-blank attempt, `strokes: []` | Exported with `strokes: []` | N/A |
| Empty stores | Fresh install | File downloads with `tallies: [], attempts: [], sessions: []` | N/A |
| Read fails | Any of the three reads returns `{ok:false}` or rejects | No download; exporter returns `err` | Settings shows inline note "Couldn't export -- try again." (existing `.note` style); console.error |
| Double tap | Export tapped while one is in flight | Second tap is a no-op; exactly one download | N/A |
| Retry | Tap after a failure | Note clears; export runs again | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/attempt.ts` -- `Attempt` (source of the mapping); `SelfGrade`.
- `src/domain/ink.ts` -- `Stroke { points: StrokePoint[]; widthPreset }`, `StrokePoint { x, y, pressure }` (grid-relative 0..1); source of the compact mapping.
- `src/domain/tally.ts`, `src/domain/session.ts` -- `Tally`, `Session` exported as-is.
- `src/domain/result.ts` -- `Result`, `ok`, `err`; all adapter failures resolve through these.
- `src/ports/*-repository.ts` -- existing repo ports; the model for doc-comment style of the new port. Do not change them (the replace capability is 2.2's).
- `src/adapters/io/.gitkeep` -- placeholder; replace with the adapter.
- `src/adapters/ui/Settings.svelte` -- add an Export section below "Idle close"; reuse `.heading`/`.body`/`.note` classes; button styled like `.back` (outline, 56px).
- `src/adapters/ui/Settings.test.ts` -- fakes the port with `vi.fn()` (never imports persistence); every `render(Settings, …)` call needs the new prop.
- `src/app/App.svelte` -- composition root: construct the exporter from the three existing repo instances, pass to `<Settings>`.
- `src/app/App.test.ts` -- mocks persistence modules; Settings-navigation tests must still pass.
- `eslint.config.js` -- `io` zone already exists; no change.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/export.ts` -- add `EXPORT_VERSION = 1`, `StrokeExport = { widthPreset: WidthPreset; points: [number, number, number][] }`, `AttemptExport = Omit<Attempt, 'strokes'> & { strokes: StrokeExport[] }` (derived, so a new `Attempt` field makes `toAttemptExport`'s explicit literal fail to type-check instead of silently dropping from backups), `ExportEnvelope`, pure `toAttemptExport(a)` (explicit field copy; points → rounded 4-dp triples) and `buildExportEnvelope(tallies, attempts, sessions, now: Date)`, and `exportFileName(now: Date)` → `tegakko-export-YYYY-MM-DD.json` using local date parts -- single shared definition for 2.1 and 2.2.
- [x] `src/domain/export.test.ts` -- mapping keeps all 10 fields and no others; points become rounded triples in order (e.g. `{x:0.123456,y:0.5,pressure:0.99999}` → `[0.1235,0.5,1]`); `widthPreset` per stroke kept; `strokes: []` stays `[]`; envelope shape/version/ISO `exportedAt`; filename zero-pads.
- [x] `src/ports/progress-exporter.ts` -- `interface ProgressExporter { export(): Promise<Result<void>> }` with doc comment (read all → serialize → hand to the browser download).
- [x] `src/adapters/io/json-progress-exporter.ts` -- `JsonProgressExporter implements ProgressExporter`; constructor takes the three repo ports plus optional `download(fileName, json)` and `now()` seams (defaults: Blob + `URL.createObjectURL` + transient `<a download>` click + revoke; `new Date()`). Any `{ok:false}` or rejection → `err`, no download. Compact JSON: `JSON.stringify(envelope)` with no indentation (indenting puts every triple element on its own ~14-space-indented line, ~4–5× bigger). Delete `.gitkeep`.
- [x] `src/adapters/io/json-progress-exporter.test.ts` -- fake ports; happy path passes the envelope JSON + filename to `download`; each read failure (resolved err and rejection) → `err`, `download` not called; serialized JSON has no newlines; plus one test of the **default** `download` (no seam injected): stub `URL.createObjectURL`/`revokeObjectURL`, spy `HTMLAnchorElement.prototype.click` capturing `download`/`href`, fake timers — asserts filename + href, one click, anchor removed from `document.body`, revoke not called before timers run and called with that URL after.
- [x] `src/adapters/ui/Settings.svelte` -- new `progressExporter: ProgressExporter` prop; "Backup" heading, one-line body ("Download your tallies, attempts, handwriting and history as one file."), "Export" button; in-flight guard; failure note under the button.
- [x] `src/adapters/ui/Settings.test.ts` -- pass a fake exporter everywhere; tests: tap calls `export()` once; double tap → once; failure shows note, retry clears it.
- [x] `src/app/App.svelte` -- wire `new JsonProgressExporter({ attempts: attemptRepository, tallies: tallyRepository, sessions: sessionRepository })` into `<Settings>`.

**Acceptance Criteria:**
- Given the Settings screen, when it renders, then an "Export" button is visible under a "Backup" heading.
- Given `just check` and `just build`, when run, then lint (incl. hexagonal boundary), typecheck, tests, and build all pass.

## Implementation Notes

- Loop 1 re-derivation: `JsonProgressExporterDeps` takes `Pick<…Repository, 'listAll' | 'getAll' | 'list'>` rather than the full ports — still port types (AD-1), and it makes the adapter's read-only use explicit. Real repos satisfy it structurally.

## Spec Change Log

- **Loop 1 (2026-09-23)** — Trigger: review finding #1 (pretty-printed JSON bloats compact points ~4–5×), plus #2 (hand-written `AttemptExport` not tied to `Attempt`) and #3 (default `browserDownload` untested). Amended: io-adapter task now requires compact `JSON.stringify(envelope)`; domain task derives `AttemptExport` from `Attempt`; io test task adds a default-download test and a no-newline assertion. Known-bad state avoided: a "compact" format whose file is dominated by indentation whitespace; future `Attempt` fields silently missing from backups; a broken real download passing CI. KEEP: everything else from the first implementation — `domain/export.ts` layout (`EXPORT_VERSION`, `StrokeExport`, `round4`, `toStrokeExport`, `buildExportEnvelope`, local-date `exportFileName`); `ports/progress-exporter.ts` and its doc comment; `JsonProgressExporter` constructor deps object with `download`/`now` seams, `Promise.all` reads, try/catch → `err`, deferred `setTimeout(0)` revoke with its comment; Settings `runExport` in-flight guard, `.catch` → `err` fallback, "Backup" section markup and `.back, .action` shared style; the `exporter()` test helper and the Settings `export` describe block; the six-case failure loop and happy/empty tests in the io test; App wiring comment.

## Review Triage Log

Pass 1 (blind-hunter BH, edge-case-hunter EC, verification-gap VG):

| # | Finding | Verdict | Evidence / route |
|---|---------|---------|------------------|
| 1 | BH: `JSON.stringify(envelope, null, 2)` puts every triple element on its own indented line, voiding the compact-points size rationale | medium | Real: depth-7 nesting → ~14-space indent per number, ~90 B/point vs ~20 B compact. Root cause is the spec task text "pretty-printed (2-space)" → **bad_spec** |
| 2 | BH: `AttemptExport` hand-written; a new `Attempt` field would type-check yet be silently dropped from backups | medium | Real: interface + manual copy + hard-coded test list all agree with each other, none tie to `Attempt`. Folded into bad_spec amendment (derive the type) |
| 3 | VG+BH: default `browserDownload` never runs in any test; dropping `anchor.download` or sync revoke passes `just check` | medium | Real: only construction injects `download: vi.fn()`; App.test never taps Export. Folded into bad_spec amendment (test the default path) |
| 4 | BH+EC: tallies/sessions pass through un-allowlisted; extra stored fields would leak | false | Only writers are `tally-repository.ts` (`put(next)` of a `{cardId, missCount}` literal) and `session-repository.ts` (`add(session)` from `buildSessionRecord`'s exact literal); no path stores extra fields |
| 5 | BH+EC: NaN/Infinity points serialize as `null` | false | `normalizePressure` maps any falsy pressure (incl. NaN) to 0.5; x/y divide by the rendered canvas box, non-zero while it receives pointer events |
| 6 | BH: stale "ink excluded" text in `.memlog.md` files and PRD FR-13 description | low | Real doc drift; direct correction — applied outside the code loop (memlog amendment lines appended, PRD description updated) |
| 7 | BH: PRD amendment note sits on the compression bullet | low | Real; reworded directly |
| 8 | BH: spec `in-review` vs sprint-status `in-progress` | false | Workflow syncs sprint-status to `review` at the present step |
| 9 | BH: no visual busy state on Export | low | Local reads + stringify are sub-second; fix adds state/UI → rejected (low, unlikely, adds complexity) |
| 10 | BH: revoke via `setTimeout(0)` races on mobile; `<a download>` unreliable in iPadOS standalone PWA | false | Product is Chromium-Android only (SPEC constraints); Chromium keeps the blob alive through an initiated download |
| 11 | BH: no App-level test that Settings gets a wired exporter | low | Required prop + typed ports make miswiring a type error; rejected (low, adds test surface for a compile-time-guarded path) |
| 12 | BH+EC: three reads are separate transactions → possibly inconsistent snapshot | low | Export only reachable from Settings (no drill mounted); single-user, a second tab mid-export is unlikely; fix needs a new snapshot port → rejected |
| 13 | BH: fourth `<h1>` in Settings | low | Pre-existing heading pattern (two `<h1>` already); → **defer** to a11y bundle |
| 14 | BH: spec ACs don't restate matrix rows; empty log sections | false | Fix would edit this build's spec; matrix is the AC source by template design → rejected |
| 15 | EC: synchronous throw from `export()` skips `.catch` | false | Sole implementation is an `async` method, which cannot throw synchronously; port returns `Promise` |

Pass 2 (after loop 1):

| # | Finding | Verdict | Evidence / route |
|---|---------|---------|------------------|
| 16 | EC: `export()` never settling (stalled IDB open) leaves `exporting` stuck | false | `db.ts` `blocked()` handler rejects the open with a typed error (DW-2/20 guard), so repo reads settle; adapter's try/catch turns that into `err` |
| 17 | EC: `Omit<Attempt,'strokes'>` only catches new *required* fields; a new optional `Attempt` field would silently drop | low | Real TS behaviour (optional props may be absent from the literal). **patch**: unexported exhaustive key map `satisfies Record<keyof Attempt, true>` + test that `toAttemptExport` output keys equal it |
| 18 | VG+BH: "local date" filename test can't catch a UTC regression (CI is UTC, dev is +02:00) | low | Pre-verified by VG. **patch**: pin a far-from-UTC `TZ` inside `export.test.ts` and add a just-after-midnight case |
| 19 | VG: mis-indented `settingsRepository:` lines / overlong `render(...)` lines in `Settings.test.ts` | low | Real, cosmetic, direct correction → **patch** |
| 20 | BH: `browserDownload` leaves anchor/URL behind if `click()` throws | low | `HTMLAnchorElement.click()` doesn't throw in practice; fix adds try/finally for an undemonstrated state → rejected |
| 21 | BH: nothing forces an `EXPORT_VERSION` bump on shape drift | low | Future-only; Story 2.2's validator + its tests pin the accepted shape; fix adds a snapshot guard → rejected |
| 22 | BH: UX `.memlog.md:18` still says "not raw stroke/ink data" | low | Real doc drift missed in pass 1 → corrected directly (supersede entry appended) |
| 23 | BH: PRD FR-13 still tags replace-not-merge as `[ASSUMPTION … confirm before build]` | low | Pre-existing (SPEC memlog already promoted it to a decided constraint); not caused by this story → **defer** |
| 24 | BH: new deferred-work entries lack `### DW-NN` ledger format | false | Entry shape is mandated verbatim by this workflow's defer template; `bmad-loop-sweep --migrate` normalizes such entries |
| 25 | BH: triage row #13 says "fourth `<h1>`" (it's the third) | low | Fix edits this build's spec → rejected (the deferred-work entry states it correctly) |
| 26 | BH: Settings retry test asserts before the second `export()` settles | low | Real: assertion at `Settings.test.ts:434` runs right after click; a success path that re-set the note would pass. **patch**: settle before asserting |
| 27 | BH: default-download test never checks the Blob's type/payload | low | Real; dropping `type: 'application/json'` would pass. **patch**: assert `createObjectURL` got a `Blob` with that type and the envelope JSON text |
| 28 | BH: Export button has no busy/disabled state | low | carried #9 — same claim, `runExport` guard unchanged in substance; rejected |
| 29 | BH: `toError` duplicated in adapter and Settings | low | Two call sites; hoisting adds public surface to `domain/result.ts` → rejected |
| 30 | BH: memory/size of full-ink export unexamined; `exportedAt` UTC vs local filename | low | Local single-user data (≈10 KB/attempt compact) is well within tablet memory; `exportedAt` display is Story 2.2's concern → rejected |

## Design Notes

Why a new `ProgressExporter` port instead of Settings calling repos directly: the architecture assigns FR-13 to `adapters/io`, and adapters can't import siblings — `ui` reaching `io` needs a port, exactly like `ui`→`ink` via `InkSurface`. The `download`/`now` constructor seams keep the adapter testable under happy-dom without stubbing `URL.createObjectURL`.

Compact points: a naive `{x,y,pressure}` object per point at full float precision is roughly 3–4× larger; 4 decimals is ~0.04px on a 400px cell, below visible resolution. Story 2.2 owns the inverse (triple → `StrokePoint`).

Filename, `version = 1`, and the "Backup" copy are agent decisions (low stakes, easy to change); Story 2.2 will read `exportedAt` as "the incoming file's date".

## Verification

**Commands:**
- `just check` -- expected: lint, typecheck, all tests pass
- `just build` -- expected: build succeeds

**Manual checks (if no CLI):**
- In a running build, Settings → Export downloads a file; open it and confirm attempts carry compact `strokes` and record counts match History/attempts.
