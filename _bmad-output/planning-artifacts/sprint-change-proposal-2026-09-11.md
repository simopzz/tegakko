# Sprint Change Proposal — 2026-09-11

## 1. Issue Summary

**Trigger:** Dogfooding the shipped Epic 1 drill (post Story 1.11, dakuten/handakuten catalog expansion) surfaced that the prompt is ambiguous for a small subset of cards.

**Problem:** The Drill prompt shows only romaji + script name (Story 1.3 AC, UX-DR17, DESIGN.md, EXPERIENCE.md — "no mnemonic," standing exclusion). Standard Hepburn romanization — correctly used throughout `domain/cards.ts` — romanizes both じ (za-row) and ぢ (da-row) as `"ji"`, and both ず and づ as `"zu"`. `cards.ts:76-77` already flags this explicitly: *"ぢ/づ deliberately duplicate じ/ず's readings (ji/zu) — standard Hepburn, not a bug."* That comment is correct about the romanization; it's silent on the consequence for a *recall-drill prompt*: when the prompt reads `"ji"`, the learner cannot tell whether the card being asked for is じ or ぢ. It's a coin flip, not a recall test — undermining FR-4 ("a prompt... to produce" a specific card) and SM-1 ("a fast, honest read on whether it's really known").

**Scope of the gap:** exactly 4 of 208 cards — ぢ, づ (hiragana) and ヂ, ヅ (katakana). じ/ず/ジ/ズ are unaffected: once the 4 da-row cards carry an explicit written-form qualifier, a bare `"ji"`/`"zu"` prompt is unambiguous by elimination.

**Evidence:** `src/domain/cards.ts:78-95` (`HIRAGANA_ROMAJI`/`KATAKANA_ROMAJI` arrays) — index for じ/ジ and ぢ/ヂ both resolve to `'ji'`; ず/ズ and づ/ヅ both resolve to `'zu'`.

**Decided direction (confirmed with user before this pass):** show both forms inline on just these 4 cards — pronunciation first, written form parenthetical — e.g. ぢ's prompt reads `"ji (di)"`, づ's reads `"zu (du)"`. All other 204 cards are unaffected: one romaji string, exactly as today. No change to Hepburn romanization itself, `cardId` scheme, or catalog card count (still 208).

## 2. Impact Analysis

### Epic Impact
- **Epic 1** (status: in-progress per sprint-status.yaml, retrospective already run): gains one small, additive story — same pattern as Story 1.11, which was kept separate from 1.2 "since it's an independent, purely-additive content change with its own test surface." This finding fits that same shape: additive, isolated, testable on its own.
- **Epic 2** (Export/Portability, backlog): unaffected. `Attempt`/`Session`/export schemas don't reference `romaji`; nothing here touches `AttemptExport` (AD-5).
- No epic resequencing, no epic invalidated, no new epic needed.

