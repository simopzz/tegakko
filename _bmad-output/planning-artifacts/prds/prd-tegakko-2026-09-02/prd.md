---
title: "PRD: Kana Writing Practice (tegakko)"
status: final
created: 2026-09-02
updated: 2026-09-02
---

# PRD: Kana Writing Practice (tegakko)
*Working title — confirm.*

## 0. Document Purpose

This PRD is for the app's own creator, acting as both PM and sole developer — it exists to lock down what v1 does before building further on it, not to align stakeholders. It builds on the finalized [Product Brief](../../briefs/brief-tegakko-2026-09-01/brief.md) and its [addendum](../../briefs/brief-tegakko-2026-09-01/addendum.md), which already cover the problem framing, competitive gap, and the delivery-stack decision (web/PWA, chosen after building and testing both native and web PoCs) — this document does not re-derive those, only references them. Features are grouped with FRs nested and globally numbered (FR-1 through FR-N); inferences made without explicit confirmation are tagged `[ASSUMPTION]` inline and indexed in §7. A `[NOTE FOR PM]` tag flags a genuine tension worth a conscious call — a handful of instances, called out inline rather than indexed separately.

## 1. Vision

A personal, tablet-and-stylus web app that tests genuine handwriting *recall* of Japanese kana, not recognition. Existing tools test recognition, not production, each in its own way: Renshuu has you trace the correct stroke path, while Duolingo auto-recognizes an approximate finger-drawn shape but still guides the hand along it. Neither ever confirms you can produce a character from a blank page with nothing to go on — this app does.

The product's emotional hook and hardest technical bet are ink quality: a genuine pressure-sensitive pen canvas over a genkouyoushi grid, fast enough and controllable enough to feel like real handwriting. That bet is already de-risked — both a native and a web PoC were built and tested on-device, and web won on the dimension that matters most (pressure-to-width control range).

v1 covers the full kana set: 92 base characters (hiragana + katakana) plus their yoon (combined) forms. It is deliberately narrow otherwise — no scheduling engine, no gamification, no accounts — because its job is not to run the primary learning loop (Renshuu already does that well); its job is to be a fast, honest gut-check. The creator has already nearly memorized the full kana set, so kanji and vocabulary are expected to follow within months — not the usual multi-year horizon — by reusing the same script-aware, self-graded, weak-spot-biased shape.

## 2. Glossary

- **Kana** — The kana set in scope for v1: the 92 base characters (hiragana + katakana) plus their yoon combinations.
- **Grapheme** — A single card's written form: one character for a base kana (e.g. あ), or a two-character combined form for a yoon card (e.g. きゃ). Cards are keyed on grapheme + script so same-sound pairs — across hiragana/katakana, and across base/yoon — stay distinct entries.
- **Script** — Hiragana or katakana. A required dimension of every card's identity, alongside grapheme.
- **Yoon** — A combined kana sound formed from a base consonant kana + small ゃ/ゅ/ょ (e.g. きゃ, *kya*), written as a two-character grapheme but representing one practice unit. Treated as its own card, same as a base kana.
- **Card** — One practice unit: a grapheme + script pair the app can prompt for (base kana or yoon).
- **Scope** — The subset of cards a session draws from — the full kana set, or a narrower selection (see FR-2).
- **Prompt** — A single instance of the app asking the user to write a specific card from memory; produces one Attempt once self-graded.
- **Attempt** — One completed cycle of a single prompt: from the prompt being shown to the user's self-grade being recorded, including whether Reveal was used. A Session aggregates one or more attempts.
- **Session** — A bounded run of prompts over a chosen Scope, from opening the drill to its closure (see FR-9), over which attempts are aggregated into accuracy (see FR-10).
- **Self-grade** — The user's own correct/incorrect judgment on a completed stroke, with no automated recognition or scoring.
- **Reveal** — An optional action during an attempt where the user requests to see the card's canonical grapheme before self-grading — used when they can't recall it at all, or want to double-check before judging their own stroke.
- **Miss tally** — A per-card cumulative count of self-graded misses, used to bias which cards are more likely to come up next.
- **Genkouyoushi grid** — The traditional Japanese writing-practice grid rendered under the pen canvas, giving proportion and stroke-placement guidance without guiding the stroke itself.

## 3. Target User

### 3.1 Jobs To Be Done

