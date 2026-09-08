# Epic 1 Context: Kana Writing Drill with Weak-Spot Memory

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic delivers the entire core product: a learner installs tegakko on their tablet, picks a practice scope, writes kana from memory on a pressure-sensitive genkouyoushi canvas, self-grades honestly (with an optional reveal), has misses bias which cards resurface (weighted by recency, not raw count), and can review session-by-session accuracy history — fully offline, persisting losslessly across days and reloads. It also includes the full greenfield scaffold (no starter template exists yet) and the hexagonal domain/ports/adapters skeleton the rest of the app is built on. Epic 1 is standalone and shippable without Epic 2 (backup/export-import).

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

- Card catalog: exactly 158 distinct cards (46 base hiragana, 46 base katakana, 33 hiragana yoon, 33 katakana yoon), keyed `"<grapheme>:<script>"`; no same-sound card collapses across script or base/yoon.
- Scope selection (script/unit toggles) governs a session's card pool and full-scope-completion condition; default scope is all 158 cards.
- Prompt cycle is: prompt → write → optional reveal → explicit self-grade. No automated recognition ever grades; reveal never auto-assigns a grade.
- Stroke width must continuously vary with pressure across the full range (Pointer Events + Chrome Delegated Ink Trails); at least 3 width presets, selectable and persisted.
- Every self-graded "incorrect" increments a persistent per-card miss tally before the next prompt is chosen; "correct" never touches it.
- Next-prompt selection is recency-weighted from attempt history (not lifetime tally); every candidate card keeps nonzero selection probability, never permanently excluded.
- Every completed prompt cycle persists a full attempt record (card, timestamps, time-to-first-stroke, total time, stroke count, reveal-used flag, self-grade, embedded grid-relative strokes).
- A session closes on explicit end, full-scope completion, or inactivity past a user-adjustable threshold (~5 min default); closure reason is distinguishable afterward. Idle detection must survive backgrounded/throttled tabs — evaluated retroactively from `lastInteractionAt`, not a live timer.
- On closure, a summary (date, cards attempted, accuracy, closure reason) is recorded and browsable later, most recent first, with idle-closed sessions visually distinct.
- Everything persists locally via IndexedDB, survives reload/restart; strokes are grid-relative (never absolute pixels) and replay correctly at any viewport size.
- App must be installable and fully offline-capable (manifest + service worker); production requires HTTPS (needed for Delegated Ink Trails' secure-context requirement).
- TypeScript strict mode across domain/ports/adapters/app, `no-explicit-any` as a hard error; persistence failures resolve as typed `Result`/rejected `Promise`, never a raw `DOMException`.
- Accessibility floor: tap targets well over Android's 48dp minimum; grade/closure states never color-only; WCAG AA contrast on load-bearing text/background pairs.
- Ink latency/feel must match or exceed the validated web PoC on the same device class — judged by side-by-side comparison, not a numeric threshold.

## Technical Decisions

- Hexagonal layering: `domain/` (pure, no DOM/IndexedDB/Svelte imports), `ports/` (interfaces), `adapters/{persistence,content,ink,ui}` (never import a sibling adapter directly — `io` belongs to Epic 2), `app/` (sole composition root). Enforced by an import-boundary ESLint rule.
- `InkSurface` port (`mount(node)`, `clear()`, `onStrokeComplete(cb)`): the ink adapter owns its canvas node outside Svelte's reactive tree; `ui` calls `mount()` once and never re-renders inside that node. The pen-check screen's live pressure readout uses its own lightweight `pointermove` listener, separate from this path.
- Grid guide and ink render on one canvas element only, never two layered canvases (avoids a known black-canvas compositing bug from the web PoC).
- Card catalog (`domain/cards.ts`) is static build-time data; `CardRepository` is in-memory, not IndexedDB-backed.
- IndexedDB (`idb`) stores: `tallies` (`{cardId, missCount}`, exactly these fields), `attempts` (embeds `strokes[]` plus session/card/timing/reveal/grade fields), `sessions` (`{id, date, scope, cardsAttempted, accuracy, closureReason}`), `settings` singleton (`{widthPreset, idleTimeoutMs, penCheckShown}`). `closureReason` is one canonical `'explicit'|'full-scope'|'inactivity'` type.
- Fixed repository signatures: `CardRepository.getAll()/getById()`; `TallyRepository.getAll()/increment(cardId)/decrement(cardId)` (atomic, decrement clamps at zero, unused until undo); `AttemptRepository.add()/listBySession()/listAll()` (always complete, never paginated)`/deleteLast()`; `SessionRepository.add()/list()`; `SettingsRepository.get()/save()`.
- `selectNext(attempts, scope): Card` is a pure domain function — no `tallies` param, no clock/schedule input; candidates come from filtering the static catalog by scope. `attempts` loads once via `listAll()` at session start and is appended to in-memory as the session progresses (never re-fetched per selection). Each incorrect attempt decays exponentially with a 7-day half-life on elapsed wall-clock time since its timestamp; a card's score is the sum of its decayed incorrect weights since its last correct attempt (a correct attempt zeroes prior misses for that card); sampling guarantees a nonzero-probability floor for every candidate.
- `undoLastGrade(sessionId)` is one atomic domain operation: `AttemptRepository.deleteLast()`, then conditionally `TallyRepository.decrement(cardId)` if the undone grade was incorrect, plus removal from `selectNext`'s in-memory attempts list — called once by `ui`, never sequenced there.
- Canonical top-level `Screen` enum (`'pen-check'|'scope-picker'|'drill'|'summary'|'history'|'settings'`) drives one top-level Svelte state variable; no router library. Drill's sub-states (blank/written/revealed/graded) are local component state.
- Service worker updates apply silently (`vite-plugin-pwa`, `registerType: 'autoUpdate'`) — no update-prompt UI.
- Stack: TypeScript 6.0.3 (strict), Vite 8.2.2, Svelte 5.57.0, `@sveltejs/vite-plugin-svelte` 7.3.0, `vite-plugin-pwa` 1.3.0, `idb` 8.0.3. Hosting: Cloudflare Pages, Git-integrated (push-to-`main` auto build+deploy, preview deploys on other branches), default `*.workers.dev` origin satisfies HTTPS. Root `Justfile` exposes `dev`/`build`/`lint`/`typecheck`/`deploy` (`deploy` wraps `wrangler pages deploy dist`).
- Greenfield: no package.json/build tooling exists yet — the scaffold is Story 1.1's job.

## UX & Interaction Patterns

- Warm washi-paper palette, one chromatic accent (terracotta) reserved for the single primary action on a screen (Correct button, progress fill, newest history bar) — never decoration, no second accent, no gradients, no red/error fills (a miss is "attention," not an error).
- Fixed type roles: serif heading face for headings/labels/buttons and the one large accuracy hero number; a brush glyph face only for an actual rendered kana grapheme, never UI text; a sans body face for sentences/micro-labels. Prompts are romaji + script name only — never a mnemonic or example word.
- Voice: no praise, streak language, or exclamation marks; plain quiet copy (e.g. "Your call — nothing is checking the shape.").
- Grade buttons (Correct/Reveal/Missed) start dimmed except Reveal, active immediately; Missed/Correct activate once a stroke exists or Reveal is tapped. Correct is the only button ever filled with the accent color.
- Reveal shows a side-by-side "Yours"/"Reference" layout (never overlaid) — empty "Yours" panel if revealed from blank; Reveal itself becomes a dimmed "Revealed" label, Missed/Correct remain required.
- Pill-toggle groups (script/set on Scope picker; ink-width/idle-timeout on Settings) commit immediately, exactly one segment active, no confirm step; Scope picker recomputes "N cards in scope" and "N shaky" (missed-variant chip) live on every toggle.
- Chip tags are read-only/non-tappable (positive for script/set/status, missed for miss/shaky counts); card position ("12/46") is plain text, never a chip.
- Post-grade toast shows Undo, with the new cumulative miss tally only on a Missed grade; stays until "Next character" or Undo is tapped.
- Session summary: accuracy hero percentage plus exactly two stat tiles (time, reveal count); a manual close gets a positive "you ended it" chip, full-scope close gets none.
- History: reverse-chronological rows, hairline dividers (last row bare); idle-closed rows get a neutral "closed on idle" chip and dimmed accuracy; full-scope rows get a positive "whole scope" chip; sparkline covers up to the last 10 sessions, 5-step accuracy color ramp except the newest bar (always accent); empty state hides the sparkline, shows one centered line, no CTA.
- Single-surface navigation: one screen at a time, no tabs/drawer, six top-level surfaces (first-run, scope-picker, drill, summary, history, settings) — no modal in this epic (the one modal, import-warning, belongs to Epic 2).
- Layout target: single portrait viewport (~800×1280 logical px, Android tablet + stylus), no responsive breakpoints.

## Cross-Story Dependencies

- 1.2 and the Drill screen from 1.3 both depend on the app shell scaffolded in 1.1.
- 1.3 initially uses random prompt selection as a placeholder; 1.7 replaces it with `selectNext`, which needs attempt history (1.5) and tallies (1.6) both in place.
- 1.4 (Reveal) extends 1.3's Drill screen and its grade-button state machine.
- 1.6's tally increments are driven by grades recorded via 1.5's attempt persistence.
- 1.8 (Undo) depends on 1.5 (`deleteLast`), 1.6 (`decrement`), and 1.7's in-memory attempts list.
- 1.9 (closure/summary) depends on attempts (1.5) and the scope size from 1.2/1.3; its idle-threshold setting extends 1.3's Settings screen.
- 1.10 (History view) depends on the `sessions` store written by 1.9.
- Epic 2 (export/import) builds on this epic's persisted data model but is not required for Epic 1 to ship.
