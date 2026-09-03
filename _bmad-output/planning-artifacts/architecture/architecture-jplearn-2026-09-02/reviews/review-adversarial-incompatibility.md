---
name: 'review-adversarial-incompatibility'
type: architecture-review
target: '_bmad-output/planning-artifacts/architecture/architecture-jplearn-2026-09-02/ARCHITECTURE-SPINE.md'
method: 'adversarial two-independent-builders incompatibility hunt'
created: '2026-09-03'
---

# Adversarial Incompatibility Review — jplearn-kana-v1 Architecture Spine

## Method

For each candidate hole, I constructed two independently-built units (different epics/stories or different dev sessions) that each read the spine literally, each satisfy every AD that applies to them, and asked whether their outputs would still fail to compose — a compile error, a silent data mismatch, or a runtime crash — when `app/` wires them together. Only pairs where both sides have a *defensible, spine-compliant* reading are reported; disagreements resolvable by "just read the PRD carefully" were discarded unless the PRD itself is ambiguous or inconsistent on the same point (several are).

Cross-referenced against `prd.md`, `EXPERIENCE.md`, and `DESIGN.md` throughout, since the spine's `sources:` frontmatter claims those as inputs — a gap that persists even after reading them counts as a spine gap, not just a "go read the PRD" non-issue.

## Overall Verdict

The spine is unusually disciplined about *dependency direction* (AD-1, AD-6) and about the two things it clearly anticipated builders getting wrong (ink-in-Svelte re-renders via AD-2, Attempt-shape leaking into export via AD-5). But it is a **structural spine, not a data-contract spine**: none of the four repository ports have method signatures, several ERD fields are typed `string` where the PRD implies a small closed value set that is never enumerated, one entire adapter (the in-memory `CardRepository`) has no home in the Structural Seed, and the single most latency-sensitive boundary in the whole system — the ink→domain stroke-complete callback — is drawn as an arrow on a diagram with no interface backing it anywhere in `ports/`. Two developers (or two sessions of the same solo developer, weeks apart) working from this document alone would very plausibly produce adapters that satisfy every AD to the letter and still fail to wire together, or wire together and silently corrupt session-closure/history data. None of these are exotic edge cases — they sit on the FR-2/FR-7 scope path, the FR-8/FR-9/FR-10/FR-11 attempt→session→history path, and the FR-3 ink path, i.e. the app's core loop.

Seven concrete findings below, ranked by severity (blast radius × likelihood two spine-compliant readings diverge).

---

## Finding 1 — The ink→domain stroke-complete callback has no port, no declared payload, and no declared timing semantics (CRITICAL)

**AD implicated:** AD-2 (governs *when* the callback fires, not its shape), AD-1 (governs dependency direction only), `ports/` (silent — none of the four listed ports cover this)

**The gap:** The Design Paradigm diagram draws `Ink -->|stroke-complete callback only| Domain` directly — bypassing `ui` entirely, which is itself a detail not stated in prose anywhere, only inferable from the diagram edge. AD-2 pins only the *cadence* ("once per completed stroke, never per pointer event"), and AD-4 pins the *persisted* `Stroke` shape (`{points: {x,y,pressure}[], widthPreset}`). Nowhere is `onStrokeComplete`'s function signature declared as a `ports/` interface, and FR-8 requires `timeToFirstStrokeMs` (prompt-shown → first stroke) and per-attempt `strokeCount`/timing — data that has to come from *somewhere* on this boundary.

