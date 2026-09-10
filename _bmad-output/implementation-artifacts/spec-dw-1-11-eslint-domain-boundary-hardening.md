---
title: 'Extend AD-1 boundary ESLint rule to domain/ports purity, with a RuleTester regression test'
type: 'chore'
created: '2026-09-10'
status: 'done'
baseline_revision: '54c8882d2d1863a6fb5738b35de62506d9f4fc56'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      deferred-work.md's DW-1/DW-11 resolution field references bundle id
      "dw-eslint-domain-boundary-hardening", which matches no file on disk.
    evidence: |-
      The actual spec file is spec-dw-1-11-eslint-domain-boundary-hardening.md;
      grepping the bundle id finds nothing, breaking ledger-to-spec
      traceability. deferred-work.md is the orchestrator's own ledger
      bookkeeping, written before this review pass started -- out of scope
      for this build to modify.
    location: >-
      _bmad-output/implementation-artifacts/deferred-work.md (DW-1, DW-11 entries)
    severity: low
  - summary: >-
      deferred-work.md's new resolution-undo field has no legend explaining
      its hex-encoded previous-value format.
    evidence: |-
      A human editing the ledger by hand would need to reverse-engineer that
      the trailing hex blob decodes to the prior "status:" line. Same
      out-of-scope reasoning as above: orchestrator-owned ledger.
    location: >-
      _bmad-output/implementation-artifacts/deferred-work.md (DW-1, DW-11 entries)
    severity: low
---

<intent-contract>

## Intent

**Problem:** `eslint.config.js`'s `import-x/no-restricted-paths` zones (lines 6-15, 69-89) only enforce the sibling-adapter-to-adapter half of AD-1 ("cross-adapter interaction goes through a port"). The other half of AD-1 — `domain/` imports nothing from `adapters/` or `app/`; `ports/` types reference only `domain/` types — is enforced only by convention/comments today. Separately, no test anywhere in the repo proves the boundary rule (existing or new) actually rejects a disallowed cross-boundary import; the zones are currently empty of real violations, so a regression (e.g. a dropped `/**` suffix on a `from` glob, silently turning a zone into a no-op) would ship silently.

**Approach:** Add two new `no-restricted-paths` zones — `domain/` and `ports/`, each restricted from `./src/adapters/**` and `./src/app/**` — to the same rule block that already restricts adapter-to-adapter imports, and extend that block's `files` glob to cover `src/domain/**/*.ts` and `src/ports/**/*.ts` so the rule actually runs on those files. Then add an ESLint `RuleTester` fixture test that imports the *real* zone arrays from `eslint.config.js` (not a hand-copied duplicate) and asserts both the existing adapter-to-adapter zones and the new domain/ports zones reject a disallowed import, and accept the allowed shapes (same-adapter, domain→ports, app→adapter).

## Boundaries & Constraints

