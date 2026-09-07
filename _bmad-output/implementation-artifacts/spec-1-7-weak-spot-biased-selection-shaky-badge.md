---
title: 'Weak-Spot-Biased Selection & Shaky Badge'
type: 'feature'
created: '2026-09-07'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '98705cbe998ef78473ff5977c9c7ee1d03c4032f'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The drill still picks its next prompt uniformly at random (Story 1.3's placeholder) — recent misses never resurface more often, so short sessions don't reinforce weak spots, and the Scope picker has no way to show which cards are shaky.

**Approach:** Replace `pickRandomCard` wholesale with a pure `selectNext(attempts, scope)` that weights each in-scope card by the sum of its exponentially-decayed (7-day half-life) incorrect-attempt weights since its last correct attempt, then samples probabilistically with a nonzero floor for every card. Wire it into Drill with the session's attempt history loaded once and appended to in-memory as grades happen. Add a pure `countShaky` (in-scope cards whose miss tally exceeds the in-scope average) and render it as an "N shaky" badge on the Scope picker.

## Boundaries & Constraints

**Always:**
- `selectNext(attempts: Attempt[], scope: Scope): Card` — no `tallies` param, no clock/schedule param; candidates come from the static `CARDS` catalog filtered by `scope`, never a passed-in card list.
- Decay is pure elapsed wall-clock time from `attempt.timestamp`: `weight = 0.5 ** (elapsedDays / 7)`. A card's score is the **sum** of its qualifying decayed incorrect weights, never max/most-recent-only.
- A correct attempt zeroes the score contribution of every incorrect attempt preceding it for that card, regardless of elapsed time.
- Every in-scope card keeps a nonzero selection probability on every draw, including the just-graded card — selection never excludes a candidate, even for one draw. This replaces Story 1.3's "never repeats the previous card" behavior.
- `attempts` is loaded once via `listAll()` when a drill entry starts and appended to in-session, in-memory as new attempts are graded — never re-fetched mid-session.
- The "N shaky" badge is informational only: it never affects `selectNext`'s weighting.

**Ask First:** none — decisions are pinned by the epic's frozen ACs (confirmed 2026-09-03).

**Never:** a separate "still flagged" floor for uncorrected misses beyond the universal per-card selection floor; scheduling, due dates, or queues of any kind.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|-----------------------------|-----------------|
| No history | Fresh scope, `attempts: []` | Every candidate carries the same floor weight (uniform) | N/A |
| Old miss vs. recent miss | Card A missed 10 days ago; Card B missed today | B scores higher — decay favors recency | N/A |
| Corrected miss | Card missed 3x, then graded Correct | Score resets to the floor; the 3 prior misses contribute nothing | N/A |
| Chronic vs. single | Card A missed 5x (all old); Card B missed once (recent) | A can still outscore B if its summed decayed weight exceeds B's single weight | N/A |
| Empty scope | `scope` filters to 0 candidates | Throws `selectNext: no cards in scope`, same contract as the old `pickRandomCard` | N/A |
| `listAll()` fails at drill entry | `Result.ok === false` | Falls back to `attempts: []` (uniform floor); drill still starts | Silent fallback, mirrors First Run's settings-read fallback |
| Shaky badge, no misses yet | Every in-scope tally is 0 | "0 shaky" (average is 0; nothing exceeds it) | N/A |
| Shaky badge, tally fetch fails | `tallyRepository.getAll()` rejects or resolves `!ok` | Falls back to `[]` tallies; badge shows "0 shaky" | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/tally.ts` -- add `countShaky(cardsInScope: Card[], tallies: Tally[]): number`: build a `Map<cardId, missCount>` from `tallies`; `average = totalMiss / cardsInScope.length` (0 for an empty scope); return the count of cards with `missCount > average` (strict `>`, so an all-zero scope shows "0 shaky" and a tie is not shaky).
- `src/domain/tally.test.ts` (**new**) -- empty scope -> 0; all-zero tallies -> 0; one card above average -> 1; a card exactly at the average is excluded.
- `src/domain/drill.ts` (**rewrite**) -- delete `pickRandomCard`; add `selectNext(attempts: Attempt[], scope: Scope, random: () => number = Math.random): Card`. Candidates = `cardsInScope(CARDS, scope)`; throws `'selectNext: no cards in scope'` when empty (same contract as the old throw). Per-candidate score: that card's attempts sorted by `timestamp` ascending; walk them, `score = 0` on every `correct`, `score += 0.5 ** (elapsedDays / 7)` on every `incorrect` where `elapsedDays = (Date.now() - Date.parse(attempt.timestamp)) / 86_400_000`. Sampling weight = `1 + score` (universal nonzero floor). Weighted pick: cumulative-weight walk against `random() * totalWeight`, clamped to the last candidate for a degenerate `random() === 1` (mirrors the old `pickRandomCard`'s clamp). No `previous`-exclusion param.
- `src/domain/drill.test.ts` (**rewrite**) -- drop the `pickRandomCard` suite; new `selectNext` suite covering every I/O-matrix row above, using `vi.useFakeTimers()`/`vi.setSystemTime()` for decay determinism and an injected `random` for sampling determinism.
- `src/adapters/ui/Drill.svelte` -- Props: replace `cards: Card[]` with `scope: Scope` and add `attempts: Attempt[]` (session-start history from the composition root). Derive `const cards = $derived(cardsInScope(CARDS, scope));` (drives the existing counter/progress bar unchanged). Add `let sessionAttempts: Attempt[] = [...attempts];` (plain, mirrors `strokes` -- nothing renders from it directly). Initial pick: `card = $state<Card>(untrack(() => selectNext(sessionAttempts, scope)));`. In `handleGrade`, push the built `attempt` into `sessionAttempts` synchronously (before the never-awaited persistence calls), then `card = selectNext(sessionAttempts, scope);` replacing `pickRandomCard(cards, card)`. Drop the `pickRandomCard` import; add `selectNext`, `cardsInScope`, `CARDS`, `Scope`.
- `src/adapters/ui/Drill.test.ts` (**large rewrite**) -- `renderDrill`'s `overrides.cards` -> `overrides.scope` (default `{scripts: ['hiragana'], units: ['base']}`) plus `overrides.attempts` (default `[]`). Every call site building a specific `cards: [card(...)]` array switches to a `scope` containing it. Tests asserting an exact first prompt (romaji/grapheme/yoon-clip/attempt-`cardId`/tally-`cardId`) read the rendered card from the DOM first (generalizes the file's existing `/^(shi|tsu)$/`-read idiom) instead of hardcoding one. Delete "never draws the previous card again" (Story 1.3 invariant, superseded here); replace "advances... to a different prompt" with "advances the counter and still shows a prompt from the scope."
- `src/adapters/ui/ScopePicker.svelte` -- add `tallyRepository: TallyRepository` prop; extend the `import { untrack } from 'svelte'` line to also import `onMount`. `let tallies = $state<Tally[]>([]);` populated in `onMount` via `tallyRepository.getAll()` (fail open to `[]`, mirrors `App.svelte`'s settings-read fallback). `const shakyCount = $derived(countShaky(cardsInScope(allCards, scope), tallies));`. Render `<span class="chip chip--missed">{shakyCount} shaky</span>` inside `.chips`, after the existing chip loops. Add `.chip--missed` CSS (mirrors `.chip--positive`, using `--color-missed-bg`/`--color-missed-fg` from `theme.css`).
- `src/adapters/ui/ScopePicker.test.ts` -- add a `fakeTallyRepository()` helper (mirrors `Drill.test.ts`'s) and pass `tallyRepository: fakeTallyRepository()` into every existing `render(ScopePicker, {...})` call. New tests: "0 shaky" with no tallies; "N shaky" once a fetched tally exceeds the in-scope average; recomputes on a script/set toggle (only in-scope cards count toward the average).
- `src/app/App.svelte` -- `handleStart` becomes `async`: after computing `scope`, `const result = await attemptRepository.listAll(); drillAttempts = result.ok ? result.value : [];` (new `let drillAttempts = $state<Attempt[]>([]);`), before constructing the ink surface / flipping `screen`. Drop `drillCards` state and its `cardsInScope` call (Drill now derives its own cards from `scope`; `ScopePicker` keeps its existing `cardsInScope`/`FULL_SCOPE` usage). Pass `{tallyRepository}` to `<ScopePicker>`. `<Drill>` becomes `<Drill {scope} attempts={drillAttempts} {inkSurface} {attemptRepository} {tallyRepository} onBack={handleDrillBack} />`.
- `src/app/App.test.ts` -- no expected changes: happy-dom has no `indexedDB`, so `listAll()` already fails closed to `err(...)` inside `IdbAttemptRepository`; `handleStart`'s new fallback resolves to `[]` and existing `findByText(...)` assertions still pass once the promise settles. Re-run to confirm.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/tally.ts` -- add `countShaky`.
- [x] `src/domain/tally.test.ts` -- new suite for `countShaky`.
- [x] `src/domain/drill.ts` -- replace `pickRandomCard` with `selectNext`.
- [x] `src/domain/drill.test.ts` -- rewrite for `selectNext`.
- [x] `src/adapters/ui/Drill.svelte` -- wire `selectNext` + `sessionAttempts`, drop `cards` prop for `scope`/`attempts`.
- [x] `src/adapters/ui/Drill.test.ts` -- rewrite fixtures/assertions for `scope`-driven rendering.
- [x] `src/adapters/ui/ScopePicker.svelte` -- shaky badge.
- [x] `src/adapters/ui/ScopePicker.test.ts` -- fake `tallyRepository`, shaky-badge tests.
- [x] `src/app/App.svelte` -- async `handleStart`, wire `attempts`/`tallyRepository` through.

**Acceptance Criteria:**
- Given attempt history and tallies exist, when Drill selects its next prompt, then it calls `selectNext(attempts, scope)` (no `tallies`, no clock param), replacing `pickRandomCard`.
- Given `attempts` loaded once via `listAll()` at drill entry, when a grade is submitted, then the new attempt is appended to the in-memory list immediately, never re-fetched.
- Given the scored candidates, when the next card is sampled, then every in-scope card — including the just-graded one — keeps a nonzero probability.
- Given the Scope picker is rendered, then it shows an "N shaky" chip counting in-scope cards whose tally exceeds the in-scope running average, recomputed live on every script/set toggle, without affecting selection weighting.

## Spec Change Log

## Design Notes

- **Why a floor of `1 + score` instead of a separate epsilon:** every candidate always carries base weight `1`, so a card with zero misses is still reachable, and the ratio between a heavily-missed card and a clean one scales naturally with `score` instead of an arbitrarily tuned constant.
- **Why `sessionAttempts` lives in `Drill.svelte`, not `App.svelte`:** Story 1.8's undo already depends on splicing this exact in-memory list (per the epic's cross-story dependencies), so it belongs beside the component that owns grading, not the composition root.
- **Why `Drill.test.ts` moves from hardcoded cards to "read the rendered card":** `selectNext` is probabilistic over the real `CARDS` catalog filtered by `scope` (never an arbitrary short list), so component-level tests can no longer force a specific first prompt; the sampling algorithm itself is proven separately in `domain/drill.test.ts` with an injected `random`.

