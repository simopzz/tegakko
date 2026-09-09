# Epic 1 Context: Kana Writing Drill with Weak-Spot Memory

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A user can install tegakko on their tablet, pick a practice scope and session size, write kana from memory on a pressure-sensitive genkouyoushi canvas, self-grade honestly with an optional reveal, have misses bias which cards get sampled into *future* sessions (recency-weighted, not raw count), and review session-by-session accuracy history — fully offline, across days, nothing lost on reload. This epic also carries the full greenfield scaffold (no starter template exists yet) and the hexagonal domain/ports/adapters skeleton the rest of the app builds on. Excludes only the import-warning modal and export/import adapter (Epic 2).

## Stories

- Story 1.1: Installable App Shell & First-Run Pen Check
- Story 1.2: Kana Catalog & Scope Picker
- Story 1.3: Write-From-Memory Drill Loop + Ink-Width Setting
- Story 1.4: Reveal Correct Answer
- Story 1.5: Attempt Recording
- Story 1.6: Per-Character Miss Tally
- Story 1.7: Weak-Spot-Biased Session Sampling & Shaky Badge
- Story 1.8: Undo Last Grade
- Story 1.9: Session Closure, Idle Timeout & Summary
- Story 1.10: Session History View
- Story 1.11: Dakuten/Handakuten Catalog Expansion

## Requirements & Constraints

