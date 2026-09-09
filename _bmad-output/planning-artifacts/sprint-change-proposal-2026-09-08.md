# Sprint Change Proposal — Session Sampling, No-Repeat Selection & Dakuten/Handakuten Catalog

**Date:** 2026-09-08
**Raised by:** simo
**Facilitated by:** John (PM), via Correct Course workflow
**Status:** Draft — awaiting approval

## 1. Issue Summary

### 1.1 How this surfaced

While reviewing session-closure behavior (Story 1.9) against the drill loop's selection mechanics (Stories 1.3, 1.7), a structural gap was identified: selection is with-replacement and weak-spot-weighted, while the Drill header's "X / N" counter (UX-DR8) uses the chosen scope's size as N. Because weighting deprioritizes already-correct cards — exactly the ones still needed to reach "every distinct card attempted once" — full-scope closure is a coupon-collector problem: expected draws to close ≈ N × H(N), roughly 4-6× the number shown on screen (≈180 draws for a 46-card scope, ≈930 for the full 158-card catalog). `EXPERIENCE.md` Flow 1 ("Morning full session") — the app's explicitly-designated primary flow, at full/near-full scope — depicts full-scope closure as the normal ending ("this repeats until the scope is exhausted — session closes automatically on the last card"). Under the shipped mechanics, that flow essentially never resolves that way in practice.

### 1.2 Expanded scope

During triage, the user (sole PM/dev/end-user of this app) proposed a redesign that resolves the above more cleanly than any option originally on the table, plus two independent, previously-unraised issues:

1. **Session sampling** — let the user choose a session size (a target number of distinct cards), capped at the chosen scope's size, independent from scope selection itself.
2. **No in-session repeats** — each session draws its cards without replacement; a miss's effect on selection moves from "resurface more within this sitting" to "bias which cards get sampled into *future* sessions."
3. **Dakuten/handakuten catalog gap** — the shipped 158-card catalog (`FR-1`, Story 1.2) contains only the plain 46-character gojūon table as "base," omitting the 25 dakuten/handakuten characters per script (が/ざ/だ/ば/ぱ-series) — even though the 33-entry "standard yoon" set already depends on those same consonants (gya/ja/bya/pya rows). No PRD/SPEC section documents this as a deliberate exclusion (the only documented catalog exclusion is extended loanword katakana); this reads as an oversight in the original "46 base" assumption, not a boundary call.

### 1.3 Why #1+#2 supersede the originally-considered fixes

Two fixes were on the table before the user's proposal: (a) bias selection toward not-yet-seen-this-session cards as coverage nears completion, or (b) reframe the counter/copy to stop implying a countdown. Both were compromises — (a) still probabilistic/approximate, (b) accepts the flagship flow as un-realizable at full scope. Weighted sampling-without-replacement of a fixed session size is exact: the counter always reaches precisely N, the bar always reaches precisely 100%, full-scope/session closure is deterministic, and `EXPERIENCE.md` Flow 1 becomes literally true again at any session size, including the full catalog. It also reuses the existing decayed-score weighting function (Story 1.7's `1 + score`, 7-day half-life) essentially unchanged — only the sampling *procedure* and *timing* change (once per session start, weighted-without-replacement, instead of once per draw, with-replacement).

## 2. Impact Analysis

### Epic Impact
Epic 1 ("Kana Writing Drill with Weak-Spot Memory") remains fully achievable as scoped — no new epic, no epic removed or resequenced. The change is contained to Epic 1's FR-1, FR-2, FR-7, FR-9 and the stories implementing them. Epic 2 (Backup & Portability) is unaffected except that its exported `AttemptExport`/session shape should be checked against any new `Session` fields introduced here (see §4, AD-4).

### Story Impact (already-shipped stories requiring amendment)

