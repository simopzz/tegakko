# Deferred Work

### DW-1: Extend the import-boundary ESLint rule so `domain/` and `ports/` can never import from `adapters/`/`app/`, not just adapter-to-adapter

origin: migrated from legacy ledger (source_spec: spec-1-1-installable-app-shell-first-run-pen-check.md), 2026-09-10
location: eslint.config.js (import/no-restricted-paths zones, AD-1)
reason: Current zones only cover sibling-adapter imports outside app/; the domain-purity half of AD-1 is enforced only by convention/comments today.
status: done 2026-09-10
resolution: resolved by sweep bundle dw-eslint-domain-boundary-hardening
resolution-undo: 92603a66961f14c53a556104414a60e314360ddded151059d0a27a0c119e1ef5 2026-09-10 7374617475733a206f70656e

### DW-2: Add `blocked`/`blocking` handlers to `openSettingsDb()` before any future story bumps `DB_VERSION`

origin: migrated from legacy ledger (source_spec: spec-1-1-installable-app-shell-first-run-pen-check.md), 2026-09-10
location: openSettingsDb() (db.ts)
reason: With a fixed version 1 this can't fire yet, but once a schema migration happens a stale tab holding an old connection could hang get()/save() indefinitely with no fallback UI.
status: done 2026-09-10
resolution: resolved by sweep bundle dw-indexeddb-blocked-versionchange-guard
resolution-undo: 6f5b53bc8a929767583c1678c52260d420b7d2dd2ee14479b25101ee72ecd7aa 2026-09-10 7374617475733a206f70656e

### DW-3: Add `runtimeCaching` for `fonts.googleapis.com`/`fonts.gstatic.com` in the VitePWA workbox config

origin: migrated from legacy ledger (source_spec: spec-1-1-installable-app-shell-first-run-pen-check.md), 2026-09-10
location: vite.config.ts (VitePWA workbox config)
reason: Google Fonts load from index.html but aren't precached, so first-load typography (though not the app shell itself) depends on network even after install.
status: open

### DW-4: Add `id` and `lang` fields to `public/manifest.webmanifest`

origin: migrated from legacy ledger (source_spec: spec-1-1-installable-app-shell-first-run-pen-check.md), 2026-09-10
location: public/manifest.webmanifest
severity: low
reason: Recommended so the installed app's identity survives future start_url changes; missing today, low priority.
status: open

### DW-5: Consider a keyboard alternative and an `aria-live` region for the First Run pen-status chip and the dismiss/install error note

origin: migrated from legacy ledger (source_spec: spec-1-1-installable-app-shell-first-run-pen-check.md), 2026-09-10
location: FirstRun.svelte (pen-check .pad status chip and dismissError note)
reason: The pen-check .pad suppresses an a11y lint warning with no ARIA/live-region feedback, and the dismissError note has the same gap; the epic's stated accessibility floor doesn't explicitly require this, but it's a real screen-reader gap.
status: open

### DW-6: Revisit `user-scalable=no` in `index.html`'s viewport meta as a deliberate product decision, not an inherited PoC default

origin: migrated from legacy ledger (source_spec: spec-1-1-installable-app-shell-first-run-pen-check.md), 2026-09-10
location: index.html (viewport meta)
reason: Disables pinch-zoom (WCAG 1.4.4 tension); defensible for active pen-drawing surfaces but Story 1.1's .pad is only a diagnostic touch target, not real strokes yet, and this setting is app-wide.
status: open
decision: 2026-09-10 Remove user-scalable=no app-wide, rely on the canvas's own touchAction:none for stroke protection — Change index.html's viewport meta to drop maximum-scale=1 and user-scalable=no, then verify the canvas's independent touchAction:none still fully protects active pen strokes without the global lock.

### DW-7: Add a CI workflow wiring `lint`/`typecheck`/`test`/`build` together on push/PR

origin: migrated from legacy ledger (source_spec: spec-1-1-installable-app-shell-first-run-pen-check.md), 2026-09-10
location: n/a (repo-wide CI workflow, none exists yet)
reason: Epic context explicitly left CI gates undecided ("decide at story/build time"); none of the new npm scripts are enforced automatically today.
status: done 2026-09-10
resolution: resolved by sweep bundle dw-ci-workflow-lint-typecheck-test
resolution-undo: 5f52b9d119fdc1d1bc946bd8f5f9bd324eea59289951a888481e3577312256ac 2026-09-10 7374617475733a206f70656e

