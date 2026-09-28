# Epic 2 Context: Backup & Portability

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic protects the single local user against browser or OS storage being cleared. The user can export all persisted progress to one plain JSON file: miss tallies, attempt records including their stroke ink, and session history. Later they can import that file to restore everything. Import is destructive by design because it replaces current data wholesale. So it must validate the file before touching anything and require an explicit two-step confirmation. The epic builds on Epic 1's persisted data model, and Epic 1 stays fully shippable without it. Export (2.1) has shipped. Import (2.2) is next.

## Stories

- Story 2.1: Export Progress Data
- Story 2.2: Import Progress Data with Confirmation

## Requirements & Constraints

- Export covers every persisted tally, attempt (with its strokes), and session in one plain JSON file. Compression (gzip) is deferred until export and import are validated in use.
- Settings (width preset, idle timeout, pen-check flag) are out of scope. Neither export nor import touches them.
- Import validates shape and `version` before applying anything. A malformed, unrecognized, or wrong-version file is rejected with an error and zero partial writes, and current data stays exactly as it was.
- A confirmed valid import deletes all current tallies, attempts, and sessions and replaces them with the file's contents. It never merges record by record. Replace-not-merge is a decided constraint. The PRD still marks it as an "assumption", but that label is stale.
- Canceling the confirmation leaves local data completely untouched.
- Export and import work fully offline in the installed PWA, with no network calls.
- A failed or blocked download needs no app-level recovery UI. Retrying the tap is enough.
- Accessibility floor: tap targets well above 48dp, and states are never shown by color alone.
- The target is Chromium on an Android tablet only.

## Technical Decisions

- **Placement:** export/import logic lives in `adapters/io`. The envelope types, compact mapping and schema validation belong in pure `domain/`, with no DOM or IndexedDB access. Define them once and share them between export and import.
- **Adapter boundaries:** `io` reaches data only through repository ports and never imports `persistence` or `ui`. The `ui` adapter (Settings) reaches `io` only through a port. Concrete adapters are wired only in `src/app/`. This boundary is lint-enforced.
- **Export envelope:** `{ version, exportedAt, tallies, attempts: AttemptExport[], sessions }`. Dates are ISO 8601 strings.
- **`AttemptExport`:** carries every `Attempt` field (`id, sessionId, cardId, timestamp, timeToFirstStrokeMs, totalTimeMs, strokeCount, revealUsed, selfGrade`). Its `strokes` use a compact form, `{ widthPreset, points: [x, y, pressure][] }`, with each number rounded to 4 decimals.
  - Build `AttemptExport` by explicit field mapping and never serialize the stored record as-is.
  - Import expands compact triples back into the persisted `Stroke` shape (`points: {x, y, pressure}[]`, grid-relative). It preserves stroke order and point order.
- **Canonical value types** must survive the round trip, and the validator must enforce them:
  - `selfGrade`: `'correct' | 'incorrect'`
  - `closureReason`: `'explicit' | 'full-scope' | 'inactivity'`
  - `Session.scope`: the structured object `{ scripts: ('hiragana'|'katakana')[]; units: ('base'|'yoon')[] }`, not a string
  - `Tally`: exactly `{ cardId, missCount }`
  - `cardId`: `"<grapheme>:<script>"`
  - `attempts` and `sessions` ids: `crypto.randomUUID()` strings
- **Validation:** check against the `AttemptExport` schema (not `Attempt`) plus `version`, and finish before any write. Parse JSON as `unknown` and narrow it only through validation. Use strict TypeScript with no explicit `any`.
- **Full reads:** export reads through `AttemptRepository.listAll()` (unpaginated), `TallyRepository.getAll()` and `SessionRepository.list()`.
- **Replace capability (2.2):** the repository ports have no bulk delete or replace method, so wholesale replace needs a new, deliberately designed port capability.
  - It must be all-or-nothing across `tallies`, `attempts` and `sessions`, for example one IndexedDB transaction. A mid-import failure must not leave mixed data.
  - The UI must never sequence per-store calls.
- **Errors:** persistence failures surface as a typed `Result` or a rejected Promise. A raw `DOMException` must never cross the adapter boundary.

## UX & Interaction Patterns

- **Where the controls live:** Export and Import are both in Settings, which is reached from the Scope picker header. There is one screen at a time and no router.
- **Import warning:** a modal-weight toast banner. It is the only modal and the only two-step destructive action in v1.
  - It states plainly that the replace is destructive. Reference copy: "Importing replaces everything here — tallies, attempts, history."
  - It shows the current local data's date and the incoming file's date.
  - It blocks the import until the user explicitly confirms or cancels.
- **Toast styling:** peach `missed-bg` background with `accent-on-peach` text, `rounded.xl`, and the single card shadow. The confirm action is text-only in `accent-strong`, with no fill and no border.
- **Import rejected:** inline error text under the Import control. No modal appears and no data is touched.
- **Voice:** plain and direct. Don't soften the destructive action. No exclamation marks and no praise.
- **Color:** no red or error fills anywhere. Terracotta is the only chromatic accent.

## Cross-Story Dependencies

- Story 2.2 must accept exactly what 2.1 produces. Reuse 2.1's shared domain envelope, `AttemptExport` types and `version` constant instead of redefining them. 2.1's `exportedAt` is the intended source for "the incoming file's date" in the import warning.
- Both stories extend Epic 1's Settings screen, use the `app/` composition root, and read the stores Epic 1 defined (`tallies`, `attempts`, `sessions`).
- Story 2.2 alone introduces the all-or-nothing replace capability on the persistence side. 2.1 intentionally left the existing repository ports unchanged.
