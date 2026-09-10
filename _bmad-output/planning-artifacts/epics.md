---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories]
inputDocuments:
  - _bmad-output/specs/spec-tegakko/SPEC.md
  - _bmad-output/planning-artifacts/prds/prd-tegakko-2026-09-02/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-tegakko-2026-09-02/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-tegakko-2026-09-02/EXPERIENCE.md
---

# tegakko - Epic Breakdown

*(Project renamed from "jplearn" to "tegakko" on 2026-09-03. Artifact folder slugs — `prd-*`, `architecture-*`, `spec-*`, `ux-*` — were renamed to match; the original brief (`brief-jplearn-2026-09-01`) and the frozen `poc-web`/`poc-native` evidence keep their historical name. "tegakko" is the live project/app name used going forward in config, package/repo naming, and the PWA manifest.)*

## Overview

This document provides the complete epic and story breakdown for tegakko (Kana Writing Practice v1), decomposing the requirements from the SPEC/PRD, UX Design (DESIGN.md + EXPERIENCE.md), and Architecture Spine into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: Script-aware kana card set, including dakuten/handakuten and yoon — the system provides the full kana card catalog (46 seion + 25 dakuten/handakuten = 71 base hiragana, 71 base katakana, standard yoon combinations for both scripts = 208 cards total), each keyed on grapheme + script; no same-sound cards, across scripts or base/yoon, ever share an entry. *(Amended 2026-09-08 via Correct Course — closes a gap where dakuten/handakuten yoon combinations (gya/ja/bya/pya rows) existed without their base-form cards.)*

FR-2: Session scope and size selection — before starting a session, the user selects its scope (full 208-card set, or narrower by script and/or base/yoon) and, independently, a session size (a target number of distinct cards to draw, capped at the chosen scope's size; default "All" = the full scope, matching prior behavior). The scope governs the candidate pool; the size governs how many distinct cards are sampled from it — that sample is the session's actual card pool and completion target. *(Amended 2026-09-08 via Correct Course.)*

FR-3: Pen canvas with genkouyoushi grid — the user writes on a pressure-sensitive pen canvas rendered over a genkouyoushi grid, using Pointer Events + Chrome's Delegated Ink Trails; stylus pressure continuously affects stroke width across the full range; at least 3 width presets (Subtle/Expressive/Calligraphy) are selectable; felt latency matches or exceeds the validated web PoC on the same device class.

FR-4: Prompt → write → self-grade loop — the user is shown a prompt, writes the card from memory, and submits their own correct/incorrect judgment; every prompt cycle requires an explicit self-grade before the next prompt appears; no automated recognition ever grades the stroke.

FR-5: Reveal correct answer — at any point before self-grading, the user can reveal the card's canonical grapheme to compare against their own stroke; reveal never auto-assigns a grade; an explicit self-grade is still required afterward; whether reveal was used is recorded on the attempt.

FR-6: Per-character miss tally — the system keeps a cumulative, per-card count of self-graded misses that persists across sessions; every self-graded "incorrect" increments that card's tally before the next prompt is selected.

FR-7: Weak-spot-biased session sampling — when a session starts, its card set is sampled without replacement from the chosen scope down to the chosen session size, using a recency-weighted score computed from each candidate's Attempt history (not raw lifetime Tally count), so old misses matter less than recent ones and a card missed heavily long ago but correct on all recent attempts is deprioritized relative to a card missed recently. Every in-scope card carries nonzero sampling probability for any given session — no card is ever permanently excluded or schedule-queued — but misses now bias which cards are drawn into *future* sessions rather than how often a card resurfaces within the same sitting. Within a sampled session, each card is presented exactly once, in a uniform-shuffled order decoupled from sampling weight. *(Reflects the AD-9/AD-10 reconciliation finalized 2026-09-03. Supersedes the 2026-09-05 with-replacement decision (Story 1.3) and Story 1.7's per-draw resampling — reconciled via Correct Course + architecture pass, 2026-09-08.)*

FR-8: Per-attempt data collection — every completed prompt cycle is recorded as a full attempt record: card, timestamp, time-to-first-stroke, total time, stroke count, reveal-used flag, self-grade, linked to its raw stroke ink; records persist alongside session and tally data, not collapsed into aggregates only.

FR-9: Session closure conditions — a session ends and is recorded when the user explicitly ends it, completes every card in that session's sampled set (no repeats, so this is a bounded, exact count equal to the chosen session size), or goes idle past a threshold (~5 min default, user-adjustable); the closure reason (`explicit`/`full-scope`/`inactivity`) is distinguishable afterward. `full-scope` now means "this session's sampled card set was completed" and is displayed uniformly as "Session complete," regardless of whether the sample equaled the full chosen scope. *(Amended 2026-09-08 via Correct Course.)*

FR-10: Session accuracy capture — on closure, the system records a session summary: date, cards attempted, accuracy (correct ÷ attempts), and closure reason.

FR-11: Session history view — the user can browse past session records from within the app, most recent first, with idle-closed sessions visually distinguishable from user/full-scope-closed ones.

FR-12: Lossless local persistence — stroke data (grid-relative, not viewport-absolute), miss tallies, attempt records, and session records persist locally via IndexedDB, surviving reload and device restart; replayed strokes render correctly regardless of viewport size.

FR-13: Export / import for backup — the user can export all local progress data (tallies, attempts, sessions — excluding raw ink) to a single JSON file and import a previously exported file to restore it, replacing current data wholesale; import validates schema+version before applying, rejecting malformed/unrecognized files with no partial write.

