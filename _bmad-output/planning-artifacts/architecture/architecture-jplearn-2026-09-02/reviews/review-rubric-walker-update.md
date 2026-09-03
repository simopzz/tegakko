# Rubric-Walker Review — ARCHITECTURE-SPINE.md (AD-9/AD-10 amendment, 2026-09-03)

**Reviewer role:** independent rubric walker, Reviewer Gate, post-amendment re-review.
**Target:** `ARCHITECTURE-SPINE.md`, amended in place to reconcile AD-9/AD-10 with SPEC.md's CAP-7 change (recency-weighted selection over Attempt history, not lifetime Tally count).
**Inputs read:** ARCHITECTURE-SPINE.md (full), `.memlog.md` (full, incl. last ~7 entries covering this update), SPEC.md (full).

## Verdict

**Pass with notes.** The AD-9/AD-10 amendment is well-formed, correctly reconciles CAP-7 against the Tally-schema-untouched constraint, and the Capability Map's FR-6/FR-7/FR-8 rows are accurate post-edit. Two issues found — one a genuine leftover internal inconsistency (stale illustrative text in AD-9), one a real but narrow divergence risk left implicit in the new Rule's wording. Neither invalidates the reconciliation; both are cheap to close.

## Checklist walk

### 1. Fixes the real divergence points for the story-level builder — misses none (mostly)
The core reconciliation is sound: `Tally` schema frozen at `{cardId, missCount}` (AD-10, matches SPEC Constraints line "Tally's own schema stays `{cardId, missCount}`"), `selectNext` signature changed to `(attempts: Attempt[], scope: Scope): Card`, `AttemptRepository.listAll()` added to AD-9, and the "no card ever permanently excluded" / "not an SRS" invariant is preserved. See **Finding 1** below for one divergence point the amendment does not fully close: whether `attempts` passed into `selectNext` is refreshed as new attempts are recorded within the same session, or is a single session-start snapshot for the session's duration. This is exactly the class of ambiguity AD-9/AD-10 exist to close, and it is currently left to inference rather than stated.

### 2. Every AD's Rule is enforceable and prevents its stated divergence
AD-10's Rule (Tally field freeze, `selectNext` signature, no-tallies-input, `listAll()` sourcing) is enforceable via TypeScript's type system for the structural parts; the recency-weighting behavior itself is explicitly and correctly deferred to story level (consistent with SPEC's Assumptions: "CAP-7's recency-decay weighting... is a mechanism decision, not a formula"). AD-9's Rule (fixed method signatures) is enforceable. See **Finding 2**: AD-9's own **Prevents** clause still cites an example that the AD-10 amendment makes false.

### 3. Nothing under Deferred lets two independently-built units diverge incompatibly
The "CAP-7 recency-decay formula" Deferred bullet correctly scopes the deferral to "recency window and decay curve," not the mechanism. However, see Finding 1 — the session-freshness question isn't obviously covered by that deferral (it's a mechanism question, not a formula parameter), so as currently worded a builder could reasonably think it's covered by the same deferral while another concludes AD-10's Rule already settles it (statically) — two incompatible readings of the *same* text, which is the exact failure mode Deferred entries are supposed to rule out.

### 4. Named tech verified-current
Not touched by this update; spot-checked only. Stack table (TS 7.0.2, Vite 8.2.2, Svelte 5.57.0, vite-plugin-svelte 7.3.0, vite-plugin-pwa 1.3.0, idb 8.0.3) is unchanged from the prior finalized version and carries its own "verified current at authoring" seed comment dated 2026-09-03. No new tech was introduced by the AD-9/AD-10 amendment (no new library, no new port implementation choice), so nothing new requires verification. No issue.

### 5. Capability → Architecture Map still accurate for FR-6/FR-7/FR-8
Checked against the amended ADs, line by line:
- **FR-6** (line 245): "`domain` (tally update logic) + `adapters/persistence` (`tallies` store) — display-only, per AD-10 | AD-9, AD-10" — correct; matches AD-10's narrowed Tally role.
- **FR-7** (line 246): "`domain` (`selectNext`, over `AttemptRepository.listAll()`) | AD-9, AD-10" — correct; matches the new signature and AD-9's `listAll()` addition.
- **FR-8** (line 247): "... — also read in bulk by weak-spot selection | AD-2, AD-4, AD-9, AD-10, AD-13" — correct; AD-10 added to the Governed-by list, consistent with AD-10's Binds now including FR-8.
No stale rows found elsewhere in the map. All 14 SPEC capabilities (CAP-1..CAP-14 ↔ FR-1..FR-14) remain covered with no gaps.

### 6. Every dimension the altitude owns is decided/deferred/open
No new silent dimension introduced by this edit. The one soft gap is Finding 1 (session-scoped attempts freshness), which is a sub-dimension of "how selection reads Attempt history" that AD-10 partially specifies (bulk read, no N+1) but doesn't fully pin down (staleness within a session).

## Cross-check against the rest of the (unchanged) spine

