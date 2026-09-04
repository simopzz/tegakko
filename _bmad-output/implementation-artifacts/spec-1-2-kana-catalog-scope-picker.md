---
title: 'Kana Catalog & Scope Picker'
type: 'feature'
created: '2026-09-04'
status: 'done'
baseline_commit: '4f81c8826c6f784ddc5f16164112682a2cc23273'
route: 'dispatch'
review_loop_iteration: 0
context: [
  '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md',
]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No card content or scope selection exists yet — the app shell (Story 1.1) has nowhere to send a learner except a placeholder screen, and there is no data for any later drill/selection story to read.

**Approach:** Author the static 158-card kana catalog as a `domain/cards.ts` module with an in-memory `content` adapter, and build the Scope picker screen: script/set pill toggles, a live card-count recompute, and a "Start writing" action that hands the chosen `{scripts, units}` scope forward.

## Boundaries & Constraints

**Always:** `Card` = `{cardId, grapheme, script: 'hiragana'|'katakana', kind: 'base'|'yoon'}`, `cardId` = `` `${grapheme}:${script}` `` (AD-3) — yoon `cardId`s use the full two-char grapheme, never decomposed. Exactly 158 cards: 46/46 base, 33/33 standard-yoon-only (11 rows × ゃゅょ), no extended loanwords. `CardRepository` is sync, un-wrapped per AD-9 (`getAll(): Card[]`, `getById(id): Card` — no `Result`/`Promise`; unlike IndexedDB, a bundled array read can't fail). `Scope` = `{scripts: ('hiragana'|'katakana')[], units: ('base'|'yoon')[]}` (AD-4); filtering by scope is a pure `domain` function. Default = full catalog, "158 cards"; pill-toggle groups commit immediately, exactly one active segment per group, live recompute; script/set render as positive-variant chip tags; tap targets ≥48dp.

**Never:** No `romaji` field on `Card` — outside AD-3's fixed shape; add only when a future prompt screen needs it. No "N shaky" badge (needs tallies, Story 1.6/1.7 — absent from this story's own ACs). No Drill-screen UI or `TallyRepository`/`AttemptRepository` work — "Start writing" only carries `Scope` forward into the existing `'drill'` placeholder.

</frozen-after-approval>

## Code Map

