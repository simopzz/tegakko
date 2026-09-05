---
title: 'Write-From-Memory Drill Loop + Ink-Width Setting'
type: 'feature'
created: '2026-09-05'
status: 'done'
route: 'dispatch'
baseline_commit: '0f07d4bf3abd9e24d6c8ff0eeffddcd8232c0778'
review_loop_iteration: 0
context: [
  '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md',
]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** "Start writing" currently lands on a throwaway placeholder. The core loop the whole product exists for — prompt, write from memory on a pressure-sensitive genkouyoushi cell, grade yourself — does not exist, and neither does the ink layer every later story (reveal, attempt recording, undo) builds on.

**Approach:** Add an `InkSurface` port with a canvas adapter that reproduces the validated PoC's ink feel (single canvas, Delegated Ink Trails, linear pressure→width), build the Drill screen around it (romaji + script prompt, progress counter, Clear, Missed/Correct gating), and add a Settings screen — reached from a new Scope-picker header — whose ink-width pill toggle persists to `settings.widthPreset`.

## Boundaries & Constraints

**Always:** One canvas element only — grid guide, center dot, and ink all render on it (two layered canvases go black under Delegated Ink Trails). The adapter owns that canvas node: `mount(node)` is called exactly once per adapter instance and Svelte never renders inside it — `app/App.svelte` constructs a fresh `CanvasInkSurface` each time the drill screen is entered, and `Drill.svelte`'s mount cleanup calls `destroy()` (releases listeners and the presenter); `onStrokeComplete` holds a single subscriber, replacing any previous one. `onStrokeComplete` fires once per completed stroke, never per pointer event. Ink feel is judged by side-by-side comparison against `poc-web/index.html` on the same device class, not a numeric threshold — so keep its mechanics: `desynchronized: true`, DPR-scaled backing store, `lineCap`/`lineJoin: 'round'` per-segment lines with no smoothing, coalesced events for geometry, width computed once per move event, `navigator.ink` feature-detected with a plain-canvas fallback. Width presets are Subtle 2→5, Expressive 1.5→9, Calligraphy 0.75→18 px, applied linearly (`min + p * (max - min)`) and read at stroke start, so a change in Settings shows on the next stroke. `Card` gains a `romaji` field (Story 1.2's frozen note explicitly deferred it to "a future prompt screen" — this is it) in Hepburn, generated from parallel arrays the same way graphemes already are. Missed and Correct are dimmed and non-interactive while the cell is blank and become active once a stroke exists; Clear appears only once ink exists, sits beside the exact line "Your call — nothing is checking the shape", empties the cell, restores the center dot, and never advances or grades. The counter is paired with a progress bar (`--color-ink-hairline` track, `--color-accent` fill, 6px, `--radius-full`) whose fill clamps at 100% once the counter passes N — a bar is never the only position signal. `settings.widthPreset` is loaded once by `app/App.svelte` on boot, held there as state, pushed into the adapter via `setWidthPreset()` on drill mount and again whenever Settings reports a change (`onPresetChange`); `Settings.svelte` persists by read-modify-write onto the last-read `Settings` record, never by constructing one from `DEFAULT_SETTINGS`, so `penCheckShown`/`idleTimeoutMs` can never be clobbered. Reached via the `Screen` enum only — `adapters/ui` never imports `adapters/ink` (ESLint boundary); `app/App.svelte` constructs the adapter and passes it as a prop. Selection is **with replacement** (decision, 2026-09-05): every prompt is drawn uniformly at random from the whole scope, cards may repeat across a session, and the counter keeps climbing past N ("47 / 46") — the AC's "next prompt appears and the counter advances" holds unconditionally until Story 1.9 adds closure. Two consequences are deliberate: the immediately-preceding card is excluded from the next draw (unless the scope holds a single card), so a grade always visibly advances; and nothing here tracks which distinct cards have been seen — Story 1.9 owns scope-exhaustion detection for its `'full-scope'` closure and must introduce that tracking itself. The Drill header carries a **temporary Back control** to the Scope picker (decision, 2026-09-05), explicitly throwaway: Story 1.9's "I'm done" replaces or absorbs it.

