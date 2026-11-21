## tegakko

Japanese kana handwriting-practice PWA: prompt → write on a pressure-sensitive canvas → self-grade, with weak-spot-biased card selection. Single-user, local-only, no accounts. TypeScript (strict) + Svelte + Vite + idb, Ports & Adapters (Hexagonal), hosted on Cloudflare.

## Working on an issue

Implement each issue on its own feature branch off `main`, named `<issue>-<slug>` (e.g. `6-settings`), created before the first commit. `main` takes work only through PRs. PR bodies must include a closing keyword for the issue (e.g. `Closes #6`). This overrides any skill step that says to commit to the current branch.

Before writing code, list the domain decisions the issue leaves open (behaviour it implies but doesn't state) and confirm them with the user.

Before every commit, run `mise run check`: everything CI runs but `build`, which CI also runs, so run `mise run build` too when a change could affect it. The pre-commit hook, which `mise install` turns on, runs `mise run check`. Commit before running `code-review`, which reads `HEAD`.

Cloudflare Workers Builds deploys every push on its own; there is no manual deploy.

## Where things are

- Vocabulary: `GLOSSARY.md`. Decisions that would surprise a reader: `docs/adr/`. Behaviour itself is specified by the code and its tests.
- Visual and interaction design: `docs/design.md`. Update it in the same PR as a change to what it describes.
- Session lifecycle: `src/app/practice.ts` (module/orchestrator) → `src/adapters/ui/drill-session.ts` (state machine) → `src/adapters/ui/Drill.svelte` (rendering).
- Coding standards for review: `docs/agents/coding-standards.md`.
- Where tests sit and how to write them: `docs/agents/testing.md`.

## Conventions that differ from defaults

- Hexagonal boundary ([ADR-0001](docs/adr/0001-hexagonal-boundary.md), enforced by `eslint.config.js`): `domain/` and `ports/` never import from `adapters/` or `app/`; adapters never import sibling adapters. Wire concrete adapters only in `src/app/`.

## Agent skills

### Issue tracker

GitHub Issues on `simopzz/tegakko`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

### Browser

Diagnosing a page in a browser, whether a style that won't apply, a slow load, an accessibility failure or a leak, goes through the `chrome-devtools` MCP server. Clicking through and screenshots go through `playwright-brave`. See `docs/agents/browser-tools.md` before opening either.

### PR screenshots

A PR that changes what the learner sees shows screenshots in its body. This repo is private, so images must be *attached*, never linked as raw-branch URLs: `raw.githubusercontent.com` carries no auth and 404s inside private-repo bodies. Attach with `gh pr edit <pr> --attach '<image>#caption'` — the uploads land as `user-attachments` URLs appended to the body — then edit the body to place them (wrapped in a `<details>` block if preferred; `<img src width>` renders for resizing). `![](./file.png)` body references are *not* rewritten by `--attach`; move the appended URLs yourself.
