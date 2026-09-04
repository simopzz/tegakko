<!-- bmad:context -->
<!-- Verified 2026-09-03 against 54d438a. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## tegakko

Japanese kana handwriting-practice PWA: prompt → write on a pressure-sensitive canvas → self-grade, with weak-spot-biased card selection. Single-user, local-only, no accounts. Planned stack: TypeScript (strict) + Svelte + Vite + idb, Ports & Adapters (Hexagonal) architecture, deployed to Cloudflare Pages. No application code exists yet — the sections below point at the planning contract in `_bmad-output/`.

## Policy

- Never edit `poc-web/` or `poc-native/` — frozen evidence for the web-vs-native decision (AD-8 in `ARCHITECTURE-SPINE.md`); dead PoCs, not part of the app.

## Where things are

- Before writing any application code, read `_bmad-output/specs/spec-tegakko/SPEC.md` (14 capabilities, constraints, permanent non-goals) and `_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md` (13 binding invariants AD-1..AD-13, stack, structural seed) — this is the canonical contract, not background reading.
- Story-level breakdown and acceptance detail: `_bmad-output/planning-artifacts/epics.md`.
- Visual/interaction design: `_bmad-output/planning-artifacts/ux-designs/ux-tegakko-2026-09-02/DESIGN.md` and `EXPERIENCE.md`.

## Running and verifying

- No `package.json` or `Justfile` exists yet. `epics.md` plans a root `Justfile` with `dev`/`build`/`lint`/`typecheck` recipes and a `deploy` recipe wrapping `wrangler pages deploy dist` — verify these against the real file once written; don't assume npm/pnpm scripts as a substitute.

<!-- /bmad:context -->