## Verification

**Commands:**
- `just check` -- lint, typecheck (`tsc --noEmit` + `svelte-check`), full Vitest suite all pass.

## Suggested Review Order

**Weighted selection algorithm**

- Entry point: the weighting/sampling core the rest of the story hangs off.
  [`drill.ts:74`](../../src/domain/drill.ts#L74)
- Per-card score: sums decayed misses, zeroed by a correct grade.
  [`drill.ts:25`](../../src/domain/drill.ts#L25)
- Guards a malformed/future timestamp from poisoning the score (review-loop patch).
  [`drill.ts:43`](../../src/domain/drill.ts#L43)

**Drill wiring: session attempt history**

- `scope`/`attempts` replace the old pre-filtered `cards` prop.
  [`Drill.svelte:29`](../../src/adapters/ui/Drill.svelte#L29)
- Seeds the in-memory session list once from the composition root's fetch.
  [`Drill.svelte:66`](../../src/adapters/ui/Drill.svelte#L66)
- Initial prompt now depends on session-start history, not uniform random.
  [`Drill.svelte:72`](../../src/adapters/ui/Drill.svelte#L72)
- New attempt appended before persistence, so the very next draw sees it.
  [`Drill.svelte:169`](../../src/adapters/ui/Drill.svelte#L169)
- Post-grade pick has no previous-card exclusion (Story 1.3 behavior superseded).
  [`Drill.svelte:196`](../../src/adapters/ui/Drill.svelte#L196)

**Composition root: async drill entry**

- `handleStart` becomes async to load attempt history before the drill mounts.
  [`App.svelte:75`](../../src/app/App.svelte#L75)
- Re-entrancy guard against a double-tap racing two ink surfaces (review-loop patch).
  [`App.svelte:78`](../../src/app/App.svelte#L78)
- `.catch()` on `listAll()` covers a rejected promise, not just `{ok:false}` (review-loop patch).
  [`App.svelte:89`](../../src/app/App.svelte#L89)

**Shaky badge**

- Pure average-threshold count, informational only, never fed into selection.
  [`tally.ts:24`](../../src/domain/tally.ts#L24)
- Fetches tallies once on mount, fails open, now with `.catch()` too (review-loop patch).
  [`ScopePicker.svelte:47`](../../src/adapters/ui/ScopePicker.svelte#L47)
- Renders the "N shaky" chip beside the existing script/set chips.
  [`ScopePicker.svelte:218`](../../src/adapters/ui/ScopePicker.svelte#L218)

**Tests and supporting changes**

- `selectNext`'s decay/floor/zeroing/edge-case suite, with fake timers and injected `random`.
  [`drill.test.ts:1`](../../src/domain/drill.test.ts#L1)
- `countShaky`'s average/tie/empty-scope suite.
  [`tally.test.ts:1`](../../src/domain/tally.test.ts#L1)
- `currentCard()` helper: reads the rendered prompt instead of forcing one.
  [`Drill.test.ts:128`](../../src/adapters/ui/Drill.test.ts#L128)
- Shaky-badge and rejected-fetch coverage.
  [`ScopePicker.test.ts:1`](../../src/adapters/ui/ScopePicker.test.ts#L1)
- Double-tap and rejected-`listAll()` coverage for the composition root.
  [`App.test.ts:79`](../../src/app/App.test.ts#L79)