- Confirm — or expose gaps in — free recall of a kana character, when unsure whether it's "really known" or only recognizable.
- Get an honest signal fast, without a guided-tracing tool quietly doing the work of remembering for the user, and without the user's own optimism grading a wrong stroke as right.
- See whether recall is actually holding up across multiple days of use, not just in a single sitting.
- Have weak characters resurface on their own, without having to remember which ones are shaky.

### 3.2 Non-Users (v1)

Anyone other than the app's creator. This is a single-user, local-only tool with no accounts, no sharing, and no multi-user data model — not a v1 gap to close, but a deliberate boundary (see §5.2).

### 3.3 Key User Journeys

- **UJ-1.** The creator, unsure about a character mid-day, opens the installed app on their tablet, picks a scope (or takes the full set), gets a prompt, writes it from memory on the pen canvas, and self-grades — revealing the correct grapheme first if they truly draw a blank — done in under a minute, with the miss tally already worth having if they get it wrong. Realizes FR-2, FR-3, FR-4, FR-5, FR-6.
- **UJ-2.** The creator, days into using the app, opens session history to see whether accuracy is trending up or just flat — the honest check that the tool is doing its job. Realizes FR-10, FR-11.

## 4. Features

### 4.1 Content Model
**Description:** The full kana set, structured so scripts never collapse into each other and so the same model extends cleanly to kanji/vocabulary later (see brief §Vision). This is foundational data, not a user-facing feature, but it gates everything else. `[NOTE FOR PM]` The brief's Scope section states "full 92-character kana set"; this PRD extends that to include yoon (see FR-1), which the brief did not anticipate. Worth a note back to the brief if it's ever revisited — not a blocker here.

**Functional Requirements:**

#### FR-1: Script-aware kana card set, including yoon

The system provides the full base kana set (46 hiragana + 46 katakana) plus yoon (combined) characters for both scripts, each keyed on grapheme + script.

**Consequences (testable):**
- All 46 base hiragana and 46 base katakana graphemes are present as distinct cards.
- Standard yoon combinations (11 base consonant rows × ゃ/ゅ/ょ = 33 per script) are present as additional cards for both hiragana and katakana, each keyed on its two-character grapheme (e.g. きゃ) + script. `[ASSUMPTION: standard yoon set only — 33 × 2 = 66 cards, for a total of 158 cards. Extended katakana-only combinations used for foreign loanword sounds (e.g. ティ, ファ) are treated as out of scope for v1; confirm this boundary.]`
- Same-sound hiragana/katakana pairs — whether base or yoon — never merge into one card or one miss-tally entry.

### 4.2 Writing Drill
**Description:** Starts with picking what to practice, then the core loop and the app's actual product: prompt, write from memory, self-grade — with a reveal option so an honest grade doesn't silently depend on unaided recall when the user genuinely draws a blank. Realizes UJ-1. Pen feel is the make-or-break quality bar here — per the addendum, web/PWA was chosen specifically because it gave a clearly better felt pressure-to-width range than native in on-device PoC testing.

**Functional Requirements:**

#### FR-2: Session scope selection

Before starting a session, the user picks its scope: the full kana set, or a narrower subset.

**Consequences (testable):**
- The user can start a session against the full kana set (all 158 cards, FR-1) with no extra selection.
- The user can narrow scope before starting, at minimum by script (hiragana only / katakana only) and by base-vs-yoon. `[ASSUMPTION: exact subset granularity — script and base/yoon toggles are the minimum read from the brief's "pick a scope"; finer-grained custom card selection is not assumed necessary for v1, confirm.]`
- The selected scope is what session closure's "full scope completed" condition (FR-9) and weak-spot selection (FR-7) operate over for that session.

#### FR-3: Pen canvas with genkouyoushi grid

The user writes on a pressure-sensitive pen canvas rendered over a genkouyoushi grid, using Pointer Events (`pressure`, `pointerType: 'pen'`) and Chrome's Delegated Ink Trails for low-latency stroke rendering.

**Consequences (testable):**
- Stylus pressure visibly and continuously affects stroke width across the full pressure range (not just a narrow high-pressure band).
- At least the three width presets already validated in the PoC (Subtle, Expressive, Calligraphy) are available.

**Out of Scope:**
- Safari/iPad support — see §5.2.