| Story | Current behavior | Required change |
|---|---|---|
| 1.2 — Kana Catalog & Scope Picker | 158-card catalog (46/46 base, 33/33 yoon); scope = script × unit only | Catalog grows to 208 cards (71/71 base incl. dakuten/handakuten, 33/33 yoon unchanged); Scope picker gains a session-size control |
| 1.3 — Write-From-Memory Drill Loop | Random-with-replacement placeholder selection (superseded by 1.7 already) | No further change beyond what 1.7 already superseded — historical note only |
| 1.7 — Weak-Spot-Biased Selection & Shaky Badge | `selectNext(attempts, scope): Card` — one weighted pick per draw, with replacement, called before every prompt | Replaced by a session-start sampler: `sampleSessionCards(attempts, scope, sessionSize): Card[]` — weighted, without replacement, called once; Drill advances through the resulting queue with no further selection calls |
| 1.8 — Undo Last Grade | Undo removes the attempt from an in-memory list that fed the *next* per-draw selection call | Undo instead reinserts the card into the session's not-yet-attempted queue (selection no longer happens mid-session, so there's nothing to "unweight" — only a queue position to restore) |
| 1.9 — Session Closure, Idle Timeout & Summary | `isScopeComplete` checks every distinct card in the *scope* was attempted; `'full-scope'` closure + "whole scope" History chip | `isScopeComplete`-equivalent now checks the session's *sampled set* (size ≤ scope); closure is exact/bounded, never probabilistic; `'full-scope'` reason kept internally but its display copy becomes uniform **"Session complete"** regardless of whether the sample equaled the full scope (per your decision) |

No new story is required for #1/#2 — this is a redefinition of already-shipped story contracts, not new functionality bolted on top. Recommend one **new** story for #3 (catalog expansion) since it's an independent, additive change with its own AC surface (card count assertions, no-collision assertions) — proposed as **Story 1.11: Dakuten/Handakuten Catalog Expansion**.

### Artifact Conflicts

**PRD (`prd.md`)** — §FR-1's yoon-scope `[ASSUMPTION]` footnote and §7 Open Questions item 4 need a resolution note added (dakuten/handakuten now in scope; extended loanword katakana remains out). FR-2's scope-selection description needs the session-size dimension added.

**Architecture (`ARCHITECTURE-SPINE.md`)** — AD-10's rule text is written entirely in terms of per-draw, with-replacement, in-session-responsive selection (explicitly: *"a miss earlier in a session can influence a later pick within that same session"*) — this sentence becomes false under the new model and must be rewritten. AD-9's `AttemptRepository`/`TallyRepository` signatures are unaffected (still bulk `listAll()`, still atomic increment/decrement) — no port signature changes needed there. AD-13 (undo) needs its rule text updated: it currently removes the undone attempt from "AD-10's in-memory attempts list" to protect *future selection calls* within the session; under the new model there are no further selection calls within a session, so undo's job becomes restoring the card to the not-yet-attempted queue instead. **This is an architecture-level change (AD-10, AD-13 rule text, not just implementation) and should get an explicit architecture pass before Dev picks it up** — recommend routing through `bmad-architecture` or an architect review before implementation begins.

**UX (`EXPERIENCE.md`, `DESIGN.md`)** — `EXPERIENCE.md` Flow 1 (line 133) needs "until the scope is exhausted" → "until the session's sampled cards are exhausted" (now true at any size). `UX-DR4` needs a new bullet for the session-size control (Scope picker gains a third pill-toggle-style dimension). `UX-DR8`'s counter description changes from "total is the session's scope size... the bar clamps at 100% / is never the sole position signal" (language written to cope with overshoot) to a flat statement that the counter is now exact — the overshoot-handling language goes away entirely as dead requirement. `UX-DR11`'s "whole scope" chip becomes "Session complete," and the phrase "regardless of whether the session's sampled size equaled the full chosen scope" should be added so future readers don't reintroduce the distinction.

**Other artifacts** — no deployment/CI/testing-strategy impact. Test suites for `Drill.svelte`, `Drill.test.ts`, `cards.test.ts`, `ScopePicker.test.ts` will need rewriting to match (Dev-side work, not part of this proposal).

## 3. Recommended Approach

**Direct Adjustment** (per checklist §4.1) — amend the existing Epic 1 stories in place, plus one new additive story for the catalog. Rollback (§4.2) isn't viable: weak-spot bias is FR-7, a core differentiator, not something to revert to get out of this. PRD MVP scope (§4.3) is unaffected — this doesn't add or cut a feature area, it corrects how an existing one behaves and closes a content gap; the MVP goalposts (FR list) stay the same shape, just more precise.

**Effort:** Moderate-to-High. Five already-shipped stories (1.2, 1.3-historical-note, 1.7, 1.8, 1.9) need AC amendment and reimplementation; one new story (1.11) is purely additive. The core domain-logic change (per-draw → per-session sampling) is smaller than the story count suggests, since it reuses the existing weighted-scoring function — but it ripples through Drill's state machine (queue-based instead of repeated-selection-based) and touches undo semantics.