- **AD-2 (InkSurface port):** no interaction with AD-9/AD-10; unaffected, no contradiction.
- **AD-4 (persisted Attempt schema):** `Attempt` carries a `timestamp: string` (ISO 8601) field (line 210, ERD), which is exactly what a recency-weighted `selectNext` needs to compute decay — the schema already supports the new AD-10 mechanism without modification. Confirmed no schema change was needed or made. Consistent.
- **AD-13 (undo atomicity):** `undoLastGrade` still calls `AttemptRepository.deleteLast` + conditional Tally decrement, as one atomic domain op — unaffected in its own text. But see **Finding 1b**: if a session-scoped in-memory attempts array feeds `selectNext` (per the ambiguity above), AD-13 doesn't say whether `undoLastGrade` must also retract the undone attempt from that in-memory array, or whether it's safe to rely on the array being re-derived from `listAll()` fresh each time. This is the same underlying ambiguity, not a separate defect — see recommendation below.
- **Structural Seed / ERD:** `TALLY { cardId, missCount }` (lines 217–220) matches AD-10's frozen schema exactly; no due-date/interval field present. `ATTEMPT` entity carries `timestamp` (needed for recency). Consistent, no edit needed and none made.
- **"`Tally` is now display-only" reflected correctly?** Yes — AD-10 line 130 and the FR-6 Capability Map row both say this explicitly and consistently.

## Findings

**Finding 1 (real divergence risk, should-fix).** AD-10's Rule (line 133): *"`attempts` is supplied by `AttemptRepository.listAll()` (AD-9), read once per session start, not re-queried per candidate card."* This sentence conflates two different anti-patterns it's trying to prevent — "don't do N-queries-per-candidate-card within one selection call" (clearly stated and good) — with an entirely separate, unstated question: **does the array get refreshed as new attempts are recorded later in the same session, or is it a single point-in-time snapshot for the whole session?** Read literally ("once per session start"), a card missed for the first time mid-session would not affect `selectNext`'s recency weighting for the rest of that same session — only from the next session onward, once `listAll()` is re-read at the next session's start. A different, equally plausible implementation would keep a session-scoped working copy that appends each new `Attempt` as `AttemptRepository.add()` is called, so recency weighting *does* react within the session. These two readings produce materially different, incompatible runtime behavior — exactly the kind of divergence AD-9/AD-10 exist to close, and CAP-7's own success bar ("a card missed heavily long ago... deprioritized relative to a card missed recently") is at least plausibly meant to include intra-session recency, not just cross-session. Recommend either: (a) explicitly state the array is a per-session-start snapshot and that intra-session misses only affect selection from the *next* session onward (if that's the intended, simpler mechanism), or (b) explicitly require the domain/session layer to keep the working attempts list current as attempts are added within the session. Either is fine architecturally; leaving it unsaid is not.

**Finding 1b (consequence of Finding 1, minor).** If (b) above is the intended design, AD-13's `undoLastGrade` should also say it retracts the undone attempt from whatever in-memory/session-scoped attempts state feeds `selectNext`, not just from the persisted store via `deleteLast`. Currently unaddressed either way. Low cost to fix once Finding 1 is resolved (may fall out for free if the answer is "always re-read `listAll()` per selection round from a small session-local cache that's just invalidated on any write").

**Finding 2 (stale text, should-fix, cheap).** AD-9's own **Prevents** clause (line 117) still reads: *"...two independently-built pieces of code (e.g. the `tallies` writer in the drill loop and the `tallies` reader in weak-spot selection) satisfying 'a `TallyRepository`' with incompatible designs..."* — "the `tallies` reader in weak-spot selection" is exactly the design AD-10 just eliminated: weak-spot selection no longer reads `TallyRepository` at all, it reads `AttemptRepository.listAll()`. This is a leftover illustrative example from before the amendment that the amendment's own diff should have swept. It doesn't break AD-9's Rule (the method-signature list itself is correct and untouched), but it's a factually wrong internal cross-reference inside a "final" spine that a story-level builder could reasonably take literally. Recommend replacing the bracketed example with something still true today, e.g. "the `tallies` writer in the drill loop and the `tallies` reader behind the 'N shaky' badge display."

## Non-findings (checked, no issue)

- `Scope` type used bare in AD-10's `selectNext` signature and in the FR-2 Capability Map row ("AD-4 (`Scope` type)") without a formally named type declaration anywhere in AD-4's Rule text (AD-4 only describes `Session.scope`'s inline shape). This is a **pre-existing** naming looseness carried over unchanged from before this amendment (SPEC.md's own Open Questions quotes the *old* signature the same way, `selectNext(tallies, scope)`), not something this update introduced or worsened. Not counted as a new finding, flagged only for awareness.
- `status: final` retained in frontmatter (line 8) while the spine is mid-Reviewer-Gate per the memlog's last entry ("Proceeding to Reviewer Gate before close"). This is a process/metadata note, not a content defect — out of scope for a rubric walk of the spine's substance.
- SPEC.md's own Open Questions section (line 122) still states the reconciliation "is needed... before build" — SPEC.md itself hasn't been updated to reflect that the reconciliation happened. Out of scope for this review (reviewing the architecture spine against SPEC, not editing SPEC), but worth flagging to the orchestrating session so SPEC's Open Questions gets closed out in its own pass.

## Summary for gate

Reconciliation is substantively correct and the Capability Map is accurate. Recommend closing Finding 2 (one-line text fix) before finalize, and resolving Finding 1 (a real, if narrow, mechanism ambiguity) either by a one-sentence clarification in AD-10 or a deliberate note in Deferred explicitly extending the existing "recency window" deferral to cover intra-session freshness. Neither finding blocks the reconciliation's core correctness.
