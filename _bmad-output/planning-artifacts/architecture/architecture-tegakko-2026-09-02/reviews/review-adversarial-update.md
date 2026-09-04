# Adversarial Review — AD-9/AD-10 Amendment (recency-weighted selection)

**Target:** `ARCHITECTURE-SPINE.md`, as amended 2026-09-03T12 to reconcile CAP-7 with SPEC.md (recency-weighted `selectNext` over `Attempt` history, `AttemptRepository.listAll()` added).

**Method:** for each Rule the amendment touched, construct two story-level implementers who each satisfy the Rule's literal text but build structurally incompatible units. Prior adversarial pass (`review-adversarial-incompatibility.md`) already covered the pre-amendment spine; this pass scopes to what the amendment changed (AD-9, AD-10) and what it ripples into (AD-13, Capability Map, ERD).

**Verdict: FAIL** — one finding (F1) is a genuine structural divergence the Rule text does not close, not a tuning-constant difference. F3 is a real port/rule contradiction the amendment sharpens (pre-existing, not newly introduced, but the amendment's "display-only" framing measurably increases the odds a builder resolves it by silent omission). Recommend closing F1 and F3 before this reaches story-writing; F2 and F4 are lower-severity but worth a one-line clarification each.

---

## F1 — `selectNext`'s "recency-weighted" has no fixed clock, and two honest readings produce different card rankings over identical data

**Location:** AD-10 Rule, bullet 3 (`ARCHITECTURE-SPINE.md:132`): *"Each candidate's selection score is a recency-weighted function over that card's incorrect attempts within the passed `attempts` list — older misses contribute less than recent ones — and the next card is chosen probabilistically biased toward higher-scoring cards; no card is ever permanently excluded or due-date-queued."*

**Unit A** measures recency as **wall-clock elapsed time** since `attempt.timestamp` (ISO 8601, per Consistency Conventions), e.g. an exponential half-life in real days. **Unit B** measures recency as **ordinal position within that card's own miss history** (most recent miss for *this card* = weight 1, its previous miss = decayed, etc.), ignoring how much real time has passed.

Both satisfy the Rule to the letter — "older misses contribute less than recent ones" is true under either definition. But they diverge structurally, not just by constant: a card missed 3 times in a row two months ago and never revisited scores near-zero under A (all its misses are "old" in real time) but scores high under B (those misses are still each card's own "most recent," since the card has no newer attempts to eclipse them). Two independently-built implementers each following the Rule to the letter produce opposite prioritization for the exact same `attempts` array on this input shape — that's a behavioral contract break, not a tuning difference, and it happens precisely on the case weak-spot selection exists to serve (a card the learner hasn't revisited in a while).

A second, related fork in the same Rule: does a **correct** attempt on a card reduce/reset that card's score (a "redemption" read of recency — a recent correct attempt should count for something), or does the score only ever move by time-decay of past misses, with correct attempts invisible to the function entirely? The Rule's phrase "a function over that card's incorrect attempts" can be read either as (a) the function's *domain* is restricted to incorrect attempts (correct attempts play no role at all), or (b) incorrect attempts are the *base signal* but a later correct attempt within the same `attempts` list is a legitimate recency-relevant discount on it. Nothing in AD-10 rules out (b), and "recency-weighted" as a phrase invites it. Implementer A (strict reading, ignores correct attempts) and Implementer C (discounts a miss once a later correct attempt exists for that card) are both AD-10-compliant and produce different scores for any card with a miss-then-correct pattern — common in normal drilling.

A third fork, lower severity but concrete: candidate cards with **zero** incorrect attempts (never missed, or missed then fully time-decayed to ~0) are still candidates per bullet 2 (catalog filter by scope, not by miss history) and must remain selectable per "no card is ever permanently excluded." If the probability transform is a plain weighted-by-score sample (weight = score), a zero-score card gets *exactly* zero selection probability forever — a de facto permanent exclusion the Rule's own words forbid, even though the implementer never added a due-date/schedule field anywhere. A different implementer who adds an epsilon floor (or a small uniform-random floor blended into the weights) avoids this. Both are "probabilistically biased toward higher-scoring cards" per the Rule text; only one actually satisfies "no card is ever permanently excluded" in practice.

**Fix direction:** pin the recency basis explicitly (e.g. "decay is over real elapsed time since `attempt.timestamp`, not ordinal position") and state whether correct attempts factor into a card's score at all. Also state the zero/near-zero-score floor requirement explicitly, since it's what actually enforces "never permanently excluded," not the scoring formula's mere existence. All three remain story-level in *value* (the window, the half-life, the floor magnitude) — this finding is about pinning the *shape* of the function, which the deferral note (`ARCHITECTURE-SPINE.md:260`) currently lumps in with "exact recency window and decay curve," a much narrower deferral than what's actually left open.

---

## F2 — `AttemptRepository.listAll(): Attempt[]` doesn't say whether it's exhaustive; a bounded/paginated implementation satisfies the same type signature

**Location:** AD-9 Rule (`ARCHITECTURE-SPINE.md:121`): `listAll(): Attempt[]` … "AD-10's weak-spot selection reads full cross-session history through this, once per session start — not `listBySession` in a loop." AD-10 Rule bullet 4 (`ARCHITECTURE-SPINE.md:133`): `attempts` is supplied by `listAll()`.

**Unit A** implements `listAll()` as a true unbounded read — every `Attempt` record ever written, no cap. **Unit B**, aware that attempt volume grows unboundedly over months of use and wary of a large IndexedDB cursor read on every session start, implements `listAll()` to internally page through the `attempts` store via cursor batching and **return only the most recent N** (say, the last 500, or the last 90 days) — still typed `Attempt[]`, still a single synchronous-looking call site, still satisfying "not `listBySession` in a loop." AD-9 fixes the *signature*, not exhaustiveness; both implementations type-check identically and neither violates the literal Rule text.

The divergence is invisible at the port boundary but real in behavior: under B, a card whose only misses fall outside the retained window scores identically to a never-missed card (F1's zero-score case) even though `Tally.missCount` (still tracked, unbounded, per AD-10 bullet 1) shows real historical misses — the lifetime badge and the selection algorithm silently disagree about a card's weak-spot status. This is exactly the kind of drift AD-10's own "no card ever permanently excluded" is trying to prevent, reintroduced one layer down at the repository boundary instead of in the domain function. It's also a plausible reading precisely *because* AD-10 explicitly defers "the exact recency window" to story level (`ARCHITECTURE-SPINE.md:134`, `:260`) without saying *which layer* owns that window — a builder optimizing for IndexedDB read cost has a textually defensible reason to put the cutoff in the adapter rather than the domain scoring function.

**Fix direction:** one line on AD-9's `listAll()` bullet or AD-10 bullet 4 — "returns every persisted `Attempt`, unbounded; any recency windowing happens in `selectNext`'s scoring function, never in the repository read."

---

## F3 — AD-13's "corresponding tally decrement" has no method on `TallyRepository` to call — a pre-existing port gap the "display-only" reframing makes easier to justify skipping

**Location:** AD-9 Rule, `TallyRepository` bullet (`ARCHITECTURE-SPINE.md:120`): `getAll(): Tally[], increment(cardId: string): void` — no `decrement`, `set`, or `save` method exists anywhere on this port. AD-13 Rule (`ARCHITECTURE-SPINE.md:152`): `undoLastGrade` "internally calls `AttemptRepository.deleteLast` and, only if the undone attempt's `selfGrade` was `'incorrect'`, a corresponding tally decrement." AD-10's amended framing (`ARCHITECTURE-SPINE.md:130`, `:245`): `Tally` "continues to back only the lifetime cumulative miss-count displays" — Capability Map FR-6 row explicitly labels it "display-only, per AD-10."

This gap predates the amendment (confirmed against `reviews/review-reconcile-ux.md:48-50`, which flagged "neither the Ports list... names any delete/compensating-write operation on `AttemptRepository`/`TallyRepository`" during the original reviewer gate; AD-13 was added in response but only fixed the *atomicity* of the domain call, never gave `TallyRepository` a way to actually decrement). It is squarely in scope here because the question the amendment raises — "does an implementer now have textual cover to treat the decrement as optional" — is answered by this gap: there is no compliant way to *do* the decrement through the fixed port, so an implementer has to choose between violating AD-9 (adding a method) or violating AD-13 (skipping the write).

**Unit A**, following AD-13's Rule text literally, adds `decrement(cardId: string): void` to `TallyRepository` to make the required call possible — but this extends a port AD-9 says is "fixed, not left to implementers" (`ARCHITECTURE-SPINE.md:114`), which A never got sign-off on.

**Unit B**, reading AD-9's `TallyRepository` as closed (`getAll`/`increment` only, per its own Prevents bullet: *"two independently-built pieces of code... satisfying 'a `TallyRepository`' with incompatible designs"* — i.e. don't freelance the port) and reading AD-10's new framing that `Tally` is "display-only" and no longer feeds anything functional, concludes the undo-decrement is a cosmetic nicety for a value nothing downstream depends on, and implements `undoLastGrade` without it. B's `TallyRepository` usage type-checks cleanly against AD-9's fixed signature; B can point to AD-10's own words ("continues to back only the lifetime cumulative miss-count displays") as the reason a display-only counter drifting by one after an undo isn't worth violating the fixed-port rule for.

Both units cite a real AD in their defense; neither is unambiguously wrong per the spine text as written, and they produce different runtime port surfaces (A ships a mutation method B's code never calls, and B's badge/chip permanently over-counts by one after every undone-incorrect grade — a small but real, user-visible bug baked into the spine's own contradiction).

**Fix direction:** add the decrement (or a `set(cardId, missCount)`) to AD-9's `TallyRepository` bullet explicitly, and have AD-13 (or AD-10) name it by that exact method name. This is the one finding here that isn't new to the amendment, but the amendment is the reason to fix it now — AD-10's "display-only" language is new textual ammunition for silently dropping the decrement that didn't exist before this update.

---

## F4 — "read once per session start" doesn't say whether in-session misses feed back into the same session's later selections

**Location:** AD-10 Rule bullet 4 (`ARCHITECTURE-SPINE.md:133`): *"`attempts` is supplied by `AttemptRepository.listAll()` (AD-9), read once per session start, not re-queried per candidate card."*

**Unit A** reads this as a snapshot: call `listAll()` exactly once, at session start, before any of this session's own attempts exist, and reuse that same array (unchanged) for every `selectNext` call for the rest of the session. Under A, missing a card on turn 2 of a session cannot influence which card is picked on turn 3 of the *same* session — the miss only affects selection starting next session, once `listAll()` is called fresh.

**Unit B** reads "not re-queried per candidate card" as the actual constraint being guarded (no N-query-per-card loop inside a single scoring pass, per AD-9's own Prevents bullet at `ARCHITECTURE-SPINE.md:117`) rather than a ban on keeping the in-memory list current — so B appends each newly-recorded `Attempt` to the cached array in-process as the session progresses, without a second repository call. Under B, a miss on turn 2 can bias turn 3's pick within the same session.

Both satisfy "read once per session start" (one repository call happens) and "not re-queried per candidate card" (no query-per-candidate loop) — but A and B disagree on whether weak-spot bias is same-session-reactive or next-session-only, which is a real, observable UX difference (does missing a card make it more likely to reappear later in the same drill, or only tomorrow?) that a story-level implementer has no way to resolve from this Rule alone.

**Fix direction:** one clause — state whether the cached `attempts` array is extended in-memory with the current session's own new attempts as they're recorded, or frozen at session start.

---

## Checked, clean — Capability Map and Structural Seed ERD against the amended Rule text

- Capability Map FR-6 (`ARCHITECTURE-SPINE.md:245`), FR-7 (`:246`), FR-8 (`:247`) all correctly cite AD-9/AD-10 and correctly reflect the amendment: FR-6's row explicitly says "display-only, per AD-10"; FR-7's row correctly names `selectNext` over `AttemptRepository.listAll()`; FR-8's row correctly adds "also read in bulk by weak-spot selection." AD-10's `Binds:` line (`:127`) matches the FR-6/7/8 widening recorded in the memlog.
- ERD `TALLY` entity (`ARCHITECTURE-SPINE.md:217-220`) still shows exactly `cardId`, `missCount` — no due-date/interval/timestamp field, consistent with the Rule's explicit prohibition. `ATTEMPT` entity fields are unchanged and already carry `timestamp`, which is what the amended selection algorithm now depends on — no ERD change was needed and none was made, which is correct, not an oversight.
- No contradiction found between the Capability Map / ERD and the amended AD-9/AD-10 text.

---

## Summary Table

| # | Finding | Severity | New to this amendment? |
| --- | --- | --- | --- |
| F1 | `selectNext` recency basis (time vs ordinal), correct-attempt redemption, zero-score floor — all underspecified | High | Yes — amendment introduces the function |
| F2 | `listAll()` exhaustiveness/windowing not pinned — repo-level truncation is a compliant reading | Medium | Yes — amendment introduces the method |
| F3 | `TallyRepository` has no decrement/set method AD-13 requires; "display-only" framing adds cover to skip it | High | Pre-existing gap, sharpened by this amendment |
| F4 | Same-session miss feedback into same-session selection is ambiguous | Medium | Yes — amendment introduces the caching question |
| — | Capability Map / ERD vs amended Rule text | Clean | Checked, no issue |
