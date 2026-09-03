---
name: reconcile-ux-vs-architecture-spine
type: review
purpose: reconciliation-check
scope: 'ARCHITECTURE-SPINE.md vs DESIGN.md + EXPERIENCE.md (jplearn kana v1)'
status: final
created: '2026-09-03'
sources:
  - '_bmad-output/planning-artifacts/architecture/architecture-jplearn-2026-09-02/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-jplearn-2026-09-02/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-jplearn-2026-09-02/EXPERIENCE.md'
---

# Reconciliation Review — Architecture Spine vs UX Source Docs

## Verdict

**Minor-to-real gaps.** The spine's core paradigm (Ports & Adapters, no-router state enum, isolated ink adapter) is structurally compatible with almost every screen and state EXPERIENCE.md/DESIGN.md describe — the six IA surfaces, the drill loop's sub-states, weak-spot bias, export/import, idle closure, and empty-history all map cleanly onto existing constructs (the `SESSION.closureReason` field, the deferred idle-timer note, the domain/persistence split). But there is one clear, concrete omission (no persisted settings/preferences store) and one cluster of real ambiguity around exactly how the `ink` adapter's boundary works for anything beyond "stroke completes" (Clear, Reveal's side-by-side "yours" panel, Undo-restores-written-state) — all of which the UX docs require and AD-2 doesn't fully specify. Nothing found is unbuildable, but several would force a builder to invent architecture the spine was supposed to have already settled.

## Findings

### 1. No persisted settings/preferences store — real gap

**What the UX requires:** Settings (ink-width preset, idle-close threshold — DESIGN.md `pill-toggle-group`, EXPERIENCE.md IA table) must persist across app opens, since this is an installed offline PWA reopened many times. First run's "that only happens once" behavior (EXPERIENCE.md Flow 1 step 1: "it launches straight to the Scope picker — no cold 'first run'") requires a persisted "first run completed" flag read at every boot, before any session/attempt exists.

**What the spine provides:** The ERD defines exactly four things: `SESSION`, `ATTEMPT`, `TALLY`, `CARD` (the last static, per AD-3). The Ports list is `CardRepository`, `AttemptRepository`, `SessionRepository`, `TallyRepository`. There is no settings/preferences entity, store, or port anywhere in the spine — not in the ERD, not in the Ports list, not in the Structural Seed, not in Deferred.

**Why it matters:** Ink width and idle-close threshold are exactly the kind of small persisted value a builder will otherwise bolt on ad hoc (localStorage? a fifth IndexedDB store? a field smuggled onto `SESSION`?) — precisely the kind of undocumented decision the spine exists to prevent (see AD-3's own rationale: "prevents a builder adding ... logic ... that never changes at runtime"). This is the single cleanest, most concrete miss in the reconciliation.

### 2. Ink↔UI boundary is under-specified beyond "stroke complete" — real gap / ambiguity

AD-2 states the contract precisely for one direction and one event: the `ink` adapter owns its canvas outside Svelte's reactive tree, the `ui` adapter mounts that node once via `onMount`, and `ink` calls back to `ui`/`domain` **only once per completed stroke** (`onStrokeComplete`), never per pointer event. That's sufficient for "enable grade buttons once ink exists" (EXPERIENCE.md Component Patterns, Grade buttons row) — a single `onStrokeComplete` firing is enough signal. But the UX describes at least three more ink-adapter interactions AD-2 doesn't name:

- **Clear** (EXPERIENCE.md Interaction Primitives / Component Patterns, Genkouyoushi cell row): a `ui`-initiated command that must reach into the `ink` adapter and erase the canvas without advancing the prompt. This is a call in the opposite direction from AD-2's stated contract (`ink → ui`, once per stroke), and it's exactly the kind of adapter-to-adapter call AD-1 says is forbidden ("every adapter imports `domain/` and/or `ports/`, never a sibling adapter"). AD-2 already implies *some* sanctioned `ui`→`ink` channel exists (mounting the node), so Clear is presumably meant to go through the same channel — but that channel/interface is never named as a port or otherwise, so a builder has to invent it.
- **Reveal's side-by-side "yours" panel** (EXPERIENCE.md Component Patterns, Reveal row; States, "Revealed, from written"/"Revealed, from blank"): the layout swaps from a single genkouyoushi cell to a two-panel "yours vs. reference" layout, and the "yours" panel must show the ink the user actually drew. AD-3 covers where the *reference* glyph data comes from (static domain data) but says nothing about how the *user's own ink* gets rendered a second time in a different panel — whether that's the same live canvas node relocated, or a second static render/replay of captured stroke data.
- **Undo restoring the "written" state** (EXPERIENCE.md Interaction Primitives, Undo row; Component Patterns, Toast banner row): tapping Undo after a grade must revert to "the graded card's written state (not a blank cell)" — i.e. the ink must still be there to look at. The Graded state description ("Prompt area and cell dim to background, opacity-reduced, not hidden") suggests the same canvas DOM node just gets dimmed rather than destroyed, which would make this work — but that's an inference, not a stated rule. Whether the ink canvas node is reused across the whole drill loop (created once at Drill-screen mount, cleared between prompts) or remounted per-prompt (destroyed/recreated by a Svelte `{#if}`/`{#key}` block on each new card) has real consequences here, and AD-2's "mounts that node once" doesn't disambiguate which "once" it means.

None of this is unbuildable, but it's exactly the boundary the spine calls out as architecturally load-bearing (AD-2's whole purpose is to pin down the ink/UI relationship precisely, "to avoid reintroducing the exact re-render-on-the-hot-path risk"), and the UX layer needs more from that boundary than AD-2 currently commits to.

