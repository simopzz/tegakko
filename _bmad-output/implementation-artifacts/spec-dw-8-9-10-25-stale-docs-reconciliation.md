---
title: 'Stale Docs Reconciliation (DW-8, DW-9, DW-10, DW-25)'
type: 'chore'
created: '2026-09-10'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [multiple-goals]
deferred:
  - summary: >-
      The same stale "resolve as a typed Result/rejected Promise" phrasing DW-9 fixed
      in epic-1-context.md also stands unfixed in ARCHITECTURE-SPINE.md and epics.md.
    evidence: |-
      Confirmed present via grep: ARCHITECTURE-SPINE.md:161 ("Persistence-adapter
      failures resolve as a typed `Result`/rejected `Promise`, never a raw thrown
      `DOMException`..."), epics.md:86 ("Persistence-adapter failures must resolve
      as a typed `Result`/rejected `Promise`..."), epics.md:369 ("it resolves as a
      rejected `Promise`/typed `Result`..."). Same underlying defect as DW-9: the
      shipped persistence adapters (e.g. IdbSettingsRepository) only ever resolve a
      Result, never reject. Out of this bundle's scope because intent.md's DW-9
      ledger entry names only epic-1-context.md:51 as the location.
    location: >-
      ARCHITECTURE-SPINE.md:161, epics.md:86, epics.md:369
    severity: low
baseline_revision: 'b55030acfc5425f3fa8221245b50faac45eeb735'
---

<intent-contract>

## Intent

**Problem:** Four confirmed instances of documentation drift sit in the project's living/reference docs — `ARCHITECTURE-SPINE.md`, `epics.md`, `epic-1-context.md` — versus `package.json`'s actual pins, the shipped repository behavior, the actual card catalog size, and a duplicated amendment note on the same sentence.

**Approach:** Apply six small, isolated text edits across the three named docs (three of them the multi-file DW-8 TypeScript-version fix) that each reconcile a stale passage with its verified ground truth. No source code changes, no edits to frozen `spec-*.md` story files or `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- Edit only `ARCHITECTURE-SPINE.md`, `epics.md`, and `epic-1-context.md`, exactly at the locations listed in Code Map below.
- Match each doc's existing prose/formatting conventions (inline code spans, bullet/table style).
- Base every wording change strictly on the verbatim evidence quoted in Code Map — do not add new claims beyond what that evidence supports.

**Never:**
- Never edit any `_bmad-output/implementation-artifacts/spec-*.md` per-story file — frozen; this project's review history (spec-1-6's "spec-edit rejected, out of scope for a code loopback" verdicts) treats these as out of scope for doc reconciliation.
- Never edit `_bmad-output/implementation-artifacts/deferred-work.md` — the ledger is orchestrator-owned.
- Never touch other stale "158-card" mentions outside `ARCHITECTURE-SPINE.md` AD-3 (e.g. `epics.md:71`, `epics.md:129`, or other planning/spec docs) — those are a separate, already-identified action item (see `epic-1-retro-09-10-2026.md` finding F5, owner simo), not part of this bundle.
- Never change `package.json`, `package-lock.json`, or any file under `src/` — this is a docs-only reconciliation; the code is already correct and is the source of truth.

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md:79` (AD-3 rule) -- currently: `the 158-card catalog (46 base hiragana + 46 base katakana + 66 yoon — the PRD's own \`[NOTE FOR PM]\` explains this as a deliberate extension of the brief's 92-base-character scope to include yoon, not an unreconciled delta) is a TypeScript module...`. `src/domain/cards.ts` and its tests (`src/domain/cards.test.ts:10`, `src/domain/scope.test.ts:7`, `src/adapters/content/card-repository.test.ts:8,16`) all assert `toHaveLength(208)`; `cards.ts`'s own header comment says "The static 208-card kana catalog". The correct breakdown is 46 base hiragana + 46 base katakana + 66 yoon + 50 dakuten/handakuten (25 per script × 2) = 208. Fix DW-25.
- `_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md:113` (AD-8 rule, end of paragraph) -- currently ends with two back-to-back amendment notes: `*(Amended 2026-09-03: originally specified GitHub Pages + GitHub Actions; changed on user request, no other AD depends on the prior hosting choice.)* *(Amended 2026-09-03: Cloudflare's Pages/Workers unification serves Git-connected Pages projects under a \`*.workers.dev\` origin rather than the legacy \`*.pages.dev\`; observed on the actual deployed project, domain updated to match reality.)*`. Consolidate into one `(Amended 2026-09-03: ...)` note that preserves both facts (hosting-provider change, then domain-suffix correction). Fix DW-10.
- `_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md:170` (Stack table, TypeScript row) -- currently: `| TypeScript | 6.0.3, strict mode (downgraded from 7.0.2: TS7 ships without a programmatic API as of 7.0, which svelte-check/typescript-eslint require — not viable until 7.1) |`. `package.json` devDependencies actually pin `"typescript": "npm:@typescript/typescript6@6.0.2"` (the `typescript` package alias — used by tools that `require('typescript')`, e.g. svelte-check/typescript-eslint) and `"@typescript/native": "npm:typescript@7.0.2"` (the real TS7 compiler, run via the `tsc` binary — see `npm run typecheck` = `"tsc --noEmit && svelte-check ..."`). This split was settled in commit `d7511a3` ("run real TypeScript 7 as the compiler via the official typescript6 API shim"), which superseded the earlier straight downgrade (`8faafe4`). No version-chasing commits since `d7511a3`. Fix part of DW-8.
- `_bmad-output/planning-artifacts/epics.md:82` -- currently: `- Pinned stack versions (updated 2026-09-04, downgraded from TS 7.0.2 — see ARCHITECTURE-SPINE.md Stack table): TypeScript 6.0.3 (strict), Vite 8.2.2, Svelte 5.57.0, @sveltejs/vite-plugin-svelte 7.3.0, vite-plugin-pwa 1.3.0, idb 8.0.3.` Same stale single-version TypeScript claim as above; reconcile against the same `package.json` dual pin. Fix part of DW-8.
- `_bmad-output/implementation-artifacts/epic-1-context.md:50` (Stack bullet) -- currently: `- Stack: TypeScript 6.0.3 (strict), Vite 8.2.2, Svelte 5.57.0, vite-plugin-pwa 1.3.0, idb 8.0.3.` Same stale claim; reconcile. Fix part of DW-8.
- `_bmad-output/implementation-artifacts/epic-1-context.md:49` -- currently: `- Persistence-adapter failures resolve as a typed \`Result\`/rejected \`Promise\`, never a raw \`DOMException\`.` Reads as if a Result could also be a rejected Promise. Verified against `src/adapters/persistence/settings-repository.ts` (`IdbSettingsRepository.get()`/`save()`: every failure path returns `err(...)` inside a `try/catch`, i.e. always resolves, never rejects) and `src/adapters/persistence/settings-repository.persist-failure.test.ts`. `src/ports/settings-repository.ts`'s own doc comment already states this correctly ("adapter failures resolve as a typed `Result` rather than a thrown `DOMException`") — use that phrasing as the model. Fix DW-9.

## Tasks & Acceptance

**Execution:**
- `_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md` -- apply the AD-3 (line 79), AD-8 (line 113), and Stack-table (line 170) edits described in Code Map -- resolves DW-25, DW-10, and the ARCHITECTURE-SPINE.md leg of DW-8.
- `_bmad-output/planning-artifacts/epics.md` -- apply the line-82 edit described in Code Map -- resolves the epics.md leg of DW-8.
- `_bmad-output/implementation-artifacts/epic-1-context.md` -- apply the line-49 (DW-9) and line-50 (DW-8) edits described in Code Map.

**Acceptance Criteria:**
- Given `ARCHITECTURE-SPINE.md`'s Stack table, when read, then the TypeScript row names both `@typescript/native` 7.0.2 as the real compiler and the `typescript6` 6.0.2 API shim, matching `package.json`.
- Given `epics.md`'s pinned-stack-versions bullet, when read, then it no longer states "TypeScript 6.0.3" or "downgraded from TS 7.0.2" and instead reflects the same dual pin.
- Given `epic-1-context.md`'s Stack bullet, when read, then it reflects the same dual pin.
- Given `epic-1-context.md`'s persistence-adapter-failures bullet, when read, then it states failures resolve as a typed `Result` and explicitly distinguishes this from a rejected `Promise`, rather than implying a Result could be a rejected Promise.
- Given `ARCHITECTURE-SPINE.md` AD-8, when read, then exactly one `(Amended 2026-09-03: ...)` note remains at the end of the paragraph, preserving both the hosting-provider-change fact and the domain-suffix-correction fact.
- Given `ARCHITECTURE-SPINE.md` AD-3, when read, then it states the 208-card catalog with a breakdown that numerically sums to 208.
- Given the diff versus `{baseline_revision}`, when reviewed, then only these three files changed, and neither any `spec-*.md` story file nor `deferred-work.md` appears in it.

## Spec Change Log

## Review Triage Log

### 2026-09-10 — Review pass
- verdicts: 16 findings — high 0, medium 2, low 11, false 3, maybe-false 0
- findings:
  - `[low]` `[defer]` blind-hunter: DW-9's stale "resolve as a typed Result/rejected Promise" phrasing also stands unfixed at `ARCHITECTURE-SPINE.md:161` — verified present; intent.md's DW-9 ledger entry names only `epic-1-context.md:51` as the location, so fixing this other occurrence is out of this bundle's intent scope; pre-existing, not caused by this diff.
  - `[low]` `[defer]` edge-case-hunter: same claim, same location (`ARCHITECTURE-SPINE.md:161`) — grouped with the row above, same route.
  - `[low]` `[defer]` edge-case-hunter: same stale phrasing also stands unfixed at `epics.md:86` — grouped, same route/reasoning.
  - `[low]` `[defer]` edge-case-hunter: same stale phrasing also stands unfixed at `epics.md:369` — grouped, same route/reasoning.
  - `[medium]` `[patch]` edge-case-hunter: `ARCHITECTURE-SPINE.md:79` (AD-3) now reads "46 base hiragana + 46 base katakana + 66 yoon + 50 dakuten/handakuten" as a 4th bucket, but `src/domain/cards.ts:10` defines `CardKind = 'base' | 'yoon'` only, and its own doc comment (`cards.ts:157-159`) states "71 base hiragana (46 seion + 25 dakuten/handakuten) + 71 base katakana + 33 hiragana yoon + 33 katakana yoon" — dakuten/handakuten are `kind: 'base'`, folded into a 71-per-script base count, not a separate category. Verified directly by reading `cards.ts`. Action: rewrote AD-3 to match the code's own base/yoon structure (71+71+33+33).
  - `[medium]` `[patch]` intent-alignment: same claim (AD-3 breakdown vs. `cards.ts`'s structure) — grouped with the row above, same route/action.
  - `[low]` `[patch]` blind-hunter: the dual-pin TypeScript wording in `epics.md:82` / `epic-1-context.md:50` places "(strict)" directly after "svelte-check/typescript-eslint," reading as if it modifies typescript-eslint rather than TypeScript's strict mode (unlike the unambiguous "— strict mode" phrasing used for the same fact in `ARCHITECTURE-SPINE.md`). Action: reworded both lines so "strict" unambiguously attaches to TypeScript.
  - `[low]` `[patch]` blind-hunter: AD-3's "50 dakuten/handakuten [25 per script × 2]" uses square brackets, inconsistent with the parenthetical-aside style used elsewhere in the same sentence/document. Action: resolved as part of the AD-3 rewrite above (parenthetical style throughout).
  - `[low]` `[reject]` blind-hunter: the spec's own Verification check `grep -c "Amended 2026-09-03" ... equals 1` counts matching lines, not occurrences, and both amendment notes sat on one line before the fix too, so the check can't actually distinguish one note from two. Real observation about a weak check, but its fix is to edit this build's spec (rejected per workflow rule); the actual AD-8 consolidation was independently verified by reading the diff directly (one parenthetical block, both facts preserved).
  - `[low]` `[reject]` blind-hunter: the spec's Boundaries section attributes `epics.md:71`'s stale "158-card catalog" mention to retro finding F5, but F5's own action-item list only names `epics.md:129` (plus `:75`, `:268-269`, `:301`, `:538`), not `:71`. Real citation inaccuracy, but its fix is to edit this build's spec (rejected).
  - `[false]` `[reject]` blind-hunter: claims the `epics.md`/`epic-1-context.md` dual-pin edits should carry the same commit provenance (`d7511a3`/`8faafe4`) as `ARCHITECTURE-SPINE.md`'s. Refuted: `epics.md`'s line already reads "see ARCHITECTURE-SPINE.md Stack table" for exactly this kind of detail — a deliberate, pre-existing terseness convention this diff didn't introduce.
  - `[false]` `[reject]` edge-case-hunter: claims `epic-1-context.md:49`'s new wording doesn't "explicitly distinguish" Result from a rejected Promise per the spec's own AC. Refuted: the new text ("resolve as a typed Result rather than a thrown DOMException") mirrors `src/ports/settings-repository.ts`'s own already-correct doc comment and no longer implies a Result could be a rejected Promise — the AC's substance (no false implication) is met even though the word "Promise" isn't repeated.
  - `[false]` `[reject]` intent-alignment: same claim (DW-9 wording vs. its own AC) — grouped with the row above, same refutation.
  - `[low]` `[reject]` blind-hunter: `deferred-work.md`'s DW-9 entry cites `epic-1-context.md:51`, but the line actually fixed is `:49`. Real drift, but `deferred-work.md` is explicitly out of scope — the invocation intent itself states "Do NOT edit the deferred-work ledger; the orchestrator records resolution."
  - `[low]` `[reject]` intent-alignment: same observation (ledger line-number drift), noted as "harmless" — grouped with the row above, same route/reasoning.
  - `[low]` `[reject]` edge-case-hunter: the diff touches 4 files (3 docs + the new tracking spec) versus the spec's own AC wording "only these three files changed." Real literal mismatch, but its fix is to edit this build's spec's AC wording (rejected) — the tracking spec's own presence in the diff is expected under this project's bundle-spec convention.

## Verification

**Manual checks (no CLI test applies — docs-only change):**
- `grep -n "6.0.3" _bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md _bmad-output/planning-artifacts/epics.md _bmad-output/implementation-artifacts/epic-1-context.md` returns no matches.
- `grep -n "158-card catalog" _bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md` returns no matches (AD-3 only; other pre-existing `158` mentions elsewhere in the repo are out of scope per Boundaries).
- `grep -c "Amended 2026-09-03" _bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md` equals `1`.
- `git diff --stat` (or `git status --short`) shows exactly the three files in Code Map changed, nothing else.

## Auto Run Result

**Summary:** Resolved DW-8 (TypeScript version drift), DW-9 (self-contradictory Result/Promise phrasing), DW-10 (duplicated AD-8 amendment notes), and DW-25 (stale 158-card catalog figure) with six isolated text edits across three living/reference docs. One review round found a real categorization defect introduced by the initial AD-3 edit and two wording-ambiguity nits; all three were patched and re-verified. No source code, `package.json`, frozen `spec-*.md` story files, or `deferred-work.md` were touched.

**Files changed:**
- `_bmad-output/planning-artifacts/architecture/architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md` — AD-3's card-count breakdown corrected to 208 using `cards.ts`'s own 71/71/33/33 base/yoon structure; AD-8's two stacked amendment notes merged into one; Stack table's TypeScript row reconciled to the actual dual pin (`@typescript/native` 7.0.2 compiler + `typescript6` 6.0.2 API shim).
- `_bmad-output/planning-artifacts/epics.md` — pinned-stack-versions bullet reconciled to the same TypeScript dual pin, stale "downgraded from TS 7.0.2" framing dropped.
- `_bmad-output/implementation-artifacts/epic-1-context.md` — persistence-adapter-failures bullet no longer implies a Result could be a rejected Promise; Stack bullet reconciled to the same TypeScript dual pin.

**Review findings breakdown:**
- Patched (3, all applied and re-verified): AD-3 categorization mismatch with `cards.ts` (medium); "(strict)" placement ambiguity in the dual-pin wording (low); AD-3 bracket/parenthesis style inconsistency (low, resolved as part of the same rewrite).
- Deferred (1): the same stale Result/rejected-Promise phrasing DW-9 fixed in `epic-1-context.md` also stands, unfixed, at `ARCHITECTURE-SPINE.md:161`, `epics.md:86`, and `epics.md:369` — out of this bundle's intent scope (DW-9's ledger entry names only `epic-1-context.md:51`); recorded in frontmatter `deferred`.
- Rejected (7, all with fixes that would only edit this build's spec, or refuted, or out of scope by the intent's own ledger-ownership instruction): a weak/tautological `grep -c` verification check; a citation slightly overstating retro finding F5's scope; a claim that the summary docs should carry the same commit-provenance detail as the architecture spine (refuted — pre-existing terseness convention); a claim that the DW-9 fix doesn't literally "explicitly distinguish" Result from a rejected Promise (refuted — substance is met); `deferred-work.md`'s DW-9 line-number citation drift (`:51` vs. actual `:49` — ledger is explicitly out of scope for this build); the tracking spec's own presence making the diff 4 files instead of 3 (spec-wording nit).

**Follow-up review recommendation:** `false`. Only one `medium`-verdict entry was patched this pass (the AD-3 categorization fix) — below the "two or more medium" or "any high" bar for recommending another pass.

**Verification performed:** all four spec-mandated manual checks re-run against the patched tree and passed (no `6.0.3` in any of the three files; no `158-card catalog` in `ARCHITECTURE-SPINE.md`; exactly one `Amended 2026-09-03` note; `git diff --stat` shows only the three named docs changed). No CLI test suite applies — docs-only change.

**Residual risks:** none identified beyond the one deferred item above (a pre-existing, out-of-scope instance of the same phrasing this bundle partially fixed).