**Never:** No Reveal control or reference glyph (Story 1.4) — the grade row is Missed + Correct only. No `AttemptRepository`, no persisted strokes, no tallies, no post-grade toast or Undo (Stories 1.5/1.6/1.8) — a grade only advances the loop. No session record, "I'm done" control, idle timeout, or summary screen (Story 1.9). No weak-spot weighting (Story 1.7) — selection is the random placeholder. No History link in the header (Story 1.10). No new theme tokens, no second accent, no red.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pen stroke | `pointerdown`→`move`→`up`, `pointerType: 'pen'`, varying `pressure` | Width varies continuously with pressure across the preset range; `onStrokeComplete` fires once on `pointerup` | N/A |
| Mouse/touch stroke | `pointerType: 'mouse'` or `'touch'` | Draws at fixed pressure 0.5 (dev/testing degradation stays operable) | N/A |
| Pen reporting `pressure: 0` | Real pen, zero reading | Treated as 0.5, matching the PoC | N/A |
| Second pointer mid-stroke | A second `pointerdown` while one is active | Ignored; the first pointer keeps the stroke | N/A |
| `navigator.ink` absent | Non-Chromium or insecure context | Canvas rendering only, no thrown error, drill fully usable | Feature-detect; `updateInkTrailStartPoint` in try/catch, warn once |
| Clear tapped | Ink on canvas | Canvas empties, center dot returns, Missed/Correct re-dim, prompt unchanged | N/A |
| No 2D context | `getContext('2d')` returns `null` (happy-dom, blocked canvas) | Adapter mounts, skips all rendering, still tracks pointers and fires `onStrokeComplete` | Guard once at mount; no throw |
| Settings read fails | `SettingsRepository.get()` returns `!ok` | Screen renders with `DEFAULT_SETTINGS.widthPreset` and the toggle is inert — nothing is saved from an unknown baseline | Log; inline note; no hard block |
| Settings save fails | `save()` returns `!ok` | Toggle stays on the tapped preset for this run, inline note shown | Log; no hard block |
| Preset changed | A segment tapped in Settings | `{...lastRead, widthPreset}` saved; the next drill stroke uses the new range, strokes already drawn are unchanged | As above |

</frozen-after-approval>

## Code Map

