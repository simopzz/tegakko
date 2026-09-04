# Epic 1 Context: Kana Writing Drill with Weak-Spot Memory

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver a personal, installable tablet PWA that tests genuine handwriting *recall* of Japanese kana rather than recognition or traced tracing. A learner installs the app, passes a first-run pen check, picks a practice scope, writes prompted characters from memory on a pressure-sensitive genkouyoushi canvas, self-grades honestly (with an optional reveal that never auto-grades), and has their misses bias which cards resurface — weighted by recency, not raw count, so old mistakes fade and recent ones matter. Sessions close cleanly (explicit, full-scope, or idle) and roll up into an accuracy history the learner can browse across days, fully offline, with nothing lost on reload. This epic also carries the entire greenfield scaffold (no starter template exists) and the hexagonal domain/ports/adapters skeleton the rest of the app builds on. Export/import backup (FR-13) is out of scope — that's Epic 2.

## Stories

- Story 1.1: Installable App Shell & First-Run Pen Check
- Story 1.2: Kana Catalog & Scope Picker
- Story 1.3: Write-From-Memory Drill Loop + Ink-Width Setting
- Story 1.4: Reveal Correct Answer
- Story 1.5: Attempt Recording
- Story 1.6: Per-Character Miss Tally
- Story 1.7: Weak-Spot-Biased Selection & Shaky Badge
- Story 1.8: Undo Last Grade
- Story 1.9: Session Closure, Idle Timeout & Summary
- Story 1.10: Session History View

## Requirements & Constraints

- Full kana catalog: 158 distinct cards (46 base hiragana, 46 base katakana, 33 hiragana yoon, 33 katakana yoon), each keyed on grapheme+script; no same-sound card ever collapses across script or base/yoon.
- Session scope selection (script and/or base/yoon) governs a session's card pool and its full-scope-completion condition; default scope is the full 158.
- Pen canvas over a genkouyoushi grid via Pointer Events + Chrome's Delegated Ink Trails; stroke width continuously reflects pressure across the full range; at least 3 width presets (Subtle/Expressive/Calligraphy); felt latency/control must match or exceed the validated web PoC on the same device class (direct side-by-side comparison, not a numeric threshold).
- Prompt → write → self-grade loop: every prompt requires an explicit self-grade before the next appears; no automated stroke recognition ever grades. Reveal may be used any time before grading, never auto-assigns a grade, and whether it was used is recorded per attempt.
- Per-card miss tally persists across sessions and increments on every self-graded "incorrect" before the next prompt is chosen.
- Next-prompt selection is recency-weighted from attempt history (not raw lifetime tally): older misses matter less, every candidate always keeps nonzero selection probability, and no card is ever excluded or scheduled out.
- Every completed prompt cycle is recorded as a full attempt (card, timestamp, time-to-first-stroke, total time, stroke count, reveal-used, self-grade, linked strokes) — never collapsed into aggregates only.
- A session closes on explicit end, full-scope completion, or idle timeout (~5 min default, user-adjustable); the closure reason is distinguishable afterward and a session summary (date, cards attempted, accuracy, closure reason) is recorded.
- Session history is browsable most-recent-first, with idle-closed sessions visually distinguishable from user/full-scope-closed ones.
- All stroke, tally, attempt, and session data persists locally (IndexedDB), lossless across reload/restart; strokes are stored grid-relative and replay correctly at any viewport size.
- The app installs to the home screen and runs fully offline once installed; production requires an HTTPS origin.
- Quality bars: TypeScript strict mode with `no-explicit-any` as an error across the whole codebase; tap targets far exceed Android's 48dp minimum; grade/closure states are never color-only; WCAG AA contrast on load-bearing text; the grid and ink render on a single canvas element (never two layered canvases — avoids a known black-canvas compositing bug from the web PoC).
- Success is felt, not dashboarded: a fast/honest recall read (including on genuinely forgotten cards via reveal), multi-day accuracy trend visible in history, and weak-spot bias surfacing the cards the user already suspects are shaky.

## Technical Decisions

