<!-- bmad:context -->
<!-- Verified 2026-09-23 against ef75663. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## tegakko

Japanese kana handwriting-practice PWA: prompt → write on a pressure-sensitive canvas → self-grade, with weak-spot-biased card selection. Single-user, local-only, no accounts. TypeScript (strict) + Svelte + Vite + idb, Ports & Adapters (Hexagonal), deployed to Cloudflare Pages via wrangler. Planning contract lives in `_bmad-output/` (spec, architecture spine, epics, UX designs).

## Policy

- Never push to main; PRs only.

## Where things are

- Before writing application code, read `_bmad-output/specs/spec-tegakko/SPEC.md` and `_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md` — the canonical contract, not background reading.
- Story-level breakdown and acceptance detail: `_bmad-output/planning-artifacts/epics.md`.
- Visual/interaction design: `_bmad-output/planning-artifacts/ux-designs/ux-tegakko-2026-09-02/DESIGN.md` and `EXPERIENCE.md`.
- Sprint state: `_bmad-output/implementation-artifacts/sprint-status.yaml`; open follow-ups in `deferred-work.md` in the same directory.

## Running and verifying

- Verify with `just check` (lint + typecheck + test); CI also runs `build`, so run `just build` before pushing when build impact is possible.
- Deploy only with `just deploy`, which builds then runs `wrangler pages deploy dist`.
- Use the Node version pinned in `.github/workflows/ci.yml`; TypeScript pins live in `package.json`.

## Conventions that differ from defaults

- Hexagonal boundary (AD-1, enforced by `eslint.config.js`): `domain/` and `ports/` never import from `adapters/` or `app/`; adapters never import sibling adapters — wire concrete adapters only in `src/app/`.

<!-- /bmad:context -->