- `src/domain/cards.ts` -- MODIFY. Add `romaji: string` to `Card`; add `HIRAGANA_ROMAJI` (46, parallel to `HIRAGANA_BASE`; shared with katakana) and yoon romaji stems parallel to `*_YOON_ROWS` (`ki→ky, shi→sh, chi→ch, ni→ny, hi→hy, mi→my, ri→ry, gi→gy, ji→j, bi→by, pi→py` + `a|u|o`, Hepburn: きゃ `kya`, しゃ `sha`, ちゃ `cha`, じゃ `ja`). Keep `Object.freeze` and the generative structure.
- `src/domain/drill.ts` -- NEW. `pickRandomCard(cards, previous?, random?): Card` — pure placeholder selection excluding `previous` (unless it is the only card), injectable RNG so tests are deterministic. Story 1.7 replaces it with `selectNext`.
- `src/domain/ink.ts` -- NEW. `Stroke`/`StrokePoint` types (grid-relative `x`,`y` in 0..1 plus `pressure`) and `WIDTH_PRESETS: Record<WidthPreset, {min, max}>` + `pressureToWidth(pressure, preset)`. Grid-relative now because AD-11 requires it for 1.5; nothing persists it yet.
- `src/ports/ink-surface.ts` -- NEW. `InkSurface`: `mount(node: HTMLElement): void`, `destroy(): void`, `clear(): void`, `onStrokeComplete(cb: (stroke: Stroke) => void): void`, `setWidthPreset(preset: WidthPreset): void`. Same file shape as `src/ports/card-repository.ts`; sync, un-wrapped.
- `src/adapters/ink/canvas-ink-surface.ts` -- NEW. Creates and owns the `<canvas>` (`touch-action: none`, `user-select: none`, `--color-surface-canvas` ground, `--radius-lg`, `1px solid --color-grid-guide` on the cell wrapper), draws the genkouyoushi cell (dashed cross-guide always, center dot only while empty), handles pointer/ink/DPR/teardown. Constructor takes a `colors` config — `{ ink: '#201E1D', guide: '#CCDBB2', dot: '#E1EECC', canvas: '#F9F4ED' }`, the `theme.css` token values, passed from `app/App.svelte` since canvas cannot read CSS custom properties — plus an optional `contextFactory` (default `(c) => c.getContext('2d', { desynchronized: true })`) that is the test seam for the fake 2D context. Pointer coordinates come from `getBoundingClientRect()` (cached, invalidated on resize) — the PoC's raw `clientX/clientY` only works because its canvas is `position: fixed; inset: 0`; this one is an inset cell. `setPointerCapture` and its release are both wrapped in try/catch (happy-dom implements neither). Replaces `src/adapters/ink/.gitkeep`. Port the mechanics from `poc-web/index.html` — read it, never edit it (AGENTS.md policy).
- `src/adapters/ui/Drill.svelte` -- NEW. Props `{ cards, inkSurface, onBack }`; follows `ScopePicker.svelte`'s pattern (scoped `<style>`, existing `--color-*`/`--radius-*`/`--spacing-*` tokens, callback props). Holds the sub-states (blank / written) as local state, never as `Screen` members.
- `src/adapters/ui/Settings.svelte` -- NEW. Props `{ settingsRepository, onPresetChange, onBack }`. Ink-width pill group only; reuse `ScopePicker.svelte`'s `.pill`/`.pill--active` markup, `role="radiogroup"`/`aria-checked` included.
- `src/adapters/ui/ScopePicker.svelte` -- MODIFY. Add a header row with a "Settings" text link (`--color-accent-strong`, not the accent) and an `onSettings` prop. Do not touch the pill/count/chip logic.
- `src/adapters/ui/ScopePicker.test.ts` -- MODIFY. Every `render(ScopePicker, {...})` call must gain the new required prop, or `svelte-check` fails in `npm run typecheck`; add one case for the Settings link.
- `src/app/App.svelte` -- MODIFY. Load settings on boot and hold `widthPreset`; construct a fresh `CanvasInkSurface` per drill entry; add a `'settings'` branch to the markup (the `Screen` union already has the member); replace the placeholder branch with `<Drill>`, passing `cardsInScope(cardRepository.getAll(), scope)`.
- `src/adapters/ui/screens.ts`, `src/domain/settings.ts`, `src/ports/settings-repository.ts`, `src/adapters/persistence/settings-repository.ts` -- unchanged. `'settings'`, `WidthPreset`, and `get`/`save` all already exist.
- Test style reference: `src/adapters/ui/ScopePicker.test.ts` (`render`/`screen`/`fireEvent` from `@testing-library/svelte`, `happy-dom`). `happy-dom` has no canvas 2D context — the ink adapter's rendering is verified by a fake context double, not by pixels, and CSS `min-height` is not resolvable there (a known, recorded gap).

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/cards.ts` -- add a Hepburn `romaji` field to `Card`, sourced from arrays parallel to the existing grapheme arrays (the catalog is generated, not enumerated) -- prompt copy needs it
- [x] `src/domain/ink.ts` -- `Stroke`/`StrokePoint`, `WIDTH_PRESETS`, `pressureToWidth` -- AD-11, PoC parity
- [x] `src/domain/drill.ts` -- `pickRandomCard` placeholder selection -- Story 1.7 replaces it
- [x] `src/ports/ink-surface.ts` -- `InkSurface` port -- AD-2
- [x] `src/adapters/ink/canvas-ink-surface.ts` -- canvas + pointer + Delegated Ink Trails adapter -- FR-3/FR-4
- [x] `src/adapters/ui/Drill.svelte` -- prompt, progress counter, cell, Clear, Missed/Correct gating -- epics Story 1.3
- [x] `src/adapters/ui/Settings.svelte` -- ink-width pill toggle persisted to `settings.widthPreset`
- [x] `src/adapters/ui/ScopePicker.svelte` -- header entry point to Settings
- [x] `src/app/App.svelte` -- wire drill + settings screens, own the `InkSurface` instance -- AD-1 composition root
- [x] `src/domain/cards.test.ts` -- extend: every card has non-empty romaji; spot-check Hepburn (し `shi`, ち `chi`, つ `tsu`, ふ `fu`, を/ヲ `wo`, ん/ン `n`, しゃ `sha`, じゃ `ja`), and that a grapheme's romaji matches across the two scripts
- [x] `src/domain/ink.test.ts` -- `pressureToWidth` across 0/0.5/1 for all three presets
- [x] `src/domain/drill.test.ts` -- injected RNG picks the expected card; only in-scope cards are returned; the previous card is never drawn twice running, except in a one-card scope
- [x] `src/adapters/ink/canvas-ink-surface.test.ts` -- the I/O matrix's rows against an injected fake 2D context: one `onStrokeComplete` per stroke, second pointer ignored, mouse/zero pressure → 0.5, missing `navigator.ink` doesn't throw, null context doesn't throw, `clear()` restores the dot, `destroy()` detaches listeners
- [x] `src/adapters/ui/Drill.test.ts` -- prompt shows romaji + script, counter starts "1 / N", Missed/Correct dimmed until a stroke, Clear re-dims them, grading advances counter and prompt, Back calls `onBack`
- [x] `src/adapters/ui/Settings.test.ts` -- current preset preselected from the repository, tap persists via `save` and fires `onPresetChange`, the saved record preserves `penCheckShown`/`idleTimeoutMs`, read/save failure paths
- [x] `src/app/App.test.ts` -- extend: Scope picker header reaches Settings and back; "Start writing" reaches the drill with the scoped card list

**Acceptance Criteria:**
- Given "Start writing" was tapped, when the Drill screen opens, then a romaji + script-name prompt (no mnemonic or example word) is shown for a card drawn at random from the scope, with a progress counter reading "1 / N" for scope size N and a progress bar beside it
- Given the Drill screen, when it renders, then exactly one `<canvas>` exists in the cell, its dashed cross-guide is drawn, and the center dot is present only while no stroke exists
- Given a pen touches the canvas, when the user writes a stroke, then stroke width varies continuously with `pressure` across the full range via Pointer Events (`pressure`, `pointerType: 'pen'`) and Chrome's Delegated Ink Trails
- Given the ink adapter, when the Drill screen mounts, then `mount(node)` is called exactly once for that instance, Svelte renders nothing inside that node, and `onStrokeComplete` fires once per completed stroke and never per pointer event
- Given a completed stroke, when it lands, then the center dot disappears and a Clear affordance appears alongside the line "Your call — nothing is checking the shape"
- Given ink exists on the canvas, when the user taps Clear, then the canvas empties, the center dot reappears, and the prompt does not advance
- Given the cell is blank, when the Drill screen renders, then Missed and Correct are dimmed and non-interactive; when at least one stroke exists, then both become active
- Given Missed or Correct is tapped, when the grade is submitted, then a new randomly selected prompt (never the card just graded) appears and the counter advances by one, with nothing persisted and no toast shown
- Given Settings is opened from the Scope-picker header, when an ink-width segment is tapped, then exactly one segment is active, the saved record is the last-read `Settings` with only `widthPreset` changed, saved immediately with no confirm step, and the next drill stroke is drawn at the new preset's width range
- Given the Drill screen or the Settings screen, when Back is tapped, then the Scope picker returns with its selection intact
- Given a device on the PoC's class, when ink is compared side by side against `poc-web/index.html`, then felt latency and pressure-to-width control match or exceed the PoC — **human-verified only**, not automatable; see Manual checks

## Implementation Notes

- **Scope-picker selection across Back.** The AC "Back returns the Scope picker with its selection intact" needs state the picker itself cannot hold: `{#if}` unmounts it whenever the drill or Settings is open. Two optional props were added beyond the Code Map's `onSettings` -- `initialScope` (seeds the pill groups) and `onScopeChange` (reports every tap, not just "Start writing", since Settings can be opened mid-selection) -- and `app/App.svelte` owns the surviving `scope`. The pill/count/chip logic itself is untouched.
- **`untrack` on one-shot prop reads.** `Drill.svelte`'s first prompt and `ScopePicker.svelte`'s restored choices deliberately capture a prop's initial value; Svelte's `state_referenced_locally` warning is silenced with `untrack`, matching the reasoning already recorded in `ScopePicker.svelte` for `$derived`.
- **svelte-check trap.** A literal `<style>`/`<script>` tag written inside a comment in a component's script block makes svelte-check parse the whole file as one unterminated script (`element_unclosed` at EOF), while Vite/Vitest compile it fine. `Drill.svelte`'s comments say "style block"/"canvas element" in prose instead, with a note in the file.
- **Center dot timing.** The dot is dropped at `pointerdown` (a guide repaint with the dot suppressed) rather than at `pointerup`, so it is never left showing underneath the learner's first stroke. `clear()` restores it.
- **Rect caching.** `getBoundingClientRect()` is cached and invalidated on `resize`, and additionally re-read once per `pointerdown` -- one layout per stroke, which also covers a layout change no resize event reported.
- **Existing test superseded.** `cards.test.ts`'s "never has a `romaji` field" assertion (Story 1.2's deferral) was replaced by the Hepburn assertions this story requires; `card-repository.test.ts`'s exact-shape `toEqual` gained the new field.