### Artifact Conflicts
- **PRD**: no direct FR conflict. FR-1/FR-5's card-content language is silent on romaji uniqueness — worth a short clarifying note but not a rewrite. MVP scope (§5) unaffected; no boundary crossed.
- **Architecture (`ARCHITECTURE-SPINE.md`)**: **AD-3** binds FR-1/FR-5 to the `Card` shape. Needs one addition: an optional `writtenRomaji?: string` field, present only on the 4 da-row dakuten cards, distinct from the existing (unchanged) `romaji` pronunciation field. `cardId` identity (`grapheme:script`) is untouched — this is a display-data addition, not an identity change.
- **UX (`DESIGN.md`, `EXPERIENCE.md`, epics.md UX-DR17)**: the "romaji + script name only, no mnemonic" standing exclusion needs a narrow carve-out clause. The written-form qualifier is not a mnemonic or memory aid — it's intrinsic disambiguating data about the card itself (which grapheme is being asked for), the same category of information `romaji` already is. Typography unaffected: still `{typography.heading}`/`{typography.body}`, never `{typography.glyph-ink}`.
- **Other artifacts**: `cards.ts` (data + comment), `cards.test.ts` (new assertions for the 4 entries), `Drill.svelte` (prompt render), `Drill.test.ts` (new assertions). No deployment/CI/persistence impact — `writtenRomaji` never persists (it's derived catalog data, not part of `Attempt`/`Session`).

## 3. Recommended Approach

**Option 1 — Direct Adjustment.** Add one small story to Epic 1 (mirrors Story 1.11's precedent exactly): amend `Card`'s shape (AD-3) with an optional field, populate it for 4 cards, amend the prompt-render rule (Story 1.3 AC + UX-DR17/DESIGN.md/EXPERIENCE.md carve-out), update tests.

- Effort: **Low** (one field, 4 data rows, one render-branch, a handful of test assertions).
- Risk: **Low** (additive only; doesn't touch persistence, `cardId`, export schema, or the other 204 cards).
- Option 2 (Rollback) and Option 3 (MVP Review) are **not viable/not needed** — nothing here needs reverting, and no PRD boundary or MVP scope is in question.

## 4. Detailed Change Proposals

### 4.1 `epics.md` — new Story 1.12

Insert after Story 1.11 (before "## Epic 2"):

```
### Story 1.12: Disambiguate Written-Form Romaji for Shared-Reading Dakuten Pairs

*(New 2026-09-11 via Correct Course — see `sprint-change-proposal-2026-09-11.md`. Additive to
Story 1.3's prompt AC and Story 1.11's catalog; kept as its own story, same rationale as 1.11:
an independent, purely-additive change with its own test surface.)*

As a learner practicing kana,
I want the prompt to tell me which of two same-pronunciation dakuten characters is being asked
for (ぢ vs じ, づ vs ず — both hiragana and katakana),
So that I'm not guessing 50/50 between two different graphemes that share a Hepburn reading.

**Acceptance Criteria:**

**Given** the static kana catalog (`domain/cards.ts`)
**When** this story ships
**Then** the `Card` type gains an optional `writtenRomaji?: string` field, distinct from the
existing `romaji` (pronunciation) field
**And** exactly 4 of 208 cards carry it: ぢ (`"di"`), づ (`"du"`), ヂ (`"di"`), ヅ (`"du"`)
**And** no other card's `romaji` or catalog shape changes.

**Given** the Drill prompt (Story 1.3's AC, UX-DR17)
**When** a card with `writtenRomaji` set is shown
**Then** the prompt reads `"<romaji> (<writtenRomaji>)"` — e.g. `"ji (di)"` for ぢ — in the same
`{typography.heading}` styling as every other prompt, never `{typography.glyph-ink}`
**And** every other card's prompt is unaffected (romaji only, exactly as today).

**Given** `cards.test.ts`
**When** updated
**Then** it asserts the 4 `writtenRomaji` values above, asserts every other card's
`writtenRomaji` is `undefined`, and continues to assert id uniqueness and no same-sound
collision across the 208-card set.
```

Also add a coverage-map line: `FR-1/FR-5 disambiguation: Epic 1 - Story 1.12` and amend UX-DR17's text (below).

### 4.2 `epics.md` — amend UX-DR17

**OLD:**
> UX-DR17: Voice/microcopy constraints — no praise, streak language, or exclamation marks anywhere (e.g. "I'm done." not "Let's go!"; "Your call — nothing is checking the shape." not "Great job!"); prompt copy is romaji + script name only, never a mnemonic or example word (standing exclusion).

**NEW:**
> UX-DR17: Voice/microcopy constraints — no praise, streak language, or exclamation marks anywhere (e.g. "I'm done." not "Let's go!"; "Your call — nothing is checking the shape." not "Great job!"); prompt copy is romaji + script name only, never a mnemonic or example word (standing exclusion). *(Amended 2026-09-11 via Correct Course)* Exactly one carve-out: for the 4 cards where Hepburn romaji alone doesn't disambiguate which grapheme is meant (ぢ/づ/ヂ/ヅ — see Story 1.12), the prompt appends the card's own written-form romaji in parentheses (e.g. `"ji (di)"`). This is disambiguating data intrinsic to the card, not a mnemonic or memory aid, and does not apply to any of the other 204 cards.

**Rationale:** the standing exclusion's purpose (from brief §Rejected/PRD §5.2) is to keep the prompt from becoming a guided hint — a mnemonic externally *helps* recall. A written-form qualifier does the opposite of helping recall: it's still testing free recall of the grapheme, just resolving which grapheme the prompt names, the same job `romaji` + script name already do for every other card.

### 4.3 `ARCHITECTURE-SPINE.md` — amend AD-3

**OLD** (rule paragraph, last sentence):
> `cardId` is the natural key `"<grapheme>:<script>"`, referenced by `tallies` and `attempts` as a plain string foreign key — no join table. Reveal (FR-5) reads the same static catalog directly.

**NEW:**
> `cardId` is the natural key `"<grapheme>:<script>"`, referenced by `tallies` and `attempts` as a plain string foreign key — no join table. Reveal (FR-5) reads the same static catalog directly. *(Amended 2026-09-11 via Correct Course — see Story 1.12.)* `Card` carries one additional optional field, `writtenRomaji?: string`, set only on the 4 cards (ぢ/づ/ヂ/ヅ) whose Hepburn `romaji` collapses onto another card's — the Drill prompt renders it as a parenthetical disambiguator alongside `romaji`. This is catalog display data, not persisted — `Attempt`/`Session`/`AttemptExport` (AD-4, AD-5) are untouched.

Update the binds line if desired (`AD-3` already binds FR-1, FR-5 — no change needed there).

### 4.4 `DESIGN.md` — amend prompt note

**OLD:**
> Romaji prompts and script-name labels are set in `{typography.heading}`/`{typography.body}`, never in `{typography.glyph-ink}` — that face is reserved for the kana character itself, so its appearance always signals "this is a real, comparable grapheme." The prompt is romaji plus script name only — no mnemonic or example-word copy (standing exclusion, see brief and PRD §5.2).

**NEW:**
> Romaji prompts and script-name labels are set in `{typography.heading}`/`{typography.body}`, never in `{typography.glyph-ink}` — that face is reserved for the kana character itself, so its appearance always signals "this is a real, comparable grapheme." The prompt is romaji plus script name only — no mnemonic or example-word copy (standing exclusion, see brief and PRD §5.2). *(Amended 2026-09-11 via Correct Course)* On the 4 cards whose Hepburn romaji is shared with another card (ぢ/づ/ヂ/ヅ), the prompt appends that card's written-form romaji in parentheses, same weight and face as the rest of the prompt — disambiguation, not a hint.

### 4.5 `EXPERIENCE.md` — amend Voice and Tone row

**OLD:**
> | Prompt is romaji + script name only | Mnemonics, example words, or any memory-aid copy (standing exclusion — brief §Rejected, PRD §5.2) |

**NEW:**
> | Prompt is romaji + script name only, plus a written-form parenthetical on the 4 cards where romaji alone is ambiguous (ぢ/づ/ヂ/ヅ — Story 1.12) | Mnemonics, example words, or any memory-aid copy (standing exclusion — brief §Rejected, PRD §5.2) |

### 4.6 Implementation (Story 1.12, handed to Build)

- `src/domain/cards.ts`: add `writtenRomaji?: string` to the `Card` interface; add a small parallel lookup (or inline map) for the 4 grapheme entries (ぢ→`di`, づ→`du`, ヂ→`di`, ヅ→`du`); wire it into `baseCards()`.
- `src/domain/cards.test.ts`: assert the 4 values and `undefined` elsewhere.
- `src/adapters/ui/Drill.svelte`: prompt render — `{card.writtenRomaji ? `${card.romaji} (${card.writtenRomaji})` : card.romaji}` in place of the current bare `{card.romaji}` (around line 531).
- `src/adapters/ui/Drill.test.ts`: assert the parenthetical renders for ぢ/づ/ヂ/ヅ and not for any other sampled card.

## 5. Implementation Handoff

**Scope classification: Minor** — direct implementation by the Developer flow (`bmad-build`), no backlog reorg, no PM/architect replan needed.

- **Deliverables:** this proposal (artifact edits above, once approved) + Story 1.12 added to `epics.md` + `sprint-status.yaml` updated with a `1-12-...` entry (`backlog`) → then `bmad-build` implements it.
- **Success criteria:** `cards.test.ts` and `Drill.test.ts` pass with the new assertions; the 4 affected cards show the parenthetical prompt; all other 204 cards are byte-identical in prompt rendering to before this change; full suite green.