- Hexagonal layering: `domain/` (pure — card model, selection algorithm, session/attempt aggregation; no DOM/IndexedDB/Svelte imports), `ports/` (repository + InkSurface interfaces), `adapters/{persistence,content,ink,ui,io}/`, `app/` (sole composition root wiring concrete adapters). An import-boundary ESLint rule blocks any `adapters/x` → `adapters/y` import outside `app/`.
- `ink` adapter implements `InkSurface` (`mount(node)`, `clear()`, `onStrokeComplete(cb)`), owns its canvas node outside Svelte's reactive tree; `ui` calls `mount()` once on `onMount` and never re-renders inside that node (pen-check's live pressure readout uses its own separate `pointermove` listener).
- Card catalog is static, build-time TypeScript data (`domain/cards.ts`); `CardRepository` is an in-memory adapter, not IndexedDB-backed. `cardId` is the natural key `"<grapheme>:<script>"`.
- IndexedDB (via `idb`) stores for this epic: `tallies` (`{cardId, missCount}` — exactly these two fields, no due-date/interval/last-reviewed ever), `attempts` (embeds grid-relative `strokes[]` plus `sessionId, cardId, timestamp, timeToFirstStrokeMs, totalTimeMs, strokeCount, revealUsed, selfGrade`), `sessions` (`{id, date, scope, cardsAttempted, accuracy, closureReason}`), `settings` (singleton: `widthPreset, idleTimeoutMs, penCheckShown`). `closureReason` is `'explicit'|'full-scope'|'inactivity'`.
- Fixed repository port signatures: `CardRepository.getAll()/getById()`; `TallyRepository.getAll()/increment(cardId)/decrement(cardId)` (atomic, decrement clamps at zero, used only by undo); `AttemptRepository.add()/listBySession()/listAll()` (complete, never paginated)`/deleteLast()`; `SessionRepository.add()/list()`; `SettingsRepository.get()/save()`.
- `selectNext(attempts: Attempt[], scope: Scope): Card` is a pure domain function — no `tallies` param, no clock/schedule input. Each incorrect attempt's weight decays exponentially with a 7-day half-life on elapsed wall-clock time since its timestamp (`weight = 0.5^(elapsedDays/7)`), never by ordinal position. A card's score is the *sum* of its qualifying incorrect attempts' decayed weights since its last correct attempt (chronic misses outrank a single old-but-recent-enough miss); a correct attempt zeroes prior incorrect attempts for that card. Sampling is probabilistic with a nonzero-probability floor for every in-scope candidate. `attempts` loads once via `listAll()` at session start and is appended to in-memory as the session progresses (never re-fetched per selection).
- `undoLastGrade(sessionId)` is one atomic domain operation: `AttemptRepository.deleteLast()`, then conditionally `TallyRepository.decrement(cardId)` if the undone grade was incorrect, plus removal from the in-memory attempts list — invoked once by `ui`, never as separate sequenced port calls.
- Canonical top-level `Screen` enum (`'pen-check'|'scope-picker'|'drill'|'summary'|'history'|'settings'`) owned by `adapters/ui/screens.ts`; one top-level Svelte state variable drives rendering, no router library. Drill's in-screen sub-states are local component state, not `Screen` members.
- Idle detection must not depend on a live running timer (Android/Chrome throttles backgrounded tabs): every interaction records `lastInteractionAt`; idle is evaluated retroactively on next resume/focus/interaction by comparing `Date.now() - lastInteractionAt` to `idleTimeoutMs`, and the resulting closure's `date`/duration reflects when activity actually stopped.
- Service worker updates apply silently (`vite-plugin-pwa`, `registerType: 'autoUpdate'`) — no update-available prompt.
- Production hosting: static build on Cloudflare Pages via native Git integration (auto build+deploy on push to `main`, preview deployments elsewhere, no GitHub Actions needed); default Cloudflare-provided `*.workers.dev` origin satisfies the HTTPS requirement.
- Persistence-adapter failures resolve as a typed `Result`/rejected `Promise`, never a raw `DOMException` past the adapter boundary.
- Greenfield scaffold: no build tooling exists yet. Directory shape: `src/{domain,ports,adapters/{persistence,content,ink,ui,io},app}`, `public/manifest.webmanifest`. Pinned versions: TypeScript 6.0.3 (strict), Vite 8.2.2, Svelte 5.57.0, @sveltejs/vite-plugin-svelte 7.3.0, vite-plugin-pwa 1.3.0, idb 8.0.3. A `Justfile` exposes `dev`, `build`, `lint`, `typecheck`, `deploy` (deploy wraps `wrangler pages deploy dist --project-name=tegakko`).
- Testing strategy and CI gates (beyond Cloudflare's build+deploy) are not fixed at the architecture level — decide at story/build time; Vitest is the natural fit given the toolchain.

## UX & Interaction Patterns

- DESIGN.md token set (CSS custom properties for color/font/radius/spacing) throughout: warm washi-paper palette, exactly one chromatic accent (terracotta), no red/error fills, no gradients, no second accent.
- Genkouyoushi cell: dashed cross-guide always visible; center dot only on the empty state, removed on first stroke; grid+ink on one canvas element; Clear appears once ink exists, paired with "Your call — nothing is checking the shape," never auto-advances/grades.
- Grade buttons: Reveal (neutral) active immediately on prompt; Missed (neutral) and Correct (primary, the only accent-filled button) render dimmed/non-interactive until a stroke exists or Reveal is tapped.
- Pill-toggle groups (scope picker's script/set, settings' idle-threshold/ink-width): exactly one active segment per group, commits immediately, no confirm step; scope picker's toggles recompute a live "N cards in scope" count.
- Scope picker shows a live "N shaky" badge (missed-variant chip) — cards in scope whose tally exceeds a running-average threshold; informational only, never affects selection weighting.
- Read-only, non-tappable chip tags (positive/missed/neutral) used across Scope picker, Drill header, Summary, History; card position ("12 / 46") is plain text, never a chip.
- Session summary: exactly two stat tiles (time, reveal count) plus accuracy hero and a missed-chip list with running tallies.
- Drill header: progress bar + "N / total" counter, always paired (bar is reinforcement, never the sole signal); advances on every completed grade including post-reveal grades.
- Post-grade toast: shows card + new cumulative miss tally (Missed only) plus Undo; stays until "Next character" or Undo; Undo reverts grade+tally and returns to the graded card's written (not blank) state.
- History row: reverse-chronological, hairline-divided (omitted on last row); idle-closed → neutral "closed on idle" chip + dimmed accuracy; full-scope → positive "whole scope" chip; manual close → no chip. Sparkline: last 10 sessions, bar height = accuracy, color = 5-step accuracy ramp except newest bar (always accent); idle-closed sessions appear undifferentiated in the sparkline.
- First-run screen: pen-check chip (positive) with live 0–1 pressure readout on stylus touch; graceful no-pressure-detected fallback (chip text changes, readout hidden, both install and "Just use it here" remain available — never hard-blocks).
- Reveal switches to a side-by-side "Yours"/"Reference" layout (never overlaid) — reference glyph in the Yuji Syuku brush typeface; "revealed from blank" shows an empty "yours" panel (center dot, no stroke); Reveal itself becomes a dimmed "Revealed" label once used.
- Empty history state: sparkline hidden, single centered line ("No sessions yet. Finish a drill to see it here."), no CTA.
- Voice/microcopy: no praise, streak language, or exclamation marks; prompt copy is romaji + script name only, never a mnemonic or example word.
- Single-surface navigation: one screen visible at a time, no tab bar/drawer; six top-level surfaces (first-run, scope-picker, drill, summary, history, settings); no modals in this epic (the one v1 modal — import warning — belongs to Epic 2).
- Accessibility floor: tap targets far exceed Android's 48dp minimum; color-only signaling is never used; WCAG AA contrast on all load-bearing pairings; basic mouse/touch operability as a graceful degradation for non-pen input.

## Cross-Story Dependencies

- Story 1.1 (scaffold + hexagonal skeleton) is the foundation every other story in this epic builds on.
- Story 1.3's random prompt selection is an explicit placeholder later replaced by Story 1.7's `selectNext`.
- Story 1.7 depends on both Story 1.5 (attempt history) and Story 1.6 (tallies) existing first.
- Story 1.8 (undo) depends on Story 1.5 (`deleteLast`), Story 1.6 (`decrement`), and Story 1.7 (the in-memory attempts list it must also remove from).
- Story 1.4 (reveal) extends Story 1.3's drill screen; `revealUsed` is captured by Story 1.5's attempt recording.
- Story 1.9 (session closure/summary) depends on Story 1.5 (attempts) and Story 1.6 (tallies) to compute accuracy and the missed-chip list, and introduces the `sessions` store Story 1.10 (history view) reads from.
- Epic 2 (export/import) builds on this epic's persisted data model (`tallies`, `attempts`, `sessions`), but this epic is fully standalone and shippable without it.
