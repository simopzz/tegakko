---
type: reconciliation-review
target: architecture-tegakko-2026-09-02/ARCHITECTURE-SPINE.md
against: prds/prd-tegakko-2026-09-02/prd.md
created: 2026-09-03
---

# Reconciliation Review — ARCHITECTURE-SPINE.md vs prd.md

## Method

Walked every FR-1..FR-14 against the spine's Capability → Architecture Map row, then followed each row's "Governed by" pointer back to the actual AD/Structural-Seed text to check whether the AD's **Rule** genuinely produces the FR's testable **Consequences** (not just names a plausible-sounding location). Cross-checked the IndexedDB schema (ERD + AD-3/AD-4) against FR-6/8/9/10/12, AD-5 against FR-13, and every §5.2 permanent exclusion against the spine's structure. Also checked §7 Open Questions/Assumptions for silent resolution or drift.

## Overall Verdict: Minor gaps

Twelve of fourteen FRs are genuinely covered with a specific, testable AD behind them. Two issues rise above nitpick level: one real omission (FR-13's replace-vs-merge import default is never encoded anywhere) and one structural weak point (FR-7's weak-spot selection has no AD guarding the "not an SRS" boundary that the PRD itself flags as a live tension). Everything in §5.2 (accounts, OCR grading, gamification) is safely excluded by the current domain model. One internal spine inconsistency (AD-3's Binds list) is also worth a fix.

## FR-by-FR walk

| FR | Map row target | Verdict |
|---|---|---|
| FR-1 | `domain/cards.ts`, AD-3 | **Covered.** AD-3's `"<grapheme>:<script>"` natural key structurally guarantees hiragana/katakana and base/yoon pairs never merge (FR-1's 3rd consequence). 158-card catalog count matches PRD §7.4's default-taken assumption exactly. |
| FR-2 | `adapters/ui`→`domain`, **"Design Paradigm"** | **Nominally covered, thin.** No AD constrains scope-filter behavior; "Design Paradigm" is a descriptive section, not a rule with a Prevents clause. SESSION.scope (string) in the ERD gives it a persistence home, but nothing enforces FR-2's "script + base/yoon" granularity or ties it to FR-7/FR-9 the way the FR text requires. Acceptable at spine altitude but the weakest citation in the table alongside FR-9. |
| FR-3 | `adapters/ink`, AD-2 | **Covered.** AD-2's isolation-from-Svelte-reactivity rule is the direct architectural answer to the FR-3 feature-specific NFR (latency must match the PoC). Width-preset/pressure consequences are satisfied one layer down by AD-4's `Stroke.widthPreset` field. |
| FR-4 | `adapters/ui`+`domain`, AD-1 | **Covered** (generically, appropriately — FR-4 is a straightforward loop, doesn't need a dedicated AD). |
| FR-5 | `adapters/ui`, **AD-3** | **Covered but mis-cited.** AD-3's own **Binds** line lists only FR-1, yet this row cites AD-3 as FR-5's governor. AD-3's content (in-memory CardRepository + natural key) does support reveal rendering the stored grapheme, so the *substance* is fine — but AD-3's Binds field should list FR-5 too, or the row should cite something else. Minor documentation inconsistency, not a coverage gap. |
| FR-6 | `domain`+`adapters/persistence` (tallies), **"Consistency Conventions"** | **Covered.** TALLY{cardId, missCount} in the ERD, backed by idb persistence, satisfies "tally persists across sessions." "Consistency Conventions" as the governor is a weak citation (it's a naming/format table, not a behavioral rule) but the schema itself does the real work here. |
| FR-7 | `domain`, **"Design Paradigm"** | **Real gap.** No AD constrains the weak-spot selection algorithm. PRD §4.3's description and §5.2 both explicitly flag "deliberately not a full SRS" as a considered, non-obvious boundary — this is exactly the kind of thing an AD's "Prevents" clause exists for (compare AD-3's "prevents a builder adding IndexedDB seed/migration logic," AD-4's "prevents a builder normalizing strokes"). Nothing in the spine prevents a future implementer from building FR-7's "selection algorithm" as a due-date/interval scheduler, which would violate the PRD's permanent SRS exclusion. This is the one FR most exposed to reintroducing an explicitly-rejected feature, and the spine is silent on it. |
| FR-8 | `domain`+`adapters/persistence` (attempts), AD-4 | **Covered, verified field-by-field.** ATTEMPT ERD entity carries cardId, timestamp, timeToFirstStrokeMs, totalTimeMs, strokeCount, revealUsed, selfGrade — every field FR-8's consequences list, exactly matching PRD §7.6's assumed field set. AD-4 explicitly and self-consciously reinterprets FR-8's "links to its raw stroke data" as direct embedding rather than a join — a deliberate, disclosed design choice, not a silent contradiction. |
| FR-9 | `adapters/ui`+`domain`, **"Design Paradigm"** | **Nominally covered, thin — same pattern as FR-2.** SESSION.closureReason (string) in the ERD gives the "flagged as distinct" consequence a place to live, and the Deferred section correctly declines to hard-code the ~5min idle value (appropriately leaving PRD §7.5 open rather than silently resolving it). But the closure-decision logic itself (explicit / full-scope-complete / idle) has no AD backing it, same weak-citation pattern as FR-2. |
| FR-10 | `domain`+`adapters/persistence` (sessions), "Structural Seed (ERD)" | **Covered.** SESSION{id, date, scope, cardsAttempted, accuracy, closureReason} maps 1:1 onto FR-10's four required fields. |
| FR-11 | `adapters/ui`+`adapters/persistence`, AD-1 | **Covered** at architecture altitude; reverse-chronological ordering and inactivity-session visual distinction are UI-layer details correctly left unspecified here. |
| FR-12 | `adapters/persistence`, AD-4 + Stack | **Covered, precisely.** AD-4's rule text explicitly states "points grid-relative per PRD FR-12" — this directly answers FR-12's most specific and easy-to-get-wrong consequence (grid-relative, not absolute-viewport-pixel storage), which the PRD itself calls out as *not* proven by the PoC. This is the single most carefully-reconciled line in the whole map. |
| FR-13 | `adapters/io`, AD-5 | **Half-covered — real gap.** AD-5 fully satisfies the *export* side: the `Attempt → AttemptExport` mapping (all fields except `strokes`) is exactly FR-13's "stroke-level ink data is out of scope for export" consequence, and schema+version validation on import matches FR-13's malformed-file-rejection consequence. **But the replace-vs-merge import behavior — FR-13's 2nd consequence and PRD §7.3's explicit destructive-by-default default-taken assumption — appears nowhere in AD-5 or anywhere else in the spine.** AD-5's rule only says import "validates... before applying"; it never states that applying means wholesale replacement of local tallies/attempts/sessions. A builder reading only the spine has no structural signal to implement replace-not-merge rather than a merge/upsert, which is the PRD's stated destructive-default concern. |
| FR-14 | `app/`+vite-plugin-pwa, AD-7+AD-8 | **Covered.** AD-8 (stable public HTTPS origin via GitHub Pages) directly satisfies FR-14's secure-context NFR; AD-7 (silent auto-update) is a compatible, non-contradicting design choice for a single-user app. manifest.webmanifest present in Structural Seed. |

## §5.2 permanent-exclusion risk check

- **No SRS:** Mostly clean — TALLY has no decay/interval/due-date fields, and no AD introduces scheduling. The one exposure is FR-7's ungoverned selection algorithm (see above) — a structural absence of a guardrail, not evidence of reintroduction.
- **No accounts:** Clean. Consistency Conventions table explicitly states "No auth/session concept beyond the practice Session entity — single local user throughout."
- **No OCR/shape grading:** Clean. Domain model has no grading module; ATTEMPT.selfGrade is user-entered, FR-4's "no grading logic evaluates the drawn stroke" is structurally impossible to violate since there's no such port/adapter in the map.
- **No gamification:** Clean. No points/streak/badge concept anywhere in ERD, ports, or ADs.

## §7 Open Questions/Assumptions — silent-resolution check

- §7.3 (replace vs merge): **not encoded** — see FR-13 finding above.
- §7.4 (yoon scope, 158 cards): **correctly encoded** in AD-3's "158-card catalog" line — matches the default taken.
- §7.5 (idle threshold ~5min): **correctly left open** — Deferred section explicitly defers the exact value to story level, doesn't silently hard-code it into an AD.
- §7.2 (tally decay/reset): **correctly left open** — no decay field forced into the TALLY schema.
- §7.6 (attempt field-list completeness): **encoded as given** — ATTEMPT ERD mirrors the PRD's assumed field list exactly (inherits the assumption's risk, doesn't add new risk).
- §7.1, §7.7: not materially engaged by the spine either way; no contradiction.

## Summary of actionable findings

1. **(Gap)** FR-13's replace-not-merge import default (PRD §7.3, FR-13 consequence 2) has no corresponding rule in AD-5 or elsewhere — only export-shape and schema/version validation are covered.
2. **(Gap)** FR-7 (weak-spot selection) is governed only by the generic "Design Paradigm" section with no AD guarding the PRD's explicit "not an SRS" boundary (§4.3, §5.2) — the one FR most exposed to scope creep into a rejected feature.
3. **(Inconsistency)** AD-3's "Binds: FR-1" line doesn't list FR-5, even though the Capability Map cites AD-3 as FR-5's governor.
4. **(Thin coverage, minor)** FR-2 and FR-9 are both cited against "Design Paradigm" rather than a specific AD — a location is named but no behavioral rule constrains either scope-selection or closure-decision logic. Consistent pattern with finding 2, lower stakes since neither touches a §5.2 boundary.
5. **(Confirmed clean)** FR-1/6/8/10/12 and the export-half of FR-13 are all precisely satisfied by the IndexedDB schema and AD-3/AD-4/AD-5 as written; §5.2's accounts/OCR/gamification exclusions are all structurally clean.
