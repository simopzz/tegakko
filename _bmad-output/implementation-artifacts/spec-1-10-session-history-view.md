---
title: 'Session History View'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'b486fec931a46b27299b01930f65c6a0d93ead02'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sessions close and persist (Story 1.9) but a learner has no way to look back at them — there's no way to tell whether recall is holding up or improving across days, only within one sitting.

**Approach:** Add a History screen — reverse-chronological session rows plus an up-to-10-session accuracy sparkline — reading the existing `sessions` store, reachable from the Scope picker header and the Session Summary screen.

## Boundaries & Constraints

**Always:**
- History reads only via `sessionRepository.list()` on mount; no writes, no editing/deleting rows.
- Rows are ordered by a dedicated sort over `date` (descending) — `list()`'s own order is unspecified per its port docstring.
- Sparkline covers at most the 10 most-recently-dated sessions, oldest→newest left to right; the newest (rightmost) bar is always `--color-accent`; every other bar's color comes from a 5-step accuracy ramp.
- Exactly one of: idle-closed → neutral "Closed on idle" chip + dimmed accuracy text; full-scope → positive "Whole scope" chip; explicit → no chip. Driven purely by `closureReason`, never by comparing `Session.scope`.
- Zero sessions: sparkline markup is entirely absent (not just hidden), single centered empty-state line.
- Reachable via a text link from both the Scope picker header and Session Summary; History's own "Back" always returns to the Scope picker.