**Risk:** Medium. The main risk is under-specifying the new `sampleSessionCards` contract (weighted-without-replacement algorithm choice, e.g. Efraimidis-Spirakis vs. sequential-removal-and-renormalize) and undo-against-a-fixed-queue edge cases (undo on the last card of a session, undo interacting with idle/explicit closure) — exactly the kind of thing AD-10/AD-13 exist to pin down before Dev starts, hence the recommendation to route through an architecture pass first.

**Scope classification:** **Major** — architecture-level rule changes (AD-10, AD-13) plus five story amendments. Per the checklist, this routes to **Product Manager / Solution Architect** before Developer implementation, not straight to Dev.

## 4. Detailed Change Proposals

### 4.1 PRD (`prd.md`)

```diff
- Standard yoon combinations (11 base consonant rows × ゃ/ゅ/ょ = 33 per script) are present as additional cards for both hiragana and katakana... `[ASSUMPTION: standard yoon set only — 33 × 2 = 66 cards, for a total of 158 cards. Extended katakana-only combinations used for foreign loanword sounds (e.g. ティ, ファ) are treated as out of scope for v1; confirm this boundary.]`
+ Standard yoon combinations (11 base consonant rows × ゃ/ゅ/ょ = 33 per script) are present as additional cards for both hiragana and katakana... Base cards additionally include the 25 dakuten/handakuten characters per script (が-series, ざ-series, だ-series, ば-series, ぱ-series), resolving the prior gap where their yoon derivatives (gya/ja/bya/pya rows) existed without a standalone base card. `[RESOLVED 2026-09-08: dakuten/handakuten in scope, 71 base + 33 yoon = 104 per script × 2 scripts = 208 cards total. Extended katakana-only loanword combinations (ティ, ファ) remain out of scope for v1.]`

- The user can narrow scope before starting, at minimum by script (hiragana only / katakana only) and by base-vs-yoon. `[ASSUMPTION: exact subset granularity...]`
+ The user can narrow scope before starting, at minimum by script (hiragana only / katakana only) and by base-vs-yoon, and independently choose a session size (a target count of distinct cards, capped at the resulting scope's size; default "All"). `[RESOLVED 2026-09-08: session-size sampling added via Correct Course.]`
```

### 4.2 Epics (`epics.md`)

**FR-1:**
```diff
- FR-1: Script-aware kana card set, including yoon — the system provides the full kana card catalog (46 base hiragana, 46 base katakana, standard yoon combinations for both scripts = 158 cards total), each keyed on grapheme + script; no same-sound cards, across scripts or base/yoon, ever share an entry.
+ FR-1: Script-aware kana card set, including dakuten/handakuten and yoon — the system provides the full kana card catalog (46 seion + 25 dakuten/handakuten = 71 base hiragana, 71 base katakana, standard yoon combinations for both scripts = 208 cards total), each keyed on grapheme + script; no same-sound cards, across scripts or base/yoon, ever share an entry. *(Amended 2026-09-08 — closes a gap where dakuten/handakuten yoon combinations existed without their base-form cards.)*
```

**FR-2:**
```diff
- FR-2: Session scope selection — before starting a session, the user selects its scope (full 158-card set, or narrower by script and/or base/yoon), which governs that session's card pool and full-scope-completion condition.
+ FR-2: Session scope and size selection — before starting a session, the user selects its scope (full 208-card set, or narrower by script and/or base/yoon) and, independently, a session size (a target number of distinct cards to draw, capped at the chosen scope's size; default "All" = the full scope, matching prior behavior). The scope governs the candidate pool; the size governs how many distinct cards are sampled from it — that sample is the session's actual card pool and completion target. *(Amended 2026-09-08.)*
```

**FR-7:**
```diff
- FR-7: Weak-spot-biased prompt selection — within a session's chosen scope, the next prompt is selected using a recency-weighted score computed from that card's Attempt history (not raw lifetime Tally count)... every candidate card carries nonzero selection probability — no card is ever permanently excluded or schedule-queued. *(Reflects the AD-9/AD-10 reconciliation finalized 2026-09-03 — supersedes the PRD's original lifetime-tally-only wording.)*
+ FR-7: Weak-spot-biased session sampling — when a session starts, its card set is sampled without replacement from the chosen scope down to the chosen session size, using a recency-weighted score computed from each candidate's Attempt history (not raw lifetime Tally count), so old misses matter less than recent ones and a card missed heavily long ago but correct on all recent attempts is deprioritized relative to a card missed recently. Every in-scope card carries nonzero sampling probability for any given session — no card is ever permanently excluded or schedule-queued — but misses now bias which cards are drawn into *future* sessions rather than how often a card resurfaces within the same sitting. Within a sampled session, each card is presented exactly once. *(Supersedes the 2026-09-05 with-replacement decision (Story 1.3) and Story 1.7's per-draw resampling — reconciled via Correct Course on 2026-09-08.)*
```