**Always:**
- `app/` stays exempt from every zone (it is the composition root — AD-1 explicitly allows it to import concrete adapters for wiring).
- `domain/` → `ports/` imports must remain allowed (AD-1: domain depends on port *types*).
- Same-adapter-directory imports must remain allowed (existing `adapterZones` behavior — do not change).
- The RuleTester test must exercise the same zone objects `eslint.config.js` actually applies (import them from the config module), not a re-typed copy — otherwise it cannot catch a regression in the real config, which is the whole point of DW-11.
- Test fixture `filename`s and cross-boundary import targets must be real files that exist on disk today (eslint-plugin-import-x's `no-restricted-paths` resolves the import specifier via its configured resolver, which does real filesystem lookups — a fictitious path silently resolves to nothing and the rule reports no violation regardless of zone config).

**Never:**
- Do not add real cross-boundary imports anywhere in `src/` to "exercise" the rule — the regression test must be self-contained inside the test file, using existing files purely as import targets in fixture `code` strings (not as new source-level imports).
- Do not weaken any existing adapter-to-adapter zone behavior.
- Do not restrict `app/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Same-adapter import | `src/adapters/persistence/tally-repository.ts` imports `./db` | No `no-restricted-paths` violation | No error expected |
| Domain → ports import | `src/domain/drill.ts` imports `../ports/tally-repository` | No violation | No error expected |
| App → adapter import | `src/app/main.ts` imports `../adapters/persistence/db` | No violation | No error expected |
| Cross-adapter import (existing zone) | `src/adapters/ui/screens.ts` imports `../persistence/db` | One `no-restricted-paths` violation (`messageId: 'zone'`) | ESLint reports the error |
| Domain → adapter import (new zone) | `src/domain/cards.ts` imports `../adapters/persistence/db` | One violation | ESLint reports the error |
| Ports → app import (new zone) | `src/ports/card-repository.ts` imports `../app/main` | One violation | ESLint reports the error |

</intent-contract>

## Code Map

- `eslint.config.js:6-15` -- existing `adapterZones` definition (one zone per adapter dir, `from: './src/adapters/!(${name})/**'`). Must become a named export (`export const adapterZones = ...`) so the test can import the real array.
- `eslint.config.js:69-89` -- the `no-restricted-paths` rule block: `files: ['src/adapters/**/*.ts', 'src/adapters/**/*.svelte']`, `settings['import-x/resolver'] = { node: { extensions: ['.js', '.ts', '.svelte'] } }`, `rules: { 'import-x/no-restricted-paths': ['error', { zones: adapterZones }] }`. Extend `files` to add `'src/domain/**/*.ts'` and `'src/ports/**/*.ts'`; change `zones: adapterZones` to `zones: [...adapterZones, ...domainPurityZones]`.
- `eslint-plugin-import-x` `no-restricted-paths` rule (`node_modules/eslint-plugin-import-x/lib/rules/no-restricted-paths.js`) -- matches `zone.target` against `context.physicalFilename`, resolves each import specifier via the configured resolver against real files on disk, and reports `messageId: 'zone'` on a match. This is why RuleTester test fixtures need real on-disk `filename`s and import targets, not invented paths.
- `src/domain/`, `src/ports/`, `src/adapters/{content,ink,io,persistence,ui}/`, `src/app/` -- the four AD-1 layers; existing real files to use as RuleTester fixture anchors, e.g. `src/adapters/persistence/tally-repository.ts` + `./db` (same-adapter, valid), `src/adapters/ui/screens.ts` + `../persistence/db` (cross-adapter, invalid), `src/domain/drill.ts` + `../ports/tally-repository` (domain→ports, valid), `src/domain/cards.ts` + `../adapters/persistence/db` (domain→adapter, invalid), `src/app/main.ts` + `../adapters/persistence/db` (app→adapter, valid), `src/ports/card-repository.ts` + `../app/main` (ports→app, invalid).
- `eslint` package's `RuleTester` class (`node_modules/eslint/lib/rule-tester/rule-tester.js`, typed in `node_modules/eslint/lib/types/index.d.ts:1451`) -- exported directly from `'eslint'` in this installed version (10.9.1); `run(name, rule, { valid, invalid })` synchronously throws (via node `assert`) on the first failing case if no `describe`/`it` globals are present, which is the case under this repo's vitest config (no `globals: true` in `vitest.config.ts`) -- so calling `ruleTester.run(...)` inside a vitest `it()` block correctly fails that test on any assertion mismatch, with no extra wiring needed.
- Type friction (must resolve, not silence): `importPlugin.rules['no-restricted-paths']` is typed against eslint-plugin-import-x's own rule-creator generic, which is not directly assignable to the `RuleDefinition` type `RuleTester.run`'s second parameter expects in the installed `eslint` version. The installed `eslint` package also exports a classic `Rule.RuleModule` type (`node_modules/eslint/lib/types/index.d.ts:648-659`) that itself extends `RuleDefinition`, so casting `importPlugin.rules['no-restricted-paths']` through `as unknown as Rule.RuleModule` (double cast required -- TS reports the two rule types as insufficiently overlapping for a single-step assertion) resolves it cleanly, with no `any` in project code (AD-6 bans `@typescript-eslint/no-explicit-any`, which is `'error'` for every `.ts` file per `eslint.config.js:41-44`).
- `vitest.config.ts:14` -- `include: ['src/**/*.test.ts']`. A root-level `eslint.config.test.ts` needs `include: ['src/**/*.test.ts', '*.test.ts']` to be picked up by `npm run test` (`vitest run`).
- `tsconfig.json` -- `include` currently lists `eslint.config.js` explicitly but has no `allowJs`; a `.ts` file importing named exports from that `.js` file fails `tsc --noEmit` with `TS7016` (no declaration file) unless `"allowJs": true` is added to `compilerOptions`, and `eslint.config.test.ts` is added to `include`.
- `eslint.config.js:38` -- top-level TS-file lint block's `files` array (`['src/**/*.ts', 'vite.config.ts', 'vitest.config.ts', 'eslint.config.js']`) should also list `'eslint.config.test.ts'` so the new root test file gets the same `@typescript-eslint/no-explicit-any` strictness as every other `.ts` file, consistent with how `vite.config.ts`/`vitest.config.ts` are already covered despite living outside `src/`.

## Tasks & Acceptance

**Execution:**
- `eslint.config.js` -- export `adapterZones` (add `export` to the existing `const`); add a new exported `domainPurityZones` array with two zones (`target: './src/domain'` and `target: './src/ports'`, each `from: ['./src/adapters/**', './src/app/**']`); extend the boundary rule block's `files` to include `'src/domain/**/*.ts'` and `'src/ports/**/*.ts'`; change its `zones` option to `[...adapterZones, ...domainPurityZones]`; add `'eslint.config.test.ts'` to the top-level TS lint block's `files` array -- closes DW-1 and wires the new zones into ESLint's active rule set.
- `eslint.config.test.ts` (new file, repo root) -- import `RuleTester` and the `Rule` type from `'eslint'`, the `no-restricted-paths` rule from `eslint-plugin-import-x`'s default export, and `adapterZones`/`domainPurityZones` from `./eslint.config.js`; build the combined `zones` array the same way the config does; run one `RuleTester.run(...)` inside a vitest `describe`/`it` covering all six I/O-matrix scenarios above (3 valid, 3 invalid) -- closes DW-11.
- `vitest.config.ts` -- change `test.include` to `['src/**/*.test.ts', '*.test.ts']` so the new root-level test file is discovered by `npm run test`.
- `tsconfig.json` -- add `"allowJs": true` to `compilerOptions`; add `'eslint.config.test.ts'` to `include`.

**Acceptance Criteria:**
- Given the finished changes, when running `npm run lint`, then it exits 0 (the new zones don't flag any existing import in `src/`, since none currently cross domain/ports → adapters/app).
- Given the finished changes, when running `npm run typecheck`, then it exits 0 with no errors from `eslint.config.test.ts` or the `allowJs` change.
- Given the finished changes, when running `npm run test`, then `eslint.config.test.ts` is picked up and its test passes, alongside all pre-existing tests continuing to pass.
- Given the RuleTester test as written, when the `from` glob on any existing or new zone in `eslint.config.js` regresses (e.g. loses a trailing `/**`, or a zone is deleted), then at least one of the test's invalid cases fails -- this is the specific regression DW-11 exists to catch; confirm it by temporarily reproducing such a regression locally and observing the test fail, then discarding that temporary change (do not commit it).

## Spec Change Log

## Review Triage Log

### 2026-09-10 — Review pass
- verdicts: 14 findings — high 4, medium 2, low 5, false 3, maybe-false 0
- findings:
  - `[high]` `[patch]` Blind Hunter: comment overstates protection -- a `files`-glob regression is not caught by the test — evidence: `RuleTester` invokes the rule directly with hand-picked zones/filenames, bypassing ESLint's flat-config file-to-rule routing entirely; grouped with edge-case-hunter/verification-gap/intent-alignment below. Applied: added a second `it()` in `eslint.config.test.ts` using `new Linter({ configType: 'flat' })` and `.verify(code, eslintConfig, filename)` against the real default-exported config; re-verified by re-stripping the `files` entries and confirming this new test fails (`expected [] to have length 1`), then restoring and confirming it passes.
  - `[high]` `[patch]` Edge Case Hunter: claim "regression on any zone's `from` glob is caught" is false for the `files` array — evidence: empirically verified by removing `'src/domain/**/*.ts'`/`'src/ports/**/*.ts'` from `eslint.config.js`'s `files` array and re-running `npx vitest run eslint.config.test.ts` — still 1 passed, no failure. Same root cause as above; same fix applied.
  - `[high]` `[patch]` Verification Gap Reviewer: `files` glob wiring is unverified by any test — evidence: `eslint.config.test.ts` imports only the named `adapterZones`/`domainPurityZones` exports, never the default export (the flat-config array with the `files` glob); confirmed by removing the two new `files` entries and observing the test still pass, then confirming a real fixture file under `src/domain/` with a disallowed import produces zero `eslint` errors with the entries removed, and the expected error with them restored. Same root cause; same fix applied.
  - `[high]` `[patch]` Intent Alignment Auditor: diff implements the zone-data-fidelity reading (R11b) but not the flat-config file-routing-fidelity reading (R11c) of DW-11's "prove the rule actually rejects..." — evidence: DW-11's own `reason:` field is about a regression shipping silently, and the bundle intent frames this as "closing AD-1's enforcement gap end to end" — nothing in the intent excludes testing the file-routing wiring, so this is in scope, not out of scope. Same root cause; same fix applied.
  - `[medium]` `[patch]` Blind Hunter: `RuleTester`'s `settings['import-x/resolver']` block is hand-duplicated rather than imported from the real config, unlike `adapterZones`/`domainPurityZones` — evidence: the test file's own comment states the zone arrays are imported specifically to avoid drift, but the resolver settings are retyped by hand, so a drift in the real settings (e.g. losing `.svelte`) would not be caught. Applied: `eslint.config.js` now exports `boundaryResolverSettings`, reused both by the real config's rule block and imported into `eslint.config.test.ts`'s `RuleTester` settings — no more hand-typed duplicate.
  - `[medium]` `[patch]` Verification Gap Reviewer ("Other findings"): same resolver-settings duplication as above — evidence: identical claim, independently reported. Same fix applied.
  - `[low]` `[patch]` Blind Hunter: asymmetric zone coverage — `domain`→`app` and `ports`→`adapters` are never exercised by an invalid case, only `domain`→`adapters` and `ports`→`app` are — evidence: each `domainPurityZones` zone has a two-entry `from` array but only one entry per zone appears in the invalid test cases. Applied: added the two missing invalid `RuleTester` cases (`domain/cards.ts` → `'../app/main'`, `ports/card-repository.ts` → `'../adapters/persistence/db'`).
  - `[low]` `[patch]` Edge Case Hunter: same asymmetric zone coverage as above — evidence: identical claim, independently reported. Same fix applied.
  - `[low]` `[patch]` Edge Case Hunter: domain/ports `files` entries have no `.svelte` counterpart, unlike the adapters entries (`src/adapters/**/*.ts` and `src/adapters/**/*.svelte`) — evidence: `eslint.config.js`'s boundary rule block lists `'src/domain/**/*.ts'`/`'src/ports/**/*.ts'` with no `.svelte` globs. No `.svelte` files exist under `domain/`/`ports/` today (architecturally they shouldn't, per AD-1/AD-12), so the bad outcome is unlikely, but the fix (two glob strings, matching the existing adapters pattern) is trivial enough not to reject under the low-rejection rule. Applied: added `'src/domain/**/*.svelte'` and `'src/ports/**/*.svelte'` to that `files` array.
  - `[low]` `[patch]` Blind Hunter: resolver's `.svelte` extension is configured but never exercised by any test case (all six fixtures target `.ts` files) — evidence: none of the valid/invalid cases import a `.svelte`-suffixed path, so a regression breaking `.svelte` resolution specifically would not be caught. Applied: swapped the cross-adapter invalid case to `src/adapters/persistence/tally-repository.ts` importing `'../ui/ScopePicker.svelte'`.
  - `[low]` `[reject]` Blind Hunter: `tsconfig.json`'s new `allowJs: true` is unscoped (applies to the whole program via the `"src"` include entry, not just the one cross-file import motivating it) — evidence: verified `src/` currently contains zero `.js` files (`find src -name '*.js'` → empty), so the described bad outcome does not occur today; scoping it more narrowly would require a second tsconfig or similar, which is more than a direct/trivial fix — rejected per the low-finding rejection rule (unlikely in everyday use, fix more than trivial).
  - `[false]` `[reject]` Blind Hunter: `import.meta.dirname` reliance is unverified against the toolchain (Node/TS version, `tsconfig` target/lib, no `engines` field touched) — evidence: disproven directly — `npm run typecheck` (`tsc --noEmit && svelte-check`) passed with 0 errors, and `npm run test` executed `eslint.config.test.ts` (which calls `import.meta.dirname`) successfully as part of the full suite, both independently confirmed by this session.
  - `[false]` `[reject]` Blind Hunter: `vitest.config.ts`'s new `'*.test.ts'` include entry is unscoped to `eslint.config.test.ts` specifically, silently broadening test discovery with no comment on the tradeoff — evidence: this is the exact change the spec's own Tasks & Acceptance section specifies (`test.include` → `['src/**/*.test.ts', '*.test.ts']`); no concrete bad outcome is named beyond "broader," which is the intended, spec-directed effect, not a defect.
  - `[false]` `[reject]` Blind Hunter: no architecture doc (e.g. an AD-1 reference doc) was updated, so the new rule's rationale is discoverable "only by accident" — evidence: disproven — both new code comments explicitly name "AD-1" (`// AD-1's other half: domain/ imports nothing from adapters/ or app/...`), matching the exact convention the pre-existing `adapterZones` comment already uses (`// AD-1: cross-adapter interaction...`), and AD-1 is already documented in `ARCHITECTURE-SPINE.md`; the rule's "why" is grep-discoverable the same way the pre-existing rule's always was.