### 3. First-run/pen-check screen missing from the spine's capability surface — gap

EXPERIENCE.md's Information Architecture table lists First run as one of six top-level surfaces, with real technical requirements: a live Pointer Events pressure readout (0–1) that updates on touch, `beforeinstallprompt` handling for install-to-home-screen, and a "stylus not detected" fallback state. The spine's Capability→Architecture Map only has rows for FR-1 through FR-14, and none of them is First run (it doesn't appear to be bound to any numbered FR at all — plausibly the PRD itself never assigned it one). The Structural Seed's inline comment on `adapters/ui` — "scope picker, drill, reveal, summary, history, settings" — also omits it. So First run has fallen through both the FR list and this spine's own screen inventory, despite being a real, first-class surface in both UX docs.

### 4. Live pressure readout vs. AD-2's "never per pointer event" rule — potential direct conflict

First run needs a pressure value that visibly updates continuously as the user touches the surface (EXPERIENCE.md State Patterns, "Stylus found" row: "live pressure readout (0–1) updates on touch"). AD-2 explicitly forbids the ink adapter from calling back to `ui`/`domain` per pointer event, precisely to keep pointer-event-frequency work off Svelte's reactive tree — it only permits one callback per *completed stroke*. If pen-check reuses the same `ink` adapter/listener pattern, these two requirements are in direct tension: a readout that updates "on touch" is a pointer-move-frequency signal, not a stroke-complete-frequency one. A separate, purpose-built listener for the pen-check screen (not the same instance/pattern as the drill canvas) resolves this cleanly, but the spine doesn't say that's the intended shape — a builder could easily reuse the drill's ink adapter for pen-check and hit the very re-render-on-hot-path problem AD-2 was written to prevent.

### 5. Undo's cross-store compensating write isn't named — minor gap

The post-grade toast's Undo (EXPERIENCE.md Component Patterns, Toast banner row) must reverse two things atomically from the user's point of view: the persisted `Attempt` record, and — only on a Missed grade — the `TALLY.missCount` increment it caused. AD-4 says an `Attempt` embeds its own strokes (so no separate strokes store to reconcile), which simplifies this, but neither the Ports list nor the Consistency Conventions table names any delete/compensating-write operation on `AttemptRepository`/`TallyRepository`, nor any transactional guarantee spanning both stores. Likely fine to build (both are IndexedDB stores reachable in one `idb` transaction) but currently unstated.

## Non-issues (checked, no gap found)

- **Six IA surfaces vs. Structural Seed's screen list** — close enough: EXPERIENCE.md treats "Reveal" as a *state* inside the Drill loop screen, not a separate top-level nav surface, while the Structural Seed's inline comment lists "drill, reveal" as if they were siblings. Harmless naming looseness, not an architectural conflict — the "single top-level Svelte state enum" nav convention comfortably holds Reveal as a sub-state of the Drill screen rather than its own enum value.
- **Grade buttons disabled until ink exists** — maps cleanly onto `onStrokeComplete` firing at least once; no conflict with AD-2.
- **Idle-timeout session closure** — the Deferred section already correctly scopes this as a UI-owned timer calling into domain closure logic, story-level detail; matches EXPERIENCE.md's idle-closure flow and the `SESSION.closureReason` field in the ERD.
- **Empty-history state** — pure `adapters/ui` presentational concern reading an empty result from `SessionRepository`; no architectural implication.
- **Import-replace confirmation modal** — the only modal in v1; the spine's flat state-enum navigation convention doesn't mention modals/overlays at all, but this is plausibly just local component state (a boolean flag inside the Settings screen) rather than a top-level nav state — low risk, but worth a builder double-checking it isn't accidentally forced into the nav enum.
- **Weak-spot "N shaky" badge live recompute** — requires `ui` to call into `domain`'s selection/tally logic for a live preview count on every scope-picker toggle tap; consistent with AD-1's dependency direction (ui → domain), no new port needed beyond what FR-6/FR-7's row already implies.
- **Export/import shape divergence (AD-5)** — matches EXPERIENCE.md's Voice and Tone warning about import being destructive and Component Patterns' import-warning toast (showing current-data date vs. incoming file date); no conflict.