**FR-9:**
```diff
- FR-9: Session closure conditions — a session ends and is recorded when the user explicitly ends it, completes every card in scope, or goes idle past a threshold (~5 min default, user-adjustable); the closure reason (`explicit`/`full-scope`/`inactivity`) is distinguishable afterward.
+ FR-9: Session closure conditions — a session ends and is recorded when the user explicitly ends it, completes every card in that session's sampled set (no repeats, so this is a bounded, exact count equal to the chosen session size), or goes idle past a threshold (~5 min default, user-adjustable); the closure reason (`explicit`/`full-scope`/`inactivity`) is distinguishable afterward. `full-scope` now means "this session's sampled card set was completed" and is displayed uniformly as "Session complete," regardless of whether the sample equaled the full chosen scope. *(Amended 2026-09-08.)*
```

**Story 1.2 — new AC bullets (append):**
```
**Given** the static kana catalog (`domain/cards.ts`)
**When** the app loads
**Then** exactly 208 distinct cards exist — 71 base hiragana (46 seion + 25 dakuten/handakuten), 71 base katakana, 33 hiragana yoon, 33 katakana yoon — each keyed by a unique `"<grapheme>:<script>"` id.

**Given** the Scope picker screen
**When** it renders
**Then** it shows a session-size control (defaulting to "All") alongside the script/set toggles, and the live "N cards in scope" count reflects the script/set scope independent of the size selection.
```

**Story 1.7 → retitled "Weak-Spot-Biased Session Sampling":**
```
**Given** the Scope picker's chosen scope and session size
**When** a session starts
**Then** `sampleSessionCards(attempts: Attempt[], scope: Scope, sessionSize: number): Card[]` is called once, returning a shuffled queue of `min(sessionSize, cardsInScope(scope).length)` distinct cards, sampled without replacement using the existing decayed-score weighting (7-day half-life, sum of qualifying incorrect weights, `1 + score` floor).

**Given** the sampled queue
**When** the Drill screen advances through it
**Then** no further selection call happens mid-session — each queue entry is presented exactly once, in order.
```

**Story 1.8 — Undo AC amendment:**
```diff
- **Given** the undone attempt was part of Story 1.7's in-memory `attempts` list
- **When** undo completes
- **Then** it is also removed from that list, so it never influences a later same-session selection.
+ **Given** the undone attempt's card was consumed from this session's sampled queue
+ **When** undo completes
+ **Then** the card is reinserted into the not-yet-attempted portion of the queue, so it is presented again later in the session.
```

**Story 1.9 — closure AC amendment:**
```diff
- **Given** a session in progress
- **When** the last card in the selected scope is completed
- **Then** the session closes automatically with `closureReason: 'full-scope'`, without requiring the explicit control.
+ **Given** a session in progress
+ **When** the last card in this session's sampled set is completed
+ **Then** the session closes automatically with `closureReason: 'full-scope'` (displayed as "Session complete"), without requiring the explicit control — this is now deterministic: a session always closes this way after exactly `sessionSize` (or full-scope, if size = "All") attempts, never fewer, never more.
```