### 2026-09-10 — Review pass (follow-up)
- verdicts: 13 findings — high 3, medium 0, low 9, false 1, maybe-false 0
- findings:
  - `[high]` `[patch]` Blind Hunter: `src/domain/**/*.svelte`/`src/ports/**/*.svelte` `files`-glob entries are never exercised by any fixture — evidence: `eslint.config.test.ts`'s real-flat-config `Linter` test only calls `violations()` with `.ts` filenames; dropping the two `.svelte` entries would ship undetected. Grouped with Edge Case Hunter/Verification Gap below (same root cause: the real-flat-config test covers only 2 of the 6 `files` glob entries). Applied: added `violations('src/domain/Thing.svelte', ...)`/`violations('src/ports/Thing.svelte', ...)` assertions using a minimal synthetic SFC (no real `.svelte` file exists under `domain/`/`ports/` today, matching the verification-gap layer's own filed proposal); real-file `src/adapters/ui/screens.ts` (invalid) and `src/adapters/persistence/tally-repository.ts` (valid) assertions closing the adapters `.ts` gap; and a `src/adapters/ui/ScopePicker.svelte` (real file, synthetic script content) assertion closing the adapters `.svelte` gap — all six `files` glob entries are now individually covered. Re-verified: `npm run lint`, `npm run typecheck`, `npm run test` all exit 0; individually stripped each of the four newly-covered `files` entries (and, separately, all four at once) and confirmed the corresponding new assertion(s) fail each time, then restored and confirmed the full suite passes.
  - `[high]` `[patch]` Edge Case Hunter: adapters `files`-glob regression (`src/adapters/**/*.ts`/`.svelte`) undetected by either test — evidence: empirically verified by stripping those entries and re-running the real-flat-config test; it still passed. Same root cause and fix as above.
  - `[high]` `[patch]` Verification Gap Reviewer (pre-verified, filed disposition `patch`): `.svelte` file-routing for the new domain/ports zones unverified by the real-config test — evidence: neither existing test supplies a `.svelte` filename to the real flat config. Same root cause and fix as above; synthetic filenames `src/domain/Thing.svelte`/`src/ports/Thing.svelte` used per this layer's own proposal.
  - `[low]` `[patch]` Blind Hunter: no RuleTester case exercises `ports/` → `domain/` (only the reverse direction is asserted valid) or same-directory imports — evidence: `eslint.config.test.ts`'s `valid` array has a `domain/ → ports/` case but no `ports/ → domain/` case; a future edit narrowing only the untested direction would ship without regression coverage. Same-directory coverage rejected as redundant (structurally these zones' `from` patterns can never match a same-directory import, so no real risk there); the asymmetric-direction part is real and the fix trivial. Applied: added one `valid` case, `src/ports/card-repository.ts` importing `../domain/drill`. Re-verified: `npm run test` passes with the new case included.
  - `[low]` `[reject]` Blind Hunter: spec `I/O & Edge-Case Matrix` still lists only 3 invalid scenarios but the shipped test has 5 invalid cases — evidence: `eslint.config.test.ts` has 5 `invalid` entries, matrix documents 3. Grouped with the three findings below (same root cause: intent-contract/Tasks&Acceptance text and Code Map were never reconciled with the final code shape after in-loop review patches). Fix would be to edit this build's spec — rejected per that categorical rule, not routed to bad_spec (the code/test is correct and more thorough than documented; nothing is broken).
  - `[low]` `[reject]` Blind Hunter: spec Code Map never updated to mention the new `boundaryResolverSettings` export — evidence: Code Map section lists only `adapterZones` as needing to become a named export. Same root cause and rejection reason as above.
  - `[low]` `[reject]` Edge Case Hunter: spec's Tasks & Acceptance claims "all six I/O-matrix scenarios (3 valid, 3 invalid)" but the shipped test has 8 cases (3 valid, 5 invalid) — evidence: counted directly in `eslint.config.test.ts`. Same root cause and rejection reason as above.
  - `[low]` `[reject]` Intent Alignment Auditor: intent-contract Approach/Tasks-and-Acceptance text never revised to mention the real-flat-config `Linter`-based test added via the review loop — evidence: contract text says "run one `RuleTester.run(...)`"; the file ships two `it()` blocks using two different verification mechanisms. Same root cause and rejection reason as above.
  - `[low]` `[reject]` Intent Alignment Auditor: literal I/O matrix's named fixture (`src/adapters/ui/screens.ts` importing `../persistence/db`) differs from the shipped cross-adapter fixture (`tally-repository.ts` importing `../ui/ScopePicker.svelte`), and two extra invalid cases exist beyond the matrix's 6 — evidence: read directly from `eslint.config.test.ts`. Same root cause and rejection reason as above.
  - `[low]` `[defer]` Blind Hunter: `deferred-work.md`'s DW-1/DW-11 `resolution` field references bundle id `dw-eslint-domain-boundary-hardening`, which matches no file on disk (actual spec is `spec-dw-1-11-eslint-domain-boundary-hardening.md`) — evidence: confirmed via the file's diff since baseline. Deferred, not fixed: `deferred-work.md` is the orchestrator's own ledger bookkeeping (already written before this review pass started), explicitly out of scope for this build to modify.
  - `[low]` `[defer]` Blind Hunter: `deferred-work.md`'s new `resolution-undo` field has no legend explaining its hex-encoded previous-value format — evidence: confirmed via the file's diff since baseline. Same reason as above: orchestrator-owned ledger, out of scope.
  - `[low]` `[reject]` Blind Hunter: `importPlugin.rules['no-restricted-paths'] as unknown as Rule.RuleModule` discards the `| undefined` that `noUncheckedIndexedAccess` (confirmed set in `tsconfig.json`) would otherwise carry, so a renamed/removed upstream rule name surfaces only as a runtime error inside `RuleTester.run` rather than a compile-time one — evidence: real, but the failure mode is already loud (fails the test suite immediately, just with a less specific message), and the only fix (an undefined-guard) would add a branch guarding state never demonstrated to occur. Rejected: unlikely in everyday use, and the fix is more than a direct correction.
  - `[false]` `[reject]` Intent Alignment Auditor: resolver-settings fidelity requirement (`boundaryResolverSettings` sourced from the real config rather than hand-typed) has no textual anchor in the intent-contract's "Always" bullets — evidence: disproven as a defect — nothing broke; the diff delivers more consistency than the contract's literal text required, which is not a bad outcome.

