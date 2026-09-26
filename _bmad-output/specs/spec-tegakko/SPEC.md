---
id: SPEC-tegakko
companions:
  - ../../planning-artifacts/prds/prd-tegakko-2026-09-02/prd.md
  - ../../planning-artifacts/ux-designs/ux-tegakko-2026-09-02/DESIGN.md
  - ../../planning-artifacts/ux-designs/ux-tegakko-2026-09-02/EXPERIENCE.md
  - ../../planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md
sources:
  - ../../planning-artifacts/briefs/brief-tegakko-2026-09-01/brief.md
  - ../../planning-artifacts/briefs/brief-tegakko-2026-09-01/addendum.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Kana Writing Practice (tegakko v1)

## Why

Existing kana tools test recognition, not recall: Renshuu traces the correct stroke path for the user, Duolingo auto-recognizes an approximate finger-drawn shape but still guides the hand. Neither ever confirms a character can be produced from a blank page with nothing to go on. That gap leaves quiet uncertainty — sitting down unsure whether a kana is really known or only recognizable, with no fast, honest way to check. tegakko kana v1 closes that gap for its single user (the app's creator) with a genuine pressure-sensitive pen canvas: prompt, write from memory, self-grade — a targeted reinforcement tool, not a second SRS. It also serves as the deliberately narrow, low-risk proof-of-pipeline for kanji and vocabulary, expected to follow within months by reusing the same script-aware, self-graded, weak-spot-biased shape.

## Capabilities

- **CAP-1** — Script-aware kana card set, including yoon
  - **intent:** The system provides the full kana card catalog — 46 base hiragana, 46 base katakana, and standard yoon combinations for both scripts — each card keyed on grapheme + script.
  - **success:** All 158 cards (92 base + 66 yoon) exist as distinct catalog entries addressable by a unique grapheme+script key; no two same-sound cards, across scripts or base/yoon, ever share an entry.

- **CAP-2** — Session scope selection
  - **intent:** Before starting a session, the user selects its scope — the full kana set or a narrower subset by script and/or base/yoon — which governs that session's card pool and completion condition.
  - **success:** Starting with no changes uses the full 158-card scope; narrowing by script and/or base/yoon changes both the drawn card pool and the full-scope-completion condition accordingly.

- **CAP-3** — Pen canvas with genkouyoushi grid
  - **intent:** The user writes on a pressure-sensitive pen canvas rendered over a genkouyoushi grid, using Pointer Events and Chrome's Delegated Ink Trails for low-latency stroke rendering.
  - **success:** Stylus pressure continuously affects stroke width across the full pressure range; at least the three validated width presets (Subtle/Expressive/Calligraphy) are selectable; felt ink latency matches or exceeds the validated web PoC on the same device class.

- **CAP-4** — Prompt → write → self-grade loop
  - **intent:** The user is shown a prompt, writes the card from memory, and submits their own correct/incorrect judgment — no automated recognition ever grades the stroke.
  - **success:** Every prompt cycle requires an explicit self-grade before the next prompt appears; no grading logic evaluates the drawn ink.

- **CAP-5** — Reveal correct answer
  - **intent:** At any point before self-grading, the user can reveal the card's canonical grapheme to compare against their own stroke, without the reveal auto-assigning a grade.
  - **success:** Reveal is available from prompt-shown through self-grade submission; revealing renders the exact stored grapheme; an explicit self-grade is still required afterward; whether reveal was used is recorded on the attempt.

- **CAP-6** — Per-character miss tally
  - **intent:** The system keeps a cumulative, per-card count of self-graded misses that persists across sessions.
  - **success:** Every self-graded "incorrect" increments that card's tally before the next prompt is selected, and the tally survives a reload.

- **CAP-7** — Weak-spot-biased prompt selection
  - **intent:** Within a session's chosen scope, the next prompt is selected using the miss tally — weighted by recency from that card's attempt history, so old misses matter less than recent ones — to bias toward higher-miss cards, without a fixed schedule or due date.
  - **success:** Across a session, higher-miss cards are prompted more often than zero/low-miss cards; a card missed heavily long ago but correct on all recent attempts is deprioritized relative to a card missed recently; no card is ever permanently excluded or guaranteed.

- **CAP-8** — Per-attempt data collection
  - **intent:** Every completed prompt cycle is recorded as a full attempt record — card, timing, stroke count, reveal usage, and self-grade — linked to its raw stroke data.
  - **success:** Each attempt record captures card, timestamp, time-to-first-stroke, total time, stroke count, reveal-used flag, and self-grade, and links to its stroke ink; records persist alongside session and tally data, not collapsed into aggregates only.

- **CAP-9** — Session closure conditions
  - **intent:** A session ends and is recorded when the user explicitly ends it, completes every card in scope, or goes idle past a threshold — with the closure reason distinguishable afterward.
  - **success:** An explicit end control is always reachable; completing the last scoped card closes the session automatically; an idle session auto-closes and is recorded with a distinct `inactivity` closure reason from `explicit`/`full-scope`.

- **CAP-10** — Session accuracy capture
  - **intent:** On closure, the system records a session summary — date, cards attempted, accuracy, and closure reason.
  - **success:** Every closure writes a session record with a non-null date, attempt count, accuracy (correct ÷ attempts), and one of the three closure reasons.

- **CAP-11** — Session history view
  - **intent:** The user can browse past session records from within the app, most recent first, with idle-closed sessions visually distinguishable.
  - **success:** History is reachable from main navigation without leaving the installed app; records render reverse-chronologically; idle-closed sessions are visually distinct from user/full-scope-closed ones.

- **CAP-12** — Lossless local persistence
  - **intent:** Stroke data (grid-relative), miss tallies, attempt records, and session records persist locally, surviving reload and device restart.
  - **success:** A full reload/process-kill reproduces prior tallies, attempts, and sessions exactly, and replayed strokes render correctly regardless of viewport size.

- **CAP-13** — Export / import for backup
  - **intent:** The user can export all local progress data (tallies, attempts with their stroke ink, sessions) to a JSON file and import a previously exported file to restore it, replacing current data.
  - **success:** Export produces one plain JSON file with tallies/attempts (including their grid-relative strokes)/sessions; import from a valid file replaces current local data wholesale; import of a malformed/unrecognized file is rejected with an error and no partial write.

- **CAP-14** — Installable, offline-capable PWA
  - **intent:** The app installs to the tablet's home screen via the browser's install prompt and runs fully offline once installed.
  - **success:** The app meets Chromium PWA installability criteria (manifest + service worker); once installed, it launches from the home-screen icon with no address bar, and drill/history/export-import all work with no network connection.

## Constraints

- Chromium-based Android tablet + stylus only in v1 — no Safari/iPad, no phone form factor; Delegated Ink Trails is Chromium-only (permanent boundary, revisit only if the tablet in use changes).
- Delivery is web/PWA, not native — decided after building and testing both as on-device PoCs; native's pressure-to-width dynamic range was opaquely capped inside compiled `androidx.ink` library code.
- Self-graded only — no automated stroke-order/shape/OCR recognition ever evaluates the drawn ink; the user is sole judge, reveal is the only assist.
- Local-only, single-user persistence — no accounts, no cloud sync, no multi-user data model.
- Not a spaced-repetition system — no due dates, review intervals, or scheduling state machine is ever added to the miss-tally mechanism.
- Production origin must be HTTPS — Delegated Ink Trails requires a secure context.
- The genkouyoushi grid and ink strokes render on one canvas element, never two layered canvases — avoids a known black-canvas compositing bug hit in the web PoC under Delegated Ink Trails.
- Export includes each attempt's grid-relative stroke data (compact, rounded, plain JSON — no compression in v1); import restores it and always replaces current local data wholesale, never merges (destructive by default).
- Weak-spot recency weighting (CAP-7) is computed at selection time from Attempt history (CAP-8), not stored on Tally — Tally's own schema stays `{cardId, missCount}`, no timestamp or interval added to it.
- Architecture follows Ports & Adapters (Hexagonal); the ink adapter is isolated from the Svelte reactive tree for latency — full rule set in `ARCHITECTURE-SPINE.md`.

## Non-goals

**Permanent — standing product boundaries, not v1-only omissions:**
- Not a spaced-repetition system (no due dates, review intervals, or scheduling state machine).
- Not multi-user or account-based — no login, no cloud sync, no sharing.
- Not a stroke-order or shape/OCR grading engine.
- Not gamified — no points, badges, streaks, mnemonics, or daily-use pressure mechanics.
- Not cross-platform beyond Chromium Android tablet + stylus — no iPad/Safari, no phone.
- Extended katakana loanword yoon combinations beyond the standard set (e.g. ティ, ファ) are out of scope.
- No custom per-card scope selection — scope narrowing is script + base/yoon toggles only.

**Deferred to v2+ — expected later, not this spec:**
- Kanji and vocabulary content, including compound words.
- Exportable image/notebook-page artifact of a day's writing.
- Ink-blot-fades abandon-session mechanic.
- KanjiVG dataset integration and radical-based character grouping.
- Any analysis UI over per-attempt data beyond session history.

## Success signal

Opening the app when unsure about a character reliably yields a fast, honest read on whether it's really known — including on genuinely forgotten cards, via reveal (CAP-4, CAP-5) — and, checked across multiple days, session history (CAP-10, CAP-11) shows accuracy holding or improving as the concrete signal that recall is actually solid. Secondary bar: the weak-spot bias (CAP-6, CAP-7) visibly surfaces the same characters already suspected as shaky, and the ink feel (CAP-3) is satisfying enough to want to reach for, not a chore.

## Assumptions

- Idle-close threshold defaults to ~5 minutes, confirmed — user-adjustable in Settings per `EXPERIENCE.md` (exact timer mechanism still deferred to story-level per `ARCHITECTURE-SPINE.md`'s Deferred section).
- CAP-7's recency-decay weighting (how far back the attempt-history window looks, the decay curve) is a mechanism decision, not a formula — the exact weighting is deferred to story/build-level, matching how the idle-timeout mechanism was deferred.

## Open Questions

- How does "already learned" travel forward into kanji/vocab scope once the content set is no longer small and fixed (self-curated list? manual entry? read from Renshuu?) — not a v1 blocker, but should be decided deliberately before scope expands.
