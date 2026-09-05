# Epic 1 Context: Kana Writing Drill with Weak-Spot Memory

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver the entire shippable product minus backup/restore: a learner installs tegakko on a Chromium Android tablet, picks a practice scope, writes kana from memory on a pressure-sensitive genkouyoushi canvas, self-grades honestly (with a reveal option that never grades for them), has recent misses bias which cards resurface, and reviews accuracy session by session — fully offline, across days, with nothing lost on reload. Because there is no starter template, this epic also carries the greenfield scaffold and the hexagonal skeleton every later story builds on. Epic 1 is standalone and shippable without Epic 2.

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

- **Catalog:** exactly 158 distinct cards — 46 base + 33 yoon per script, hiragana and katakana. Same-sound cards never collapse across script or base/yoon.
- **Self-grading is sacred.** Nothing automated ever judges a stroke. Every prompt cycle requires an explicit correct/incorrect tap; reveal never auto-assigns a grade, and whether reveal was used is recorded on the attempt.
- **No scheduling.** Misses bias selection probabilistically; no due dates, intervals, or queues. Every in-scope card always keeps a nonzero selection probability.
- **Persistence is lossless and local.** Tallies, attempts (with ink), and sessions survive reload and device restart; strokes are stored grid-relative so they replay correctly at any viewport size.
- **Offline PWA.** Must meet Chromium installability criteria (manifest + service worker), launch from the home screen with no address bar, and run drill/history/settings with no network. Production requires an HTTPS origin — Delegated Ink Trails needs a secure context.
- **Ink feel** is validated by side-by-side comparison against the existing web PoC on the same device class, not against an invented numeric latency threshold.
- **Strictness:** TypeScript `strict: true` across every layer with no exceptions; `@typescript-eslint/no-explicit-any` is an error, not a warning.
- **Accessibility floor:** tap targets comfortably exceed Android's 48dp minimum; no state is ever color-only (every chip pairs tint with text); WCAG AA contrast on all load-bearing pairings.
- **Standing product exclusions:** no streaks, points, badges, or daily-use nudges; no mnemonics or example words in prompts (romaji + script name only); no red/error visual language for a miss.

## Technical Decisions

- **Ports & adapters layering:** `domain/` (pure — no DOM, IndexedDB, or Svelte imports), `ports/` (interfaces), `adapters/` (persistence, content, ink, ui, io), `app/` (composition root, the only place concrete adapters are wired). An adapter never imports a sibling adapter's implementation; enforce with an import-boundary ESLint rule.
- **Card content is static build-time data** in `domain/cards.ts`, served by an in-memory `CardRepository` — never an IndexedDB store. `cardId` is the natural key `"<grapheme>:<script>"`.
- **IndexedDB (via `idb`), four stores:** `tallies` (`cardId`, `missCount` — exactly those two fields, ever), `attempts` (embeds grid-relative `strokes[]` plus session/card ids, timestamp, timing, stroke count, reveal flag, self-grade), `sessions` (id, date, structured `scope`, cardsAttempted, accuracy, closureReason), `settings` (singleton: widthPreset, idleTimeoutMs, penCheckShown). `closureReason` is one canonical type: `'explicit' | 'full-scope' | 'inactivity'`. Ids are `crypto.randomUUID()`; dates are ISO-8601 strings.
- **Repository signatures are fixed:** `CardRepository.getAll/getById`; `TallyRepository.getAll/increment/decrement` (atomic, decrement clamps at zero, used only by undo); `AttemptRepository.add/listBySession/listAll/deleteLast` — `listAll()` returns complete unpaginated history; `SessionRepository.add/list`; `SettingsRepository.get/save`.
- **Persistence failures** surface as a typed `Result` or rejected promise — a raw `DOMException` must never escape the adapter boundary.
- **Ink adapter** implements an `InkSurface` port (`mount(node)`, `clear()`, `onStrokeComplete(cb)`) and owns its canvas node outside Svelte's reactive tree: `mount()` is called once on mount and nothing re-renders inside that node; `onStrokeComplete` fires per stroke, never per pointer event. The pen-check screen's live pressure readout is the one exemption (its own lightweight `pointermove` listener).
- **One canvas element only** — grid guide and ink render together; two layered canvases trigger a known black-canvas compositing bug under Delegated Ink Trails.
- **Selection is a pure domain function** `selectNext(attempts, scope): Card` — no tallies parameter, no clock or schedule input, candidates filtered from the static catalog internally. Each incorrect attempt's weight decays exponentially with a 7-day half-life on elapsed wall-clock time; a card's score is the **sum** of qualifying decayed weights; a correct attempt zeroes the contribution of the incorrect attempts preceding it for that card; sampling enforces a nonzero probability floor. `attempts` is loaded once via `listAll()` at session start and appended to in memory during the session.
- **Undo is one atomic domain operation** `undoLastGrade(sessionId)`: delete last attempt, conditionally decrement the tally, and drop it from the in-memory attempts list. The UI calls it once, never sequencing the port calls itself.
- **Navigation** is a canonical `Screen` enum (`pen-check | scope-picker | drill | summary | history | settings`) in `adapters/ui/screens.ts` driven by one top-level state variable — no router. Drill's sub-states (blank, written, revealed-from-*, graded) are local component state, not `Screen` members.
- **Idle closure must not rely on a live timer** — backgrounded Android/Chrome throttles `setTimeout`. Record `lastInteractionAt` on every interaction and evaluate idleness retroactively on resume/focus/interaction; a session found idle closes with `'inactivity'` and a date/duration reflecting when activity actually stopped.
- **Stack (pinned):** TypeScript 6.0.3 strict, Vite 8.2.2, Svelte 5.57.0, @sveltejs/vite-plugin-svelte 7.3.0, vite-plugin-pwa 1.3.0 (`registerType: 'autoUpdate'` — updates apply silently, no update banner), idb 8.0.3. A root `Justfile` exposes `dev`, `build`, `lint`, `typecheck`, `deploy`. Hosting is Cloudflare Pages via Git integration (push to `main` builds and deploys; other branches get previews); `deploy` wraps `wrangler pages deploy dist`.
- **Not decided upstream, decide at story time:** test framework (Vitest is the natural fit) and whether lint/typecheck become a CI gate. No third-party telemetry or crash reporting — console plus a minimal in-app error boundary.

