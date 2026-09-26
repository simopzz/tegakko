# Epic 2 Context: Backup & Portability

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give the single local user a safety net against browser/OS storage being cleared: export all persisted progress (miss tallies, attempt records with their stroke ink, session history) to one JSON file, and later import such a file to restore it. Import is destructive by design — it replaces current data wholesale — so it must validate the file before touching anything and require an explicit confirmation step. This epic builds on Epic 1's persisted data model; Epic 1 stays fully shippable without it.

## Stories

- Story 2.1: Export Progress Data
- Story 2.2: Import Progress Data with Confirmation

## Requirements & Constraints

- Export covers every persisted tally, attempt (including its strokes), and session record, in a single plain JSON file. Compression (gzip) is deferred until export/import is validated in use.
- Import validates the file's shape and version before applying anything. Malformed, unrecognized, or wrong-version files are rejected with an error and zero partial writes; current data stays exactly as it was.
- A valid, confirmed import deletes all current tallies, attempts, and sessions and replaces them with the file's contents. It never merges record by record.
- Canceling the confirmation leaves local data completely untouched.
- Export and import must work fully offline in the installed PWA. No network calls.
- Settings (width preset, idle timeout, pen-check flag) are not part of the export scope. Only tallies, attempts, and sessions are.
- A failed or blocked browser download needs no app-level recovery UI. Retrying the tap is enough.
- Accessibility floor still applies: tap targets well above 48dp, and states are never shown by color alone.

## Technical Decisions

- **Placement:** export/import logic lives in a new `adapters/io` adapter. Schema validation belongs in `domain/`, which stays pure (no DOM or IndexedDB). The `io` adapter must not import `persistence` or `ui` directly. It reaches data through repository ports, and concrete adapters are wired only in `src/app/`. This boundary is lint-enforced.
- **Export envelope:** `{ version, exportedAt, tallies, attempts: AttemptExport[], sessions }`. Dates are ISO 8601 strings.
- **`AttemptExport`** carries every `Attempt` field — `id, sessionId, cardId, timestamp, timeToFirstStrokeMs, totalTimeMs, strokeCount, revealUsed, selfGrade` — plus `strokes` in compact form: `{ widthPreset, points: [x, y, pressure][] }`, each number rounded to 4 decimals. The `io` adapter maps `Attempt → AttemptExport` explicitly before serializing; import expands compact strokes back to the persisted `Stroke` shape. Never serialize the stored record as-is.
- **Canonical value types, preserved through export and import:**
  - `selfGrade`: `'correct' | 'incorrect'`
  - `closureReason`: `'explicit' | 'full-scope' | 'inactivity'`
  - `Session.scope`: the structured object `{ scripts: ('hiragana'|'katakana')[]; units: ('base'|'yoon')[] }`, not a string
  - `Tally`: exactly `{ cardId, missCount }`
  - `cardId`: `"<grapheme>:<script>"`
- **Import validation** checks against the `AttemptExport` schema (not `Attempt`) plus the `version` field, and completes before any write.
- **Full attempt history:** reading data for export must use the unpaginated `AttemptRepository.listAll()`. Tallies come from `TallyRepository.getAll()` and sessions from `SessionRepository.list()`.
- **Port changes:** the fixed repository ports have no bulk delete/replace method. Wholesale replace needs a new, deliberately designed port capability. It must be all-or-nothing across the three stores (for example, a single IndexedDB transaction), so a failure mid-import cannot leave mixed data. Never sequence per-store UI-level calls.
- **Error handling:** persistence failures surface as a typed `Result` or a rejected Promise, never a raw `DOMException` crossing the adapter boundary.
- **Types:** TypeScript strict mode, and no explicit `any`. Parsed JSON must be narrowed from `unknown` through validation.

## UX & Interaction Patterns

- **Settings screen:** Export and Import controls both live in Settings. Settings is reached from the Scope picker header. There is one screen at a time and no router.
- **Import warning:** a modal-weight toast banner, and the only modal and only two-step destructive action in v1.
  - It states plainly that the replace is destructive. The reference copy is "Importing replaces everything here — tallies, attempts, history."
  - It shows both the current local data's date and the incoming file's date.
  - It blocks the import until the user explicitly confirms or cancels.
- **Toast styling:** peach `missed-bg` background with `accent-on-peach` text, `rounded.xl`, and the single card shadow. The confirm action is text-only in `accent-strong`, with no fill and no border.
- **Import rejected:** show inline error text under the Import control. No modal, and no data touched.
- **Voice:** plain and direct. No soft-pedaling of the destructive action, no exclamation marks, and no praise.
- **Color:** no red or error fills anywhere. The only chromatic accent is terracotta.

## Cross-Story Dependencies

- Story 2.2 depends on 2.1's envelope format, `version` value, and `AttemptExport` mapping. Import must accept exactly what export produces, so the shape and validator should be defined once and shared.
- Both stories extend the existing Settings screen and the `app/` composition root from Epic 1, and read the persistence stores Epic 1 defined (`tallies`, `attempts`, `sessions`).
- Story 2.2 requires a new all-or-nothing replace capability on the persistence side, as described under Technical Decisions.
