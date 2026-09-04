---
title: 'Installable App Shell & First-Run Pen Check'
type: 'feature'
created: '2026-09-03'
status: 'done'
baseline_commit: '53e5743ab3ef01dad10cc06c2fa8a37f84564130'
review_loop_iteration: 0
context: [
  '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md',
  '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-tegakko-2026-09-02/DESIGN.md',
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

- `package.json` -- pin Vite 8.2.2, Svelte 5.57.0, `@sveltejs/vite-plugin-svelte` 7.3.0, `vite-plugin-pwa` 1.3.0, `idb` 8.0.3, TypeScript 6.0.3 (strict), ESLint + `typescript-eslint` + `eslint-plugin-import`
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

### Review Findings

**Patch:**
- [x] [Review][Patch] Pen-pressure check accepts a UA-defaulted 0.5 reading as proof of a real pressure sensor — Per the W3C Pointer Events spec, hardware that does not support pressure reports `pressure: 0.5` while a pen is in active contact (0 otherwise). `evaluatePointer` ([`FirstRun.svelte:43`](../../src/adapters/ui/FirstRun.svelte#L43)) treated any `pressure > 0` as "Stylus found," so a non-pressure-sensitive pen — exactly the device class the I/O matrix's "No pressure input" row exists to catch — passed the check and showed a fabricated "0.50" readout. Fixed: any reading other than exactly 0.5 confirms immediately (no added latency for real sensors); a reading stuck at exactly 0.5 never confirms on its own and waits for a differing sample, so a UA-defaulted stylus correctly falls through to "no pressure input detected" on liftoff. [src/adapters/ui/FirstRun.svelte:47]
- [x] [Review][Patch] Install flow has no error handling if `prompt()`/`userChoice` rejects — `deferredInstallPrompt` is nulled before the await, so a rejection leaves the Install button silently gone with an unhandled promise rejection and no recovery message, unlike the parallel `persistPenCheckShown` failure path which does surface one [src/adapters/ui/FirstRun.svelte:93]
- [x] [Review][Patch] Install-triggered persistence path (AC: "...via install") has no test coverage — no test exercises `beforeinstallprompt`/`handleInstall`/accepted `userChoice` [src/adapters/ui/FirstRun.svelte:93]
- [x] [Review][Patch] App.svelte's documented failed-settings-read fallback to First Run has no test coverage — both `App.test.ts` cases only ever resolve `get()` with `ok(...)` [src/app/App.svelte:14]
- [x] [Review][Patch] No-pressure pointerup-driven transition has no test coverage — no test ever dispatches `pointerup`/`pointercancel` [src/adapters/ui/FirstRun.svelte:60]
- [x] [Review][Patch] Settings-read failure during dismiss silently falls back to `DEFAULT_SETTINGS` instead of surfacing an error like the save-failure path does — harmless today (no other field is ever written yet) but will silently clobber a real preference once Story 1.3 adds a configurable `widthPreset` [src/adapters/ui/FirstRun.svelte:74]
- [x] [Review][Patch] `gen-icons.py` isn't wired into `Justfile`/`package.json` — committed icons are current, but there's no scripted way to regenerate them if `DESIGN.md`'s accent color changes [scripts/gen-icons.py]

**Deferred:**
- [x] [Review][Defer] Pinned-TypeScript-version docs contradict `package.json`'s actual pins — ARCHITECTURE-SPINE.md, epics.md, epic-1-context.md, and this spec's own Code Map all say "TypeScript 6.0.3," but `package.json` pins `@typescript/typescript6@6.0.2` for tooling plus a separate `@typescript/native@7.0.2` for the real compiler [package.json] — deferred: caused by the parallel TS7/ESLint dependency-version work (commits 8faafe4/bbaab96/d7511a3) outside story 1.1's own commits; reconcile docs once that work settles
- [x] [Review][Defer] epic-1-context.md's "resolve as a typed Result/rejected Promise" phrasing is self-contradictory and doesn't match the implementation, which never rejects [_bmad-output/implementation-artifacts/epic-1-context.md:51] — deferred: doc-only clarity issue, fix touches an architecture-context doc rather than story code
- [x] [Review][Defer] ARCHITECTURE-SPINE.md's AD-8 has two separate amendment notes stacked on one sentence [_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md:113] — deferred: cosmetic doc formatting, fix touches architecture doc rather than story code
- [x] [Review][Defer] Adapter-boundary ESLint rule (AD-1) has no fixture test proving it actually blocks a cross-adapter violation [eslint.config.js:12] — deferred: guards a currently-empty boundary since no adapters cross-import yet; add a fixture test once real adapter code exists (Story 1.2+)

**Rejected:**
- `false` — Icons missing on fresh checkout: `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` are already committed binary files; nothing depends on `gen-icons.py` running at install time.
- reject — Suggested Review Order's pointer to `settings-repository.test.ts:1` for the persist-failure edge case: that test actually lives in the separate `settings-repository.persist-failure.test.ts`; fix would mean editing this spec's own Suggested Review Order, out of scope for a code-review patch.
- `false` — No-retry-after-failure in `persistPenCheckShown`: this is the deliberate, tested "never hard-block" trade-off (`FirstRun.svelte:66-72`), explicitly documented in a code comment and covered by `FirstRun.test.ts`'s "shows a generic error note... without dismissing" case.
- `false` — Justfile's `wrangler pages deploy` recipe questioned post Pages/Workers unification: commit `7fe8c70` states the `*.workers.dev` origin was "verified live," which was deployed via this exact recipe.
- `false` — Manifest `orientation: "portrait"` called undiscussed/inherited: DESIGN.md and EXPERIENCE.md both explicitly specify a single-surface, portrait-only Android-tablet target.
- `low` — Double-tap race on "Just use it here": both concurrent calls write an identical, idempotent `Settings` record and call `onDismiss()` with no observable harm; the fix (a dismissing-guard) adds more complexity than the risk warrants.
- `false` — `settingsRepository.get()`/`save()` "rejecting" scenario: both methods are fully `try/catch`-wrapped in `IdbSettingsRepository` and provably never reject.
- `false` (corrected on user pushback) — `package.json`'s `allowScripts` field flagged as not npm-recognized: it is real — the current npm install-script policy mechanism (companion to `npm approve-scripts`/`npm deny-scripts`, `--strict-allow-scripts`), and the project's three pinned `pkg@version` entries are a correct use of it. Verified via `npm help install`'s `allow-scripts`/`strict-allow-scripts`/`dangerously-allow-all-scripts` docs on the installed npm.
- `low` — `gen-icons.py`'s unhandled `OSError` on write failure: a dev-only, manually-run script; an unhandled traceback is adequate signal for its one caller.
- reject — `user-scalable=no` inherited-default concern: already captured verbatim in `deferred-work.md`; no new action needed.

### Review Findings (Re-review)

**Patch:**
- [x] [Review][Patch] Install-prompt failure permanently blocked real persistence via "Just use it here" (and a later successful install) — `handleInstall`'s new catch block reused the same `dismissError` variable that `persistPenCheckShown`'s retry-skip guard checks, so once an install prompt failed, every later dismiss call short-circuited straight to `onDismiss()` without ever calling `settingsRepository.get()/save()`; `penCheckShown` was never actually written, so First Run would resurface on the next launch — contradicting the AC. Fixed: introduced a separate `persistenceFailed` flag that only a real `get()`/`save()` failure sets; `dismissError` remains the rendered message for both failure types, but only a persistence failure gates the no-retry short-circuit. [src/adapters/ui/FirstRun.svelte:30]
- [x] [Review][Patch] Pressure readout froze once confirmed if a later reading in the same contact was exactly 0.5 — the 0.5-ambiguity check applied unconditionally, so a live 0.5 sample after confirmation was silently dropped instead of updating the display. Fixed: once `penStatus === 'pressure-detected'`, the readout updates on every reading regardless of value; the 0.5 ambiguity check only gates initial confirmation. [src/adapters/ui/FirstRun.svelte:50]
- [x] [Review][Patch] `sprint-status.yaml`'s `last_updated` dropped the time-of-day component the sibling `generated` field keeps, an inconsistent timestamp format introduced by the first review pass's sync [_bmad-output/implementation-artifacts/sprint-status.yaml]
- [x] [Review][Patch] New `Justfile` `gen-icons` recipe hardcoded a `python3` dependency with no comment noting it, unlike every other recipe which stays inside the npm toolchain [Justfile]

**Deferred:**
- [x] [Review][Defer] The 0.5-ambiguity heuristic has an inherent false-negative edge case: a real sensor whose reading happens to land on exactly 0.5 for an entire contact would be misread as "no pressure," the inverse of the false-positive this patch fixed — not surfaced in the original patch write-up [src/adapters/ui/FirstRun.svelte:50] — deferred: inherent limit of distinguishing a UA default from a genuine reading using `pressure` alone; no further signal is available without a larger API change
- [x] [Review][Defer] `dismissError`'s error note and the pen-status chip render as plain text with no `aria-live`/`role="alert"`, so a screen-reader user gets no announcement on failure or status change [src/adapters/ui/FirstRun.svelte] — deferred: expands the scope of the existing deferred-work.md item on the pen-status chip's accessibility gap to also cover the error note

**Rejected:**
- `false` — Float-precision epsilon comparison suggested for the 0.5 check: `!== 0.5` is exact and correct as written; a near-0.5-but-not-identical float (e.g. 0.499999) already falls outside the special case and confirms immediately as intended, so there is no precision-drift misclassification risk to guard against.

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

- `Justfile` and `tsconfig.json` -- the pinned-version, strict-mode tooling contract
  [`Justfile:1`](../../Justfile#L1)