## UX & Interaction Patterns

- **Visual system:** implement DESIGN.md's tokens as CSS custom properties (`--color-*`, `--font-*`, `--radius-*`, `spacing-1`..`spacing-8`). Warm washi-paper neutrals, exactly one chromatic accent (terracotta) reserved for the single primary action per screen. No second accent, no gradients, no red anywhere — a miss uses the peach "missed" tint, not error language. Card surfaces are the only elements that cast a shadow. Kana graphemes render in the brush face (Yuji Syuku); UI text, labels, and romaji never do.
- **Single-surface navigation:** one screen at a time, no tab bar or drawer, six surfaces total. The only modal in v1 belongs to Epic 2.
- **Layout target:** portrait ~800×1280 logical px, Android tablet + stylus; no responsive breakpoints.
- **Grade buttons** sit in one equal-width row under the canvas. Reveal is active from the moment the prompt appears; Missed and Correct stay dimmed and non-interactive until either a stroke exists or Reveal has been tapped. Correct is the only accent-filled control.
- **Genkouyoushi cell:** dashed cross-guide always visible; center dot only while empty; Clear appears once ink exists, paired with "Your call — nothing is checking the shape," and never advances or grades.
- **Reveal** switches to a side-by-side Yours/Reference layout — never overlaid, never replacing the user's ink; revealing from blank shows an empty "yours" panel. Reveal then becomes a dimmed "Revealed" label.
- **Post-grade toast** shows the card, its new cumulative miss tally (Missed only), and Undo; it persists until "Next character" or Undo. Undo returns to the graded card's *written* state, not a blank cell.
- **Pill toggle groups** (script, set, ink width, idle threshold): exactly one active segment, commits immediately, no confirm step. Scope picker recomputes "N cards in scope" live on every tap.
- **Chips are read-only and never tappable** — positive for script/set/status, missed for counts. Card position ("12 / 46") is plain text, not a chip. Progress bars are always paired with the text counter.
- **Shaky badge** counts in-scope cards whose tally exceeds a running-average threshold — informational only, it never affects weighting.
- **History:** reverse-chronological rows divided by hairlines (omitted on the last); idle-closed rows get a neutral "closed on idle" chip with a dimmed accuracy value, full-scope rows a positive "whole scope" chip, manual closures no chip. Sparkline covers the last 10 sessions, height by accuracy, color by a 5-step ramp, newest bar always accent; idle sessions appear undifferentiated there. Empty state hides the sparkline and shows one centered line, no CTA.
- **Voice:** no praise, streaks, or exclamation marks. "I'm done." not "Let's go!"
- **Interaction:** pen-first, but every non-canvas action is a single tap — no swipe, drag, or long-press. Mouse/touch must stay operable as a dev/testing degradation.

## Cross-Story Dependencies

- Story 1.1 scaffolds everything (project, layering, lint boundaries, PWA, settings store) — every other story depends on it.
- Story 1.2's catalog and `Scope` type feed the drill loop's card pool and the session record's `scope`.
- Story 1.3 builds the drill loop with a **random** selection placeholder and introduces the Settings screen; Story 1.7 replaces the placeholder with `selectNext`.
- Story 1.7 needs both attempt history (1.5) and tallies (1.6); its shaky badge lands on Story 1.2's Scope picker.
- Story 1.8's undo consumes `TallyRepository.decrement` (created but unused in 1.6), `AttemptRepository.deleteLast` (1.5), and Story 1.7's in-memory attempts list.
- Story 1.9 extends Story 1.3's Settings screen with the idle threshold and depends on attempt data (1.5) for its accuracy summary.
- Story 1.10 depends on Story 1.9's `sessions` store and closure reasons.
- Epic 2 builds on this epic's persisted data model; nothing here depends on Epic 2.