**Never:**
- No pagination — `list()` always returns the complete set (Story 1.9's fixed contract).
- No shared/extracted chip stylesheet — follow the existing per-component scoped-CSS duplication (`chip--positive`/`chip--missed` already duplicated in `ScopePicker.svelte`/`SessionSummary.svelte`); add `chip--neutral` the same way.
- No live re-fetch/poll while History is mounted — one `list()` call, same one-shot pattern as `Settings.svelte`'s `onMount`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mixed closures | 3+ sessions incl. one idle, one full-scope, one explicit | Reverse-chron rows, correct chip/dimming per row | N/A |
| Single session | 1 record | One row, no divider; sparkline shows one accent bar | N/A |
| >10 sessions | 15 records | Sparkline shows only the latest 10; all 15 still listed as rows | N/A |
| No sessions | `list()` resolves `ok([])` | No sparkline markup; centered "No sessions yet. Finish a drill to see it here." | N/A |
| `list()` fails | rejected/`err` Result | Same empty-state rendering (fail-open) | `console.error`, fail-open |

</frozen-after-approval>

## Code Map

- `src/domain/history.ts` (NEW) -- `export function sortSessionsDescending(sessions: Session[]): Session[]` (new array, sorted by `date` string descending); `export function sparklineSessions(sortedDescending: Session[]): Session[]` (`sortedDescending.slice(0, 10).reverse()` -- chronological ascending, last element is newest); `export const RAMP_COLORS: readonly string[] = ['#ccdbb2', '#afbd95', '#919f78', '#74815c', '#56633f']` (5-step ramp, low→high, interpolated between `--color-grid-guide` and `--color-positive-accent` per DESIGN.md's qualitative description -- see Design Notes); `export function rampColorForAccuracy(accuracy: number): string` (`RAMP_COLORS[Math.min(4, Math.floor(accuracy * 5))]`); `export type ClosureChipVariant = 'positive' | 'neutral' | null`; `export function closureChipVariant(reason: ClosureReason): ClosureChipVariant` (`'full-scope' → 'positive'`, `'inactivity' → 'neutral'`, `'explicit' → null`).
- `src/domain/history.test.ts` (NEW) -- `sortSessionsDescending` (mixed/equal dates); `sparklineSessions` (>10 truncates to latest 10 in ascending order, empty input); `rampColorForAccuracy` boundary tests at each bucket edge (0, 0.2, 0.4, 0.6, 0.8, 1.0 -- 1.0 must map to index 4, not overflow); `closureChipVariant` for all three `ClosureReason` values.
- `src/adapters/ui/History.svelte` (NEW) -- follows `Settings.svelte`'s structural pattern exactly: `<main class="history"><div class="card"><header class="header"><button class="back" onclick={onBack}>Back</button><p class="label">History</p></header>...`. Props: `{ sessionRepository: SessionRepository; onBack: () => void }`. State: `let sessions = $state<Session[]>([])`, `let loaded = $state(false)`. `onMount`: `sessionRepository.list()`; on `ok`, `sessions = sortSessionsDescending(result.value)`; on failure, `console.error(...)` and leave `sessions` empty (fail-open); either branch then `loaded = true`. Gate all content in `{#if loaded}` (mirrors `Settings.svelte:140`). When `sessions.length > 0`: sparkline row of `sparklineSessions(sessions)` -- each bar's `background` is `var(--color-accent)` for the last (newest) element, else `rampColorForAccuracy(session.accuracy)` via inline `style`, height proportional to `session.accuracy`; then `<ul class="rows">` with one `<li class="row">` per session in `sessions` (already descending) showing formatted `date` (`new Date(session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })`), accuracy `{Math.round(session.accuracy * 100)}%` with class `dimmed` when `closureReason === 'inactivity'`, and a chip per `closureChipVariant(session.closureReason)` (`'positive'` → `chip chip--positive` "Whole scope", `'neutral'` → `chip chip--neutral` "Closed on idle", `null` → none). When `sessions.length === 0`: `<p class="empty">No sessions yet. Finish a drill to see it here.</p>`, no sparkline. CSS: reuse `ScopePicker.svelte`'s exact `.chip`/`.chip--positive` block, add `.chip--neutral { background: rgba(32, 30, 29, 0.07); color: var(--color-ink); }` (DESIGN.md's neutral chip-tag spec); `.row:not(:last-child) { border-bottom: 1px solid var(--color-ink-faint); }` for the hairline divider (omitted on the last row).
- `src/adapters/ui/History.test.ts` (NEW) -- `@testing-library/svelte`, mirrors `ScopePicker.test.ts`'s fake-repository pattern: `fakeSessionRepository(listResult: Result<Session[]>)`. Cover every I/O matrix row above plus: "Back" calls `onBack`; sparkline bar count and newest-bar color when >10 sessions are seeded.
- `src/adapters/ui/ScopePicker.svelte` (MODIFY) -- add prop `onHistory: () => void`; in the existing `.header` div (line ~123), add `<button type="button" class="link" onclick={onHistory}>History</button>` before the existing Settings link, both grouped in a right-aligned wrapper so `.header`'s `justify-content: space-between` still holds (label left, links right).
- `src/adapters/ui/ScopePicker.test.ts` (MODIFY) -- add `onHistory` to `renderScopePicker`'s default props/overrides; test tapping "History" calls it.
- `src/adapters/ui/SessionSummary.svelte` (MODIFY) -- add prop `onHistory: () => void`; add a header row above the existing `<h1 class="label" ...>` heading: `<div class="header"><button type="button" class="link" onclick={onHistory}>History</button></div>`, CSS copied from `ScopePicker.svelte`'s `.header`/`.link` blocks (`.header { display:flex; justify-content:flex-end; }`).
- `src/adapters/ui/SessionSummary.test.ts` (MODIFY) -- add `onHistory` prop to the render helper; test tapping "History" calls it.
- `src/app/App.svelte` (MODIFY) -- import `History from '../adapters/ui/History.svelte'`. Add `function handleOpenHistory(): void { screen = 'history'; }` and `function handleHistoryBack(): void { screen = 'scope-picker'; }`. Pass `onHistory={handleOpenHistory}` to both `<ScopePicker>` and `<SessionSummary>`. Add `{:else if screen === 'history'}<History {sessionRepository} onBack={handleHistoryBack} />` alongside the existing `{:else if}` chain.
- `src/app/App.test.ts` (MODIFY) -- add a test: tapping "History" from Scope picker shows the History screen, and its "Back" returns to Scope picker.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/history.ts` -- add sort/sparkline/ramp/chip-variant pure helpers.
- [x] `src/domain/history.test.ts` -- unit-test the pure helpers.
- [x] `src/adapters/ui/History.svelte` -- new History screen.
- [x] `src/adapters/ui/History.test.ts` -- render/behavior tests covering the I/O matrix.
- [x] `src/adapters/ui/ScopePicker.svelte` + `.test.ts` -- add "History" header link.
- [x] `src/adapters/ui/SessionSummary.svelte` + `.test.ts` -- add "History" header link.
- [x] `src/app/App.svelte` + `.test.ts` -- wire the `history` screen and its two entry points.

**Acceptance Criteria:**
- Given one or more sessions, when History opens, then rows render reverse-chronological with hairline dividers, omitted on the last row.
- Given an idle-closed session, then its row shows a neutral "Closed on idle" chip and dimmed accuracy; given full-scope, a positive "Whole scope" chip; given manual close, no chip.
- Given up to the last 10 sessions, then the sparkline's bar colors follow the 5-step ramp except the newest bar, always accent; idle-closed sessions are undistinguished in the sparkline.
- Given no sessions, then the sparkline is absent and the empty-state line renders with no call-to-action.
- Given the Scope picker or Session Summary screen, then a "History" link opens History; "Back" returns to the Scope picker.

### Review Findings (pass 2, 2026-09-08)

Layers: Blind Hunter, Edge Case Hunter, Verification Gap, Acceptance Auditor (no violations).
Triage: 1 decision-needed, 4 patch, 0 defer, 14 rejected (see appendix).

- [ ] ~~[Review][Decision] History dates render in the viewer's local timezone~~ — rejected per human decision 2026-09-08: local day is the intended session day; current behavior stands, no code change.
- [x] [Review][Patch] `formatDate` output is only self-checked [src/adapters/ui/History.test.ts] — every date expectation is computed with the same helper; add a literal-string assertion (dedicated `format-date` unit test).
- [x] [Review][Patch] History entry focus shift runs unasserted [src/adapters/ui/History.svelte:37-38] — add a `document.activeElement` test mirroring `SessionSummary.test.ts:140-144`.
- [x] [Review][Patch] Summary→History→Back path never clicks Back [src/app/App.test.ts:204] — extend the Summary-entry case to click "Back" and assert the Scope picker returns.
- [x] [Review][Patch] Focus indicator removed from History heading [src/adapters/ui/History.svelte:161-163] — `.label:focus { outline: none; }` leaves keyboard users with no visible focus location on entry; delete the rule.

Rejected appendix:
- false: sparkline `aria-hidden` hides info from screen readers — refuted: rows expose every session's date + accuracy percentage (strictly more than the bars); hiding the redundant visual is correct.
- rejected (spec-mandated): load failure renders the true-empty line — the I/O matrix explicitly requires identical fail-open rendering + `console.error`; changing it edits the spec.
- false: `rampColorForAccuracy` unclamped for negative/NaN accuracy — refuted: sole accuracy producer `computeAccuracy` (`src/domain/session.ts:78-82`) returns `correct / attempts.length` (0 when empty), mathematically in `[0, 1]`; no reachable out-of-range input.
- false: `sparklineSessions` silently wrong on unsorted input — refuted: sole caller passes `sortSessionsDescending` output; the parameter is named `sortedDescending`.
- false: `loaded` stuck on header-only when sort/fetch throws — refuted: `.catch` converts rejection into an `err` Result and `loaded = true` runs in both branches (`History.svelte:47-61`); the pure string-compare sort on a typed array cannot throw, and the port type returns a Promise (no sync throw for conforming impls). Same refutation covers the non-array `ok` value and post-unmount state-write claims.
- false: `screen = 'history'` lacks a union member — refuted: `src/adapters/ui/screens.ts:5` already includes `'history'`.
- rejected (spec edit): spec frontmatter `status: 'done'` vs sprint-status `review` — process metadata; fixing it edits the spec under review.
- rejected low: unbounded `<ul>` rows with no cap/virtualization — the spec's Never mandates no pagination with full listing, and added complexity is unwarranted at single-user drill scale.
- false: Settings link navigation uncovered after the header restructure — refuted: `ScopePicker.test.ts:222-236` asserts it against the current header.
- false: unknown `closureReason` falls through the switch — refuted: closed union (`src/domain/session.ts:17`), exhaustive switch, rejected by `tsc` at every call site.
- false: `formatDate` renders "Invalid Date" — refuted: sole date producer `Drill.svelte:462` `toISOString()` always yields a parseable ISO string.
- rejected low: never-settling `list()` promise leaves header-only screen — the idb adapter always settles; a timeout race adds complexity for an unreachable case.

## Implementation Notes

- `rampColorForAccuracy` indexes an internal `as const` tuple (typed as `0 | 1 | 2 | 3 | 4`) rather than the exported `readonly string[]`, avoiding a `noUncheckedIndexedAccess` fallback/non-null assertion while still exporting `RAMP_COLORS` in the shape the spec calls for.
- Row markup groups date + chip on the left, accuracy on the right within each `<li class="row">` -- the Code Map specified the required pieces but not their exact grouping; this is the judgment call made.
- `just check` verified independently (not just from the implementation subagent's report): lint 0 errors, typecheck 0 errors, 297/297 tests passing (up from 279 at baseline), including all 5 I/O-matrix rows in `History.test.ts` plus the new `ScopePicker.test.ts`/`SessionSummary.test.ts`/`App.test.ts` entry-point tests.
- **Patch pass:** all 6 patch-routed findings from review pass 1 were fixed (h1 heading + focus-on-mount mirroring `SessionSummary.svelte`, sparkline `.bar` `min-height`, de-duplicated `formatDate`, a varying-accuracy sparkline height/color test, a Summary→History `App.test.ts` navigation test, and `SessionSummary.test.ts` formatting) and independently verified: `just check` -- lint 0 errors, typecheck 0 errors, 299/299 tests passing.
- One deviation caught and fixed directly (not a reviewer finding): the patch pass initially exported `formatDate` from `History.svelte` via a `<script module>` block for `History.test.ts` to import. This satisfies `svelte-check` and Vitest but not raw `tsc --noEmit` (the first half of `typecheck`), which treats `.svelte` files as opaque default exports only -- `just check` failed with `TS2614`. Fixed by extracting `formatDate` into a plain `src/adapters/ui/format-date.ts` module, imported by both `History.svelte` and `History.test.ts`; `just check` re-verified green (299 tests) after this fix.

## Spec Change Log

## Review Triage Log

Review pass 1 (Blind Hunter, Edge Case Hunter, Verification Gap):

- **[medium, patch]** `History.svelte`'s header renders only `<p class="label">History</p>` -- no `<h1>` heading landmark anywhere on the screen, and no focus is shifted on entry. Verified against the established codebase precedent: `SessionSummary.svelte` explicitly moves focus to an `<h1 class="label" tabindex="-1" bind:this={heading}>` on `onMount` for the identical class of event (a full-screen swap that would otherwise drop focus to `<body>`), with a comment explaining why. History is reached the same way (a link tap causing a full-screen swap) but has neither a heading landmark nor a focus shift. Fix: mirror `SessionSummary.svelte`'s exact pattern. (Blind Hunter, two related findings merged.)
- **[medium, patch]** No test verifies that `SessionSummary`'s "History" link, once wired through `App.svelte:198` (`onHistory={handleOpenHistory}`), actually navigates to the History screen -- the only App-level History test starts from the Scope picker. Verified by reading all of `App.test.ts`: `handleOpenHistory`/`handleSummaryAgain` are both `() => void`, so a copy-paste swap (`onHistory={handleSummaryAgain}`) type-checks and every existing test (including `SessionSummary.test.ts`'s own, which supplies its own `vi.fn()`) stays green. Fix: add one `App.test.ts` case reaching Summary via Drill "I'm done", then clicking "History" and asserting the History screen renders. (Verification Gap + Blind Hunter, same root cause.)
- **[low, patch]** Sparkline `.bar` has `min-width: 8px` but no `min-height`; a 0%-accuracy session's bar renders at literal 0px height, an invisible sliver rather than a visible low bar. Verified by reading `History.svelte`'s `.bar` CSS and the inline `height` style. Fix: add a small `min-height` (e.g. 4px). (Blind Hunter.)
- **[low, patch]** `History.test.ts` re-derives its own copy of `History.svelte`'s `formatDate` logic to compute expected values rather than asserting fixed literal strings or importing the real function, so a regression in the formatting itself would not be caught (the test's copy would drift in lockstep). Verified: both copies are identical `toLocaleDateString` calls. Fix: export `formatDate` from `History.svelte` for the test to import, or assert literal expected strings. (Blind Hunter + Verification Gap, same root cause.)
- **[low, patch]** No test asserts the sparkline's `height:` style or a non-newest bar's ramp color against its own *varying* accuracy -- the only >10-session test seeds every session with the identical `accuracy: 0.5`, so it can't distinguish a correctly-computed per-bar ramp color from a coincidentally-non-accent placeholder. Verified: `grep -n "height" History.test.ts` finds zero matches. Fix: add a test seeding varying accuracies and asserting each bar's height percentage and specific ramp-bucket color. (Verification Gap.)
- **[low, patch]** `SessionSummary.test.ts` has two call sites where `onAgain: vi.fn(), onHistory: vi.fn(),` are squeezed onto one line, inconsistent with every other updated call site in the same diff (one prop per line). Verified by reading the diff. (Blind Hunter.)
- **[low, defer]** No loading affordance (spinner/skeleton) between `History` mounting and `sessionRepository.list()` resolving -- the card shows only the header. Verified this is a pre-existing gap: `Settings.svelte` has the identical `{#if loaded}`-gated pattern with no loading state, unmodified by this diff; History merely inherits an established, already-accepted convention rather than introducing a new one. (Blind Hunter.)
- **[false]** Claim: History rows should surface `cardsAttempted` so a "90%" from 4 cards isn't visually identical to one from 40. Refuted: DESIGN.md's `history-row` component spec (part of the frozen planning intent) enumerates exactly `date`, `accuracyColor`, and the closure chip -- no per-row card count is called for anywhere in the epic context or this spec's ACs; this is a scope expansion, not a missing requirement. (Blind Hunter.)
- **[false]** Claim: the sparkline should surface a caveat that idle-closed sessions are visually undistinguished there, since it can misleadingly read as a stable/improving trend. Refuted by the frozen spec's own AC and epic context, both explicit: "idle-closed sessions still appear in the sparkline, undistinguished there" is a deliberate design decision, not an oversight. (Blind Hunter.)
- **[false]** Claim: `sortSessionsDescending`'s lexicographic string comparison of `date` risks silent mis-ordering against a malformed or differently-formatted date string. Refuted: `Session.date` has exactly one producer in the codebase, `Drill.svelte:462`'s `new Date(effectiveClosedAt).toISOString()` -- always a fixed-format, `Z`-suffixed ISO-8601 UTC string, for which lexicographic ordering equals chronological ordering. No reachable call site can supply a differently-shaped value. (Blind Hunter.)
- **[false]** Claim: `rampColorForAccuracy` returns `undefined` for a negative `accuracy`, rendering an invalid `background-color`. Refuted: `Session.accuracy`'s only producer, `computeAccuracy`, returns `correct / attempts.length` (or `0` for zero attempts) -- mathematically bounded to `[0, 1]` for every reachable input; no call site can pass a negative value. (Edge Case Hunter.)
- **[false]** Claim: a sparkline bar's `height` style can overflow past 0-100% for an out-of-range `accuracy`. Refuted by the same bound as above -- `entry.accuracy` is always `Session.accuracy`, never outside `[0, 1]`. (Edge Case Hunter.)
- **[false]** Claim: `History.svelte`'s date formatting can render the literal text "Invalid Date" for an unparseable `sessionItem.date`. Refuted by the same single-producer argument as the `sortSessionsDescending` finding above -- `Session.date` is always a well-formed ISO string, for which `new Date(...)` never fails to parse. (Edge Case Hunter.)

No `intent_gap`/`bad_spec` entries this pass -- the implementation matches the spec's Code Map with no deviations found. All patch-routed findings above proceed to the auto-fix dispatch; the one defer-routed finding is logged to `deferred-work.md`.

## Design Notes

- **Ramp color derivation:** DESIGN.md describes the sparkline's ramp only qualitatively ("five-step accuracy ramp from `grid-guide` through `positive-accent` tones"). `RAMP_COLORS` linearly interpolates the two named tokens' RGB values at t = 0, 0.25, 0.5, 0.75, 1.0 to get five concrete, evenly-spaced stops — a direct reading of the stated endpoints, not a new design decision.
- **History "Back" always targets Scope picker:** even when opened from Session Summary, "Back" returns to the Scope picker rather than restoring the prior screen — avoids adding "previous screen" state for a single-portrait, no-router app where Summary's own exit ("Another round") already lands there too.

## Verification

**Commands:**
- `just check` -- lint, typecheck, full Vitest suite all pass.
