# Epic 1 Context: Kana Writing Drill with Weak-Spot Memory

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic delivers the full single-user kana handwriting drill as an installable, offline-first PWA: pick a practice scope, write a prompted kana character from memory on a pressure-sensitive genkouyoushi canvas, self-grade honestly with an optional reveal, let misses bias which characters resurface next by recency rather than raw count, and review accuracy session by session over time. It also carries the greenfield scaffold and hexagonal domain/ports/adapters skeleton everything else builds on, since no build tooling exists yet. The product exists for a fast, honest recall check — not a guided-tracing tool, an auto-recognition tool, or an engagement product. Epic 1 is fully shippable alone; export/import backup (Epic 2) is a later, separable addition.

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

- Catalog holds exactly 158 cards (46 base hiragana, 46 base katakana, 33 hiragana yoon, 33 katakana yoon), each uniquely keyed by grapheme+script; no same-sound card collapses across script or base/yoon.
- A session scope (script and/or base/yoon), chosen up front, sets both the card pool and the full-scope-completion condition.
- Every prompt needs an explicit self-grade; no automated recognition ever grades. Reveal can be used any time before grading, never auto-grades, and its use is recorded on the attempt.
- The miss tally is a plain cumulative per-card count — never a spaced-repetition scheduler with due dates or intervals.
- Next-card selection is recency-weighted from attempt history, not lifetime tally: misses decay exponentially (7-day half-life) by wall-clock time, a card's score sums its decayed misses (not max/most-recent), and a later correct attempt zeroes out prior misses for that card. Every candidate always keeps some chance of being picked.
- Every completed prompt records its card, timestamp, time-to-first-stroke, total time, stroke count, reveal-used flag, self-grade, and grid-relative stroke ink (replayable at any viewport size).
- Sessions close on explicit action, full-scope completion, or inactivity (5 min default, adjustable). Idle detection compares a stored last-interaction time retroactively on next resume, not a live foreground timer — backgrounded mobile tabs throttle those.
- All data persists losslessly in IndexedDB across reload/restart, with typed errors rather than raw exceptions on failure. The app must install as an offline-capable PWA on Chromium Android (manifest + service worker, HTTPS) and work fully offline once installed.
- Tap targets sit well above Android's 48dp minimum; states are never color-only; WCAG AA contrast; TypeScript strict, no-explicit-any as an error.

## Technical Decisions

- Hexagonal layering: domain is pure (no DOM/IndexedDB/Svelte); ports define interfaces; adapters (persistence, content, ink, ui — io is Epic 2) implement them; app is the sole composition root wiring concrete adapters. Lint enforces the boundary; the one needed cross-adapter link (ui→ink) goes through the ink port.
- The ink port exposes mount/clear/on-stroke-complete; the adapter owns its canvas node outside Svelte's reactive tree, mounted once, firing the callback once per stroke (not per pointer event). Grid and ink render on one canvas element, never two layered — a compositing bug appeared that way earlier.
- The card catalog is static build-time data via an in-memory repository, not IndexedDB; a card's id is grapheme+script.
- Four IndexedDB stores: tallies, attempts (fields per Requirements above), sessions, and a singleton settings record. Repository signatures are fixed, including atomic tally increment/decrement (clamped at zero) and an unpaginated attempts listing.
- Weak-spot selection is a pure function of attempt history and scope; history loads once per session and is appended to in memory as attempts are recorded, never re-fetched per pick.
- Undo-last-grade is one atomic operation — delete the last attempt, decrement the tally only if incorrect, retract it from the in-memory selection list — called once, never sequenced by the UI.
- A single top-level screen enum (pen-check/scope-picker/drill/summary/history/settings) drives navigation via one state variable, no router; drill's own sub-states stay local component state.
- Service-worker updates apply silently, no update-prompt UI. Hosting: Cloudflare Pages, Git-integrated, auto-deploy on main; a root Justfile exposes dev/build/lint/typecheck/deploy. Stack: TypeScript strict, Vite, Svelte 5, vite-plugin-pwa, idb.

## UX & Interaction Patterns

- Warm washi-paper palette, one chromatic accent (terracotta) — no red/error fills, gradients, or second accent. Voice avoids praise, streak language, exclamation marks; prompts are romaji + script name only, never a mnemonic.
- Reveal is active the instant a prompt appears; Missed/Correct start dimmed and activate once a stroke exists or Reveal is tapped, whichever first — Correct is the only button ever filled with the accent color. The cell's center dot shows only while empty; Clear empties it without advancing the prompt.
- Reveal switches to a side-by-side "yours"/"reference" layout (reference in the glyph-ink typeface), never overlaid; from blank it shows an empty "yours" panel. Reveal then becomes a dimmed "Revealed" label — grading is still required after.
- The post-grade toast shows the card and (Missed only) its new cumulative tally plus Undo, until "Next character" is tapped; Undo restores the pre-grade written state, not a blank cell.
- Pill-toggle groups (scope script/set; settings idle-threshold/ink-width) commit immediately. Scope picker recomputes its live card count and informational "N shaky" badge on every toggle. A progress bar + "N of total" counter in the drill header advances on every completed grade, including post-reveal ones.
- Session summary: one accuracy hero percentage, two stat tiles (time, reveal count), a missed-chip list with running tallies; manual close gets a chip, full-scope close gets none.
- History rows run reverse-chronological; idle-closed rows get a neutral chip and dimmed accuracy, full-scope rows a positive chip, manual closes none. The last-10-session sparkline's bar height maps to accuracy and color to a 5-step ramp except the newest bar (always accent); empty history shows one centered line instead, no CTA.
- First-run shows a "stylus found" chip with a live pressure readout, and a graceful "no pressure detected" fallback that never blocks install or using the app without a stylus.
- One screen visible at a time, no modal in this epic (the app's only modal, import confirmation, belongs to Epic 2).

## Cross-Story Dependencies

- Story 1.1's scaffold/skeleton is a prerequisite for every other story here.
- Story 1.3 ships a random-selection placeholder by design; Story 1.7 explicitly supersedes it, depending on attempt history (1.5) and tallies (1.6).
- Story 1.8 depends on 1.5's delete-last and 1.6's decrement, and must retract the undone attempt from 1.7's in-memory selection list.
- Story 1.9 depends on attempts/tallies for accuracy and missed-chip data, and extends 1.3's Settings screen with an idle-threshold toggle; Story 1.10 depends on the session records it writes.
- Epic 2's export/import builds on this epic's persisted data shapes but is not required for Epic 1 to ship.