- `src/domain/cards.ts` -- NEW. `Card` type + exported `CARDS: Card[]` (158 entries).
- `src/domain/scope.ts` -- NEW. `Scope` type + `cardsInScope(cards, scope): Card[]` pure filter (capability map: FR-2 → domain scope filter, not adapter/UI).
- `src/ports/card-repository.ts` -- NEW. `CardRepository` port, sync signatures (AD-9) -- same file shape as `src/ports/settings-repository.ts`, not its async/`Result` pattern.
- `src/adapters/content/card-repository.ts` -- NEW. `InMemoryCardRepository implements CardRepository`, reads `domain/cards.ts`. Replaces `src/adapters/content/.gitkeep`.
- `src/adapters/ui/ScopePicker.svelte` -- NEW. Follow `src/adapters/ui/FirstRun.svelte`'s pattern: own scoped `<style>` using existing `--color-*`/`--radius-*`/`--spacing-*` tokens (`src/app/theme.css`, nothing new needed), callback props (`cardRepository`, `onStart: (scope: Scope) => void`), and its `render`/`screen`/`fireEvent` (`@testing-library/svelte`) test style -- see `FirstRun.test.ts`.
- `src/adapters/ui/screens.ts` -- unchanged; `'scope-picker'`/`'drill'` already exist (Story 1.1).
- `src/app/App.svelte` -- MODIFY. Replace the `screen === 'scope-picker'` placeholder with `<ScopePicker>`; add a `scope` state variable set by `onStart`, then `screen = 'drill'`. `'drill'`'s own placeholder is untouched -- Story 1.3's screen.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/cards.ts` -- author the 158-card static catalog + `Card` type -- FR-1, AD-3
- [x] `src/domain/scope.ts` -- `Scope` type + `cardsInScope` pure filter -- FR-2, AD-4
- [x] `src/ports/card-repository.ts` -- `CardRepository` port -- AD-9
- [x] `src/adapters/content/card-repository.ts` -- in-memory adapter -- AD-3
- [x] `src/adapters/ui/ScopePicker.svelte` -- script/set pill toggles, live count, chip tags, "Start writing" -- epics.md Story 1.2
- [x] `src/app/App.svelte` -- wire `ScopePicker` in place of the placeholder, carry `scope` forward -- integration
- [x] `src/domain/cards.test.ts` -- exact bucket counts (46/46/33/33), id uniqueness, no cross-script/base-yoon collapse
- [x] `src/domain/scope.test.ts` -- filter behavior across script/unit combinations, including the full-scope default
- [x] `src/adapters/content/card-repository.test.ts` -- `getAll`/`getById` against the real catalog
- [x] `src/adapters/ui/ScopePicker.test.ts` -- default 158-card count, live recompute on each pill tap, `onStart` receives the exact narrowed `Scope`

**Acceptance Criteria:**
- Given the static catalog, when the app loads, then exactly 158 distinct cards exist, each uniquely keyed by `` `${grapheme}:${script}` ``, with no same-sound card collapsing across script or base/yoon
- Given the Scope picker with no changes, when it renders, then the full 158-card scope is selected by default and the live count reads "158 cards"
- Given the user taps a script pill (Hiragana/Katakana/Both) or set pill (Base/Yoon/Both), when exactly one segment per group becomes active, then the "N cards in scope" count recomputes immediately with no confirm step
- Given a narrowed scope (e.g. Hiragana + Base = 46 cards), when "Start writing" is tapped, then that exact `{scripts, units}` scope is what gets carried forward
- Given the Scope picker, when rendered, then script/set metadata renders as positive-variant chip tags and every tap target meets or exceeds Android's 48dp minimum

## Implementation Notes

## Spec Change Log

## Review Triage Log

- `low` [blind-hunter] Set pill group's third option is labeled "All" in `ScopePicker.svelte`/`ScopePicker.test.ts`, but the AC (and epics.md) literally say "Base/Yoon/Both" — a real copy mismatch against spec text; harmless functionally, fix is a direct label rename. → patch
- `false` [blind-hunter] Live count renders "158 cards in scope" vs the AC's "reads '158 cards'" — disproven: "158 cards in scope" contains "158 cards" verbatim, and a sibling AC bullet independently requires the "N cards in scope" phrasing; both are satisfied simultaneously by the one string shipped.
- `medium` [blind-hunter] Pill-toggle active/inactive state is signaled only by background-fill color (`.pill--active`), with no `aria-pressed` or other non-color cue — a real screen-reader gap on a new interactive toggle control; fix is adding `aria-pressed={condition}` to the six existing buttons, trivial, no new surface. → patch
- `low` [blind-hunter] `App.test.ts`'s new scope-forwarding test only exercises the default full-scope path, not a narrowed one end-to-end through `App.svelte` — real gap, but low-impact: the narrowed-scope object's correctness is already fully unit-tested in `ScopePicker.test.ts`'s `onStart` assertions; only the App-level glue is under-covered. → patch
- `defer` [blind-hunter + verification-gap "Other findings"] The ≥48dp tap-target AC is unverified by any test — `happy-dom` can't resolve CSS `min-height` via `getComputedStyle`, so `ScopePicker.test.ts` substitutes a "real `<button>` element" check (documented in its own comment). Confirmed pre-existing: `FirstRun.test.ts` (Story 1.1) has the same gap for its own 88px buttons, so this isn't introduced by this diff — recorded once, covering both components.
- `false` [blind-hunter] epic-1-context.md's rewrite allegedly drops IndexedDB schema/enum detail, pinned dependency versions, the mouse/touch graceful-degradation note, and narrows the platform to "Chromium Android" — disproven on all four: `ARCHITECTURE-SPINE.md` (unmodified) still carries the exact `sessions`/`settings` schema, `closureReason` enum, and repository signatures; the pinned versions are now in `package.json` (shipped code, which `compile-epic-context.md`'s own rule says not to duplicate); the mouse/touch note is unmodified in `EXPERIENCE.md`; and "Chromium Android" faithfully compresses `ARCHITECTURE-SPINE.md`'s own already-Chromium-Android-only scope line. Nothing is inaccessible, only de-duplicated per that compile task's documented rules.
- `false` [blind-hunter] `sprint-status.yaml` shows `in-progress` while the spec's own frontmatter shows `in-review` — disproven as a shipped inconsistency: this same workflow syncs sprint-status to `review` at step-05, which had not yet run when this diff was captured.
- `low` [blind-hunter] `cards.test.ts`'s dedicated "never collapses across script"/"never collapses yoon into base" tests are narrower than their names imply (script-pair comparison can't collide by construction; the yoon check spot-tests one row) — real clarity issue, but exhaustive collision coverage already exists via the separate generic `Set`-based uniqueness assertion over all 158 ids, so no actual gap in what's verified. Fix (broaden the spot-check to the full row set, or a clarifying comment) is trivial. → patch
- `medium` [verification-gap, pre-verified] `ScopePicker.test.ts` never asserts that chip tags shrink to match a narrowed selection — every narrowing test only reads the count text or the `onStart` argument, never `.chips` content. A regression that hardcodes both script/set chip labels regardless of selection would ship undetected, silently misrepresenting the active scope to the learner. → patch
- [edge-case-hunter] Zero findings — exhaustive trace of all new/changed code paths found no unhandled branches, call-site mismatches, or falsified claims against the spec.

## Verification

**Commands:**
- `just check` -- expected: lint, typecheck, and test all pass with zero errors, including the new `cards`/`scope`/`card-repository`/`ScopePicker` tests