**Unit A (ink adapter, built to AD-2's letter):** implements `onStrokeComplete(stroke: Stroke): void` — passes only the finished stroke, since AD-2 says nothing more is required and AD-4's `Stroke` type has no timestamp field. Timing is "someone else's problem."

**Unit B (domain attempt-aggregation / the code that composes `onStrokeComplete` in `app/`, built from FR-8's requirement):** was written assuming the ink adapter supplies capture-time metadata — e.g. `onStrokeComplete(stroke: Stroke, meta: { strokeStartMs: number, strokeEndMs: number }): void` — because computing `timeToFirstStrokeMs` from *when the JS callback happens to run* (after Delegated Ink Trails' async rendering) is measurably less accurate than timestamping at the actual `pointerdown`/`pointerup` events the ink adapter itself owns exclusively (AD-2: ink owns these listeners; nothing outside it ever sees a raw pointer event).

**Why both are spine-compliant and still incompatible:** AD-2's rule is satisfied by either signature — it only constrains call frequency. AD-6 (strict TS, no `any` at port boundaries) would catch this at compile time *only if* a shared interface existed for both sides to type against; since none does, `app/`'s composition-root glue code is where the mismatch surfaces, and only if both units are compiled together — if built in separate sessions/branches with local stub types, both compile clean in isolation and the mismatch is discovered only at integration, potentially after both are "done."

**Fix direction:** Add a `ports/` (or a dedicated `src/ink/contract.ts`) interface, e.g. `StrokeCompleteHandler = (stroke: Stroke, meta: StrokeTiming) => void` with `StrokeTiming` explicitly named, and state which side (ink vs domain) is the timestamp authority for `timeToFirstStrokeMs`/`totalTimeMs`.

---

## Finding 2 — `Session.scope` is typed `string` but scope selection is multi-dimensional; no serialization convention exists (HIGH)

**AD implicated:** Consistency Conventions (data & formats row), Structural Seed ERD, FR-2/FR-7 capability-map rows

**The gap:** FR-2 fixes scope granularity at "script (hiragana/katakana/both) × base-vs-yoon" — not a single value. The ERD nonetheless types `SESSION.scope` as a bare `string`. EXPERIENCE.md's IA table shows "Another round" on Session Summary routing back through Scope picker, implying a session's stored scope needs to be re-derivable (not just displayed) later. No convention says how the multi-dimensional selection collapses into that one string.

**Unit A (scope-picker `ui` + `domain` scope-filter, built for FR-2/FR-7):** models scope internally as a structured value, e.g. `{ scripts: ('hiragana'|'katakana')[], includeYoon: boolean }`, and when persisting a `Session`, serializes it as a joined label for readability: `"hiragana+katakana:base"`.

**Unit B (`persistence`/`SessionRepository` + `history` screen, built for FR-10/FR-11, independently, off the ERD's bare `string`):** treats `scope` as an opaque display string only and, to support "Another round" re-selecting the same scope, instead JSON-stringifies the structured filter object into that same field (`'{"scripts":["hiragana"],"yoon":false}'`) so it can `JSON.parse` it back.

**Why incompatible despite compliance:** Both readings satisfy "the field is a `string`" and both satisfy their own FR. But History (FR-11, "browse past session records... closure reason") rendering Unit A's human label would show garbage if fed Unit B's JSON, and "Another round" re-parsing Unit A's label as JSON would throw. Nothing in the spine says whether `scope` is a *display* string or a *machine-parseable* string, or names a single `ScopeSelector` type both sides must round-trip through.

**Fix direction:** Name a `ScopeSelector` domain type, put it in `ports/` or `domain/`, and specify explicitly whether `Session.scope` stores that type serialized (and how) or a separate human label — not both conflated into one untyped `string`.

---

## Finding 3 — `closureReason` (session closure) has no enumerated value set, and the PRD itself uses two different field names for it (HIGH)

**AD implicated:** Structural Seed ERD, Consistency Conventions, FR-9/FR-10/FR-11 capability-map rows

**The gap:** PRD FR-9's own worked example writes `endReason: inactivity`; PRD FR-10 calls the same concept "closure reason" with the value set "explicit / full-scope / inactivity"; the spine's ERD picks the field name `closureReason: string` but never restates the three literal values as a union type anywhere a compiler would check them.

**Unit A (domain session-closure logic, FR-9, built independently):** emits one of `"explicit" | "full-scope" | "inactivity"` on a `closureReason` field, following the spine's ERD field name and FR-10's word list.

**Unit B (history screen, FR-11's "sessions closed via inactivity are visually distinguishable," built independently against the PRD's own FR-9 text which is the closer citation for *that specific requirement*):** checks `session.endReason === 'idle'` — a different field name (lifted from FR-9's literal example) and a different literal (`'idle'`, a natural paraphrase of "inactivity" nobody pinned down).

**Why incompatible despite compliance:** Each unit can honestly cite a PRD passage for its exact spelling — the PRD is internally inconsistent (`endReason` vs `closureReason`) and never gives a canonical literal-value list; the spine copies only the field name from one side (the ERD) and never resolves the value set at all. AD-6's strict mode does not help: `string` accepts anything. The failure mode is silent — FR-11's "visually distinguish inactivity" check just never fires, or `session.endReason` is `undefined` because persistence only ever wrote `closureReason`.

**Fix direction:** Spine should pin the literal union (`type ClosureReason = 'explicit' | 'full-scope' | 'inactivity'`), pick one field name, and note the PRD's `endReason`/`closureReason` inconsistency as resolved in favor of the ERD's name.

---

## Finding 4 — Screen-navigation enum: no canonical value list, no stated owner module, ambiguous granularity (6 surfaces vs 9 screen states) (MEDIUM-HIGH)

**AD implicated:** Consistency Conventions (state & cross-cutting row), AD-1 (app/ as sole cross-importer)

**The gap:** The convention says "screen navigation is a single top-level Svelte state enum (no router library — the screen set is small and fixed)" but names neither the enum's values nor which module declares it. `EXPERIENCE.md` lists 6 IA surfaces (First run, Scope picker, Drill loop, Session summary, History, Settings) but separately notes "9 screen states total" across those 6 — i.e. some surfaces (plausibly Drill loop, with its prompt/reveal/self-grade sub-states) fan out into more than one state. The spine's `companions: []` is empty, so nothing formally binds the enum to that table.

**Unit A (built while wiring Session-summary → "Another round" → Scope-picker navigation):** declares `type Screen = 'FirstRun' | 'ScopePicker' | 'Drill' | 'Summary' | 'History' | 'Settings'` — 6 flat values, treating "Drill loop"'s reveal/self-grade states as internal component state, not top-level navigation, and puts the enum + the writable Svelte store holding it inside `app/` (since Consistency Conventions elsewhere says "no global mutable state outside `app/`").

**Unit B (built while wiring the idle-timer-triggered closure → summary transition, FR-9):** independently declares a 9-value enum promoting `DrillPrompt` / `DrillReveal` / `DrillGraded` as distinct top-level states (matching EXPERIENCE.md's "9 screen states" line literally), and — reasoning that screen state is a `ui`-adapter concern, not an app-composition concern — declares it inside `adapters/ui/` as a Svelte store.

**Why incompatible despite compliance:** Both are literal readings of "single top-level enum" (6 vs 9 states) and of where non-`app/`-global state may live (the "no global mutable state outside `app/`" line doesn't explicitly say *screen navigation state* counts, since it could be read as a `ui`-local concern rather than cross-cutting app state). If Unit B's enum lives in `adapters/ui`, and any other adapter or `app/` itself needs to read/set current screen (e.g. `io` adapter triggering navigation to Scope picker after an import completes), that adapter would have to import from `adapters/ui` — which AD-1 forbids for a sibling adapter, or forces `app/` into an awkward proxy. Two independently-built navigation call sites using different enum names/granularities will not compile against each other at all.

**Fix direction:** Name the enum's exact values (ideally citing `EXPERIENCE.md`'s IA table verbatim and resolving the 6-vs-9 question explicitly), and state which module owns the declaration — `app/`, given the existing "no global state outside `app/`" rule, is the natural, spine-consistent answer, but the spine needs to say so.

---

## Finding 5 — No repository port has a method signature; "domain owns logic, persistence owns store" split is drawn inconsistently across FR rows (MEDIUM-HIGH)

**AD implicated:** AD-1, `ports/` (all four), Capability Map (FR-6 row specifically)

**The gap:** `CardRepository`, `AttemptRepository`, `SessionRepository`, `TallyRepository` are named but never given method signatures anywhere in the spine (correctly deferred as a code-level concern in general — but the Capability Map actively invites a split that only works if both sides agree on a read/write shape). FR-6's row: "lives in `domain` (tally update logic) + `adapters/persistence` (`tallies` store)."

**Unit A (persistence adapter author, reading "adapters/persistence owns the tallies store"):** implements `TallyRepository.increment(cardId: string): Promise<void>` — an atomic, adapter-internal read-modify-write, since owning "the store" reasonably includes owning the mutation primitive over it.

**Unit B (domain tally-update-logic author, reading "domain owns tally update logic," FR-6: "incremented each time... self-graded incorrect"):** writes the +1 arithmetic itself in `domain/`, calling `TallyRepository.get(cardId): Promise<Tally>` then `TallyRepository.save(tally: Tally): Promise<void>` — because *logic* living in domain, to this author, means the increment computation itself must be domain code, not hidden inside an adapter method.

**Why incompatible despite compliance:** Both are honest readings of the same Capability Map cell ("domain: logic" / "persistence: store" is a description of a *split*, not a method contract). `TallyRepository` as actually implemented (`increment` only) doesn't satisfy the `{get, save}` interface the domain code was written against, or vice versa — a straight type error at the `ports/` boundary, but discoverable only once both are wired, since AD-6 would happily strict-check each side against its own locally-assumed interface shape if the interface itself was never centrally declared before both stories started.

**Fix direction:** Even at spine altitude, state the *shape* of at least the mutating port methods for the two ports with more than one reasonable design (`TallyRepository`, `AttemptRepository` — does `save` take a whole `Attempt` or is there a separate "append stroke" path given AD-4's embedding?), or explicitly defer this with a note that the *first* story to touch each port must write the interface and every subsequent story is bound to it.

---

## Finding 6 — `CardRepository`'s in-memory implementation has no home in the Structural Seed (MEDIUM)

**AD implicated:** AD-3, Structural Seed

**The gap:** AD-3 says the 158-card catalog is "a TypeScript module compiled into the bundle" and `CardRepository` is "implemented by an in-memory adapter reading that module, not by `persistence`." The Structural Seed's `adapters/` block lists exactly four subfolders: `persistence/`, `ink/`, `ui/`, `io/` — none of which is an appropriate, AD-3-compliant home for this adapter (persistence is explicitly excluded; the other three are unrelated concerns).

**Unit A (built for FR-1, following "the 158-card catalog is a TypeScript module... `CardRepository` implemented by an in-memory adapter"):** puts both the static data *and* the `CardRepository` implementation in `domain/cards.ts`, reasoning that since `domain/` is explicitly allowed to hold "card model" per the Design Paradigm's own bullet list, the natural place for a trivial in-memory lookup is right next to the data.

**Unit B (built for FR-2/FR-7, needing to `import` a `CardRepository` instance to hand to `app/`'s composition root, and treating "adapter" literally):** creates `adapters/content/` (a fifth adapter folder, absent from the Structural Seed but consistent with AD-1's "every adapter imports domain/ and/or ports/") and implements `CardRepository` there, importing the catalog data from `domain/cards.ts`.

**Why incompatible despite compliance:** Unit A's approach means `domain/` now exports something that implements a `ports/` interface — technically not a banned import direction under AD-1's literal rule (domain still imports nothing outward), but it collapses the domain/port/adapter separation the whole spine is organized around, since "domain implements its own port" isn't a pattern any other part of the system uses. Unit B's approach is more spine-idiomatic but invents a folder the Structural Seed doesn't list. Whichever a given story picks, code elsewhere (`app/`'s wiring, or any test written against "the CardRepository adapter") that assumed the other location will `import` from a path that doesn't exist.

**Fix direction:** Add the missing folder (e.g. `adapters/content/` or fold it explicitly into `domain/cards.ts` by name) to the Structural Seed so there's one answer.

---

## Finding 7 — `selfGrade` and export-envelope symmetry are under-typed in ways strict TS won't catch (LOW-MEDIUM)

**AD implicated:** Structural Seed ERD, AD-5, AD-6

**Two related sub-gaps, same root cause (fields typed `string` where a closed set is implied but never spelled out as a union):**

- **`selfGrade`:** PRD FR-4 is unambiguous that grading is binary ("correct or incorrect"), and FR-10 computes accuracy as "correct self-grades ÷ attempts" — but the ERD types `ATTEMPT.selfGrade` as bare `string`. A drill-screen builder could persist `"correct" | "incorrect"`; a session-aggregation builder computing FR-10's accuracy could just as defensibly have been written expecting a boolean-flavored string (`"true"/"false"`) or different casing (`"Correct"`). AD-6's strict mode doesn't catch this since `string` accepts all of the above — the failure is a silent `accuracy` of `0` or `NaN` if the two literal sets never intersect, not a compile error.
- **Export envelope asymmetry:** AD-5 requires an `AttemptExport` mapping specifically to strip `strokes` before serialization, and Consistency Conventions' envelope shape names `attempts: AttemptExport[]` explicitly but leaves `tallies` and `sessions` unsuffixed in that same envelope type. That asymmetry is *currently* harmless (Session/Tally have no ink-sized or sensitive fields to strip) but it's not stated as deliberate anywhere. A builder implementing the `io` adapter's export mapper, reading AD-5's "map before serializing" rule as a general export-adapter principle rather than an Attempt-specific one, could add `SessionExport`/`TallyExport` passthrough types "for symmetry"; a builder implementing the import-side schema validator, reading the envelope convention literally (raw `Session`/`Tally` shapes, no `*Export` variant), validates against the persisted types directly. If Session/Tally ever gain a field that shouldn't round-trip (plausible the moment `Session.scope`'s representation is fixed per Finding 2, if that representation ends up embedding something large), the two independently-built halves of `io/` disagree on schema shape with no compiler check catching it, since both `Session` and `SessionExport` would satisfy `strict: true` as long as each side is internally consistent.

**Fix direction:** Pin `selfGrade` as a literal union (`'correct' | 'incorrect'`) in the ERD/domain types. State explicitly whether the `SessionExport`/`TallyExport` non-existence is a deliberate v1 decision (i.e., persisted shape == export shape for those two entities) so a builder doesn't "correct" it into an asymmetric mapper the counterpart doesn't expect.

---

## Summary Table

| # | Finding | Severity | Primary path affected |
|---|---|---|---|
| 1 | Ink→domain stroke-complete callback: no port, no payload/timing contract | Critical | FR-3, FR-8 (ink capture → attempt timing) |
| 2 | `Session.scope`: `string`-typed, multi-dimensional, no serialization convention | High | FR-2, FR-7, FR-11 ("Another round") |
| 3 | `closureReason`/`endReason`: no enumerated values, PRD field-name inconsistency inherited | High | FR-9, FR-10, FR-11 |
| 4 | Screen enum: no canonical values, no owner module, 6-vs-9-state ambiguity | Medium-High | All UI navigation, cross-cutting |
| 5 | Repository ports: no method signatures; domain/persistence split ambiguous (esp. Tally) | Medium-High | FR-6, and by extension FR-8/FR-10 |
| 6 | `CardRepository`'s in-memory adapter has no home in Structural Seed | Medium | FR-1, FR-2, FR-7 |
| 7 | `selfGrade` untyped as literal union; export-envelope Session/Tally symmetry undeclared | Low-Medium | FR-4, FR-10, FR-13 |