### Review Findings

- [x] [Review][Patch] `pointerleave` completes the active stroke prematurely, contradicting a frozen invariant [src/adapters/ink/canvas-ink-surface.ts:148]
- [x] [Review][Patch] Katakana/hiragana romaji correctness rests on positional array-coupling verified by only a partial content spot-check [src/domain/cards.ts:96-113]
- [x] [Review][Patch] A Settings save failure on the currently-selected preset can never be retried by re-tapping it [src/adapters/ui/Settings.svelte:53]
- [x] [Review][Patch] Settings' load/save failure note has no `aria-live` region, so screen-reader users get no announcement [src/adapters/ui/Settings.svelte:105]
- [x] [Review][Patch] `INK_COLORS` is a plain mutable object, unlike every other config table in this codebase (`WIDTH_PRESETS`, `CARDS`) [src/app/App.svelte:26]
- [x] [Review][Defer] `epic-1-context.md`'s rewrite drops the scope/full-scope-completion link and the quantified 5-minute idle default [_bmad-output/implementation-artifacts/epic-1-context.md] — deferred: pre-existing at `baseline_commit`, not caused by this diff, and the fix would edit an agent-context file; Stories 1.7/1.9 must restore both facts before being specified.

**Rejected**

- Spec frontmatter says `status: 'done'` while `sprint-status.yaml` has this story at `review` — `false`: fixing this would mean editing the spec under review; both reflect this workflow's own in-flight state.
- `wrangler.jsonc` added with no mention in the spec's Code Map — `false`: valid, inert deployment config from an unrelated commit riding the branch; no behavioral defect.
- `Missed`/`Correct` both call the identical `handleGrade()` with no distinguishing argument — `false`: intentional per the frozen spec ("a grade only advances the loop"); nothing is persisted this story, so there is nothing yet to differentiate.
- `epic-1-context.md` leaves the shaky badge's interaction with the new Settings/Back flow unstated — `false`: no concrete failure scenario, a documentation gap for a future story, not a defect in this diff.
- `pointercancel` leaves `hasInk` unchanged when a prior stroke already completed — `false`: correct behavior; the earlier stroke's ink still exists on the canvas so `hasInk` staying `true` matches what's actually drawn.
- `Settings.svelte`'s `settingsRepository.get().then(...)` has no `.catch` — `false`: `IdbSettingsRepository.get()` wraps every I/O path in try/catch and always resolves a `Result`, per `settings-repository.persist-failure.test.ts`; unreachable without a new adapter bug.
- `pickRandomCard` doesn't guard against duplicate `cardId`s in its input — `false`: `CARDS` is a frozen, generated catalog with unique natural keys; no code path today produces a scope containing duplicates.
- Ink-trail width is computed once per move event and reused across coalesced sub-segments — `false`: this is exactly the frozen PoC-parity mechanic the spec requires, not a defect.
- `deferred-work.md`'s new entry assumes `planning-artifacts/epics.md` still holds two facts, unverified in this diff — `false`: a documentation cross-check with no demonstrated failure and nothing in this diff to patch.
- Grade buttons stay active mid-second-stroke, and `clear()` nulls `activePointerId` without releasing native pointer capture — `false`: matches the spec's "active once a stroke exists" wording; native pointer capture auto-releases on `pointerup` regardless of the explicit call, and the `activePointerId` null check correctly ignores any leftover move/end events for that pointer.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `replay()` recomputes width from the current `this.widthPreset`, so a `setWidthPreset` followed by a resize repaints existing ink at the new range | medium | patch | Confirmed: `replay()` calls `pressureToWidth(b.pressure, this.widthPreset)`, and `resize()`→`redraw()`→`replay()`. Contradicts the port docstring and the matrix's "strokes already drawn are unchanged". Unreachable via today's wiring (`inkSurface` is null whenever Settings is open) but reachable through the class's own public `setWidthPreset`, and Story 1.5's persisted replay inherits it. Smallest fix is adapter-internal (keep the preset beside each stroke), so no public surface. |
| 2 | `pointercancel` is bound to `handlePointerEnd` and commits the partial stroke as a completed one | medium | patch | Confirmed: `handlePointerEnd` pushes to `strokes` and fires `strokeCompleteCb` regardless of `event.type`. Palm contact/OS gesture on a tablet is everyday; an aborted stroke then counts as ink and enables grading. Frozen intent says `onStrokeComplete` fires per *completed* stroke, so discarding on cancel follows the spec rather than deviating. |
| 3 | `aria-valuenow` exceeds `aria-valuemax` once the counter passes N | medium | patch | Confirmed: `aria-valuenow={position}` vs `aria-valuemax={cards.length}`, and `Drill.test.ts` deliberately asserts the "3 / 2" state. Screen readers get an out-of-range value. Direct correction, no new surface. |
| 4 | `.cell` combines `aspect-ratio: 1/1` with `max-height: 60vh`, so the cell is not reliably square and per-axis normalization distorts replay | medium | patch | Confirmed in `Drill.svelte`'s style block; when the height cap binds the box is wider than tall, and `toGridRelative` normalizes x and y independently, so an in-memory stroke replays distorted after a rotate/resize. CSS-only correction. |
| 5 | The coalesced-events branch is never exercised — the test's `pointerEvent()` has no `getCoalescedEvents` | medium | patch | Confirmed: the helper builds a plain `Event`, so `typeof event.getCoalescedEvents === 'function'` is always false and the fallback branch always runs. "Width computed once per move event and reused across sub-segments" is frozen PoC-parity mechanics with zero coverage. |
| 6 | No end-to-end coverage that a Settings preset change reaches the next drill's adapter | medium | patch | Pre-verified by the verification-gap layer with a demonstration: deleting `widthPreset = preset` from `handlePresetChange` leaves the whole suite green, because the only preset assertion in `App.test.ts` comes from the boot read, not a tap. The story's headline setting can break silently. |
| 7 | No test for Start → Back → Start re-entry, the invariant AD-2 exists to protect | medium | patch | Confirmed: `App.test.ts` asserts one canvas on first entry and zero after Back, never the re-entry that a leaked adapter would turn into a second canvas (the black-canvas compositing bug). Test-only. |
| 8 | Katakana romaji is taken from `HIRAGANA_ROMAJI` by index and no test can observe a misalignment | medium | patch | Confirmed: `baseCards()`/`yoonCards()` read the shared arrays for both scripts, so the "hiragana and katakana counterpart read identically" test is tautological. Hepburn spot-checks cover only ヲ/ン for katakana and no katakana yoon; swapping シ/ツ in `KATAKANA_BASE` ships wrong readings with a green suite. |
| 9 | `pointerleave` is wired to `handlePointerEnd`, potentially splitting one stroke into several completions | maybe-false | defer | Under working `setPointerCapture` the browser retargets boundary events, so the leave should not fire mid-stroke; happy-dom never dispatches it unprompted, and no test covers it. Would need the target tablet to settle whether a leave fires mid-stroke under capture. Medium if confirmed. |
| 10 | `INK_COLORS` hard-codes four `theme.css` hexes in `App.svelte` with nothing guarding drift | low | defer | Confirmed the duplication (values currently match `theme.css`). Developer harm is real — a palette edit desynchronizes the canvas from the DOM — but closing it needs either a shared token module or a CSS-parsing test, beyond a direct correction, and the story's mandated manual side-by-side check would catch a live mismatch. |
| 11 | The Settings radiogroup has roving `tabindex` but no arrow-key handler, so a keyboard user cannot change the selection | medium | defer | Confirmed in `Settings.svelte` — and confirmed identical in `ScopePicker.svelte:104-174`, shipped and reviewed in Story 1.2. Pre-existing house pattern, not caused by this change; fixing it belongs across both controls at once. |
| 12 | `App.svelte`'s `void settingsRepository.get().then(...)` has no `.catch` | low | defer | The `void ... .then` chain is pre-existing (this story only added a line inside it), and `settings-repository.persist-failure.test.ts` proves the adapter converts rejections into typed `Result`s, so the path needs an adapter bug to reach. |
| 13 | `epic-1-context.md` rewrite drops the scope/full-scope-completion link and the quantified 5-minute idle default | low | defer | The file was already modified in the working tree at `baseline_commit`, so it is not this change's doing; it is also an agent-context artifact, which routes to defer by rule. Stories 1.7/1.9 depend on both facts. |
| 14 | `Settings.svelte`'s `get()` chain has no `.catch`, leaving `loaded === false` | low | rejected | Same refutation as #12: the port converts rejections to `Result`s (proven by an existing test), so this needs an adapter bug to reach, and the fix adds a branch rather than correcting one. |
| 15 | `clear()` called mid-stroke nulls `activePointerId`, so `releasePointerCapture` is never called | low | rejected | Real but self-healing: the next `pointerdown` re-captures, and reaching it needs a second finger on Clear while the pen is down and a prior stroke already landed. Fix adds a guard branch. |
| 16 | Only `window` resize is observed; a cell resize with no window event leaves the backing store stale | low | rejected | Confirmed there is no `ResizeObserver`, but `pointerdown` re-measures the rect so coordinates stay correct, and the target is a fixed portrait tablet. Fix adds a new observer and teardown. |
| 17 | Entering the drill with an empty scope throws from `pickRandomCard` during init | false | rejected | Not reachable: both `ScopePicker` pill groups always leave at least one script and one unit selected, so `cardsInScope` is never empty. Throwing loudly on a state the program cannot reach is correct behavior. |
| 18 | `Drill.svelte`'s `if (!cell) return` skips the cleanup that calls `destroy()` | false | rejected | Not reachable: `.cell` is rendered unconditionally (inside no `{#if}`), so Svelte assigns `bind:this` before `onMount`. On the hypothetical path `mount()` never ran, so there is nothing to destroy. |
| 19 | `normalizePressure` does not clamp pressure above 1 | maybe-false | rejected | Pointer Events constrains `pressure` to 0..1; a driver quirk was not demonstrated, and the PoC (the frozen parity target) does not clamp either. Would only be `low` if confirmed — a slightly over-thick stroke. |
| 20 | `toGridRelative` does not clamp to 0..1 for captured moves outside the cell | low | rejected | Out-of-range points are clipped by the canvas today, so nothing visible breaks. Clamping would flatten an overshooting stroke onto the cell edge — a behavior change the spec does not ask for, and less faithful than clipping. |
| 21 | A resize mid-stroke drops the in-progress ink and leaves `lastX/lastY` against the old rect | low | rejected | Real but confined to one stroke the learner can Clear, and it needs a rotate during a stroke. Fix means replaying `currentPoints` and rescaling the last point — added complexity. |
| 22 | Two rapid Settings taps can resolve out of order, leaving `lastRead` behind the displayed preset | low | rejected | The only field that diverges is `widthPreset`, which every later save overwrites anyway, and `preset` is set optimistically before the await. No observable consequence; fix adds a sequence number. |
| 23 | The `{#if}` chain lost its catch-all `{:else}`, so `summary`/`history` render nothing | false | rejected | Confirmed those members exist in `Screen`, but nothing in this story assigns them, and `handleStart` always sets `inkSurface` before `screen = 'drill'`. Stories 1.9/1.10 add their own branches with their screens. |
| 24 | The spec says `in-review` while `sprint-status.yaml` says `in-progress`, and the change/triage logs are empty | false | rejected | Not a defect: both are this workflow's own in-flight state at the moment the diff was taken. Step 5 syncs sprint-status, and this table is the triage log being written now. |