### DW-8: Reconcile pinned-TypeScript-version docs with `package.json`'s actual pins

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check (2026-09-04)"), 2026-09-10
location: ARCHITECTURE-SPINE.md, epics.md, epic-1-context.md vs package.json
reason: Docs say "TypeScript 6.0.3" everywhere, but package.json pins @typescript/typescript6@6.0.2 for tooling plus a separate @typescript/native@7.0.2 for the real compiler, a byproduct of parallel TS7/ESLint dependency-version work outside story 1.1's own commits.
status: done 2026-09-10
resolution: resolved by sweep bundle dw-stale-docs-reconciliation
resolution-undo: 8f2d5b2ff4282a213f91aacc0c7abf0f4e86addfd7292a0c8596048b0b4bc026 2026-09-10 7374617475733a206f70656e

### DW-9: Fix epic-1-context.md's self-contradictory "resolve as a typed Result/rejected Promise" phrasing

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check (2026-09-04)"), 2026-09-10
location: epic-1-context.md:51
reason: Reads as if a Result could also be a rejected Promise; the shipped IdbSettingsRepository never rejects, only resolves a Result.
status: done 2026-09-10
resolution: resolved by sweep bundle dw-stale-docs-reconciliation
resolution-undo: 8f2d5b2ff4282a213f91aacc0c7abf0f4e86addfd7292a0c8596048b0b4bc026 2026-09-10 7374617475733a206f70656e

### DW-10: Consolidate ARCHITECTURE-SPINE.md AD-8's two stacked amendment notes into one

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check (2026-09-04)"), 2026-09-10
location: ARCHITECTURE-SPINE.md:113 (AD-8)
severity: low
reason: Two separate "(Amended 2026-09-03: ...)" notes sit back-to-back on the same sentence (hosting provider, then domain suffix).
status: done 2026-09-10
resolution: resolved by sweep bundle dw-stale-docs-reconciliation
resolution-undo: 8f2d5b2ff4282a213f91aacc0c7abf0f4e86addfd7292a0c8596048b0b4bc026 2026-09-10 7374617475733a206f70656e

