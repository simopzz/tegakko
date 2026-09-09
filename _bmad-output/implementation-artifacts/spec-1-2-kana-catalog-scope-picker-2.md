---
title: 'Kana Catalog & Scope Picker — Session-Size Control'
type: 'feature'
created: '2026-09-09'
status: 'done'
baseline_commit: '69fe8cbb23d07ece0efb3d99c6335725bccb9513'
route: 'dispatch'
review_loop_iteration: 0
context: [
  '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md',
]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.2 shipped the Scope picker against the old 158-card, scope-only model. The 2026-09-08 Correct Course amended its ACs twice: Story 1.11 (done) already grew the catalog to 208 cards, but the Scope picker still has no session-size control — the independent "target distinct card count" dimension that Story 1.7's future `sampleSessionCards(attempts, scope, sessionSize)` will consume.

**Approach:** Add a third pill-toggle group to `ScopePicker.svelte` — a session-size choice of `25% / 50% / 75% / All`, independent of the script/set scope and not affecting the live "N cards in scope" count. Mirror the existing `initialScope`/`onScopeChange` pattern with a parallel `initialSessionSize`/`onSessionSizeChange` pair so the choice survives a Back navigation, exactly like scope does today. The value is not yet threaded into `onStart` or session sampling — Story 1.7 wires that up when `sampleSessionCards` exists.

**Decision (2026-09-09):** Session-size control is percent-of-scope presets (`25% / 50% / 75% / All`), pill-toggle group, same markup/radiogroup pattern as `Settings.svelte`'s `IDLE_PRESETS`.

## Boundaries & Constraints