## Verification

**Commands:**
- `npm run lint` -- expected: exits 0, no violations.
- `npm run typecheck` -- expected: exits 0 (`tsc --noEmit && svelte-check`), no errors.
- `npm run test` -- expected: all test files pass, including `eslint.config.test.ts`.

**Manual checks (if no CLI):** none beyond the commands above.

## Auto Run Result

**Summary:** This was a follow-up review pass on a spec previously marked `done`. Four independent review layers (Blind Hunter, Edge Case Hunter, Verification Gap Reviewer, Intent Alignment Auditor) reviewed the diff against baseline `54c8882`. The review found the existing implementation's real-flat-config `Linter` regression test (added in the prior review pass) only exercised 2 of the 6 `files`-glob entries in the boundary rule block (`src/domain/**/*.ts` and `src/ports/**/*.ts`), leaving `src/adapters/**/*.ts`, `src/adapters/**/*.svelte`, `src/domain/**/*.svelte`, and `src/ports/**/*.svelte` unprotected against a silent regression — exactly the failure class DW-11 exists to prevent. A smaller gap (no test asserted `ports/` → `domain/` imports stay allowed) was also found. Both were patched directly (no step-03 subagent from this session was available to re-engage).

**Files changed this pass:**
- `eslint.config.test.ts` -- added 4 `violations()` assertions to the real-flat-config test (adapters `.ts` valid+invalid, adapters `.svelte` invalid, domain `.svelte` invalid, ports `.svelte` invalid) closing the `files`-glob coverage gap; added 1 `RuleTester` valid case (`ports/` → `domain/`) closing the asymmetric-direction gap.
- `spec-dw-1-11-eslint-domain-boundary-hardening.md` -- this follow-up review's triage log entry, `deferred` frontmatter (2 new items), this Auto Run Result.

