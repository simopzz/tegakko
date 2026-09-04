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

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-kana-catalog-scope-picker.md`
  summary: The ≥48dp tap-target requirement has no test coverage anywhere in the suite.
  evidence: `happy-dom` can't resolve CSS `min-height` via `getComputedStyle`, so neither `FirstRun.test.ts` (Story 1.1, 88px buttons) nor `ScopePicker.test.ts` (Story 1.2, 56px pills / 88px "Start writing") can assert real tap-target size -- both substitute a "renders as a real `<button>`" check instead. A regression that shrinks a button below 48dp would pass `just check` undetected; would need a real-browser/Playwright-style check to close.