- Catalog is 208 static cards: 71 base hiragana (46 seion + 25 dakuten/handakuten), 71 base katakana, 33 yoon per script; keyed uniquely on grapheme + script, no same-sound collapsing.
- Before a session, the user picks a scope (script + base/yoon toggles, live "N cards in scope" count) and, independently, a session size (target distinct-card count capped at scope size, default "All", doesn't affect the scope count).
- Drill loop: prompt (romaji + script name, no mnemonic) → write from memory → optional reveal → mandatory explicit self-grade (correct/incorrect); no automated recognition ever grades a stroke.
- Reveal is available from prompt-shown until grading, never auto-assigns a grade; whether it was used is recorded per attempt regardless of grade.
- Every self-graded incorrect increments that card's cumulative miss tally before the next prompt; correct never changes it.
- A session's card set is sampled once at session start, without replacement, biased by a recency-weighted score over attempt history — every in-scope card always keeps nonzero sampling probability; each sampled card is shown exactly once per session.
- Every completed prompt cycle is recorded as a full attempt (card, timestamps, time-to-first-stroke, total time, stroke count, reveal-used, self-grade, embedded grid-relative strokes) — never collapsed to aggregates only.
- A session closes on an explicit end, on completing its own sampled set (exact count), or after an idle threshold (~5 min default, adjustable) evaluated retroactively from a recorded `lastInteractionAt` (never a live foreground timer — backgrounded tabs throttle those). Closure reason (`explicit`/`full-scope`/`inactivity`) is always distinguishable; `full-scope` always displays as "Session complete" regardless of sample-vs-scope size.
- On closure a session summary (date, cards attempted, accuracy, closure reason) is recorded and later browsable, most-recent-first, with idle-closed sessions visually distinguished.
- Strokes (grid-relative, not viewport-absolute), tallies, attempts, and sessions persist locally via IndexedDB, survive reload/restart, and replay correctly at any viewport size.
- App must be an installable, offline-capable PWA on Chromium Android, HTTPS in production; ink latency/feel must match or exceed the validated PoC on the same device class.
- TypeScript strict mode, no `any` anywhere, across the codebase; accessibility floor (48dp+ tap targets, never color-only states, WCAG AA contrast).
- Genkouyoushi grid and ink render on one canvas element only, never two layered canvases (avoids a known compositing bug).

## Technical Decisions

- Hexagonal layering: `domain/` pure (no DOM/IndexedDB/Svelte), `ports/` interfaces, `adapters/{persistence, content, ink, ui}` (`io` is Epic 2), `app/` the sole composition root wiring concrete adapters. No sibling-adapter imports — the one exception (`ui`→`ink`) goes through the `InkSurface` port; enforced by an import-boundary ESLint rule.
- `InkSurface` port: `mount(node)` once, outside Svelte's reactive tree; `clear()`; `onStrokeComplete(cb)` fires once per completed stroke (never per pointer event). First-run's pressure readout is exempt (own lightweight listener).
- Card content is static build-time TS (`domain/cards.ts`) served by an in-memory `CardRepository`, not IndexedDB; `cardId = "<grapheme>:<script>"`.
- IndexedDB (`idb`) has 4 stores — `tallies`, `attempts` (embeds grid-relative strokes + timing/grade fields), `sessions` (id/date/scope/cardsAttempted/accuracy/closureReason), `settings` singleton (widthPreset/idleTimeoutMs/penCheckShown). Repository ports (`CardRepository`, `TallyRepository` with atomic `increment`/`decrement`, `AttemptRepository` with an always-complete unpaginated `listAll()` plus `deleteLast`, `SessionRepository`, `SettingsRepository`) have fixed signatures — don't redesign them per story.
- Session sampling: pure domain fn `sampleSessionCards(attempts, scope, sessionSize): Card[]`, called exactly once at session start (no `tallies` param). Each candidate's score sums its qualifying incorrect attempts' contributions, each decaying by elapsed wall-clock time with a 7-day half-life; a correct attempt zeroes contributions preceding it for that card. Sampling is sequential weighted removal without replacement down to `min(sessionSize, cardsInScope.length)` with a nonzero-probability floor at every step, then uniform-shuffled so weight never determines presentation order. No further sampling call happens mid-session — a miss recorded during a session only affects the *next* session's sample.
- Undo: `undoLastGrade(sessionId)` is one atomic domain op (`AttemptRepository.deleteLast()`, then `TallyRepository.decrement(cardId)` only if the undone grade was incorrect), called once by `ui`. Since sampling happens only once at session start, undo needs no interaction with any queue/selection-input list.
- Screens: canonical `Screen = 'pen-check'|'scope-picker'|'drill'|'summary'|'history'|'settings'`, one Svelte state variable, no router; drill's own sub-states (blank/written/revealed/graded) are local component state, not `Screen` members.
- Service worker updates apply silently (`vite-plugin-pwa`, `registerType: 'autoUpdate'`), no update-prompt UI. Hosting is Cloudflare Pages via Git integration (`*.workers.dev` origin satisfies HTTPS); a `Justfile` exposes `dev`/`build`/`lint`/`typecheck`/`deploy`.
- Persistence-adapter failures resolve as a typed `Result`/rejected `Promise`, never a raw `DOMException`.
- Stack: TypeScript 6.0.3 (strict), Vite 8.2.2, Svelte 5.57.0, vite-plugin-pwa 1.3.0, idb 8.0.3.

## UX & Interaction Patterns

- Single-surface navigation: one screen at a time, no tab bar/drawer/modal (six top-level surfaces).
- Genkouyoushi cell: dashed cross-guide always visible, center dot only while empty; Clear appears once ink exists, paired with "Your call — nothing is checking the shape," never auto-advances/grades.
- Grade buttons: Reveal active immediately; Missed/Correct (Correct is the only accent-filled button) render dimmed until a stroke exists or Reveal was tapped.
- Reveal shows a side-by-side "Yours"/"Reference" layout (never overlaid, reference in the glyph-ink typeface); a blank reveal shows an empty "yours" panel; Reveal then becomes a dimmed "Revealed" label and both grade buttons activate.
- Pill-toggle groups (one active segment, commits immediately, no confirm): Scope picker's script/set toggles drive the live scope count; an independent session-size control doesn't affect it; Settings has ink-width and idle-threshold toggles.
- Read-only chip tags (positive/missed/neutral) on Scope picker, Drill header, Summary, History; card position ("12/N") is plain text, never a chip. Scope picker's "N shaky" badge (missed-variant) counts cards over a running-average miss threshold — informational only.
- Drill header progress bar + "N / total": total is the sampled size; advances one per grade; always reaches exactly 100% (no-replacement sampling means no overshoot).
- Post-grade toast: card + new cumulative miss tally (Missed only) + Undo, until "Next character" or Undo tapped; Undo restores the written (not blank) state.
- History rows: reverse-chronological, hairline-divided; idle-closed gets a neutral chip + dimmed accuracy; sampled-set-completed gets a positive "Session complete" chip regardless of scope-vs-sample size; manual closures carry no chip. Last-10-session sparkline (accent for newest bar); empty history shows one centered line, no CTA.
- First-run: pen-check chip with live 0–1 pressure readout, graceful "no pressure input detected" fallback (install and "Just use it here" both remain available); either path permanently sets `settings.penCheckShown`.
- Voice: no praise, streak language, or exclamation marks; prompts are romaji + script name only, never mnemonics/example words.

## Cross-Story Dependencies

- Story 1.11 (catalog expansion) is additive to and depends on Story 1.2's amended catalog/scope-picker AC; sequence before or alongside 1.2.
- Story 1.7's session sampling depends on attempt history (1.5) and tallies (1.6) already existing.
- Story 1.8 (undo) depends on 1.5, 1.6, and 1.7's session-sampling model (no in-session queue manipulation needed).
- Story 1.9's closure depends on Story 1.7's sampled queue as the completion target and Story 1.3's Settings screen for idle threshold.
- Story 1.10 depends on Story 1.9's session records.
- Epic 1 is standalone and shippable; Epic 2 builds on its persisted data model without blocking it.