**Feature-specific NFRs:**
- Ink latency and feel must match or exceed the validated web PoC's self-rated feel on the same device class (Chromium-based browser, Android tablet + stylus) — the acceptance test is a direct side-by-side comparison against the PoC, not an invented numeric threshold, since ink-feel is explicitly a felt/qualitative bar elsewhere (SM-4, §6). `[NOTE FOR PM]` If this ever needs a hard number instead (e.g. for automated QA), the PoC session would need to be re-run with instrumentation to establish one — none exists yet.

#### FR-4: Prompt → write → self-grade loop

The user is shown a prompt (a card to produce), writes it from memory on the canvas, and marks their own result correct or incorrect — no automated stroke-order or shape recognition.

**Consequences (testable):**
- Each prompt cycle requires an explicit self-grade input before advancing to the next prompt.
- No grading logic evaluates the drawn stroke; correctness is entirely the user's judgment.

#### FR-5: Reveal correct answer

At any point before self-grading, the user can tap a reveal control to display the card's canonical grapheme. The content model (FR-1) already stores each card's ground-truth grapheme, so reveal renders that directly — no separate answer dictionary is needed.

**Consequences (testable):**
- The reveal control is available on every prompt, from when it appears until self-grade is submitted.
- Revealing displays the exact grapheme text stored on that card (FR-1), rendered clearly enough to compare against the just-written stroke.
- The user still submits an explicit self-grade after revealing — revealing does not auto-assign a grade, since the user may have already written it correctly and simply be double-checking.
- Whether reveal was used on an attempt is recorded as part of that attempt's data (FR-8).

