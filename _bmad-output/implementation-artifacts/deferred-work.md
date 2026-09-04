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
  summary: Consider a keyboard alternative and an `aria-live` region for the First Run pen-status chip, beyond the epic's stated accessibility floor.
  evidence: The pen-check `.pad` suppresses an a11y lint warning with no ARIA/live-region feedback; the epic's accessibility floor (tap targets, no color-only signaling, WCAG AA contrast) doesn't explicitly require this, but it's a real screen-reader gap.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-installable-app-shell-first-run-pen-check.md`
  summary: Revisit `user-scalable=no` in `index.html`'s viewport meta as a deliberate product decision, not an inherited PoC default.
  evidence: Disables pinch-zoom (WCAG 1.4.4 tension); defensible for active pen-drawing surfaces but Story 1.1's `.pad` is only a diagnostic touch target, not real strokes yet, and this setting is app-wide (set once, applies to every future screen).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-installable-app-shell-first-run-pen-check.md`
  summary: Add a CI workflow wiring `lint`/`typecheck`/`test`/`build` together on push/PR.
  evidence: Epic context explicitly left CI gates undecided ("decide at story/build time"); none of the new npm scripts are enforced automatically today.
