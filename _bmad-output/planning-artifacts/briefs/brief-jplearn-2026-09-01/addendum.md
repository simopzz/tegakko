---
title: "Addendum: Kana Writing Practice"
status: final
created: 2026-09-01
updated: 2026-09-02
---

# Addendum: Kana Writing Practice

Supporting detail that doesn't belong in the executive brief but is worth preserving for whoever picks this up next (PRD, architecture, or the user's own future self).

## Delivery Stack: Web / PWA (Decided)

**Decision: web/PWA**, made after building and testing both as PoCs (see PoC Findings below) — not from theory. Primary reason: web gave clearly better, more controllable pressure-to-stroke-width range in actual on-device testing, which matters directly since ink feel is this product's core bet. Native's `androidx.ink` pipeline was noticeably harder to get a wide, calligraphy-style dynamic range out of, for reasons that turned out to be opaque (inside compiled native library code, not the public Kotlin API). Device class (tablet + stylus, not phone) stays fixed as already decided.

- Pointer Events API (`pressure`, `tiltX`/`tiltY`, `pointerType: 'pen'`) for pressure-sensitive stylus detection.
- Chrome's Delegated Ink Trails / Ink API (`updateInkTrailStartPoint`) hands the leading edge of a stroke to the browser compositor to render ahead of the app's own draw call, cutting perceived latency — built specifically for this use case. Confirmed active in real on-device testing (Chrome on a Galaxy Tab).
- Chromium-only (Chrome/Edge/Samsung Internet on Android) — **no Safari support**, so this would not run on iPad without a different approach later.
- Requires a secure context (HTTPS) for the Delegated Ink Trails path — confirmed via `chrome://flags/#unsafely-treat-insecure-origin-as-secure` during PoC testing; a real deployment needs a proper HTTPS origin (trivial for a hosted PWA, unlike the PoC's local dev server).
- Avoids app-store distribution and Android-only lock-in; trades away some of native's latency-tuning maturity, which testing showed was not actually needed to get a good feel in practice.
- Local-only persistence via IndexedDB — confirmed lossless in the PoC (see PoC Findings).
- Fully offline (once loaded/installed as a PWA).

### PoC Findings

Both PoCs were built and tested on-device (Galaxy Tab + S Pen). PoC work is complete; these findings, together with the felt-experience comparison, are what the delivery-stack decision rests on.

- **Native build path had friction.** Kotlin + Compose + `androidx.ink` 1.0.0 stable compiles and installs, but needed `compileSdk` bumped to 35 (several dependencies, including `ink-authoring-compose`, require it over 34) and use of `BrushBehavior.Builder` — the library's flat `BrushBehavior(...)` constructor exists in the compiled AAR for binary compatibility but isn't callable from Kotlin source.
- **Stock pressure brush was misleading.** `StockBrushes.pressurePen()` does map pressure to width, but only for `InputToolType.STYLUS` and only across a narrow 0.8–1.0 pressure band (max 1.5x) — under ordinary writing pressure it read as flat, not pressure-insensitive by device limitation but by that brush's specific tuning. A custom `BrushBehavior`/`BrushTip` with an explicit, wider range fixed this.
- **Web had its own real gotcha.** An initial two-canvas layout (opaque grid layer + transparent ink layer on top) turned the canvas black the instant `navigator.ink.requestPresenter` took over compositing for the ink layer. Merging both into a single, always-opaque canvas fixed it.
- **Dynamic range: web currently gives more control.** Both PoCs got matching parametrized width presets (Subtle / Expressive / Calligraphy). On web, switching presets produces a clearly felt range, including a genuine hairline-to-bold spread on Calligraphy. On native, the same exercise stayed noticeably flatter at the bold end — and a diagnostic on-screen readout confirmed raw Android pressure does reach 1.0 at max press, ruling out a hardware/OS ceiling. The flattening happens somewhere inside `androidx.ink`'s compiled native pressure-normalization or size-multiplier code, which isn't inspectable from the public Kotlin API surface (decompiling the Kotlin-level classes turned up no explicit clamp). Net effect: web currently offers more direct, predictable control over the pressure-to-width curve; native's abstraction is harder to fully control for a wide calligraphy-style range specifically.
- **Persistence is lossless and solved on both — not a differentiator.** Neither platform saves rendered pixels. Native uses `ink-storage`'s own serializers (`StrokeInputBatchSerialization` + `BrushFamilySerialization`) to encode the raw point stream and brush definition, then reconstructs the exact stroke via the public `Stroke(brush, inputs)` constructor — deterministic recomputation, not an approximation. Web has no equivalent library, so the same principle was hand-rolled: store the point stream (x, y, normalized pressure) plus which preset was active in IndexedDB, replay through the same draw routine on load. Both verified surviving a full reload/process-kill with the stroke reproduced exactly, including per-stroke width even when different strokes on the same page used different presets. Native gets this more cheaply (first-party serializers); web needed roughly the same logic hand-written — a real but minor implementation-cost difference, not a capability gap.

## Rejected Alternatives

Closed options from earlier scoping — kept for context on why the shipped shape looks the way it does, not as live choices.

### Delivery stack: native Android

Kotlin + Jetpack Compose + `androidx.ink` (stable 1.0.0, released 2025-12-17 — `ink-authoring`, `ink-brush`, `ink-geometry`, `ink-rendering`, `ink-storage`, `ink-strokes`), built on Android's low-latency front-buffer pipeline (`GLFrontBufferedRenderer`) plus the `MotionPredictor` library. Stylus input as standard `MotionEvent` (`TOOL_TYPE_STYLUS`), no Samsung-specific SDK needed. Strokes stored as vector geometry, not raster — same lossless persistence property web ended up matching. Minimum Android 10 (API 29) for the low-latency path.

**Why it lost:** first-party and purpose-built, and got pressure sensitivity working once a custom `BrushBehavior` replaced the misleading stock brush — but even after that fix, the achievable pressure-to-width *range* stayed noticeably flatter than web's for reasons buried in compiled native library code, not the public Kotlin surface. For a product whose core bet is ink feel, an opaque ceiling on that specific control was disqualifying, even though everything else about the native path (build tooling aside) worked.

**Trade-off being accepted:** giving up `androidx.ink`'s more mature, purpose-built low-latency rendering pipeline and native distribution (app store presence, deeper OS integration) in exchange for a web stack that, in this PoC, simply gave a better felt result on the one dimension that matters most here.

### Scheduling mechanism: full SRS (Leitner / SM-2-lite)

The original brainstorm scoped a proper spaced-repetition scheduler — Leitner or SM-2-lite, with due-dates and review intervals, deciding what to show and when. During product-brief discovery, this was deliberately dropped.

**Why:** the app's real job turned out not to be "run the primary learning schedule" — that's already handled well by Renshuu. Once the job was reframed as "confirm free recall reliably in a short session," a due-date/interval engine no longer justified its complexity. What survived instead is a much lighter mechanism: a per-character miss tally that biases which characters come up next, with no dates, no intervals, no scheduling state machine.

**Trade-off being accepted:** without true SRS spacing, the app can't guarantee optimal long-term retention the way Renshuu's scheduling engine can. That's fine — it isn't trying to own that job.

### Product framing: alternate one-feature candidates

From the brainstorm's "One Feature Only" pass:

- **Pure ink/sketch app** (save-as-image only, no drawing evaluation) — would have validated the tablet/stylus stack fastest but would have tested nothing about recall.
- **Flip-card with no drawing evaluation** (drawing for the user's own eyes only, no self-grade) — cheapest possible loop, but drops the one thing that makes this different from just doodling.

Both were set aside in favor of the shipped shape: self-graded free recall on a real pen canvas, because that's the only version that actually answers "do I really know this."

## Parked Ideas (v2+, not commitments)

Carried forward from the original brainstorm, none scoped or sequenced yet:

- Exportable image of the day's writing (notebook/diary-page metaphor).
- Ink-blot-fades-if-you-quit mechanic (abandon-session feedback) — considered, not decided; would need to fit the "no gamification" spirit of v1 without becoming a streak mechanic in disguise.
- KanjiVG (open stroke-order SVG dataset) as a future content source once kanji is in scope.
- Radical-based character grouping, to support learning transfer once kanji is introduced.
