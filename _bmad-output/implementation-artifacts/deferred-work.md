- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-installable-app-shell-first-run-pen-check.md`
  summary: Extend the import-boundary ESLint rule so `domain/` and `ports/` can never import from `adapters/`/`app/`, not just adapter-to-adapter.
  evidence: Current `import/no-restricted-paths` zones only cover sibling-adapter imports outside `app/`; the domain-purity half of AD-1 is enforced only by convention/comments today.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-installable-app-shell-first-run-pen-check.md`
  summary: Add `blocked`/`blocking` handlers to `openSettingsDb()` before any future story bumps `DB_VERSION`.
  evidence: With a fixed version 1 this can't fire yet, but once a schema migration happens a stale tab holding an old connection could hang `get()`/`save()` indefinitely with no fallback UI.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-installable-app-shell-first-run-pen-check.md`
  summary: Add `runtimeCaching` for `fonts.googleapis.com`/`fonts.gstatic.com` in the VitePWA workbox config.
  evidence: Google Fonts load from `index.html` but aren't precached, so first-load typography (though not the app shell itself) depends on network even after install.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-installable-app-shell-first-run-pen-check.md`
  summary: Add `id` and `lang` fields to `public/manifest.webmanifest`.
  evidence: Recommended so the installed app's identity survives future `start_url` changes; missing today, low priority.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-installable-app-shell-first-run-pen-check.md`
  summary: Consider a keyboard alternative and an `aria-live` region for the First Run pen-status chip and the dismiss/install error note, beyond the epic's stated accessibility floor.
  evidence: The pen-check `.pad` suppresses an a11y lint warning with no ARIA/live-region feedback, and the `dismissError` note added by the review's error-handling patches has the same gap; the epic's accessibility floor (tap targets, no color-only signaling, WCAG AA contrast) doesn't explicitly require this, but it's a real screen-reader gap.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-installable-app-shell-first-run-pen-check.md`
  summary: Revisit `user-scalable=no` in `index.html`'s viewport meta as a deliberate product decision, not an inherited PoC default.
  evidence: Disables pinch-zoom (WCAG 1.4.4 tension); defensible for active pen-drawing surfaces but Story 1.1's `.pad` is only a diagnostic touch target, not real strokes yet, and this setting is app-wide (set once, applies to every future screen).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-installable-app-shell-first-run-pen-check.md`
  summary: Add a CI workflow wiring `lint`/`typecheck`/`test`/`build` together on push/PR.
  evidence: Epic context explicitly left CI gates undecided ("decide at story/build time"); none of the new npm scripts are enforced automatically today.

## Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check (2026-09-04)

- summary: Reconcile pinned-TypeScript-version docs with `package.json`'s actual pins.
  evidence: ARCHITECTURE-SPINE.md, epics.md, epic-1-context.md, and the story spec's own Code Map all say "TypeScript 6.0.3," but `package.json` pins `@typescript/typescript6@6.0.2` for tooling plus a separate `@typescript/native@7.0.2` for the real compiler — a byproduct of the parallel TS7/ESLint dependency-version work (commits 8faafe4/bbaab96/d7511a3) outside story 1.1's own commits.

- summary: Fix epic-1-context.md's self-contradictory "resolve as a typed Result/rejected Promise" phrasing.
  evidence: `epic-1-context.md:51` reads as if a `Result` could also be a rejected `Promise`; the shipped `IdbSettingsRepository` never rejects, only resolves a `Result`.

- summary: Consolidate ARCHITECTURE-SPINE.md AD-8's two stacked amendment notes into one.
  evidence: `ARCHITECTURE-SPINE.md:113` has two separate "(Amended 2026-09-03: ...)" notes back-to-back on the same sentence (hosting provider, then domain suffix).

- summary: Add a fixture/RuleTester test proving the adapter-boundary ESLint rule (AD-1) actually blocks a cross-adapter import.
  evidence: `eslint.config.js`'s `import-x/no-restricted-paths` zones are unverified by any rule-level test; the boundary is currently empty (no adapter cross-imports exist yet), so a regression (e.g. a dropped `/**` suffix) would ship silently until Story 1.2+ adds real adapter code to violate it.

## Deferred from: code review of spec-1-1-installable-app-shell-first-run-pen-check, re-review (2026-09-04)

