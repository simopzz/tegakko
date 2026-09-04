---
title: Architecture Spine Review — tegakko-kana-v1 (rubric walk)
reviews: ../ARCHITECTURE-SPINE.md
against: _bmad-output/planning-artifacts/prds/prd-tegakko-2026-09-02/prd.md
created: 2026-09-03
---

# Review: ARCHITECTURE-SPINE.md (tegakko-kana-v1)

Verdict: **Solid, ship-ready with two fixes.** The spine is unusually tight for its altitude — every PRD FR maps to a governing AD or the paradigm, the ERD and component diagram are valid and non-trivial, the deploy/hosting envelope is explicitly decided (not silently missing), and nothing in Deferred creates real divergence risk given a single builder. Two concrete defects found: one AD whose stated enforcement mechanism doesn't actually enforce the rule it claims to prevent, and one capability (production error visibility) that's absent without even being named as a deferral. Neither blocks moving to epics/stories, both are cheap to fix.

---

## 1. Does it fix the real divergence points for the level below, and miss none?

Checked every PRD FR (1–14) against the Capability → Architecture Map: all 14 are present and each points to a specific file location plus a governing AD or paradigm reference. No FR is orphaned.

Divergence points that *would* bite a solo builder working story-by-story (likely across many separate AI-driven build sessions, per this repo's bmad-loop setup) are the ones actually fixed:

- **Layering** (AD-1) — prevents the single most likely mistake in a hexagonal setup: an adapter reaching into a sibling adapter or the DOM leaking into `domain/`.
- **Ink adapter isolation** (AD-2) — the one true novel/risky subsystem (real-time canvas + Delegated Ink Trails) gets its own AD precisely because it's the one place a "natural" Svelte-idiomatic implementation (bind ink state to a Svelte store, re-render on stroke) would silently reintroduce the exact latency problem the native-vs-web PoC decision was fought to avoid. Good catch — this is the spine's best AD.
- **Card storage model** (AD-3), **attempt/stroke embedding** (AD-4), **export shape ≠ persisted shape** (AD-5) — these three pre-empt three different "a second builder normalizes this differently" scenarios that IndexedDB + a naive reading of PRD FR-8's "links to" and FR-13's export language would otherwise invite.
- **Hosting/deploy** (AD-8) — closes the loop on FR-14's install/offline requirement so it doesn't quietly stay dependent on a dev laptop, which is called out explicitly as the PoC-era failure mode being avoided.

Nothing found in the FR set is un-covered. One soft miss: PRD FR-3's feature-specific NFR ("ink latency/feel must match or exceed the validated PoC's felt experience, side-by-side") has no architectural anchor beyond AD-2's structural isolation — reasonable, since it's explicitly a qualitative/felt bar not a numeric one (the PRD says so itself), so there's nothing to encode. Not a defect, just noting the map's "AD-2" governance for FR-3 covers the *mechanism* for hitting that bar, not the bar itself — nor should it.

## 2. Is every AD's Rule actually enforceable, and does it prevent its stated Prevents?

Six of eight ADs pass cleanly. Two have real gaps:

- **AD-6 ("TypeScript strict mode, no exceptions") — Rule does not fully deliver on its own Prevents.** The Rule is "`strict: true` in tsconfig... No `any` at a port boundary." But `strict: true` only catches *implicit* `any` and stricter null/type checks — it does **not** forbid a developer (or an AI coding a story) from writing an explicit `: any` on a port-boundary parameter or return type. The stated Prevents ("an untyped or loosely-typed adapter silently breaking the domain/port contract... without a compiler catching it") is exactly the scenario explicit `any` slips through. As written, the Rule's only cited mechanism doesn't enforce the second sentence of the Rule itself. **Fix:** add `@typescript-eslint/no-explicit-any` (or equivalent) scoped at minimum to `ports/` and adapter files that implement them, or state the enforcement is manual/review-only if that's the actual intent.

- **AD-1 and AD-2 — enforceable only by manual discipline, no tooling gate named.** Both rules are structurally sound and their Prevents are real, but nothing in the spine specifies *how* a violation gets caught (no dependency-cruiser/ESLint import-boundary rule for AD-1's "adapters never import a sibling adapter"; no lint/runtime guard for AD-2's "callback once per stroke, never per pointer event"). For a single human reviewer this is probably fine (they'll notice), but if any of this build work runs through unattended/automated sessions (this repo has `bmad-loop` configured per the project memory), an unenforced architectural rule is exactly the kind of thing that erodes silently across many small automated commits. Not a blocking defect — flagging because the checklist explicitly asks whether the Rule is *actually* enforceable, and "a human will notice" is weaker than the other ADs, which are either compiler-checked (AD-1 partially, AD-6 partially) or config-checked (AD-7, AD-8).

The other ADs (AD-3, AD-4, AD-5, AD-7, AD-8) have Rules that are either directly compiler/schema-checkable (AD-3's `CardRepository` typing, AD-5's `AttemptExport` schema+version validation) or config-level and trivially verifiable by inspection (AD-7's `registerType: 'autoUpdate'`, AD-8's GitHub Actions workflow). These are fine as-is.

## 3. Could anything under Deferred let two independently-built units diverge incompatibly?

Walked all six Deferred items against this test. None qualify as a hidden AD — all are either genuinely low-risk (single UI surface, single builder) or already carry enough of a stated default to prevent divergence even though formally "deferred":

- **Testing framework/strategy** — no divergence risk: PRD doesn't require tests, so there's no second implementation to diverge from a first.
- **CSS/styling architecture** — low risk, but worth a note: DESIGN.md (a spine source) already fixes every token *value* (colors, type scale, spacing, radii, component specs) in complete detail. The spine's deferral text ("expected to become CSS custom properties... Svelte's native scoping is sufficient") already reads as a decision in substance, just filed under Deferred. The one thing genuinely left open — the actual custom-property *naming convention* (e.g. `--color-accent` vs `--accent` vs `--jp-accent`) — could diverge if built across separate sessions each inventing their own prefix. Low severity given it's cosmetic and trivially greppable/fixable later, but cheap to close: one line fixing a naming convention (e.g. `--{token-path}` kebab-case) would remove the only live divergence surface here.
- **Idle-timeout implementation detail** — no risk: the deferred text already fixes owner (UI adapter) and call target (domain closure logic); only the internal timer mechanism is left open, and there's exactly one screen that needs it.
- **Custom domain/DNS** — no risk, purely a non-decision with no consumer yet.
- **Kanji/vocabulary content model extension** — correctly out of this spine's binds (no FR requires it in v1); explicitly named as expected-to-extend rather than silently ignored.
- **CI beyond deploy** — no risk for a solo project; correctly scoped as "not specified" rather than silently absent (see §6 below for a related but distinct gap).

Conclusion: nothing here needs promotion to an AD.

## 4. Is all named tech plausible/current as stated?

Could not independently verify exact version numbers against upstream registries in this environment (no network/API access available for a live check). Judging from known release cadence up to my own training cutoff:

- Vite 8.2.2, Svelte 5.57.0, `@sveltejs/vite-plugin-svelte` 7.2.0, `vite-plugin-pwa` 1.3.0, `idb` 8.0.3 — all fall within plausible ranges given each project's historical release cadence (e.g., Vite's roughly-yearly major bumps would put v8 around late 2025, making 8.2.2 by Sept 2026 reasonable; Svelte 5 shipped Oct 2024 and has had frequent minor releases since). Nothing here is implausible on its face (no version skew like a Vite 8 project pinned to a vite-plugin-svelte major built for Vite 5, no idb major that predates IndexedDB's current API shape).
- The spine already self-flags this correctly: `<!-- SEED — verified current at authoring (2026-09-03); the code owns this once it exists -->`. That caveat is the right mitigation for a review dimension that can't be fully checked from a document alone — no further action needed beyond what's already there.

Not flagging this as a finding since the document already carries the appropriate hedge; noting only that this reviewer's confidence on exact patch numbers is bounded by lack of live verification.

## 5. Does it cover the PRD's capabilities?

Yes, fully — see §1. All 14 FRs mapped; the Design Paradigm, all 8 ADs, the Consistency Conventions table, and the Structural Seed collectively give every FR either a direct governing rule or a clear, unambiguous "lives here" location with no rule needed (e.g. FR-2, FR-9, FR-10 are adequately covered by the general paradigm + ERD without needing their own AD — correctly not over-specified).

One cross-check worth naming: FR-12's "grid-relative, not absolute-pixel" stroke storage requirement (explicitly flagged in the PRD as *new* work, not a carry-over from the PoC's absolute-pixel schema) is captured in AD-4's `Stroke` shape (`points: {x, y, pressure}[]`) — but AD-4's rule text doesn't itself state the grid-relative requirement, it's only implicit via "points grid-relative per PRD FR-12" in the prose. Since this is explicitly called out in the PRD as a place where a builder might reach for the PoC's existing (wrong) schema, it would be stronger as an explicit clause in AD-4's Rule itself rather than a parenthetical reference. Minor — the information is present and traceable, just one level less prominent than its risk warrants.

## 6. Is every structural dimension owned, deferred-with-reason, or flagged open? (operational/environmental envelope check)

Deployment, hosting, and the build/deploy pipeline are explicitly decided (AD-8: GitHub Pages + GitHub Actions on push to `main`, no custom domain, HTTPS via default origin) — this is not silently missing, which is the most common failure mode this check is looking for, and it's absent here. Good.

Gap found: **production operations/observability is absent from the spine, and unlike every other omitted dimension, it isn't named anywhere — not as an AD, not in Consistency Conventions, not in Deferred.** There's no mention of what happens when the installed PWA throws an uncaught error on the user's tablet in the field (no error boundary strategy, no logging, no crash visibility). AD-8's Prevents clause is specifically about the *install/update path* not depending on a reachable dev machine — but that same reasoning implies the user could be running a broken build with zero feedback loop back to the developer, and the spine doesn't address it one way or the other. For a true single-user hobby app this may well be a deliberate "I'll just notice when it breaks" non-decision — which is fine — but the checklist's point stands: every other deliberately-skipped dimension in this document (custom domain, CI gates, testing strategy) got a named Deferred line with a reason; this one didn't get named at all. **Fix:** add one line to Deferred, e.g. "Error/crash observability — none; single-user app, developer is the only user, failures surface via direct use. Revisit if the user base ever exceeds one." — costs nothing and closes the checklist gap cleanly.

No other structural dimension (environments, secrets/config management — none needed, no backend/API — correctly absent since there is none, data backup — covered by FR-13/AD-5) is silently missing.

## 7. Format check — placeholders, diagrams

- No unresolved template markers (`TODO`, `TBD`, `{{...}}`, `FIXME`) found anywhere in the file.
- Both Mermaid diagrams are syntactically valid and non-trivial: the `flowchart TB` in Design Paradigm has 8+ real nodes and labeled edges; the `erDiagram` in Structural Seed has 4 entities, 3 relationships, and full field lists. Neither is an empty/stub graph.
- `companions: []` in frontmatter is legitimate (no companion documents were generated for a spine this size), not a placeholder.
- Section-by-section, nothing is empty or stubbed — every AD has all four required parts (Binds/Prevents/Rule), Deferred entries all carry a reason, the Stack table and Structural Seed are both fully populated.

---

## Summary of findings, ranked

1. **(Medium) AD-6's stated enforcement mechanism (`strict: true`) doesn't actually forbid explicit `any` at a port boundary**, which is exactly the failure mode its Rule and Prevents claim to close. Add an explicit-any lint rule scoped to `ports/`+adapters, or soften the Rule's wording to match what `strict: true` alone actually guarantees.
2. **(Medium) Production error/crash observability is the one operational dimension that's absent without being named** — every other consciously-skipped dimension got a one-line Deferred entry with a reason; this one didn't. Add a single Deferred line even if the answer is "none, by design."
3. **(Low) AD-1 and AD-2 have no tooling/lint gate named for enforcement**, relying on manual review to catch a violation — worth flagging given this repo is set up for automated/agent-driven story execution (bmad-loop), where an unenforced convention is more likely to erode unnoticed than under a single human's own hand.
4. **(Low) AD-4's Rule text doesn't itself state the grid-relative point requirement** that PRD FR-12 explicitly flags as new, PoC-schema-diverging work — it's only in the surrounding prose, one level less prominent than the risk it's guarding against warrants.
5. **(Cosmetic, non-blocking) CSS custom-property naming convention is the one live (if trivial) divergence surface left in the "CSS/styling" Deferred item** — DESIGN.md already fixes every token value; only the property-naming scheme is unfixed, and it's cheap to pin down in one line.

Overall: this is a well-scoped, correctly-altitude architecture spine. Fix #1 and #2 before treating it as final; #3–#5 are optional polish.