### 4.3 Weak-Spot Selection
**Description:** A lightweight bias mechanism, deliberately not a full SRS (see addendum's Rejected Alternatives). Keeps short sessions useful without due dates or review intervals.

**Functional Requirements:**

#### FR-6: Per-character miss tally

The system keeps a cumulative miss count per card, incremented each time that card is self-graded incorrect.

**Consequences (testable):**
- Every self-graded "incorrect" updates that card's tally before the next prompt is selected.
- The tally persists across sessions (see FR-12).

#### FR-7: Weak-spot-biased prompt selection

The system selects the next prompt, within the session's chosen scope (FR-2), using the miss tally to bias toward higher-miss cards, without a fixed schedule or due dates.

**Consequences (testable):**
- Across a session, cards with a higher miss tally are prompted more often than cards with zero or low misses.
- No card is permanently excluded or guaranteed; selection stays probabilistic, not a strict due-date queue.

**Notes:** Whether the tally needs decay or reset over time is an open question carried from the brief (see §7) — left unresolved for v1 given the small, fixed content set.

### 4.4 Session History
**Description:** v1 is done when the app can be used from the tablet across multiple days with a visible read on whether recall is actually improving — not just the per-character tally, but a per-session record, closed on well-defined terms and built on top of granular per-attempt data. Realizes UJ-2.

**Functional Requirements:**

#### FR-8: Per-attempt data collection

For every attempt (one prompt cycle), the system records a full attempt record beyond just the aggregate self-grade result.

**Consequences (testable):**
- Each attempt record includes: card (grapheme + script), timestamp, time from prompt shown to first stroke, total time from prompt shown to self-grade submitted, stroke count, whether reveal (FR-5) was used, and the self-grade result.
- Each attempt record links to its raw stroke ink data (FR-12) for later inspection.
- Attempt records are retained locally alongside session and miss-tally data (FR-12), not collapsed into session-level aggregates only.

`[ASSUMPTION: this field list is one reading of "all the possible data points" — confirm nothing else (e.g. per-stroke pressure stats beyond the raw ink data already in FR-12) needs to be a first-class attempt field.]`

**Notes:** No analysis UI beyond FR-11 is scoped for v1 — this is the data foundation for any future per-character or per-session analysis, captured now so it isn't lost later.

#### FR-9: Session closure conditions

A session ends — and is recorded (FR-10) — when any of the following happens: the user taps an explicit "I'm done" control, the user completes every card in the session's selected scope (FR-2), or the user is inactive for a set idle period.

**Consequences (testable):**
- An explicit end control is reachable at any point during a session.
- Completing the last card in the selected scope closes the session without requiring the explicit control.
- After an idle period `[ASSUMPTION: ~5 minutes — confirm or adjust]`, the session auto-closes.
- A session closed via inactivity is still recorded (FR-10) but flagged as distinct from sessions closed via the explicit control or full-scope completion (e.g. `endReason: inactivity`), so it doesn't quietly skew accuracy trends in history (FR-11).

#### FR-10: Session accuracy capture

On session closure (FR-9), the system records a session summary: date, cards attempted, accuracy percentage, and closure reason.

**Consequences (testable):**
- A session record is written on every closure (FR-9), with a non-null date, attempt count, accuracy value, and closure reason (explicit / full-scope / inactivity).
- Accuracy is computed as correct self-grades ÷ attempts (FR-8) for that session.

#### FR-11: Session history view

The user can browse past session records (date, cards attempted, accuracy%, closure reason) from within the app.

**Consequences (testable):**
- Session history is reachable from the app's main navigation without leaving the installed app.
- Records display in reverse-chronological order (most recent first).
- Sessions closed via inactivity are visually distinguishable from user-completed sessions.

### 4.5 Data Persistence & Portability
**Description:** Local-only by design (brief §Solution) — no account, no sync. Three concerns nested here: making storage lossless (already solved and PoC-verified per the addendum for raw point fidelity, though not for the storage shape v1 actually needs — see FR-12), extending that to the new attempt-level data, and giving the user a safety net against browser/OS storage being cleared.

**Functional Requirements:**

#### FR-12: Lossless local persistence

Stroke data, miss tallies, attempt records, and session records persist locally via IndexedDB, surviving app reload and device restart.

**Consequences (testable):**
- A stroke's point stream (x, y, normalized pressure) and active width preset are stored relative to the grid cell it belongs to — not as absolute viewport pixels — so replay reproduces the stroke correctly regardless of viewport size or device. `[NOTE FOR PM]` The web PoC's own storage schema used absolute viewport-pixel coordinates in a flat, ungrouped stroke list, which proved raw point-stream fidelity, but not this grid-relative, card/attempt-grouped storage shape. Grid-relative, card/attempt-grouped storage is new work for v1, not a direct carry-over of the PoC schema.
- Miss tallies, attempt records, and session records survive a full reload/process-kill, matching values from before the reload.

#### FR-13: Export / import for backup

The user can export all local progress data (miss tallies, attempt records, session history) to a JSON file, and import a previously exported file to restore it.

**Consequences (testable):**
- Export produces a single JSON file containing miss tallies, attempt records, and session records (stroke-level ink data is out of scope for export — see Out of Scope below).
- Import from a validly-exported file restores miss tallies, attempt records, and session records, replacing current local data `[ASSUMPTION: replace, not merge — simpler and matches single-device, single-user usage; confirm before build, since it's destructive by default]`.
- Import validates that the file matches the expected export schema (shape and version) before applying anything; a malformed or unrecognized file is rejected with an error message rather than partially applied.

**Out of Scope:**
- Exporting raw stroke/ink data — export covers progress data needed to resume practice, not a full ink archive.

### 4.6 Platform & Installability
**Description:** Web/PWA per the addendum's PoC-based decision. Installability specifically was scoped in from the user's framing of v1-done as "really run the app from my tablet" — read as installed and launchable like an app, not a browser tab navigated to each time.

**Functional Requirements:**

#### FR-14: Installable, offline-capable PWA

The app installs to the tablet's home screen via the browser's install prompt and launches/runs fully offline once installed.

**Consequences (testable):**
- The app meets PWA installability criteria (manifest + service worker) in a Chromium-based Android browser.
- After install, the app launches from the home-screen icon without a browser address bar, and all v1 functionality (drill, history, export/import) works with no network connection.

**Feature-specific NFRs:**
- Requires an HTTPS origin in production (Delegated Ink Trails needs a secure context — confirmed via PoC, see addendum).

## 5. MVP Scope & Boundaries

### 5.1 In Scope
- Full kana set including yoon, script-aware (FR-1).
- Session scope selection (FR-2).
- Pressure-sensitive pen canvas with genkouyoushi grid (FR-3).
- Prompt → write → self-grade loop with reveal (FR-4, FR-5).
- Per-character miss tally with weak-spot-biased selection (FR-6, FR-7).
- Per-attempt data collection, session closure, accuracy capture, and browsable history (FR-8, FR-9, FR-10, FR-11).
- Lossless local persistence + JSON export/import (FR-12, FR-13).
- Installable, offline-capable PWA (FR-14).

### 5.2 Out of Scope — Permanent
*Not building this in v1, and not a v2+ roadmap item — a deliberate, standing boundary on what this product is.*

- Not a spaced-repetition system. No due dates, review intervals, or scheduling state machine — deliberately dropped during brief discovery (see addendum's Rejected Alternatives).
- Not a multi-user or account-based product. No login, no cloud sync, no sharing.
- Not a stroke-order or shape-grading engine. No OCR/ML evaluation of drawn ink — the user is the sole judge, with reveal (FR-5) as the only assist.
- Not a gamified or streak-driven product. No points, badges, mnemonics, or daily-use pressure mechanics.
- Not cross-platform beyond the stated target: Chromium-based Android tablet + stylus. No iPad/Safari support in v1 (Delegated Ink Trails is Chromium-only, per addendum). `[NOTE FOR PM]` Revisit if the tablet in use ever changes — the current PWA approach doesn't carry over.
- Extended katakana loanword combinations beyond standard yoon (e.g. ティ, ファ) — see FR-1 assumption.

### 5.3 Out of Scope — Deferred to v2+
*Not in v1, but expected or parked for later — a to-do, not a boundary.*

- Kanji and vocabulary content, including compound words — expected soon after v1 (see Vision), not scoped here.
- Exportable image / notebook-page artifact of a day's writing (parked, per addendum).
- Ink-blot-fades abandon-session mechanic (parked, per addendum — needs to avoid becoming a streak mechanic in disguise, per §5.2's gamification boundary).
- KanjiVG (open stroke-order SVG dataset) as a future kanji content source, and radical-based character grouping for learning transfer — both parked once kanji is in scope (per addendum's Parked Ideas).
- Any analysis UI over the per-attempt data (FR-8) beyond session history (FR-11) — the data is captured for later use, not surfaced further in v1.

## 6. Success Metrics

Hobby-scale, self-directed product — success is a felt outcome, not a dashboard.

**Primary**
- **SM-1**: Opening the app when unsure about a character reliably yields a fast, honest read on whether it's really known — including on cards the user has genuinely forgotten, thanks to reveal. Validates FR-3, FR-4, FR-5.
- **SM-2**: Session history (FR-10, FR-11), checked across multiple days, shows accuracy holding or improving — the concrete signal that recall is actually solid, not just assumed. Validates FR-10, FR-11.

**Secondary**
- **SM-3**: Weak-spot bias (FR-6, FR-7) visibly surfaces the same characters the user already suspects are shaky, without having to track them manually.
- **SM-4**: The ink feel is satisfying enough that reaching for the app feels wanted, not like a chore — the qualitative bar behind the entire pen-canvas investment. Validates FR-3.
- **SM-5**: The script-aware grapheme+script data model (FR-1) holds up cleanly as a foundation once kanji and vocabulary are added, without needing to be redone under a bigger content set — a build-quality goal as much as a product one (carried from brief §Success Criteria).

**Counter-metrics (do not optimize)**
- **SM-C1**: Daily-use frequency or session count is not a target — this app is a gut-check tool, not an engagement product; optimizing for more sessions would fight the Non-Goal of avoiding gamification/streak pressure (§5.2).

## 7. Open Questions & Assumptions

Each item below is unresolved; where a default was assumed to keep drafting moving, it's noted as **Default taken** — confirm or override before or during build.

1. How does "already learned" travel forward into kanji/vocab scope, once the content set is no longer small and fixed? Not a v1 problem; worth deciding deliberately before scope expands (carried from brief). No default assumed.
2. Does the miss tally (FR-6) need decay or reset over time, so characters that are hard early on don't stay overweighted once they're solid? Left open for v1 given the small, fixed kana set (carried from brief). No default assumed.
3. Export/import (FR-13): should import replace local data outright or merge with it? **Default taken:** replace, not merge — simpler and matches single-device, single-user usage; confirm before build, since it's a destructive-by-default choice.
4. Exact yoon scope (FR-1): should it stay standard-set-only (66 cards), or include extended katakana loanword combinations too? **Default taken:** standard set only (33 combinations × 2 scripts = 66 cards; 158 cards total).
5. Exact inactivity threshold for session auto-closure (FR-9). **Default taken:** ~5 minutes.
6. Per-attempt data field list (FR-8): is the assumed set complete, or are there other data points worth capturing as first-class fields? **Default taken:** card, timestamps, latency, stroke count, reveal-used flag, self-grade result — one reading of "all the possible data points," not verified exhaustive.
7. Scope-selection granularity (FR-2): is script + base/yoon toggling enough, or does v1 need finer-grained custom card selection? **Default taken:** script + base/yoon toggles only; no custom per-card selection.