- summary: The pressure-check's 0.5-ambiguity heuristic has an inherent false-negative edge case.
  evidence: A real pressure sensor whose reading happens to land on exactly 0.5 for an entire contact (`FirstRun.svelte:50`) would be misread as "no pressure input detected" -- the inverse of the false-positive the heuristic was written to fix. No further signal is available from `PointerEvent.pressure` alone to disambiguate a genuine 0.5 from the W3C no-pressure-API default; would need a different API (e.g. a device-capabilities check) to close fully.
  status: unowned -- no story or milestone currently schedules this; needs a deliberate call at the next sprint-planning pass rather than sitting here indefinitely.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-kana-catalog-scope-picker.md`
  summary: The ≥48dp tap-target requirement has no test coverage anywhere in the suite.
  evidence: `happy-dom` can't resolve CSS `min-height` via `getComputedStyle`, so neither `FirstRun.test.ts` (Story 1.1, 88px buttons) nor `ScopePicker.test.ts` (Story 1.2, 56px pills / 88px "Start writing") can assert real tap-target size -- both substitute a "renders as a real `<button>`" check instead. A regression that shrinks a button below 48dp would pass `just check` undetected; would need a real-browser/Playwright-style check to close.
  status: unowned -- no story schedules this; the CI-workflow item above (this file, spec-1-1 section) is the natural place to add a real-browser test job once that workflow exists, but nothing currently forces that pairing to happen.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-write-from-memory-drill-loop-ink-width-setting.md`
  summary: `pointerleave` is wired to `handlePointerEnd`, which may split one stroke into several completions when pointer capture is unavailable.
  evidence: Under a working `setPointerCapture` the browser retargets boundary events, so the leave should not fire mid-stroke -- but `setPointerCapture` failures are swallowed in a bare `catch`, and happy-dom never dispatches `pointerleave` on its own, so no test covers it either way. Would be settled by writing a stroke that exits the cell on the target tablet and checking whether `onStrokeComplete` fires more than once; medium severity if confirmed, since an extra completion enables grading on a partial stroke.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-write-from-memory-drill-loop-ink-width-setting.md`
  summary: `INK_COLORS` in `app/App.svelte` hard-codes four `theme.css` hexes with nothing guarding against drift.
  evidence: The canvas cannot read CSS custom properties, so the composition root duplicates `--color-ink`, `--color-grid-guide`, `--color-positive-bg` and `--color-surface-canvas` as literals (values currently match `theme.css`). A palette edit desynchronizes the drill canvas from the DOM with a green suite -- `canvas-ink-surface.test.ts` injects its own colors, and `App.test.ts` only counts canvases. Closing it needs a shared token module consumed by both, or a test that parses `theme.css`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-write-from-memory-drill-loop-ink-width-setting.md`
  summary: The pill radiogroups have roving `tabindex` but no arrow-key handler, so a keyboard or switch user can never change the selection.
  evidence: `Settings.svelte` (Story 1.3) reuses the pattern shipped in `ScopePicker.svelte:104-174` (Story 1.2): `role="radio"` with `tabindex` 0 on the checked pill and -1 on the rest, `onclick` only. Only the already-selected option is reachable. Pre-existing, and it now spans two screens -- the fix belongs across both controls at once, plus the `aria-disabled` pills in Settings that stay focusable and click to a silent no-op.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-write-from-memory-drill-loop-ink-width-setting.md`
  summary: The `settingsRepository.get()` chains in `App.svelte` and `Settings.svelte` have no `.catch`, so a rejection would leave the app or the screen permanently unrendered.
  evidence: Both use `void settingsRepository.get().then(...)`. `App.svelte` would never flip `ready`, rendering a blank page; `Settings.svelte` would never flip `loaded`, showing a heading with no pills -- plus an unhandled rejection in each case. Reaching it needs an adapter bug: `settings-repository.persist-failure.test.ts` proves `IdbSettingsRepository` converts both `get()` and `save()` failures into typed `Result`s. The `void ... .then` shape in `App.svelte` predates this story.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-write-from-memory-drill-loop-ink-width-setting.md`
  summary: The `epic-1-context.md` rewrite dropped two normative requirements that Stories 1.7 and 1.9 depend on.
  evidence: The scope "sets both the card pool and the full-scope-completion condition" is gone entirely, and the 5-minute default idle timeout (and its adjustability) survives only as an unquantified "evaluate idleness retroactively" line. The file was already modified in the working tree at this story's `baseline_commit`, so the loss is not this change's doing; it is also an agent-context artifact. Restore both from `planning-artifacts/epics.md` before Story 1.7 or 1.9 is specified.

## Deferred from: code review of spec-1-3-write-from-memory-drill-loop-ink-width-setting (2026-09-05)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-write-from-memory-drill-loop-ink-width-setting.md`
  summary: `epic-1-context.md`'s rewrite drops the scope/full-scope-completion link and the quantified 5-minute idle default (same item already tracked above; re-flagged independently in this review pass).
  evidence: Confirmed still present and unresolved as of this diff. Pre-existing at `baseline_commit`, not caused by this change; fix requires editing an agent-context file, so it stays deferred here as well rather than being patched.

## Deferred from: code review of spec-1-6-per-character-miss-tally (2026-09-07)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-per-character-miss-tally.md`
  summary: `openTegakkoDb()` in `db.ts` has no `blocked` handler, so a stale IndexedDB connection held open in another tab can hang the `DB_VERSION` upgrade -- and every persistence call -- indefinitely with no error surfaced.
  evidence: `db.ts`'s `openDB()` call defines only `upgrade()`, not `blocked()`. Pre-existing since the 1->2 bump (Story 1.5), not introduced by Story 1.6's 2->3 bump; affects `settings`/`attempts`/`tallies` equally, so the fix belongs once in `db.ts` for all three stores, not in a single story's diff. Low likelihood for a typically single-instance installed PWA, but the consequence (an indefinite, silent hang) is severe if two tabs/windows are ever open simultaneously across a version bump.
