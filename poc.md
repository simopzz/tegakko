Prompt A — Native Android PoC:

Build a minimal Android app: one full-screen writing surface with a genkouyoushi-style grid background (thin gray guide lines forming square cells, roughly the proportions of Japanese manuscript paper), and stylus-drawn ink on top.

Use Kotlin + Jetpack Compose + androidx.ink (stable 1.0.0 — ink-authoring, ink-brush, ink-geometry, ink-rendering, ink-storage, ink-strokes). Use GLFrontBufferedRenderer and the MotionPredictor library for the low-latency rendering path — that's the whole point of this stack, so don't skip it for a naive Canvas draw loop. Pressure should map to stroke width via the Brush module. Min SDK: Android 10 (API 29).

Add a single "clear" button so I can wipe the canvas and try again. That's the entire feature set — no navigation, no other screens, no persistence.

Delivery: I'll be building on a MacBook and testing on an Android tablet. Set the project up for ADB deployment: assume I'll enable Developer Options + USB debugging on the tablet and either connect via USB-C or pair over Wi-Fi, then install with adb install -r app-debug.apk or run directly from Android Studio targeting the physical device. Tell me the exact commands/steps once the project is built.

---

Prompt B — Web/PWA PoC:

Build a minimal single-page web app: one full-viewport <canvas> with a genkouyoushi-style grid background (thin gray guide lines forming square cells), and stylus-drawn ink on top.

Use the Pointer Events API (pressure, pointerType: 'pen') for stylus detection and pressure-mapped stroke width. Use Chrome's Delegated Ink Trails API (updateInkTrailStartPoint) for latency reduction — that's the specific thing being tested, so don't skip it for a plain requestAnimationFrame draw loop. Target Chrome/Edge/Samsung Internet on Android; no need to support Safari or non-pointer input.

Add a single "clear" button. No build tooling needed beyond what's necessary to load it in a mobile browser — plain HTML/JS is fine unless you have a reason to reach for something else. No persistence, no other screens.

Delivery: I'll be building on a MacBook and testing on an Android tablet over the same Wi-Fi network. Set up a simple static server (e.g. npx serve or python3 -m http.server) and tell me the LAN URL to open on the tablet. Important: the Delegated Ink Trails API almost certainly requires a secure context (HTTPS) — a plain http://<lan-ip>:<port> origin won't qualify, so either set up local HTTPS with mkcert (and tell me how to trust the cert on the tablet), or tell me exactly what to add at chrome://flags/#unsafely-treat-insecure-origin-as-secure on the tablet so the fast path actually activates instead of silently falling back to plain canvas rendering. Confirm in your own testing/devtools that the low-latency path is actually active before handing it back to me.