**Review findings breakdown (13 findings, this pass):**
- Patched (4, all verified working): adapters `.ts`/`.svelte` and domain/ports `.svelte` `files`-glob coverage (high, 3 grouped findings from Blind Hunter/Edge Case Hunter/Verification Gap Reviewer); `ports/` → `domain/` RuleTester coverage (low, Blind Hunter).
- Deferred (2, low, both `deferred-work.md` ledger cosmetics -- out of scope, orchestrator-owned): resolution field references a bundle id matching no file on disk; new `resolution-undo` field has no format legend.
- Rejected (7): 4 low + 1 false grouped as spec-documentation drift (I/O matrix scenario count, Code Map missing `boundaryResolverSettings` mention, Tasks & Acceptance scenario count, intent-contract text not mentioning the `Linter`-based test, literal matrix fixture mismatch) -- rejected because the only fix is editing this build's spec, and the code/test is correct and more thorough than documented, not broken; 1 low (TS double-cast discards `| undefined`) -- real but the failure mode is already loud (fails tests immediately) and the only fix adds an undemonstrated guard; 1 false (resolver-settings fidelity has no textual anchor in "Always" bullets) -- not a defect, the diff simply delivers more than the contract's literal text required.

**Verification performed:** `npm run lint`, `npm run typecheck`, and `npm run test` (23 files / 319 tests) all exit 0 after the patch. Empirically confirmed regression-catching for every one of the 4 previously-uncovered `files`-glob entries by individually (and then jointly) stripping each from `eslint.config.js`, observing the corresponding new assertion fail, then restoring and re-confirming the full suite passes.

**Follow-up review recommendation:** `false`. This pass patched a `high` entry (3 grouped findings), which on a follow-up pass would default to `true` -- but every part of that fix was empirically verified (each of the 4 previously-uncovered `files`-glob entries individually confirmed to break the corresponding new assertion when stripped), so there is no specific unverified risk left to name. Patched-by-verdict this pass: high 1 (grouped, 3 findings), low 1.

**Residual risks:** The 3 `reject`ed spec-documentation-drift items (I/O matrix, Code Map, Tasks & Acceptance) mean the spec's own text no longer precisely describes the shipped test's scenario count/fixtures -- purely cosmetic, no functional risk, out of this triage step's power to fix. The TS double-cast (`Rule.RuleModule`) issue means a future upstream rule rename would surface as a runtime error rather than a compile error -- low-impact since the test suite would still fail loudly. The 2 deferred `deferred-work.md` ledger items are the orchestrator's responsibility, not this build's.