FR-14: Installable, offline-capable PWA — the app installs to the tablet's home screen via the browser's install prompt and runs fully offline once installed (drill, history, export/import all work with no network connection); requires HTTPS origin in production.

### NonFunctional Requirements

NFR-1: Ink latency and feel must match or exceed the validated web PoC's self-rated feel on the same device class (Chromium-based browser, Android tablet + stylus) — acceptance is a direct side-by-side comparison against the PoC, not an invented numeric threshold. (Binds FR-3)

NFR-2: Production origin must be HTTPS — Delegated Ink Trails requires a secure context. (Binds FR-3, FR-14)

NFR-3: The app must meet Chromium PWA installability criteria (manifest + service worker) and function fully offline after install. (Binds FR-14)

NFR-4: TypeScript strict mode (`strict: true`) applied across domain/ports/adapters/app with no exceptions; `@typescript-eslint/no-explicit-any` enabled as an error, not a warning. (Binds: all)

NFR-5: Accessibility floor — tap targets meet or exceed Android's 48dp minimum by a wide margin; grade and closure states are never color-only (every chip pairs its tint with text); WCAG AA contrast (4.5:1 body/label, 3:1 display/heading at large size) on all load-bearing text/background pairings named in DESIGN.md.

NFR-6: The genkouyoushi grid and ink strokes must render on one canvas element, never two layered canvases — avoids a known black-canvas compositing bug hit in the web PoC under Delegated Ink Trails. (Binds FR-3)

NFR-7: Import is a destructive-by-default operation — the UI must require an explicit confirm step (showing current-data date vs. incoming file date) before replacing local data; a malformed/unrecognized import file must be rejected with an error and zero partial writes. (Binds FR-13)

### Additional Requirements

