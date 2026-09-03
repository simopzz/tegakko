---
review: version-verification
target: ARCHITECTURE-SPINE.md (jplearn-kana-v1)
performed: 2026-09-03
method: live npm registry queries (registry.npmjs.org) + MDN/web search
---

# Version & Technical-Currency Verification — jplearn-kana-v1 Architecture Spine

## Scope

Re-verified, independently and live (not trusting the memlog's prior claims), every pinned version in the Stack table, the continued existence/fitness of each named technology, and the GitHub Pages + GitHub Actions hosting decision for an installable Chromium-Android PWA with pointer-pressure input and Delegated Ink Trails. Verification method: direct queries against `registry.npmjs.org` (dist-tags + per-version `time` timestamps + `peerDependencies`), MDN for platform-API compatibility status, and web search for hosting/runner currency.

## Verdict

**Mostly sound, with one confirmed staleness finding.** Four of five pinned package versions are exact matches for the current npm `latest` dist-tag as of 2026-09-03. One (`@sveltejs/vite-plugin-svelte` at 7.2.0) is one minor version behind what was already available *before* the spine's stated verification date — a real gap in the "verified current" claim, though not a functional or compatibility problem. The Delegated Ink Trails / Pointer Events / GitHub Pages+Actions claims all check out against current sources.

## Stack Table — Line-by-Line

| Package | Spine version | Live npm `latest` (checked 2026-09-03) | Status |
| --- | --- | --- | --- |
| Vite | 8.2.2 | 8.2.2 (published 2026-08-20) | ✅ Exact match |
| Svelte | 5.57.0 | 5.57.0 (published 2026-08-28) | ✅ Exact match |
| @sveltejs/vite-plugin-svelte | 7.2.0 | **7.3.0** (published 2026-08-08) | ⚠️ Stale — see finding 1 |
| vite-plugin-pwa | 1.3.0 | 1.3.0 (published 2026-05-05) | ✅ Exact match |
| idb | 8.0.3 | 8.0.3 (published 2025-05-07) | ✅ Exact match (no newer release exists) |
| TypeScript | "strict mode, latest stable" (unpinned) | 7.0.2 (published 2026-07-08) | ✅ Fine as unpinned — see finding 2 |

## Findings

### 1. `@sveltejs/vite-plugin-svelte` pinned to 7.2.0, but 7.3.0 was already out before the spine's stated verification date — STALE, low severity

The memlog states (2026-09-03 verification): "Svelte 5.57.0, @sveltejs/vite-plugin-svelte 7.2.0." But `@sveltejs/vite-plugin-svelte@7.3.0` was published **2026-08-08**, roughly four weeks before this spine's authoring/verification date. So the claim that 7.2.0 was "current at authoring" doesn't hold — a newer minor was already available at the time and appears to have been missed.

Impact assessment: **cosmetic, not functional.**
- Checked `peerDependencies` for both 7.2.0 and 7.3.0: identical (`vite: ^8.0.0-beta.7 || ^8.0.0`, `svelte: ^5.46.4`). Both are fully compatible with the rest of the pinned stack.
- Checked the changelog between the two: 7.3.0 adds "pass environment to `dynamicCompileOptions`" and a minor logging fix; 7.2.0 added an inspector context-menu feature. Nothing breaking, nothing security-relevant, nothing that affects this app's architecture.

Recommendation: bump the pin to 7.3.0 (or re-pin to whatever is `latest` when the code is actually scaffolded, since the Stack table already carries a "the code owns this once it exists" disclaimer). Not a blocking issue, but it is evidence the "verified current" annotation on this one line was not actually checked against the freshest registry state — worth noting so the same gap isn't assumed absent elsewhere.

### 2. TypeScript left unpinned as "latest stable" — correct call, but note the ecosystem has moved further than a reader might assume

Confirmed via npm registry: current `latest` is **TypeScript 7.0.2** (published 2026-07-08), which is the "tsgo" Go-native-compiler rewrite line, not the 5.x/6.x line most existing tutorials/tooling docs still reference. Leaving this unpinned in the spine is the right call (it floats to whatever's current at scaffold time), and `strict: true` remains a standard, fully-supported tsconfig option under TS 7. Not a defect in the spine. Flagging only as a heads-up for build time: TS 7 is a materially different compiler implementation from what most Svelte/Vite tooling guides were written against, so it's worth a quick sanity check that `svelte-check` and editor tooling behave as expected once the toolchain is actually installed — that's a build-time concern, not an architecture-spine concern, and doesn't require a spine change.

### 3. `idb` at 8.0.3 — confirmed current, confirmed not abandoned

8.0.3 is still the npm `latest` dist-tag; there has been no newer release since 2025-05-07 (~16 months). Checked that this reflects package maturity rather than abandonment: `jakearchibald/idb` remains an actively maintained repo (7.4k GitHub stars, ~1,442 dependent packages on npm), and no successor/replacement library has superseded it. The memlog's "most widely adopted" characterization holds up.

### 4. Delegated Ink Trails — still Chrome/Chromium-only, still "Limited availability," consistent with the PRD's platform boundary

Checked MDN's current compatibility data for `DelegatedInkTrailPresenter`/Ink API: explicitly marked **"Limited availability — this feature is not Baseline because it does not work in some of the most widely-used browsers."** This matches the memlog's 2026-09-02 claim exactly and remains consistent with the PRD/spine's deliberate Chromium-Android-only scope (AD-8, brief addendum). No drift here — the spine isn't relying on a feature that quietly became Baseline-safe (which would have been fine) or, worse, one that quietly lost even Chrome support (which would have broken the whole ink-latency approach).

### 5. Pointer Events (`pressure`, `pointerType: 'pen'`) — solid, Baseline-stable, no concern

Confirmed via MDN: the `PointerEvent` interface (including `pressure` and `pointerType`) has been a **widely available Baseline feature since July 2020**. Nothing here has changed or is at risk of changing; this is a safe, boring dependency, correctly not flagged as a risk anywhere in the spine.

### 6. GitHub Pages + GitHub Actions hosting — technically sound for an installable PWA at a project-page subpath

- HTTPS is unconditionally enforced on `*.github.io` origins (has been for years, unchanged) — satisfies both the PWA installability requirement and the secure-context requirement Delegated Ink Trails needs.
- Service workers work correctly at a GitHub Pages *project*-page subpath (e.g. `username.github.io/repo-name/`) provided the manifest `start_url`/`scope` and the service worker's registration scope are set to that subpath rather than assumed to be site root — this is a well-documented, standard pattern, and `vite-plugin-pwa` supports it directly via Vite's `base` config option, so nothing exotic is required here. AD-8's "no custom domain in v1, default `*.github.io` origin" framing is accurate and doesn't need a caveat added.
- No evidence of any 2026 change to GitHub Pages that would break this (no deprecation of project pages, no new HTTPS/service-worker restriction found).
- One adjacent, non-blocking note surfaced during research: GitHub Actions hosted runners are transitioning their default Node.js runtime from 20 to 24 during 2026 (Node 20 is being removed from runners **2026-09-16**, i.e. imminent relative to this spine's authoring date). This is an Actions-infrastructure change, not a GitHub Pages hosting-model change, and it doesn't require anything in the architecture spine to change — official actions like `actions/deploy-pages` are expected to update accordingly. Worth a one-line awareness note for whoever writes the actual workflow YAML (pin action versions, don't hardcode a Node version if avoidable), but it is out of scope for the spine itself and the spine correctly leaves CI workflow detail undeferred/deferred appropriately ("CI beyond deploy" is already listed as Deferred).

## Things checked and found to require no correction

- Svelte 6 exists only as an alpha (`6.0.0-alpha.24` on npm as of 2026-09-03) — confirms Svelte 5.x remains the correct, current stable choice; no premature-major-version risk.
- Vite 8 is a real, substantial, intentional release (Rolldown/Rust-bundler rewrite replacing the old esbuild+Rollup split), not a mislabeled or hallucinated version — confirmed via Vite's own announcement post. Reported to have broad framework beta-testing (React Router, Astro, Nuxt, SvelteKit) and strong plugin-compatibility claims; reasonable foundation for a new project. Minor note: Vite 8 requires Node 20.19+ or 22.12+ — not currently stated anywhere in the spine, but this is an implementation/CI detail, not an architectural one.
- `vite-plugin-pwa`'s `peerDependencies` explicitly list `vite: "^3.1.0 || ... || ^8.0.0"`, confirming 1.3.0 is compatible with the pinned Vite 8.2.2 rather than trailing it.

## Summary Table

| Claim in spine/memlog | Verified? | Confidence |
| --- | --- | --- |
| Vite 8.2.2 is current | Yes, exact match | High |
| Svelte 5.57.0 is current | Yes, exact match | High |
| vite-plugin-svelte 7.2.0 is current | **No** — 7.3.0 predates the stated verification date | High |
| vite-plugin-pwa 1.3.0 is current | Yes, exact match | High |
| idb 8.0.3 is current | Yes, exact match, package not abandoned | High |
| Delegated Ink Trails is still Chrome-only/experimental | Yes | High |
| Pointer Events pressure/pointerType is stable/Baseline | Yes | High |
| GitHub Pages HTTPS + SW at project subpath supports PWA install | Yes | High |
| Nothing about the hosting choice is stale for 2026 | Yes, with a minor non-blocking Actions-runner-Node-version note | Medium-High |
