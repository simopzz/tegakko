# PoC Reconciliation — PRD Technical Claims vs. poc-web/index.html

Source reviewed in full: `/Users/simopzz/dev/tegakko/poc-web/index.html` (428 lines).
Source skimmed for context only: `/Users/simopzz/dev/tegakko/poc-native/` — no `.kt` source files present in the tree (only Gradle wrapper/build artifacts and `AndroidManifest.xml`); no corroborating detail available beyond what the PRD/addendum already states.

## FR-2 — Pen canvas with genkouyoushi grid

**Claim:** Pointer Events (`pressure`, `pointerType: 'pen'`) and Chrome's Delegated Ink Trails used for rendering; at least three width presets (Subtle, Expressive, Calligraphy) exist and produce a felt difference.

**Verdict: Confirmed by code, with one clarifying nuance.**

- Pointer Events are used throughout (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`/`pointerleave`), reading `e.pressure` and `e.pointerType` (lines 323-334, 363-423).
- Delegated Ink Trails is wired up via `navigator.ink.requestPresenter({ presentationArea: canvas })` (line 304) and `updateInkTrailStartPoint()` (lines 347-359), gated behind a feature check with a status HUD reporting active/inactive/absent.
- Exactly three presets exist, named exactly as the PRD states: `Subtle (2–5px)`, `Expressive (1.5–9px)`, `Calligraphy (0.75–18px)` (lines 116-120). The min/max ranges are meaningfully different from each other, so a felt difference is plausible from the numbers alone (code review can't confirm actual felt/tactile difference — that's an on-device claim, not a static-code one).
- **Nuance worth noting (not a mismatch):** Delegated Ink Trails is a supplementary low-latency preview layer only. The actual committed, persisted stroke is always drawn via the regular Canvas 2D path (`strokeSegment()` / `ctx.lineWidth`), regardless of whether the Ink API is active. If `navigator.ink` is unavailable or `requestPresenter` fails, drawing still works via the canvas fallback — the ink trail is cosmetic/latency-only, not load-bearing for correctness. The PRD's phrasing ("used for low-latency stroke rendering") is accurate but could be read as implying Ink Trails renders the persisted stroke; it does not — it only renders the live preview trail.

## FR-11 — Lossless local persistence

**Claim:** Stroke point streams (x, y, normalized pressure) plus active width preset are stored via IndexedDB such that reload reproduces the stroke exactly.

**Verdict: Confirmed for the core mechanism, but one real gotcha found that isn't yet reflected in the PRD.**

- Each finished stroke is stored as `{ points: [{x, y, pressure}, ...], preset: {min, max} }` via IndexedDB (`addStrokeToDb`, lines 160-167, 406-417).
- Replay (`replayStroke`, lines 190-204) reconstructs width from `preset.min + pressure * (preset.max - preset.min)` — the same formula `pressureToWidth()` uses live (line 331-334) — so redrawing is deterministic and matches the PRD's "reproduces the stroke exactly" claim, in principle.
- **New finding — coordinate frame is absolute, not grid-relative:** `x`/`y` are raw `clientX`/`clientY` viewport pixel coordinates at capture time (lines 367-368, 391-393), not coordinates relative to the genkouyoushi grid. The grid itself is redrawn on every resize with `offsetX`/`offsetY` recomputed from the *current* `window.innerWidth`/`innerHeight` (`drawGrid()`, lines 228-241). `resizeAll()` (called on every `resize` event, line 280) redraws the grid at the new size and then replays all saved strokes using their old, now possibly-stale absolute pixel coordinates (lines 273-278). Net effect: the stroke pixels themselves replay identically (truly lossless as raw ink), but if the viewport/window size differs between the writing session and the replay (e.g. device rotation, different window size, different device DPI/viewport) the stroke can visually drift out of alignment with the grid cell it was written in. This is a genuine constraint on "reproduces the stroke exactly" that the current PRD language doesn't call out — it's lossless as a point stream but not viewport-invariant relative to the grid.
- **New finding — no attempt/card grouping in the persisted schema:** the PoC's IndexedDB store is a flat, ungrouped list of stroke records (`autoIncrement` `id` only) with a single global "Clear" action that wipes *all* strokes, in memory and in the DB (lines 284-288). This proves point-stream fidelity, but doesn't exercise the data shape FR-7/FR-11 will actually need in the real app — attempt records that "link to raw stroke ink data" (FR-7) and per-card/per-session grouping. The PoC validates the low-level ink persistence primitive, not the higher-level schema (stroke → attempt → card → session) the PRD requires. Worth a build-time note, not a blocker.

## FR-13 — Installable, offline-capable PWA

**Verdict: Pure greenfield — not yet built or proven in the PoC.**

- `/Users/simopzz/dev/tegakko/poc-web/` contains only `index.html` and `.gitignore` — confirmed via directory listing.
- No `manifest.json`/web app manifest, no service worker file, and no `serviceWorker`/`register()`/manifest-link code anywhere in `index.html` (grep for `manifest|serviceWorker|service-worker|sw.js|register` returns nothing).
- So FR-13's installability + full offline-functionality claims describe work the PRD is correctly scoping in as new, not a capability the PoC already demonstrated. This is consistent with how the PRD itself frames it — §4.6 cites the addendum's PoC-based decision as being about the *delivery-stack choice* (web vs. native), not about PWA installability specifically, and FR-13's one PoC-backed claim is narrower and accurate: the HTTPS/secure-context requirement for Delegated Ink Trails (`navigator.ink` requires a secure context) is genuinely exercised by the PoC, since `requestPresenter` only succeeds on HTTPS or localhost. No mismatch here — just confirming FR-13 as new work, as requested.

## Other notes (out of scope for reporting per task instructions)

The canvas-transparency bug (single-canvas workaround, lines 95-102) and any androidx.ink pressure-clamp behavior are already documented in the PRD/addendum and were not re-reported here.
