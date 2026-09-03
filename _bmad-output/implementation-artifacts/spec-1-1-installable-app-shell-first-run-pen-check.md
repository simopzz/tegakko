---
title: 'Installable App Shell & First-Run Pen Check'
type: 'feature'
created: '2026-09-03'
status: 'done'
baseline_commit: '53e5743ab3ef01dad10cc06c2fa8a37f84564130'
review_loop_iteration: 0
context: [
  '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md',
  '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-jplearn-2026-09-02/DESIGN.md',
  '{project-root}/poc-web/index.html',
]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No build tooling exists yet. tegakko needs a real, installable app shell before any drill content can be built on top of it — including a first-run screen that proves the stylus works before the learner commits to using the app.

**Approach:** Scaffold a Vite + Svelte 5 + TypeScript-strict project with the hexagonal `domain/ports/adapters/app` skeleton, a PWA manifest + service worker, a `Justfile`, and a First Run screen that live-reads pen pressure via Pointer Events and gates on `settings.penCheckShown`.

## Boundaries & Constraints

**Always:** TypeScript strict + `@typescript-eslint/no-explicit-any` as an error; an import-boundary lint rule blocking `adapters/x` → `adapters/y` outside `app/`; grid/ink stay conceptually separable but this story only needs a plain `pointermove` listener (no `InkSurface`/canvas — that's Story 1.3); `SettingsRepository` is the only port needed (`get()/save()`, IndexedDB-backed via `idb`, singleton record); First Run never hard-blocks — both "Install" and "Just use it here" stay available regardless of pen-check outcome; DESIGN.md tokens only (warm palette, one terracotta accent, no red/gradient).

**Ask First:** Pushing the initial scaffold to the `origin` GitHub remote; connecting the repo to Cloudflare Pages (dashboard/account action, do not attempt via `wrangler` non-interactively).

**Never:** No `CardRepository`, `AttemptRepository`, `TallyRepository`, or any drill/canvas code — out of scope for this story. No router library. No service-worker update-available prompt (silent `autoUpdate`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First open, no settings | IndexedDB empty | First Run screen renders (not any other screen) | N/A |
| Pen contacts screen | `pointerType: 'pen'`, pressure > 0 | "Stylus found" chip (positive) + live 0–1 pressure readout | N/A |
| No pressure input | Only mouse/touch events, or pen with no pressure API | Chip reads "no pressure input detected," readout hidden, Install + "Just use it here" both still shown | N/A |
| Dismiss first-run | Tap "Just use it here" | `settings.penCheckShown = true` saved; reopening app never shows First Run again | Persist failure surfaces via typed `Result`, not a thrown `DOMException` |
| Offline reopen after install | No network | App loads and renders from cache (service worker) | N/A |

</frozen-after-approval>

## Code Map

- `package.json` -- pin Vite 8.2.2, Svelte 5.57.0, `@sveltejs/vite-plugin-svelte` 7.3.0, `vite-plugin-pwa` 1.3.0, `idb` 8.0.3, TypeScript 7.0.2 (strict), ESLint + `typescript-eslint` + `eslint-plugin-import`
- `vite.config.ts` -- `@sveltejs/vite-plugin-svelte` + `VitePWA({ registerType: 'autoUpdate', manifest: false })` (manifest served statically, see below)
- `tsconfig.json` -- `strict: true`
- `eslint.config.js` -- `no-explicit-any: 'error'`; `import/no-restricted-paths` zones enforcing no `adapters/x` → `adapters/y` outside `app/`
- `public/manifest.webmanifest` -- name "tegakko", `display: standalone`, icons, `start_url`
- `index.html` -- links the manifest, mounts `app/main.ts`
- `Justfile` -- `dev`, `build`, `lint`, `typecheck`, `deploy` (deploy → `wrangler pages deploy dist --project-name=tegakko`)
- `src/ports/settings-repository.ts` -- `SettingsRepository { get(): Promise<Result<Settings>>; save(s: Settings): Promise<Result<void>> }`
- `src/adapters/persistence/settings-repository.ts` -- `idb`-backed impl; singleton record `{ widthPreset, idleTimeoutMs, penCheckShown }` (only `penCheckShown` meaningfully used this story; others get sane defaults)
- `src/adapters/ui/screens.ts` -- canonical `Screen` union type: `'pen-check'|'scope-picker'|'drill'|'summary'|'history'|'settings'` (only `'pen-check'` renders this story)
- `src/adapters/ui/FirstRun.svelte` -- pen-check UI: own `pointermove` listener (reference `poc-web/index.html`'s `normalizedPressure`/pointer handling), chip + readout, Install button (`beforeinstallprompt`), "Just use it here" button
- `src/app/App.svelte`, `src/app/main.ts` -- composition root: wires the persistence adapter, reads `penCheckShown` on boot to decide whether to show `FirstRun`

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js` -- scaffold build tooling -- establishes the pinned, strict, boundary-enforced foundation every later story builds on
- [x] `src/{domain,ports,adapters/{persistence,content,ink,ui,io},app}` -- create Structural Seed directories -- matches architecture's hexagonal layering
- [x] `src/ports/settings-repository.ts` + `src/adapters/persistence/settings-repository.ts` -- Settings port + IndexedDB adapter -- persists `penCheckShown` losslessly
- [x] `public/manifest.webmanifest`, `vite.config.ts` PWA config -- installability + offline shell -- satisfies install + offline ACs
- [x] `src/adapters/ui/FirstRun.svelte`, `src/adapters/ui/screens.ts`, `src/app/App.svelte`, `src/app/main.ts` -- first-run flow -- gates on `penCheckShown`, never hard-blocks
- [x] `Justfile` -- dev/build/lint/typecheck/deploy recipes -- matches architecture's tooling contract
- [x] Unit test for `SettingsRepository` adapter covering the offline/persist-failure edge case in the I/O matrix

**Acceptance Criteria:**
- Given the project has no existing build tooling, when the scaffold is created, then `lint` and `typecheck` both pass with zero errors
- Given a fresh install with no prior settings, when the app opens, then First Run renders before any other screen
- Given the First Run screen and a pen touches the display, when contact is sustained, then the pressure readout updates continuously with contact (not just on first touch)
- Given the app is already installed, when it reopens, then First Run is skipped regardless of `penCheckShown`'s prior value being set via "Just use it here" or via install

## Spec Change Log

## Design Notes

`eslint-plugin-import`'s `no-restricted-paths` needs one zone per adapter directory (a same-pattern `target`/`from` won't exclude same-dir imports):

```js
zones: ['content','ink','persistence','ui','io'].map(name => ({
  target: `./src/adapters/${name}`,
  from: `./src/adapters/!(${name})`,
}))
```

`beforeinstallprompt` fires only on Chromium; Safari/Firefox tablets simply never show the Install button — that's acceptable per the epic's Chromium-based-tablet scope, not a bug to work around.

## Verification

**Commands:**
- `just lint` -- expected: zero errors
- `just typecheck` -- expected: zero errors
- `just build` -- expected: succeeds, produces `dist/`

**Manual checks (if no CLI):**
- Open the built app on a Chromium Android tablet with a stylus: confirm pressure readout tracks live contact, install banner appears, and offline reload after install still renders

## Suggested Review Order

**App shell & screen routing**

- Entry point: decides First Run vs. the rest of the app on every boot
  [`App.svelte:18`](../../src/app/App.svelte#L18)

- Settings read on mount; a failed read falls back to showing First Run rather than skipping it
  [`App.svelte:14`](../../src/app/App.svelte#L14)

- Composition root: the only file allowed to import concrete adapters
  [`main.ts:12`](../../src/app/main.ts#L12)

- Canonical `Screen` union owned here, per AD-12 -- only `'pen-check'` renders this story
  [`screens.ts:5`](../../src/adapters/ui/screens.ts#L5)

**First-run pen-check flow**

- Pointer state machine driving the chip/readout -- a zero-pressure pen event waits for `pointerup` before concluding "no pressure API," rather than deciding on the first move
  [`FirstRun.svelte:43`](../../src/adapters/ui/FirstRun.svelte#L43)

- Persist-and-dismiss, including the review fix: a save failure now stays on screen with a visible note instead of unmounting in the same tick
  [`FirstRun.svelte:66`](../../src/adapters/ui/FirstRun.svelte#L66)

- `beforeinstallprompt` deferred-prompt flow (Chromium-only by design, per epic scope)
  [`FirstRun.svelte:93`](../../src/adapters/ui/FirstRun.svelte#L93)

**Settings persistence adapter**

- `get()`/`save()`: IndexedDB via `idb`, wrapped in `Result` so no `DOMException` ever crosses the port boundary
  [`settings-repository.ts:41`](../../src/adapters/persistence/settings-repository.ts#L41)

- Failure-to-`Error` mapping that keeps the port boundary's typed-`Result` guarantee
  [`settings-repository.ts:29`](../../src/adapters/persistence/settings-repository.ts#L29)

**Domain types**

- `Result<T>` discriminated union -- the shape every adapter failure resolves to
  [`result.ts:7`](../../src/domain/result.ts#L7)

- `Settings` shape and its defaults; only `penCheckShown` is load-bearing this story
  [`settings.ts:10`](../../src/domain/settings.ts#L10)

**Architecture boundary enforcement (ESLint)**

- Adapter-to-adapter import boundary (AD-1) -- one zone per adapter directory, `/**` suffix required or the check silently no-ops
  [`eslint.config.js:12`](../../eslint.config.js#L12)

- Why `.svelte` files can't use a plain `extends` for parity with `.ts` strictness (it would clobber the Svelte parser) -- rules are merged in by hand instead
  [`eslint.config.js:28`](../../eslint.config.js#L28)

**PWA shell**

- Manifest linked statically rather than plugin-generated, so it matches the architecture's stated directory shape
  [`vite.config.ts:8`](../../vite.config.ts#L8)

- Installability metadata: standalone display, three icon sizes including one maskable
  [`manifest.webmanifest:1`](../../public/manifest.webmanifest#L1)

**Tests**

- Pressure readout updates across multiple `pointermove` events, and chip-state transitions
  [`FirstRun.test.ts:1`](../../src/adapters/ui/FirstRun.test.ts#L1)

- First-Run-vs-placeholder gating, driven by a stubbed `SettingsRepository`
  [`App.test.ts:1`](../../src/app/App.test.ts#L1)

- Persistence round-trip and the persist-failure edge case (I/O matrix)
  [`settings-repository.test.ts:1`](../../src/adapters/persistence/settings-repository.test.ts#L1)

**Peripherals**

- `Justfile`, `.npmrc`, and `tsconfig.json` -- the pinned-version, strict-mode tooling contract
  [`Justfile:1`](../../Justfile#L1)

- TypeScript 7/6 side-by-side shim needed until `typescript-eslint`/`svelte-check` support TS7
  [`link-ts6-for-eslint.sh:1`](../../scripts/link-ts6-for-eslint.sh#L1)