**New Story 1.11 — Dakuten/Handakuten Catalog Expansion** *(RESOLVED 2026-09-09: kept as its own story, not folded into 1.2 — sequenced before or alongside 1.2's amendment)*:
```
As a learner practicing kana,
I want dakuten and handakuten characters (が, ぱ, etc.) included in the practice catalog,
So that I'm drilled on the complete character set I actually need, not just the plain gojūon table.

AC: catalog grows to 208 cards as specified in the amended Story 1.2 AC above; `cards.test.ts` bucket-count assertions updated (71/71/33/33); no same-sound collision across the expanded set.
```

### 4.3 Architecture (`ARCHITECTURE-SPINE.md`)

**AD-10** — rule text sentence needing rewrite:
```diff
- The domain loads `attempts` once via `AttemptRepository.listAll()` (AD-9) at session start, then appends each newly recorded attempt to that in-memory list immediately after it is persisted — so a miss earlier in a session can influence a later pick within that same session (matching the pre-amendment, `Tally`-based behavior's intra-session responsiveness). It is not re-fetched from the repository per candidate or per selection call. AD-13's `undoLastGrade` removes the undone attempt from this in-memory list as well as calling `AttemptRepository.deleteLast`, so a later same-session selection never weights against an undone attempt.
+ The domain loads `attempts` once via `AttemptRepository.listAll()` (AD-9) at session start and uses it to compute a single weighted-without-replacement sample of `sessionSize` cards — the session's fixed queue. Misses recorded *during* a session no longer influence that session's own remaining draws (there are none — the queue is fixed at session start); they influence the weighting the *next* session's sample is drawn against. AD-13's `undoLastGrade` no longer needs to protect a later same-session selection call (none exists) — instead it reinserts the undone card into the session's not-yet-attempted queue.
```
Function signature: `selectNext(attempts: Attempt[], scope: Scope): Card` → `sampleSessionCards(attempts: Attempt[], scope: Scope, sessionSize: number): Card[]`.

**AD-13** — rule text needs the same reframe (undo restores queue position, not in-memory selection-input list). Exact wording left to the architecture pass recommended in §2/§3.

**AD-4 (schema)** — open question, not a firm proposal: does `Session` need a field recording the intended sample size (distinct from `cardsAttempted`, which already exists and equals the sample size *only* on a `full-scope`/"Session complete" closure)? Not required by any FR today since History (UX-DR11) doesn't display a fraction — flagging for the architecture pass to decide, not resolving here.

### 4.4 UX (`EXPERIENCE.md`, `DESIGN.md`)

```diff
EXPERIENCE.md Flow 1, step 6:
- This repeats until the scope is exhausted — session closes automatically on the last card, no explicit "I'm done" needed today.
+ This repeats until the session's sampled cards are exhausted — session closes automatically on the last card, no explicit "I'm done" needed today.
```

```diff
UX-DR8:
- Progress bar + "N / total" counter in the Drill header — total is the session's scope size; advances by one on every completed grade, including grades given after a Reveal; the bar is reinforcement, never the sole position signal (always paired with the text counter).
+ Progress bar + "N / total" counter in the Drill header — total is the session's sampled size (≤ scope size); advances by one on every completed grade, including grades given after a Reveal. Selection is without replacement, so the counter always reaches exactly total and the bar always reaches exactly 100% — no overshoot case exists.
```

```diff
UX-DR11:
- ...full-scope-completed sessions get a positive "whole scope" chip...
+ ...sessions that completed their sampled card set get a positive "Session complete" chip, regardless of whether the sample equaled the full chosen scope...
```

New bullet for UX-DR4 (session-size control): pill-toggle or stepper alongside script/set, presets TBD by UX pass (e.g. "All / 20 / 40"), default "All" — exact widget choice deferred to implementation/UX detailing, not fixed here.

## 5. PRD MVP Impact & Action Plan

MVP scope is **not** reduced or expanded in shape — FR-1, FR-2, FR-7, FR-9 are corrected/clarified, not added or cut. Sequencing:

1. **Architecture pass** on AD-10/AD-13 rule text and the `sampleSessionCards` contract (weighted-without-replacement algorithm, queue/undo semantics) — recommended before any code changes, given the Major classification.
2. **Story amendment** — apply the diffs in §4.2 to `epics.md` (or split into a dedicated amendment doc if preferred).
3. **Dev re-implementation** of Stories 1.2 (catalog + scope-picker control), 1.7 (sampler), 1.8 (undo-against-queue), 1.9 (closure/copy), plus new Story 1.11 (kept separate, per decision 2026-09-09).
4. **UX pass** on the session-size control's exact widget and any Scope-picker layout consequence of a third control dimension.

## 6. Implementation Handoff

**Scope classification: Major.**

**Handoff:** Product Manager / Solution Architect, per checklist §4.4 — recommend an architecture session (e.g. `bmad-architecture`) to firm up AD-10/AD-13 rule text and the sampler's exact contract before Developer implementation starts on the amended stories.

**Success criteria:** `EXPERIENCE.md` Flow 1 becomes literally reproducible at any session size including the full 208-card catalog; the Drill counter/bar never overshoots; a miss's effect is observable across sessions (next session's sample skews toward it) rather than within one; catalog exposes all 208 cards with correct bucket counts; History shows "Session complete" uniformly with no scope-size-dependent branching.