### DW-11: Add a fixture/RuleTester test proving the adapter-boundary ESLint rule (AD-1) actually blocks a cross-adapter import

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check (2026-09-04)"), 2026-09-10
location: eslint.config.js (import-x/no-restricted-paths zones, AD-1)
reason: The boundary is currently empty (no adapter cross-imports exist yet), so a regression (e.g. a dropped /** suffix) would ship silently until a later story adds real adapter code to violate it.
status: done 2026-09-10
resolution: resolved by sweep bundle dw-eslint-domain-boundary-hardening
resolution-undo: 92603a66961f14c53a556104414a60e314360ddded151059d0a27a0c119e1ef5 2026-09-10 7374617475733a206f70656e

### DW-12: The pressure-check's 0.5-ambiguity heuristic has an inherent false-negative edge case

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check, re-review (2026-09-04)"), 2026-09-10
location: FirstRun.svelte:50
reason: A real pressure sensor whose reading lands on exactly 0.5 for an entire contact would be misread as "no pressure input detected," the inverse of the false-positive the heuristic fixes; no further signal is available from PointerEvent.pressure alone to disambiguate without a different API (e.g. a device-capabilities check). Unowned — no story or milestone currently schedules this.
status: done 2026-09-10
resolution: closed by human decision: Add a code comment/spec note that this is an accepted PointerEvent.pressure API limitation, not a bug to fix.
decision: 2026-09-10 Accept as a documented, permanent limitation — Add a code comment/spec note that this is an accepted PointerEvent.pressure API limitation, not a bug to fix.

### DW-13: The ≥48dp tap-target requirement has no test coverage anywhere in the suite

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check, re-review (2026-09-04)"), 2026-09-10
location: FirstRun.test.ts, ScopePicker.test.ts
reason: happy-dom can't resolve CSS min-height via getComputedStyle, so both suites substitute a "renders as a real button" check instead; a regression shrinking a button below 48dp would pass just check undetected. Would need a real-browser/Playwright-style check to close; the CI-workflow item (DW-7) is the natural place to add it, but nothing currently forces that pairing.
status: open
decision: 2026-09-10 Keep open, unowned

### DW-14: `pointerleave` is wired to `handlePointerEnd`, which may split one stroke into several completions when pointer capture is unavailable

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check, re-review (2026-09-04)"), 2026-09-10
location: n/a (stroke-completion pointer handling)
severity: medium
reason: Under a working setPointerCapture the browser retargets boundary events so leave shouldn't fire mid-stroke, but setPointerCapture failures are swallowed in a bare catch and happy-dom never dispatches pointerleave, so no test covers it either way; medium severity if confirmed since an extra completion enables grading on a partial stroke.
status: done 2026-09-10
resolution: already resolved: canvas-ink-surface.ts mount() wires pointerleave to handlePointerCancel (discards in-progress stroke), not handlePointerEnd, unchanged since the file's initial commit 12a26e7; covered by canvas-ink-surface.test.ts:463-485 ("discards the in-progress stroke on pointerleave instead of completing it").

### DW-15: `INK_COLORS` in `app/App.svelte` hard-codes four `theme.css` hexes with nothing guarding against drift

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check, re-review (2026-09-04)"), 2026-09-10
location: app/App.svelte (INK_COLORS)
reason: The canvas cannot read CSS custom properties, so the composition root duplicates four theme.css tokens as literals; a palette edit would desynchronize the drill canvas from the DOM with a green test suite. Closing it needs a shared token module or a test that parses theme.css.
status: open

### DW-16: The pill radiogroups have roving `tabindex` but no arrow-key handler, so a keyboard or switch user can never change the selection

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check, re-review (2026-09-04)"), 2026-09-10
location: Settings.svelte, ScopePicker.svelte:104-174
reason: role="radio" pills use tabindex 0 on the checked pill and -1 on the rest with onclick only, so only the already-selected option is reachable; now spans two screens plus the aria-disabled pills in Settings that stay focusable and click to a silent no-op.
status: open

### DW-17: The `settingsRepository.get()` chains in `App.svelte` and `Settings.svelte` have no `.catch`, so a rejection would leave the app or the screen permanently unrendered

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check, re-review (2026-09-04)"), 2026-09-10
location: App.svelte, Settings.svelte (void settingsRepository.get().then(...))
reason: App.svelte would never flip ready (blank page); Settings.svelte would never flip loaded (heading with no pills), plus an unhandled rejection in each case. Reaching it needs an adapter bug; the void ...then shape in App.svelte predates this story.
status: open

### DW-18: The `epic-1-context.md` rewrite dropped two normative requirements that later scope/idle-timeout stories depend on

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check, re-review (2026-09-04)"; re-flagged independently in "Deferred from: code review of spec-1-3-write-from-memory-drill-loop-ink-width-setting (2026-09-05)"), 2026-09-10
location: epic-1-context.md
reason: The scope "sets both the card pool and the full-scope-completion condition" is gone entirely, and the 5-minute default idle timeout (and its adjustability) survives only as an unquantified "evaluate idleness retroactively" line. Pre-existing in the working tree at baseline_commit, an agent-context artifact; restore both from planning-artifacts/epics.md before the dependent stories are specified. Confirmed still present and unresolved as of the 2026-09-05 review pass.
status: done 2026-09-10
resolution: already resolved: epic-1-context.md line 32 (as of commit 69fe8cb, 2026-09-09) restores quantified idle-timeout language ("~5 min default, adjustable"), matching epics.md FR-9 amended 2026-09-08 via Correct Course; the scope-to-card-pool/full-scope-completion wording is superseded, not dropped, by epics.md FR-2's own 2026-09-08 Correct Course amendment; session.ts, settings.ts, Settings.svelte and App.svelte already implement the amended model correctly.

### DW-19: `resetDb()` in persistence tests resolves on `onblocked`, so a blocked `deleteDatabase` can let the next test run against a stale database

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-6-per-character-miss-tally, review pass (2026-09-07)"), 2026-09-10
location: tally-repository.test.ts:218, attempt-repository.test.ts, settings-repository.test.ts
severity: low
reason: Identical req.onblocked = () => resolve() pattern across all three test files; pre-existing shared pattern, and all repository impls close connections in finally so blocked is unlikely. Fix belongs once as a shared test helper (retry/wait instead of resolve), not per story file. Unverified in practice.
status: open

### DW-20: `openTegakkoDb()` in `db.ts` has no `blocked` handler, and a `blocked` handler alone would be insufficient since open connections must also close on `versionchange`

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-6-per-character-miss-tally, review pass (2026-09-07)"), 2026-09-10
location: db.ts (openTegakkoDb / openDB, defines only upgrade())
reason: A stale IndexedDB connection held open in another tab can hang the DB_VERSION upgrade — and every persistence call — indefinitely with no error surfaced; pre-existing since the 1->2 bump, affects settings/attempts/tallies equally, so the fix belongs once in db.ts for all three stores. A blocked handler alone doesn't resolve this: open connections must also close on versionchange or the upgrade can never proceed. Low likelihood for a typically single-instance installed PWA, but severe if two tabs/windows are open simultaneously across a version bump.
status: done 2026-09-10
resolution: resolved by sweep bundle dw-indexeddb-blocked-versionchange-guard
resolution-undo: 6f5b53bc8a929767583c1678c52260d420b7d2dd2ee14479b25101ee72ecd7aa 2026-09-10 7374617475733a206f70656e

### DW-21: If `undoLastGrade`'s persistence calls fail after `handleUndo` already mutated in-memory mirrors, those mirrors stay desynced from the real store for the rest of the session

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-6-per-character-miss-tally, review pass (2026-09-07)"), 2026-09-10
location: Drill.svelte (handleUndo, undoLastGrade)
reason: handleUndo applies in-memory mutations (sessionAttempts pop, cardTallies decrement) unconditionally before awaiting undoLastGrade, matching the frozen spec's accepted matrix row (no rollback requirement) and the codebase's fire-and-forget/fail-open philosophy elsewhere — a deliberate, spec-sanctioned trade-off, but worth a fuller reconciliation strategy (e.g. a startup re-sync) if IndexedDB write failures turn out not to be as rare as assumed.
status: done 2026-09-10
resolution: closed by human decision: Frozen spec already accepts this row; no change needed unless real-world IndexedDB failure rates prove otherwise.
decision: 2026-09-10 Keep the current no-rollback behavior as the accepted trade-off — Frozen spec already accepts this row; no change needed unless real-world IndexedDB failure rates prove otherwise.

### DW-22: The post-grade toast in `Drill.svelte` uses `role="status"` to host interactive Undo/Next-character buttons

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-6-per-character-miss-tally, review pass (2026-09-07)"), 2026-09-10
location: Drill.svelte (post-grade toast)
reason: role="status" is designed for polite announcements, not for wrapping primary interactive controls; assistive tech isn't guaranteed to expose buttons inside it promptly. Focus is now moved onto Undo when the toast appears, which mitigates the immediate reachability gap, but the underlying role choice is still worth a dedicated a11y pass.
status: open

### DW-23: `Drill.svelte`'s `cardTallies` map is seeded from the `tallies` prop's `missCount` with no defensive guard against a corrupted/malformed persisted value

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-6-per-character-miss-tally, review pass (2026-09-07)"), 2026-09-10
location: Drill.svelte (cardTallies seed)
reason: domain/drill.ts's score() already guards a malformed timestamp for the same class of concern, establishing precedent for treating persisted-data corruption as worth guarding against; cardTallies's seed has no equivalent guard, so a corrupted missCount would surface as a NaN/negative toast count with no fallback.
status: open

### DW-24: `History.svelte` shows no loading affordance between mounting and `sessionRepository.list()` resolving

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-6-per-character-miss-tally, review pass (2026-09-07)"), 2026-09-10
location: History.svelte
severity: low
reason: Pre-existing gap, not introduced by this story — Settings.svelte has the identical {#if loaded}-gated pattern with no loading state; History merely inherits an already-accepted convention.
status: open

### DW-25: `ARCHITECTURE-SPINE.md`'s AD-3 rule text still states the pre-expansion 158-card catalog figures, now stale after expansion to 208 cards

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-6-per-character-miss-tally, review pass (2026-09-07)"), 2026-09-10
location: ARCHITECTURE-SPINE.md (AD-3)
severity: low
reason: AD-3 wasn't part of the dakuten/handakuten story's frozen Code Map and wasn't touched by the 2026-09-08 Correct Course architecture pass either (that pass only rewrote AD-10/AD-13); confirmed still stale via grep.
status: done 2026-09-10
resolution: resolved by sweep bundle dw-stale-docs-reconciliation
resolution-undo: 8f2d5b2ff4282a213f91aacc0c7abf0f4e86addfd7292a0c8596048b0b4bc026 2026-09-10 7374617475733a206f70656e

### DW-26: `epic-1-context.md` rewrite drops the continuous pressure-varying stroke-width requirement and the at-least-3 persisted width presets

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-11-dakuten-handakuten-catalog-expansion (2026-09-09)"), 2026-09-10
location: epic-1-context.md
reason: Old Requirements line "Stroke width must continuously vary with pressure ... at least 3 width presets, selectable and persisted" has no equivalent in the rewritten context; surviving text only notes ink-width/idle-threshold Settings toggles plus the widthPreset field. Maybe-false — needs check against epics.md/PRD source of truth. Agent-context file, deferred rather than patched. A sibling IDB-compression claim from the same review was refuted and is not carried forward.
status: done 2026-09-10
resolution: already resolved: epics.md:27 (FR-3, the project's actual source of truth, not epic-1-context.md's condensed summary) still states pressure continuously affects stroke width across the full range and >=3 selectable presets, unchanged since authoring; src/domain/ink.ts:44-56 defines WIDTH_PRESETS (Subtle/Expressive/Calligraphy) and pressureToWidth() implementing exactly this. The epic-1-context.md omission the entry flagged never propagated to the requirement or the implementation -- nothing was actually dropped from the shipped product.

### DW-27: Add keyboard roving-navigation (arrow keys) to ScopePicker.svelte's `role="radiogroup"` pill groups, including the new session-size group

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-11-dakuten-handakuten-catalog-expansion (2026-09-09)"), 2026-09-10
location: ScopePicker.svelte (script, set, and session-size radiogroup pill groups)
reason: WAI-ARIA's radiogroup pattern conventionally implies arrow-key navigation between options; none exists today. Pre-existing on the script/set groups (Story 1.2's first pass), inherited unchanged by the new session-size group per its frozen Intent (mirror existing markup exactly). Related to DW-16, which covers the same gap on Settings.svelte's pills.
status: open

### DW-28: Add `aria-live` regions to ScopePicker.svelte's live-updating text

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-11-dakuten-handakuten-catalog-expansion (2026-09-09)"), 2026-09-10
location: ScopePicker.svelte ("N cards in scope" count, shaky-count chip, "N cards this session" hint)
reason: None of these currently announce their value changes to screen-reader users when script/set/session-size pills are tapped. Pre-existing gap on the count/shaky text (Story 1.2's first pass), inherited unchanged by the new session-size hint.
status: open

### DW-29: `Drill.test.ts`'s shared `currentCard()` helper can nondeterministically resolve to the wrong `Card` when a scope contains a romaji collision

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-11-dakuten-handakuten-catalog-expansion (2026-09-09)"), 2026-09-10
location: src/adapters/ui/Drill.test.ts (currentCard helper: cards.find(c => c.romaji === romaji))
reason: Assumes unique romaji per scope, no longer true since the dakuten/handakuten expansion introduced two genuine collisions (じ/ぢ both romanize "ji", ず/づ both romanize "zu"). The UI intentionally never displays the grapheme itself, so the helper can't disambiguate from the DOM alone; fixing this needs a test-only cardId attribute or seeded attempts/RNG, a test-infra design decision rather than a quick patch. Reproduced twice in back-to-back just check runs (miss tally, then attempt recording, both HIRAGANA_BASE_SCOPE); collision frequency is unchanged by the sampling rework, not a regression it introduced.
status: open

### DW-30: `spec-1-10-session-history-view.md` still describes the History chip copy as "Whole scope," now contradicted by the rename to "Session complete"

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-7-8-9-session-sampling-rework (2026-09-09)"), 2026-09-10
location: _bmad-output/implementation-artifacts/spec-1-10-session-history-view.md (behavior row, code map, acceptance criteria)
severity: low
reason: domain/history.ts's own docstring was updated inline with the 2026-09-09 rename, so only the old spec file itself is stale; matches this repo's existing precedent (e.g. DW-25) of logging a later story's staleness on an earlier done spec rather than editing it.
status: open

### DW-31: `Drill.svelte` reads `queue[0]!`/`queue[queueIndex]!` via non-null assertions with no fallback UI if `sampleSessionCards` throws

origin: migrated from legacy ledger ("Deferred from: code review of spec-1-7-8-9-session-sampling-rework (2026-09-09)"), 2026-09-10
location: Drill.svelte (queue[0]!, queue[queueIndex]!)
reason: An empty scope somehow reaching Drill would propagate an uncaught throw out of component initialization. Verified unchanged from before this rework — the prior code would propagate an identical empty-scope throw the same way; the Scope picker's own pill groups are the only guard today (always leave at least one script and one unit active), same as before.
status: open

### DW-32: deferred-work.md's DW-1/DW-11 resolution field references bundle id "dw-eslint-domain-boundary-hardening", which matches no file on disk.
origin: spec-deferred 2a957debac07
location: _bmad-output/implementation-artifacts/deferred-work.md (DW-1, DW-11 entries)
source_spec: `spec-dw-1-11-eslint-domain-boundary-hardening.md`
severity: low
reason: The actual spec file is spec-dw-1-11-eslint-domain-boundary-hardening.md; grepping the bundle id finds nothing, breaking ledger-to-spec traceability. deferred-work.md is the orchestrator's own ledger bookkeeping, written before this review pass started -- out of scope for this build to modify.
status: open

### DW-33: deferred-work.md's new resolution-undo field has no legend explaining its hex-encoded previous-value format.
origin: spec-deferred 5941b9f74581
location: _bmad-output/implementation-artifacts/deferred-work.md (DW-1, DW-11 entries)
source_spec: `spec-dw-1-11-eslint-domain-boundary-hardening.md`
severity: low
reason: A human editing the ledger by hand would need to reverse-engineer that the trailing hex blob decodes to the prior "status:" line. Same out-of-scope reasoning as above: orchestrator-owned ledger.
status: open

### DW-34: The new CI workflow runs lint/typecheck/test/build on every push/PR but nothing marks those checks as required in GitHub branch protection, so a red run still would not block a merge.
origin: spec-deferred 8489dd938d83
location: .github/workflows/ci.yml (branch-protection settings live outside the repo)
source_spec: `spec-dw-7-ci-workflow-lint-typecheck-test.md`
severity: medium
reason: Verified: no branch-protection configuration exists anywhere in this repository (confirmed by inspecting the diff and repo state — nothing beyond the new .github/workflows/ci.yml touches GitHub settings). Two reviewers converged on this independently (blind-hunter and the intent-alignment auditor's "Reading C"). Not resolvable from a code diff alone: GitHub's required-status-check API needs the check to have run at least once on the default branch before it can be marked required, and configuring branch protection is a shared/admin-level repository setting an unattended code-only pass should not change. Revisit once this workflow has run on main at least once.
status: open

### DW-35: The same stale "resolve as a typed Result/rejected Promise" phrasing DW-9 fixed in epic-1-context.md also stands unfixed in ARCHITECTURE-SPINE.md and epics.md.
origin: spec-deferred 80c245f8ecfc
location: ARCHITECTURE-SPINE.md:161, epics.md:86, epics.md:369
source_spec: `spec-dw-8-9-10-25-stale-docs-reconciliation.md`
severity: low
reason: Confirmed present via grep: ARCHITECTURE-SPINE.md:161 ("Persistence-adapter failures resolve as a typed `Result`/rejected `Promise`, never a raw thrown `DOMException`..."), epics.md:86 ("Persistence-adapter failures must resolve as a typed `Result`/rejected `Promise`..."), epics.md:369 ("it resolves as a rejected `Promise`/typed `Result`..."). Same underlying defect as DW-9: the shipped persistence adapters (e.g. IdbSettingsRepository) only ever resolve a Result, never reject. Out of this bundle's scope because intent.md's DW-9 ledger entry names only epic-1-context.md:51 as the location.
status: open

### DW-36: deferred-work.md still lists DW-2 and DW-20 as status: open even though this bundle's changes resolve them.
origin: spec-deferred d3a3aeb7e85f
location: _bmad-output/implementation-artifacts/deferred-work.md (DW-2, DW-20 entries)
source_spec: `spec-dw-2-20-indexeddb-blocked-versionchange-guard.md`
severity: low
reason: This diff never touches deferred-work.md; the invocation's own instructions explicitly forbid editing the deferred-work ledger from within this build ("Do NOT edit the deferred-work ledger; the orchestrator records resolution"), so updating DW-2/DW-20's status is the orchestrator's responsibility, not this build's.
status: open

### DW-37: resetDb()'s indexedDB.deleteDatabase(...).onblocked resolves as success instead of surfacing the block, so a connection leaked by an earlier failing test silently "succeeds" at reset without actually
origin: spec-deferred 05b0dcb153fc
location: src/adapters/persistence/db.test.ts:6-13 (same pattern in tally-repository.test.ts:8-15, session-repository.test.ts, attempt-repository.test.ts, settings-repository.test.ts)
source_spec: `spec-dw-2-20-indexeddb-blocked-versionchange-guard.md`
severity: medium
reason: This is the exact same pre-existing pattern already used verbatim by tally-repository.test.ts's resetDb() helper (onblocked => resolve()), copied into the new db.test.ts per the spec's own Code Map instruction to follow that file's structure; the new tests in db.test.ts are more likely than most to exercise this weakness since they deliberately hold connections open mid-test to test the blocked/blocking handshake itself.
status: open