## Design Notes

Ink mechanics distilled from `poc-web/index.html` (do not re-derive; do not edit that file):

```js
const ctx = canvas.getContext('2d', { desynchronized: true });
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);            // draw in CSS px
// pressure: non-pen, or falsy (incl. exactly 0) -> 0.5
// width = min + p * (max - min), computed ONCE per move event,
//   reused for every coalesced sub-segment of that event
ctx.lineCap = ctx.lineJoin = 'round';               // per-segment straight lines,
ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();  // no smoothing
// raw (non-coalesced) event; on pointerdown BEFORE drawing the dot, on pointermove AFTER the segments
presenter?.updateInkTrailStartPoint(rawEvent, { color, diameter: width });
```

`setPointerCapture` on down (release in try/catch); a tap with no movement draws a dot via a `+0.01` micro-segment; resizing clears the backing store, so re-draw the guide and replay the in-memory stroke list. Convert every pointer coordinate through the canvas's `getBoundingClientRect()` first — the PoC gets away with raw `clientX/clientY` only because its canvas is `position: fixed; inset: 0` — then store points grid-relative (divide by the cell's CSS size) so 1.5 can persist them and replay at any viewport size, even though the layout is a fixed portrait target.

## Verification

**Commands:**
- `just check` -- expected: lint, typecheck, and test all pass with zero errors, including the new ink/drill/settings tests

**Manual checks (if no CLI):**
- On the target tablet, write on the drill cell with the stylus beside `poc-web/index.html` open on the same device: taper and latency should be indistinguishable; switching the Settings preset changes the next stroke's width range.