**Always:** Catalog stays the already-shipped 208 cards (71/71 base, 33/33 yoon) — no change to `domain/cards.ts`. Session-size pill group is its own `role="radiogroup"`, exactly one active segment, commits immediately, same `.pill`/`.pill--active` markup and 48dp tap targets as the script/set groups. Every percent choice — `25%`/`50%`/`75%`/`All` — resolves *live* against the current scoped count (`Math.round(percentage * scopedCount)`, `All` = `scopedCount` itself), recomputed on every script/set toggle the same way the count itself is; there is no separate "clamp" step because a percentage of a changed scope is already a valid value for that scope. `Math.round` floors to a minimum of 1 only if `scopedCount > 0` (an empty scope can't occur — the Scope picker always keeps at least one script and one unit active).

**Never:** No change to `onStart`'s signature or to `App.svelte`'s `handleStart` — 1.2's own ACs only require the existing `{scripts, units}` payload to keep flowing unchanged. No `sampleSessionCards` call, no `Session`/`sessions`-store field — that is Stories 1.7/1.9's job. No change to the shaky-badge or script/set toggle behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default render | No `initialSessionSize` prop | "All" segment active; effective size equals the live scoped count (208) | N/A |
| Preset selected, then scope narrowed | `50%` active, full 208-card scope, then scope narrowed to 33-card (yoon-only) scope | `50%` segment stays active; effective size recomputes from 104 to 17 (`Math.round(0.5 * 33)`) | N/A |
| Preset selected, then scope widened | `50%` active under the 33-card scope above, scope widened back to full 208 | Effective size recomputes back to 104 | N/A |
| Back navigation restores choice | User opens Settings mid-pick (`25%` active), returns | `25%` segment still active, not reset to "All" | N/A |
| Rounding at a small scope | `25%` active, scope narrowed to a 1-card-short edge (e.g. effective scope of 3) | Effective size rounds to nearest integer (`Math.round(0.25 * 3)` = 1), never 0 | N/A |

</frozen-after-approval>

## Code Map

- `src/adapters/ui/ScopePicker.svelte` — add the session-size pill group + `sizePercent` state (mirrors `scriptChoice`/`setChoice`'s `$state`/`$derived` pattern at lines 67-95); add `initialSessionSize`/`onSessionSizeChange` props mirroring `initialScope`/`onScopeChange` (lines 31-32, 112-114). New `$derived` computes the effective count from `sizePercent` and `scopedCount`.
- `src/adapters/ui/Settings.svelte` (lines 27-31, 170-187) — reference only: `IDLE_PRESETS` pill-group markup is the precedent to copy for this preset UI.
- `src/app/App.svelte` (lines 50, 180-181) — add a sibling `sessionSize` `$state`, wired the same way `scope`/`onScopeChange` already are, purely for Back-navigation persistence. No other App.svelte change.
- `src/adapters/ui/ScopePicker.test.ts` — existing script/set pill-group tests (structure to mirror for the new group's tests).

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/ui/ScopePicker.svelte` -- add `25%/50%/75%/All` session-size pill group (state, `$derived` effective size from `sizePercent * scopedCount`, markup) -- delivers the new AC's control
- [x] `src/adapters/ui/ScopePicker.svelte` -- add `initialSessionSize`/`onSessionSizeChange` props, reported via the existing `$effect` alongside `onScopeChange` -- preserves choice across Back, mirrors existing scope behavior
- [x] `src/app/App.svelte` -- add `sessionSize` state wired to the new props -- completes the persistence mirror
- [x] `src/adapters/ui/ScopePicker.test.ts` -- cover default "All", each percent preset's effective count, live recompute on scope narrow/widen, and the minimum-1 rounding edge case

**Acceptance Criteria:**
- Given the Scope picker with no prior selection, when it renders, then the session-size control shows "All" active and "N cards in scope" reads 208.
- Given the user taps a script/set pill, when the count recomputes, then the session-size control's selected segment is unchanged, but its effective count recomputes against the new scope.
- Given a percent preset is active, when the user narrows or widens the scope, then the effective size recomputes live from that percentage of the new scoped count (rounded, minimum 1).
- Given a session-size choice was made, when the user opens Settings and returns, then the same segment is still active.

## Implementation Notes

Implemented as specified: `SizeChoice = 'all' | 0.25 | 0.5 | 0.75` exported from `ScopePicker.svelte`, consumed as a type-only import in `App.svelte`. All four Tasks complete; all four Acceptance Criteria and all five I/O-matrix rows covered by tests in `ScopePicker.test.ts` (8 new cases under a `describe('session size', ...)` block, including a minimal 3-card fake `CardRepository` case asserting the matrix's documented `Math.max(1, ...)` rounding-floor output is produced -- the floor itself never actually binds at that input (`Math.round(0.25 * 3)` is already 1), so this case asserts the floor's output is safe rather than exercising the clamp in action; the real 208-card catalog can't reach a scope small enough to hit a genuinely floor-breaking input through the UI). Verified: `npx vitest run` 313/313 pass (after the review patch added one `App.test.ts` integration test), `npm run typecheck` 0 errors, `npm run lint` clean.

## Spec Change Log

## Review Triage Log

- **App.svelte's session-size persistence wiring has no integration test** (verification-gap, pre-verified) — `medium` — `App.test.ts` has round-trip tests for `scope` surviving a Settings/History Back navigation (lines 227, 305) but none for the new `sessionSize` wiring at `App.svelte:55,187-188`, even though it realizes the frozen AC "opens Settings and returns, then the same segment is still active." A regression here (e.g. a dropped `onSessionSizeChange` wire) would ship with all tests green. Routed: **patch**.
- **"N cards this session" hint has no singular/plural handling** (blind-hunter + edge-case-hunter, same root cause) — `low` — `ScopePicker.svelte`'s hint literally renders "1 cards this session" at an effective size of 1 (per `ScopePicker.test.ts`'s own assertion). Real defect, but only reachable at a scope ≤ ~3 cards, unreachable through the real 208-card catalog's own minimum scope (33). Fix is a one-line ternary — trivial despite low real-world exposure. Routed: **patch**.
- **Implementation Notes overstates the rounding-floor test coverage** (blind-hunter) — `low` — `Math.round(0.25 * 3) = 1` already, without `Math.max(1, ...)` ever binding; the Implementation Notes says the floor is "exercised," which the test's own comment already correctly caveats but the notes don't. Doc-only inaccuracy, trivial fix. Routed: **patch**.
- **Spec status `'in-review'` inconsistent with sprint-status.yaml's vocabulary** (blind-hunter) — `false` — conflates two separate, intentionally different vocabularies: `spec-template.md`'s own frontmatter comment defines spec-file status as `draft | ready-for-dev | in-progress | in-review | done`, distinct from `sprint-status.yaml`'s own story-tracking vocabulary (`backlog/ready-for-dev/in-progress/review/done`). Other specs show `'done'` because they're finished, not because `'in-review'` is invalid.
- **`sprint-status.yaml` still shows `1-2-...: in-progress`** (blind-hunter) — `false` — this review pass is still in progress; `step-05-present` syncs the story to `review` only after the review step completes, per the workflow's own sequencing (not yet reached).
- **New pill group hardcodes 4 buttons instead of an `{#each}` loop** (blind-hunter) — `false` — the file's own two pre-existing groups (script, set) are *also* hardcoded individual buttons, not loops; the new group matches this file's dominant local convention. `Settings.svelte`'s `IDLE_PRESETS` loop is a different file's style. The 4 presets are fixed by the frozen spec, not user-configurable, so there's no real "kept in sync by hand" risk.
- **No cross-reference from this spec to the original `spec-1-2-...md` it supersedes, unlike `spec-1-9`'s precedent** (blind-hunter) — `false` — checked `spec-1-9-session-closure-idle-timeout-summary.md`'s Spec Change Log directly: its one entry is from an unrelated review-loop-1 finding predating the 2026-09-08 Correct Course, not an in-place amendment for this redesign. It is exactly as stale as the original `spec-1-2` file (per `sprint-status.yaml`'s own comment). The `-2`-suffixed new-file convention used here is what step-01's own routing logic prescribes for a `done`-status spec needing re-implementation.
- **`role="radiogroup"`/`role="radio"` has no keyboard roving-navigation handling** (blind-hunter) — real, but pre-existing in the file's original script/set groups (shipped as `done` in Story 1.2's first pass); the new group only repeats an already-existing pattern the frozen Intent explicitly directs mirroring ("same markup... as the script/set groups"). Routed: **defer**.
- **No `aria-live` region on the effective-size hint text** (blind-hunter) — real, but consistent with this screen's existing pattern: nothing in `ScopePicker.svelte` (including the pre-existing "N cards in scope"/shaky-count text, which also updates live with no announcement) uses `aria-live`. Not a regression introduced by this diff. Routed: **defer**.

## Design Notes

Session-size state should follow the exact shape already used for `scriptChoice`/`setChoice`: a discrete union, e.g. `'all' | 0.25 | 0.5 | 0.75`, with a `$derived` effective-size that always recomputes from `scopedCount` (`choice === 'all' ? scopedCount : Math.max(1, Math.round(choice * scopedCount))`) rather than caching a number. Because a percentage is inherently relative, this live recompute is also what the "scope narrowed/widened" I/O-matrix rows need — no separate clamp logic, unlike a fixed-count design would require.

## Verification

**Commands:**
- `npx vitest run src/adapters/ui/ScopePicker.test.ts` -- expected: all pass, including new session-size cases
- `npm run typecheck` -- expected: no errors (strict mode, no `any`)
- `npm run lint` -- expected: no errors

### Review Findings (2026-09-09 — branch feat/1-2-scope-picker-session-size vs main, 7 files +391/-3)

- [x] [Review][Patch] "N cards in scope" has no singular handling [src/adapters/ui/ScopePicker.svelte:304] — applied 2026-09-09: `{scopedCount === 1 ? 'card' : 'cards'}` ternary matching hint; typecheck/lint/tests pass
- [x] [Review][Defer] `role="radiogroup"` pill groups have no arrow-key roving navigation [src/adapters/ui/ScopePicker.svelte:252] — deferred: pre-existing on script/set groups, already tracked in deferred-work.md for this spec
- [x] [Review][Defer] Live-updating count/hint text has no `aria-live` region [src/adapters/ui/ScopePicker.svelte:300] — deferred: pre-existing on count/shaky text, already tracked in deferred-work.md for this spec

Rejected:
- false — empty-scope effective-size inconsistency (`all`=0 vs percent=`Math.max(1,…)`=1): unreachable, min real scope is 33 (static 208-card catalog, picker always keeps ≥1 script+unit active); `allCards` is sync static data with no empty path.
- false — session-size silently discarded by `handleStart`/`onStart`: by spec Never-constraint (no `onStart` change, Story 1.7 consumes); hint + code comments make it visible, acceptance audit PASS.
- false — undefined `sessionSize` after session-end/reload: spec requires only Back-navigation persistence (implemented + tested in `App.test.ts`); reload reset to `'all'` is defined `$state` init.
- false — no runtime validation for `initialSessionSize`: `SizeChoice` union + strict TS, mirrors `initialScope` verbatim-seed pattern; runtime-invalid unreachable.
- false — `onSessionSizeChange` test mount-count gap: test correctly asserts last-call; mount-time `$effect` is intentional mirror of `onScopeChange`, no named harm.
- false — no help text distinguishing the two counts: spec requires no help text; labels ("Session size" + hint vs count-card) already distinguish; fix would add surface = spec edit.
- false — empty-scope edge duplicate (edge-case-hunter scopedCount-zero): same refutation as empty-scope above.
