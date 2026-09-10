---
title: 'Add a CI workflow wiring lint/typecheck/test/build together on push/PR'
type: 'chore'
created: '2026-09-10'
status: 'done'
baseline_revision: 'b8316fcba6a3cb2dd873232f48a00305345dd36a'
review_loop_iteration: 0
followup_review_recommended: false
context: ['/home/simopzz/dev/personal/tegakko/_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md']
warnings: []
deferred:
  - summary: >-
      The new CI workflow runs lint/typecheck/test/build on every push/PR but
      nothing marks those checks as required in GitHub branch protection, so
      a red run still would not block a merge.
    evidence: |-
      Verified: no branch-protection configuration exists anywhere in this
      repository (confirmed by inspecting the diff and repo state — nothing
      beyond the new .github/workflows/ci.yml touches GitHub settings).
      Two reviewers converged on this independently (blind-hunter and the
      intent-alignment auditor's "Reading C"). Not resolvable from a code
      diff alone: GitHub's required-status-check API needs the check to have
      run at least once on the default branch before it can be marked
      required, and configuring branch protection is a shared/admin-level
      repository setting an unattended code-only pass should not change.
      Revisit once this workflow has run on main at least once.
    location: >-
      .github/workflows/ci.yml (branch-protection settings live outside the repo)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** No CI configuration exists anywhere in the repo (no `.github/workflows`, nothing else). ARCHITECTURE-SPINE.md's Deferred section and AD-8 explicitly note Cloudflare's Git-integrated deploy covers build+deploy only, leaving the `lint`/`typecheck`/`test` npm scripts unenforced on push/PR — this was deliberately left undecided until build time.

**Approach:** Add a GitHub Actions workflow (`.github/workflows/ci.yml`) that, on every `push` and `pull_request`, installs dependencies and runs the existing `lint`, `typecheck`, `test`, and `build` npm scripts as separate steps.

## Boundaries & Constraints

**Always:** Invoke the existing `package.json` scripts (`npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`) verbatim as four distinct steps, in that order, after `npm ci` — never inline their logic or combine them into one step, so a failure identifies which gate broke. Use `actions/checkout` and `actions/setup-node` with `cache: npm` keyed off the committed `package-lock.json`. Trigger on both `push` and `pull_request` with no branch filter (no `.nvmrc`/`engines` field exists to read a Node version from; the four commands were just verified passing locally under Node v26.7.0, so pin `setup-node`'s `node-version` to `26`).

**Never:** Do not touch deploy — AD-8's Cloudflare Git-integrated build+deploy path (and the `Justfile`'s `deploy` recipe) stays untouched; no `wrangler` invocation in this workflow. Do not depend on the `just` binary (not preinstalled on GitHub-hosted runners) — call the npm scripts directly instead of `just check`/`just build`. Do not modify `_bmad-output/implementation-artifacts/deferred-work.md` (orchestrator-owned ledger).

</intent-contract>

## Code Map

- `package.json` -- `scripts.lint` (`eslint .`), `scripts.typecheck` (`tsc --noEmit && svelte-check --tsconfig ./tsconfig.json`), `scripts.test` (`vitest run`), `scripts.build` (`vite build`) — the four gates to wire up; all four verified passing locally on baseline (`0 errors`, `319 tests passed`, clean `vite build`).
- `package-lock.json` -- present at repo root; `actions/setup-node`'s `cache: npm` needs this to key its cache.
- `.github/workflows/ci.yml` -- does not exist yet; this is the new file.
- `Justfile` -- local `check` recipe (`lint typecheck test`) and `build` recipe exist for developer convenience but are not invoked from CI (see Never: no `just` dependency).
- `_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md` -- AD-8 (Cloudflare Git-integrated deploy, no Actions workflow required for deploy) and the `## Deferred` entry "CI beyond deploy" — the source of this task's scope boundary.

## Tasks & Acceptance

**Execution:**
- `.github/workflows/ci.yml` -- create a workflow with `on: push` and `on: pull_request` (no branch filter), a single job on `ubuntu-latest` running `actions/checkout`, `actions/setup-node` (`node-version: '26'`, `cache: npm`), `npm ci`, then `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` as four separate steps -- turns the already-defined npm scripts into an enforced, required-check-eligible gate on every push/PR.

**Acceptance Criteria:**
- Given a push to any branch or a pull request against the repo, when the workflow runs, then `npm ci` runs first, followed by `lint`, `typecheck`, `test`, `build` as four distinct steps in that order.
- Given the current repository state (all four scripts already pass locally), when the workflow runs, then all steps succeed.
- Given any one of the four commands would fail, when the workflow runs, then only that step fails and is individually identifiable in the job's step list (not folded into one combined script/step).

## Spec Change Log

## Review Triage Log

### 2026-09-10 — Review pass
- verdicts: 14 findings — high 0, medium 3, low 7, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` Missing `concurrency` group lets `push` and `pull_request` both fire a full CI run for the same commit on a same-repo PR branch — real: GitHub dispatches both events for that case; fix applied: added top-level `concurrency: {group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true}`.
  - `[medium]` `[patch]` No `permissions:` block leaves `GITHUB_TOKEN` at its default scope while the job runs untrusted `npm ci`/build scripts — real: no explicit permissions restriction exists anywhere in the file; fix applied: added top-level `permissions: contents: read`.
  - `[low]` `[patch]` No `timeout-minutes` lets a hung step run up to GitHub's 360-minute default — real: confirmed absent from the job; fix applied: added `timeout-minutes: 15` to the job.
  - `[low]` `[patch]` Job is named `build` but runs lint+typecheck+test+build, misdescribing it in the Actions UI/required-checks list — real: `jobs.build` is the sole job and runs all four gates; fix applied: renamed the job key to `ci`.
  - `[medium]` `[defer]` Workflow runs the four gates but nothing marks them as required GitHub branch-protection checks, so a red run still wouldn't block a merge — real: no branch-protection config exists in this repo; not fixable from a code diff alone — GitHub's required-status-check API needs the check to have run at least once on the default branch first, and branch protection is a shared/admin repo setting, not something an unattended code-only pass should change. Deferred to a follow-up once this workflow has run on `main`.
  - `[false]` `[reject]` "No caching beyond npm" called an undocumented tradeoff — refutation: `actions/setup-node`'s `cache: npm` already covers the dominant CI cost (dependency install); locally all four gates combined complete in ~5s, so there's no evidence of a real slowness problem.
  - `[false]` `[reject]` Spec's `warnings: []`/`deferred: []` said to mismatch the real gaps left by the change — refutation: this review pass is exactly what populates `deferred:` with the verified gaps below; the objected-to state is corrected by this same pass, not a standing defect.
  - `[low]` `[patch]` No `workflow_dispatch` trigger, so the workflow can only be re-run via an empty commit/re-push — real: `on:` lists only `push`/`pull_request`; fix applied: added `workflow_dispatch:` to `on:`.
  - `[low]` `[patch]` `push:` has no filter, so pushing a tag (not just a branch) also dispatches the full job — real: `on.push` has no `branches`/`tags` key and GitHub's unfiltered `push` trigger matches tag refs too; fix applied: added `branches: ['**']` under `push:`.
  - `[low]` `[patch]` (edge-case-hunter; same root cause as the concurrency row above) Missing concurrency group causes duplicate/overlapping runs for the same ref — carried into that same fix.
  - `[low]` `[patch]` (edge-case-hunter; same root cause as the timeout row above) No `timeout-minutes` — carried into that same fix.
  - `[false]` `[reject]` Intent-alignment: the spec's acceptance criteria are framed at the level of the workflow actually executing in GitHub Actions, but the diff only proves the underlying npm scripts pass locally — refutation: the verification-gap layer examined this exact question and found no gap — no in-repo test can or should assert a hosted Actions run, and the spec's own Verification section already states this limitation explicitly rather than concealing it.
  - `[medium]` `[defer]` (intent-alignment; same root cause as the branch-protection row above) The "enforced" reading of the intent needs required-status-check wiring, which a workflow-file diff cannot express — carried into that same defer.
  - `[false]` `[reject]` (intent-alignment; same root cause as the row above) No Vitest test exercises `ci.yml` itself — carried into that same refutation: inherent to a CI-config-only change, not a gap this diff should close.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0 (already verified passing on baseline)
- `npm run typecheck` -- expected: exit 0, `0 errors` (already verified passing on baseline)
- `npm run test` -- expected: exit 0, all test files pass (already verified passing on baseline: 23 files / 319 tests)
- `npm run build` -- expected: exit 0, `dist/` produced (already verified passing on baseline)
- `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` -- expected: parses without error (sanity check for valid YAML; GitHub Actions itself can't run locally)

**Manual checks (if no CLI):**
- Read `.github/workflows/ci.yml` and confirm it triggers on both `push` and `pull_request`, and that `lint`/`typecheck`/`test`/`build` each appear as their own step calling the matching `npm run <script>` (not combined, not reimplemented).

## Auto Run Result

**Summary:** Added `.github/workflows/ci.yml`, a GitHub Actions workflow that runs `lint`, `typecheck`, `test`, and `build` as four separate steps (after `npm ci`) on every `push` (branches only) and `pull_request`, plus manual `workflow_dispatch`. Hardened during review with a `concurrency` group, `permissions: contents: read`, and a `timeout-minutes` cap; job renamed from `build` to `ci` to match what it actually does.

**Files changed:**
- `.github/workflows/ci.yml` (new) — CI workflow: checkout, setup-node (Node 26, npm cache), `npm ci`, then `lint`/`typecheck`/`test`/`build` as separate steps; `concurrency`, `permissions`, `timeout-minutes`, and `workflow_dispatch` added during review.
- `_bmad-output/implementation-artifacts/spec-dw-7-ci-workflow-lint-typecheck-test.md` (new) — this spec/process artifact.

**Review findings breakdown:**
- Patched (6, all low/medium, none high): missing `concurrency` group (low); missing `permissions:` block (medium); missing `timeout-minutes` (low); misleading `build` job name (low); missing `workflow_dispatch` trigger (low); unfiltered `push` also matching tag refs (low).
- Deferred (1, medium): CI runs the four gates but nothing marks them as required GitHub branch-protection status checks, so a red run wouldn't block a merge yet — not achievable from a code diff alone (needs the check to have run on `main` first, plus a separate admin-level branch-protection change). See frontmatter `deferred`.
- Rejected (4, false): "no caching beyond npm" (npm cache already covers the dominant cost, no measured slowness); "spec deferred/warnings looked stale" (this same review pass is what populates them); "diff only proves local script success, not an actual GitHub Actions run" and "no Vitest test exercises `ci.yml`" (both refuted by the dedicated verification-gap review pass — no in-repo test can or should assert a hosted Actions run, and the spec's own Verification section already states that limitation).

**Follow-up review recommendation:** `false` — no `high` entries were patched, and only one `medium` entry (`permissions:` block) was patched, below the two-or-more-medium threshold for a first pass.

**Verification performed:** `npm run lint`, `npm run typecheck`, `npm run test` (23 files / 319 tests), and `npm run build` all re-run after the patch and passed (exit 0). `.github/workflows/ci.yml` re-parsed as valid YAML after the patch. Manual check: workflow triggers on `push`/`pull_request`/`workflow_dispatch`; `lint`/`typecheck`/`test`/`build` each remain their own step calling the matching `npm run <script>`.

**Residual risks:** The deferred branch-protection gap above — until a follow-up marks these checks required, a failing run is visible but not blocking. No other residual risk identified; all four gates pass on the current baseline.