- Ports & Adapters (Hexagonal) layering: `domain/` (pure, no DOM/IndexedDB/Svelte imports), `ports/` (interfaces), `adapters/` (persistence, content, ink, ui, io — never import a sibling adapter's implementation directly), `app/` (composition root, sole place allowed to wire concrete adapters). Enforced via an import-boundary ESLint rule (e.g. `eslint-plugin-boundaries`). (AD-1)
- The `ink` adapter implements a formal `InkSurface` port (`mount(node)`, `clear()`, `onStrokeComplete(cb)`) and owns its canvas node outside Svelte's reactive tree — the `ui` adapter calls `mount()` once on `onMount` and never re-renders inside that node. The pen-check screen's live pressure readout is exempted (its own lightweight `pointermove` listener, not the stroke-complete hot path). (AD-2)
- Card content (158-card catalog) is static, build-time TypeScript data (`domain/cards.ts`) compiled into the bundle — `CardRepository` is an in-memory adapter (`adapters/content`), not IndexedDB-backed. `cardId` is the natural key `"<grapheme>:<script>"`. (AD-3)
- IndexedDB schema (via `idb`), 4 object stores: `tallies` (`{cardId, missCount}`), `attempts` (embeds `strokes[]` grid-relative, plus `sessionId`, `cardId`, `timestamp`, `timeToFirstStrokeMs`, `totalTimeMs`, `strokeCount`, `revealUsed`, `selfGrade`), `sessions` (`{id, date, scope:{scripts,units}, cardsAttempted, accuracy, closureReason}`), `settings` (singleton: `{widthPreset, idleTimeoutMs, penCheckShown}`). `closureReason` is the one canonical field/type: `'explicit'|'full-scope'|'inactivity'`. (AD-4, AD-11)
- Export/import: `io` adapter maps `Attempt → AttemptExport` (all fields except `strokes`) before serializing; import validates against `AttemptExport` schema + `version` field before applying; a valid import deletes and replaces all current `tallies`/`attempts`/`sessions` wholesale, never merges. (AD-5)
- Repository port signatures are fixed, not left to implementers: `CardRepository.getAll()/getById()`; `TallyRepository.getAll()/increment(cardId)/decrement(cardId)` (both atomic, decrement clamps at zero, used only by undo); `AttemptRepository.add()/listBySession()/listAll()` (returns complete unpaginated history — never truncated/paginated by default) `/deleteLast(sessionId)`; `SessionRepository.add()/list()`; `SettingsRepository.get()/save()`. (AD-9)
- Weak-spot selection is a pure domain function `selectNext(attempts: Attempt[], scope: Scope): Card` — no `tallies` param, no clock/schedule input; candidates resolved by filtering the static catalog by scope internally; score decays by elapsed wall-clock time since each incorrect attempt's timestamp (never ordinal position); a correct attempt discounts prior incorrect attempts for that card; sampler enforces a nonzero-probability floor for every candidate. `attempts` is loaded once via `listAll()` at session start and appended to in-memory as new attempts are recorded within that session (not re-fetched per candidate/selection). (AD-10)
- Undo-last-grade (`undoLastGrade(sessionId)`) is a single atomic domain operation: `AttemptRepository.deleteLast()`, then conditionally `TallyRepository.decrement(cardId)` if the undone grade was incorrect, plus removal from AD-10's in-memory attempts list — called once by `ui`, never sequenced as separate port calls by the UI layer. (AD-13)
- Canonical top-level `Screen` enum (`'pen-check'|'scope-picker'|'drill'|'summary'|'history'|'settings'`) owned by `adapters/ui/screens.ts`; a single top-level Svelte state variable drives which screen renders — no router library. Drill's in-screen sub-states (blank, written, revealed-from-written, revealed-from-blank, graded, etc.) are local component state, not `Screen` members. (AD-12)
- Service worker updates apply silently via `vite-plugin-pwa`'s `registerType: 'autoUpdate'` — no update-available prompt/banner UI. (AD-7)
- Production hosting: static build deployed to Cloudflare Pages via its native Git integration (auto build+deploy on push to `main`, preview deployments on other branches, no GitHub Actions workflow needed for this path); default Cloudflare-provided `*.workers.dev` origin (no custom domain in v1) satisfies the HTTPS/secure-context requirement. (AD-8)
- Dev ergonomics: a `Justfile` at the repo root exposes recipes for repeated commands (`dev`, `build`, `lint`, `typecheck`, `deploy`) so common actions don't require remembering exact syntax; `deploy` wraps `wrangler pages deploy dist` for manual/on-demand deploys outside the Git-triggered flow.
- **No starter template** — this is a greenfield build. No package.json/build tooling exists yet in the repo (`poc-web/` is a bundler-less single-file vanilla-JS PoC; `poc-native/` is dead code from the rejected native path). Epic 1 / Story 1 must scaffold the Vite + Svelte + TypeScript + vite-plugin-pwa project from scratch.
- Pinned stack versions (updated 2026-09-04 — see ARCHITECTURE-SPINE.md Stack table): TypeScript — `@typescript/native` 7.0.2 as the real compiler, `typescript` aliased to the `typescript6` 6.0.2 API shim for svelte-check/typescript-eslint — strict mode, Vite 8.2.2, Svelte 5.57.0, @sveltejs/vite-plugin-svelte 7.3.0, vite-plugin-pwa 1.3.0, idb 8.0.3.
- Testing framework/strategy not fixed at the architecture level — Vitest is the natural fit given the Vite toolchain, but no coverage bar was mandated; decide at build/story time.
- No CI beyond build+deploy is specified — lint (import-boundary, no-explicit-any) and typecheck are named enforcement mechanisms but not yet wired into a required CI gate; consider for an early infra story.
- No third-party crash-reporting/telemetry service — errors surface via browser console plus a minimal in-app error boundary (deliberate deferral for a single-user local app).
- Persistence-adapter failures must resolve as a typed `Result`/rejected `Promise`, never a raw thrown `DOMException` surfacing past the adapter boundary.

### UX Design Requirements

UX-DR1: Implement the full DESIGN.md token set as CSS custom properties (`--color-*`, `--font-*`, `--radius-*`, spacing scale `spacing-1`..`spacing-8`) — warm washi-paper palette with exactly one chromatic accent (terracotta); no red/error fills anywhere, no gradients, no second accent.

UX-DR2: Genkouyoushi cell component — dashed cross-guide always visible; center dot shown only on the empty (no-ink) state, removed on first stroke; grid and ink render on one canvas element (never two layered canvases, per NFR-6); Clear affordance appears once ink exists paired with "Your call — nothing is checking the shape" copy, never auto-advances/auto-grades.

UX-DR3: Grade buttons (Correct/Reveal/Missed) with dimmed/disabled-state logic — Reveal (`button-neutral`) is active from the moment the prompt appears; Missed (`button-neutral`) and Correct (`button-primary`) render as `button-dimmed` and are non-interactive until at least one stroke exists on the canvas or Reveal has been tapped, whichever happens first; Correct is the only button ever filled with the accent color.

UX-DR4: Pill-toggle-group component for mutually exclusive choices — Scope picker (script, set) and Settings (idle-close threshold, ink-width preset); exactly one segment active per group; tapping a segment commits immediately with no separate confirm step; Scope picker's toggles drive a live "N cards in scope" recompute on every tap. *(Amended 2026-09-08 via Correct Course)* The Scope picker also gains an independent session-size control (presets TBD at implementation, e.g. "All / 20 / 40"; default "All") that does not affect the "N cards in scope" count — it governs how many of those N cards get sampled into the session.

UX-DR5: Card count + "N shaky" badge on Scope picker — recomputes live on every script/set toggle; "shaky" = cards in current scope whose miss tally exceeds a running-average threshold; informational only, does not affect selection order or weighting.

UX-DR6: Chip tag component (positive / missed / neutral variants), always read-only and non-tappable — positive for script/set/status metadata, missed for miss-count/shaky-count; used on Scope picker, Drill header, Session summary, and History rows. Card position ("12 / 46") is plain text, never a chip.

UX-DR7: Stat tile component (label/value pair, read-only) — exactly two per Session summary (time, reveal count), not a variable-length list.

UX-DR8: Progress bar + "N / total" counter in the Drill header — total is the session's **sampled size** (≤ scope size); advances by one on every completed grade, including grades given after a Reveal. Selection is without replacement, so the counter always reaches exactly total and the bar always reaches exactly 100% — no overshoot case exists. *(Amended 2026-09-08 via Correct Course — previously total was the scope size and the bar had to clamp at 100% to cope with with-replacement overshoot; that handling is now unnecessary.)*

UX-DR9: Toast banner, grade-confirmation variant — appears post-grade, shows the card and its new cumulative miss tally (only on a Missed grade) plus an Undo action; stays visible until "Next character" or Undo is tapped; Undo reverts the grade and tally increment and returns to the graded card's written state (not a blank cell).

UX-DR10: Toast banner, import-warning variant — modal-weight; states the replace is destructive, shows both the current-data date and the incoming file's date, requires an explicit confirm tap; this is the only two-step destructive action and the only modal in v1.

UX-DR11: History row component — reverse-chronological list, divided by hairlines (omitted on the last row); idle-closed sessions get a neutral "closed on idle" chip and their accuracy value dims to `ink-muted`; sessions that completed their sampled card set get a positive **"Session complete"** chip, regardless of whether the sample equaled the full chosen scope; manually-closed sessions carry no chip. *(Amended 2026-09-08 via Correct Course — was "whole scope"; renamed since a session's sampled set can now be smaller than its scope, and completing either should read the same way.)*

UX-DR12: History bar sparkline — last 10 sessions (or fewer if history is shorter); bar height maps to that session's accuracy, color maps to a 5-step accuracy ramp, except the newest bar which is always the accent color regardless of height; idle-closed sessions still appear in the sparkline (undifferentiated there — only the list rows below distinguish them).

UX-DR13: First-run screen — pen-check chip (positive) with a live 0–1 pressure readout on stylus touch; graceful "no pressure input detected" fallback state for non-stylus input (chip text changes, readout hidden, both install and "Just use it here" paths remain available — app never hard-blocks on stylus absence); install-to-home-screen prompt with an always-available "Just use it here" fallback.

UX-DR14: Reveal side-by-side layout — replaces the single-cell layout with the user's ink and the canonical reference glyph shown side by side (never overlaid, never replacing the user's stroke), reference glyph rendered in the `glyph-ink` brush typeface (Yuji Syuku); "revealed from blank" shows an empty "yours" panel (center dot, no stroke) instead of an inked glyph; Reveal itself becomes a dimmed "Revealed" label and activates Missed/Correct.

UX-DR15: Empty-history state — sparkline area hidden, single centered line ("No sessions yet. Finish a drill to see it here."), no CTA (History is only reachable once the app is otherwise in use).

UX-DR16: Accessibility floor — tap targets meet/exceed Android's 48dp minimum by a wide margin on every button and toggle segment; grade/closure states are never color-only (every chip pairs tint with text); WCAG AA contrast per DESIGN.md's verified pairings; basic mouse/touch operability supported as a graceful degradation for non-pen input (Pointer Events default pressure), for dev/testing convenience.

UX-DR17: Voice/microcopy constraints — no praise, streak language, or exclamation marks anywhere (e.g. "I'm done." not "Let's go!"; "Your call — nothing is checking the shape." not "Great job!"); prompt copy is romaji + script name only, never a mnemonic or example word (standing exclusion).

UX-DR18: Single-surface navigation — one screen visible at a time, no tab bar, no drawer; six top-level surfaces only (first-run, scope-picker, drill, summary, history, settings) per the IA table; the import-replace confirmation (UX-DR10) is the only modal in v1.

### FR Coverage Map

```
FR-1:  Epic 1 - Script-aware kana card catalog (158 cards)
FR-2:  Epic 1 - Session scope selection
FR-3:  Epic 1 - Pen canvas + genkouyoushi grid
FR-4:  Epic 1 - Prompt → write → self-grade loop
FR-5:  Epic 1 - Reveal correct answer
FR-6:  Epic 1 - Per-character miss tally
FR-7:  Epic 1 - Weak-spot-biased (recency-weighted) session sampling
FR-8:  Epic 1 - Per-attempt data collection
FR-9:  Epic 1 - Session closure conditions
FR-10: Epic 1 - Session accuracy capture
FR-11: Epic 1 - Session history view
FR-12: Epic 1 - Lossless local persistence
FR-13: Epic 2 - Export / import for backup
FR-14: Epic 1 - Installable, offline-capable PWA
```

## Epic List

### Epic 1: Kana Writing Drill with Weak-Spot Memory
A user can install the app on their tablet, pick a practice scope, write kana from memory on a pressure-sensitive genkouyoushi canvas, self-grade with an honest reveal option, have their misses bias which cards resurface (weighted by recency, not just raw count), and see session-by-session accuracy history — fully offline, across days, with nothing lost on reload.

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-14
**NFRs covered:** NFR-1, NFR-2, NFR-3, NFR-4, NFR-5, NFR-6
**Also includes:** the full greenfield scaffold (no starter template exists), the hexagonal domain/ports/adapters skeleton, and every architecture/UX requirement except the import-warning modal (UX-DR10) and the `io` adapter (AD-5) — those belong to Epic 2.

### Epic 2: Backup & Portability
A user can export all local progress (tallies, attempts, sessions — never raw ink) to a JSON file, and later import a previously exported file to restore it — a safety net against browser/OS storage being cleared, requiring an explicit confirm before the destructive replace.

**FRs covered:** FR-13
**NFRs covered:** NFR-7
**Also includes:** AD-5 (`io` adapter, `AttemptExport` shape), UX-DR10 (import-warning modal).

**Dependency:** Epic 2 builds on Epic 1's persisted data model but Epic 1 is fully standalone and shippable without it.

## Epic 1: Kana Writing Drill with Weak-Spot Memory

### Story 1.1: Installable App Shell & First-Run Pen Check

As a learner practicing kana,
I want to install tegakko on my tablet's home screen and be greeted by a pen-check screen that confirms my stylus works,
So that I know the app is ready to use like a real installed tool before any drill content exists.

**Acceptance Criteria:**

**Given** the project has no existing build tooling
**When** the scaffold is created
**Then** a Vite + Svelte 5 + TypeScript (strict) project named `tegakko` exists with `domain/`, `ports/`, `adapters/`, `app/` directories per the Structural Seed
**And** an import-boundary ESLint rule rejects any `adapters/x` → `adapters/y` import outside `app/`.

**Given** repeated dev commands (build, lint, typecheck, deploy)
**When** the `Justfile` is added at the repo root
**Then** it exposes at least `dev`, `build`, `lint`, `typecheck`, and `deploy` recipes
**And** `deploy` wraps `wrangler pages deploy dist --project-name=tegakko`.

**Given** the scaffolded app pushed to a GitHub repo
**When** connected to Cloudflare Pages via its Git integration (framework preset Vite, build command `npm run build`, output directory `dist`)
**Then** pushes to `main` auto-build and deploy to a `*.workers.dev` HTTPS origin
**And** other branches get preview deployments, with no GitHub Actions workflow required for this path.

**Given** the deployed app opened in a Chromium-based Android tablet browser
**When** install criteria are met (manifest + service worker)
**Then** the browser offers to install it to the home screen
**And** after install it launches from the home-screen icon with no address bar.

**Given** the app is installed
**When** opened with no network connection
**Then** it still loads and renders.

**Given** a fresh install with no prior settings
**When** the app opens for the first time
**Then** the First Run screen appears (not Scope picker), rendered using DESIGN.md's token set (card-surface, warm palette, Noto Serif JP heading, no red/gradient anywhere).

**Given** the First Run screen
**When** a pen/stylus touches the screen
**Then** a "stylus found" chip (positive variant) appears
**And** a live 0–1 pressure readout updates continuously with contact.

**Given** the First Run screen
**When** no pressure input is detected
**Then** the chip instead reads "no pressure input detected," the readout is hidden
**And** both the install prompt and "Just use it here" remain available.

**Given** the First Run screen
**When** the user taps "Just use it here" (or the app is already installed)
**Then** `settings.penCheckShown` is set to `true`
**And** first-run is never shown again on subsequent opens.

**Given** TypeScript strict mode and `@typescript-eslint/no-explicit-any` are configured
**When** lint/typecheck run
**Then** both pass with zero errors on the scaffolded code.

### Story 1.2: Kana Catalog & Scope Picker

As a learner practicing kana,
I want to choose which script(s) and unit type (base/yoon) to practice before starting,
So that I can tailor a session to what I actually want to work on right now.

**Acceptance Criteria:**

**Given** the static kana catalog (`domain/cards.ts`)
**When** the app loads
**Then** exactly 208 distinct cards exist — 71 base hiragana (46 seion + 25 dakuten/handakuten), 71 base katakana, 33 hiragana yoon, 33 katakana yoon — each keyed by a unique `"<grapheme>:<script>"` id
**And** no same-sound card collapses across script or base/yoon.
*(Amended 2026-09-08 via Correct Course — grows the catalog from 158 to 208 cards, adding the 25 dakuten/handakuten characters per script to "base," closing a gap where their yoon derivatives (gya/ja/bya/pya rows) existed without a standalone base card.)*

**Given** the Scope picker screen
**When** it renders with no changes
**Then** the full 208-card scope is selected by default and the live count reads "208 cards."

**Given** the Scope picker screen
**When** it renders
**Then** it shows a session-size control (defaulting to "All") independent of the script/set toggles
**And** the live "N cards in scope" count reflects only the script/set scope, unaffected by the size selection.
*(New AC, 2026-09-08 via Correct Course — see amended FR-2, UX-DR4.)*

**Given** the Scope picker
**When** the user taps the script pill-toggle (Hiragana / Katakana / Both) or the set pill-toggle (Base / Yoon / Both)
**Then** exactly one segment per group is active, the change commits immediately with no confirm step
**And** the "N cards in scope" count recomputes live to match the new combination.

**Given** a narrowed scope (e.g. Hiragana + Base only = 46 cards)
**When** the user taps "Start writing"
**Then** that exact scope definition (`{scripts, units}`) is what the app carries forward for the session's card pool.

**Given** the Scope picker
**When** rendered
**Then** script/set metadata renders as positive-variant chip tags, consistent with DESIGN.md's chip-tag component
**And** every tap target meets or exceeds Android's 48dp minimum.

### Story 1.3: Write-From-Memory Drill Loop + Ink-Width Setting

As a learner practicing kana,
I want to write a prompted character from memory on a pressure-sensitive genkouyoushi canvas and grade myself,
So that I get an honest, fast read on whether I actually recall it.

**Acceptance Criteria:**

**Given** "Start writing" was tapped from the Scope picker
**When** the Drill screen opens
**Then** a prompt (romaji + script name, no mnemonic) is shown for a card selected at random from the session's scope
**And** a progress counter reads "1 / N" where N is the scope size.

**Given** the Drill screen
**When** rendered
**Then** the genkouyoushi cell is a single canvas element (grid guide + ink both rendered on it, never two layered canvases), with a dashed cross-guide always visible and a center dot visible only while the cell is empty.

**Given** a pen/stylus touches the canvas
**When** the user writes a stroke
**Then** stroke width continuously varies with pressure across the full pressure range, using Pointer Events (`pressure`, `pointerType:'pen'`) and Chrome's Delegated Ink Trails.

**Given** the ink adapter's `InkSurface` port
**When** the Drill screen mounts
**Then** `mount(node)` is called exactly once (never re-rendering inside that node)
**And** `onStrokeComplete` fires once per completed stroke, never per pointer event.

**Given** a completed stroke
**When** it lands
**Then** the center dot disappears
**And** a Clear affordance appears alongside "Your call — nothing is checking the shape" copy.

**Given** ink exists on the canvas
**When** the user taps Clear
**Then** the canvas empties, the center dot reappears
**And** the prompt does not advance.

**Given** the Drill screen
**When** the cell is blank and un-revealed
**Then** Missed and Correct render dimmed; **when** at least one stroke exists
**Then** Missed and Correct become active.

**Given** Missed or Correct is tapped
**When** a grade is submitted
**Then** the next prompt (selected at random from the scope — weak-spot bias arrives in Story 1.7) appears
**And** the progress counter advances by one.

**Given** a Settings screen accessible from the Scope picker header
**When** opened
**Then** it shows an ink-width pill-toggle (Subtle / Expressive / Calligraphy), persisted to `settings.widthPreset`
**And** the Drill canvas immediately reflects the selected width on the next stroke.

**Given** a device on the same class as the validated web PoC
**When** ink is compared side by side against the PoC
**Then** felt latency and pressure-to-width control match or exceed the PoC's rated feel.

### Story 1.4: Reveal Correct Answer

As a learner practicing kana,
I want to reveal the correct character when I genuinely can't recall it (or want to double-check),
So that I still get an honest grade instead of guessing blind or fudging my own judgment.

**Acceptance Criteria:**

**Given** the Drill screen
**When** a prompt appears
**Then** the Reveal control is active immediately — even before any stroke exists — and remains active until a grade is submitted.

**Given** the user taps Reveal while the cell has written ink
**When** revealed
**Then** the layout switches to a side-by-side "Yours" / "Reference" view — the user's own ink on one side, the canonical grapheme rendered in the glyph-ink brush typeface on the other — never overlaid, never replacing the user's stroke.

**Given** the user taps Reveal while the cell is blank
**When** revealed
**Then** the "Yours" panel shows the empty canvas (center dot, no stroke) instead of an inked glyph.

**Given** a reveal has happened
**When** rendered
**Then** Reveal itself becomes a dimmed "Revealed" label
**And** Missed/Correct are both active and still required — revealing never auto-assigns a grade.

**Given** a grade is submitted after a reveal
**When** the attempt is captured
**Then** a `revealUsed` flag is set to `true` for that attempt, regardless of the grade given.

### Story 1.5: Attempt Recording

As a learner practicing kana,
I want every completed prompt cycle to be saved with its full detail,
So that the app has real data to reason about my progress and weak spots later.

**Acceptance Criteria:**

**Given** the `attempts` IndexedDB store does not yet exist
**When** this story ships
**Then** it is created via `idb` with an `AttemptRepository` port implementation exposing `add()`, `listBySession()`, `listAll()` (returns the complete, unpaginated history), and `deleteLast()`.

**Given** a grade (Correct or Missed) is submitted on the Drill screen
**When** the attempt is persisted
**Then** the record includes a UUID `id`, `sessionId`, `cardId`, ISO-8601 `timestamp`, `timeToFirstStrokeMs`, `totalTimeMs`, `strokeCount`, `revealUsed`, `selfGrade` (`'correct'|'incorrect'`), and an embedded `strokes[]` array.

**Given** a stroke's point stream
**When** persisted
**Then** each point (`x, y, pressure`) is stored relative to the grid cell, never as absolute viewport pixels
**And** the active `widthPreset` is stored alongside it.

**Given** attempts have been persisted
**When** the app is fully reloaded
**Then** `listAll()` returns exactly the same attempts as before reload, with strokes that replay correctly regardless of the current viewport size.

**Given** an IndexedDB operation fails
**When** it occurs
**Then** it resolves as a rejected `Promise`/typed `Result`, never letting a raw `DOMException` surface past the adapter boundary.

### Story 1.6: Per-Character Miss Tally

As a learner practicing kana,
I want the app to keep a running count of how often I've missed each character,
So that my shaky characters are tracked without me having to remember them myself.

**Acceptance Criteria:**

**Given** the `tallies` IndexedDB store does not yet exist
**When** this story ships
**Then** it is created with a `TallyRepository` port implementation exposing `getAll()`, `increment(cardId)`, and `decrement(cardId)` (both atomic; `decrement` clamps at zero, unused until Story 1.8).

**Given** a card has no prior tally
**When** it is self-graded Missed for the first time
**Then** a new `{cardId, missCount: 1}` record is created.

**Given** a card already has a tally
**When** it is self-graded Missed again
**Then** `missCount` increments by exactly one before the next prompt is selected; a Correct grade never changes the tally.

**Given** tallies exist
**When** the app is fully reloaded
**Then** `getAll()` returns the same miss counts as before reload.

**Given** the `Tally` schema
**When** inspected
**Then** it contains exactly two fields (`cardId`, `missCount`) — no due-date, interval, or last-reviewed timestamp is ever added to it.

### Story 1.7: Weak-Spot-Biased Session Sampling & Shaky Badge

As a learner practicing kana,
I want characters I've been missing recently to be more likely to show up in my sessions than ones I've clearly gotten solid,
So that my practice stays targeted at weak spots across sessions, without me having to consciously pick them.

*(Amended 2026-09-08 via Correct Course + architecture pass — bias moved from per-draw resampling within a session to weighted sampling of the session's card set at session start; see amended FR-7, AD-10.)*

**Acceptance Criteria:**

**Given** attempt history (Story 1.5) and tallies (Story 1.6) exist, and a session's chosen scope and session size
**When** the session starts
**Then** it calls a pure domain function `sampleSessionCards(attempts: Attempt[], scope: Scope, sessionSize: number): Card[]` — no `tallies` parameter, no clock/schedule input beyond `Date.now()` inside decay — replacing the prior per-draw `selectNext`, called exactly once.

**Given** the weighted sample
**When** it is drawn
**Then** it uses sequential weighted removal without replacement (repeatedly draw via the weighted cumulative-sum pick against the remaining candidate pool, remove the winner, recompute the pool's total weight) down to `min(sessionSize, cardsInScope(scope).length)` distinct cards
**And** the resulting set is uniform-shuffled before becoming the session's presentation queue, decoupling sampling weight from draw order.

**Given** the sampled queue
**When** the Drill screen advances through it
**Then** no further sampling call happens mid-session — each queue entry is presented exactly once, in order; a miss recorded during the session influences only the *next* session's sample, not this one's remaining cards.

**Given** a card's incorrect attempts
**When** scoring that card
**Then** each incorrect attempt's contribution decays exponentially with a **7-day half-life** based on elapsed wall-clock time since its `timestamp` (never by ordinal position) — e.g. `weight = 0.5^(elapsedDays / 7)` — with no floor beyond the universal selection floor below (a decision confirmed 2026-09-03: pure time decay, no separate "still flagged" floor for uncorrected misses).

**Given** a card with more than one incorrect attempt since its last correct attempt (or ever, if never corrected)
**When** computing that card's score
**Then** the card's score is the **sum** of each qualifying incorrect attempt's decayed weight (not max, not most-recent-only) — a card missed 5 times ranks higher than one missed once even if all 5 misses are old, so chronic weakness is never masked by a single recent-enough miss on a rarely-missed card (a decision confirmed 2026-09-03, closing an ambiguity the architecture left open: multiple-miss combination was unspecified).

**Given** a card missed several times long ago but correct on every attempt since
**When** compared against a card missed once recently
**Then** the recently-missed card scores higher (a correct attempt discounts the incorrect attempts that precede it for that card, zeroing their contribution regardless of elapsed time).

**Given** the scored candidates
**When** a session's cards are sampled
**Then** sampling is probabilistic and every candidate card in scope carries a nonzero probability of being sampled into any given session, at every step of the shrinking pool — no card is ever permanently excluded or given zero probability regardless of its score.

**Given** the Scope picker screen
**When** rendered
**Then** it shows an "N shaky" badge (missed-variant chip) counting cards in the current scope whose miss tally exceeds a running-average threshold, recomputed live on every script/set toggle — informational only, does not affect selection weighting.

### Story 1.8: Undo Last Grade

As a learner practicing kana,
I want to undo my last grade if I mis-tapped or graded too hastily,
So that a slip of the stylus doesn't pollute my tally or history.

**Acceptance Criteria:**

**Given** a grade was just submitted (the Drill screen is in its "graded" state)
**When** the user taps Undo (from the post-grade toast banner)
**Then** `undoLastGrade(sessionId)` runs as a single atomic domain operation.

**Given** the undo runs
**When** it completes
**Then** it calls `AttemptRepository.deleteLast()`, and — only if the undone grade was `'incorrect'` — `TallyRepository.decrement(cardId)`; both effects are visible immediately.

**Given** Story 1.7's session sampling now happens once at session start, not per-draw
**When** undo completes
**Then** no session-queue manipulation is needed — Story 1.8's own deferred-advance behavior (below) already guarantees the queue hasn't advanced past the undone card, since Undo is only offered before "Next character" is tapped.
*(Amended 2026-09-08 via Correct Course + architecture pass — supersedes the prior AC, which existed to protect a per-draw selection call that no longer exists; see amended AD-13.)*

**Given** the graded card
**When** undo completes
**Then** the Drill screen returns to that card's written state (the ink as it was before grading, not a blank cell), with Missed/Correct/Reveal available again as before.

**Given** the toast banner has appeared
**When** the user taps "Next character" instead of Undo
**Then** Undo is no longer available for that attempt.

**Given** a Missed grade
**When** the toast banner appears
**Then** it shows the card, its new cumulative miss tally, and the Undo action; **given** a Correct grade
**Then** the toast still appears with an Undo action but without a miss-tally readout.

### Story 1.9: Session Closure, Idle Timeout & Summary

As a learner practicing kana,
I want a session to end cleanly — whether I finish everything, stop early, or step away — and see a clear summary of how I did,
So that each sitting has a defined result I can trust.

**Acceptance Criteria:**

**Given** a session in progress
**When** the user taps an always-reachable "I'm done" control
**Then** the session closes immediately with `closureReason: 'explicit'`.

**Given** a session in progress
**When** the last card in this session's sampled set is completed
**Then** the session closes automatically with `closureReason: 'full-scope'` (displayed to the user as **"Session complete"**), without requiring the explicit control — this is now deterministic: a session always closes this way after exactly the session's sampled size (equal to the chosen session size, or the full scope's size if "All" was chosen), never fewer, never more.
*(Amended 2026-09-08 via Correct Course + architecture pass — closure against the sampled set, not the full scope, is now exact rather than probabilistic; see amended FR-9, UX-DR11.)*

**Given** a session in progress
**When** no interaction occurs for the configured idle threshold (default ~5 minutes)
**Then** the session auto-closes with `closureReason: 'inactivity'`.

**Given** Android/Chrome can throttle or suspend `setTimeout` in a backgrounded tab or minimized PWA
**When** idle detection is implemented
**Then** it does **not** rely on a live running timer to fire the closure — instead, every interaction records `lastInteractionAt`, and idle is evaluated retroactively on the next resume/focus/interaction event by comparing `Date.now() - lastInteractionAt` against `idleTimeoutMs`
**And** a session found idle this way still closes with `closureReason: 'inactivity'` and a `date`/duration reflecting when activity actually stopped, not when the app happened to be reopened (a decision confirmed 2026-09-03, closing a gap the architecture left unaddressed: naive foreground timers are unreliable on backgrounded mobile tabs).

**Given** the Settings screen (from Story 1.3)
**When** opened
**Then** it now also shows an idle-close-threshold pill-toggle, persisted to `settings.idleTimeoutMs` and used by the idle timer.

**Given** any closure reason
**When** the session closes
**Then** a `sessions` record is written (new IndexedDB store, `SessionRepository.add()/list()`) with a non-null `id`, `date`, the session's `scope` object, `cardsAttempted`, `accuracy` (correct ÷ attempts for that session), and `closureReason`.

**Given** the session record
**When** the app is fully reloaded
**Then** `list()` returns the same session records as before reload.

**Given** a closed session
**When** the Session Summary screen renders
**Then** it shows the accuracy hero percentage, exactly two stat tiles (time, reveal count), and a missed-chip list of this session's misses with their running cumulative tallies.

**Given** a manually-closed session
**When** the summary renders
**Then** it carries a positive "you ended it" chip; **given** a full-scope closure
**Then** no special chip appears on the summary itself.

### Story 1.10: Session History View

As a learner practicing kana,
I want to browse my past sessions,
So that I can tell whether my recall is actually holding up or improving across multiple days, not just in one sitting.

**Acceptance Criteria:**

**Given** one or more session records exist
**When** the History screen opens (from Scope picker header or Session summary)
**Then** sessions render as a reverse-chronological list of History rows, each divided by a hairline (omitted on the last row).

**Given** an idle-closed session
**When** its row renders
**Then** it shows a neutral "closed on idle" chip and its accuracy value dims; **given** a full-scope session
**Then** it shows a positive "whole scope" chip; **given** a manually-closed session
**Then** it carries no chip.

**Given** up to the last 10 sessions
**When** the sparkline renders
**Then** each bar's height maps to that session's accuracy and its color follows the 5-step accuracy ramp, except the most recent bar, which is always the accent color regardless of height; idle-closed sessions still appear in the sparkline, undistinguished there.

**Given** no sessions exist yet
**When** History opens
**Then** the sparkline area is hidden and a single centered line reads "No sessions yet. Finish a drill to see it here." with no call-to-action.

**Given** the History screen
**When** rendered
**Then** it is reachable from the app's main navigation without leaving the installed app
**And** every chip pairs its color tint with visible text.

### Story 1.11: Dakuten/Handakuten Catalog Expansion

*(New 2026-09-08 via Correct Course — see `sprint-change-proposal-2026-09-08.md`. Additive to and dependent on Story 1.2's amended catalog AC above; kept as a separate story since it's an independent, purely-additive content change with its own test surface.)*

As a learner practicing kana,
I want dakuten and handakuten characters (が, ぱ, etc.) included in the practice catalog,
So that I'm drilled on the complete character set I actually need, not just the plain gojūon table.

**Acceptance Criteria:**

**Given** the static kana catalog (`domain/cards.ts`)
**When** this story ships
**Then** the catalog grows to 208 cards as specified in Story 1.2's amended AC (71 base hiragana, 71 base katakana, 33 hiragana yoon, 33 katakana yoon).

**Given** `cards.test.ts`'s bucket-count assertions
**When** updated
**Then** they assert 71/71/33/33 instead of 46/46/33/33, and continue to assert id uniqueness and no same-sound collision across the expanded set.

## Epic 2: Backup & Portability

### Story 2.1: Export Progress Data

As a learner practicing kana,
I want to export all my tallies, attempts, and session history to a file,
So that I have a backup if my browser or device storage is ever cleared.

**Acceptance Criteria:**

**Given** the Settings screen
**When** this story ships
**Then** it gains an "Export" control.

**Given** the user taps Export
**When** the export runs
**Then** the `io` adapter maps every persisted `Attempt` to an `AttemptExport` (all fields except `strokes`) and produces a single JSON file with the envelope `{version, exportedAt, tallies, attempts: AttemptExport[], sessions}`.

**Given** the exported file
**When** inspected
**Then** it contains no raw stroke/ink data anywhere, while still containing every tally, attempt (minus strokes), and session record currently persisted.

**Given** the export completes
**When** the browser handles the download
**Then** no dedicated app-level recovery UI is required for a failed/blocked download beyond allowing the user to retry the tap.

### Story 2.2: Import Progress Data with Confirmation

As a learner practicing kana,
I want to import a previously exported file to restore my progress,
So that I can recover after clearing storage or reinstalling — with a clear warning since it replaces everything.

**Acceptance Criteria:**

**Given** the Settings screen
**When** this story ships
**Then** it gains an "Import" control.

**Given** the user selects a file to import
**When** it validates against the `AttemptExport` schema and `version` field
**Then** a modal-weight toast banner appears showing both the current local data's date and the incoming file's date, and blocks the Import action until the user explicitly confirms or cancels.

**Given** the user cancels the import-warning modal
**When** cancel is tapped
**Then** current local data is left completely untouched.

**Given** the user confirms the import-warning modal
**When** the import applies
**Then** all current `tallies`, `attempts`, and `sessions` are deleted and replaced wholesale with the imported data — never merged record-by-record.

**Given** a malformed or unrecognized file (wrong shape or missing/mismatched version)
**When** import is attempted
**Then** it is rejected with inline error text under the Import control, no modal shown, and zero partial writes — current data remains exactly as it was.
