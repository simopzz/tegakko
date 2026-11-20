## tegakko

Japanese kana handwriting-practice PWA: prompt → write on a pressure-sensitive canvas → self-grade, with weak-spot-biased card selection. Single-user, local-only, no accounts. TypeScript (strict) + Svelte + Vite + idb, Ports & Adapters (Hexagonal), deployed to Cloudflare Pages via wrangler. Planning docs from the retired BMAD workflow live in `docs/bmad/` as transitional reference; they will be removed once superseded.

## Policy

- Never push to main; PRs only.

## Where things are

- Before writing application code, read `docs/bmad/SPEC.md` and `docs/bmad/ARCHITECTURE-SPINE.md` — the canonical contract, not background reading.
- Visual/interaction design: `docs/bmad/DESIGN.md` and `EXPERIENCE.md`.
- Work items: GitHub Issues (see `## Agent skills` below).

## Running and verifying

- Verify with `just check` (lint + typecheck + test); CI also runs `build`, so run `just build` before pushing when build impact is possible.
- Deploy only with `just deploy`, which builds then runs `wrangler pages deploy dist`.
- Use the Node version pinned in `.github/workflows/ci.yml`; TypeScript pins live in `package.json`.

## Conventions that differ from defaults

- Hexagonal boundary (AD-1, enforced by `eslint.config.js`): `domain/` and `ports/` never import from `adapters/` or `app/`; adapters never import sibling adapters — wire concrete adapters only in `src/app/`.

## Agent skills

### Issue tracker

GitHub Issues on `simopzz/tegakko`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
