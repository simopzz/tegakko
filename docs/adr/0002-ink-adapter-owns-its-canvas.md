# The ink adapter owns a single canvas outside Svelte

The ink adapter (`adapters/ink`) implements the `InkSurface` port and owns its canvas outright: the UI calls `mount(node)` once and never renders inside that node. Pointer Events and Delegated Ink Trails attach directly to the canvas, and the UI only hears about a stroke once it is complete (`onStrokeComplete`), never per pointer event. The genkouyoushi grid and the ink draw on **one** canvas element, never two layered canvases.

tegakko is a web PWA rather than a native app because the native proof of concept (`androidx.ink`) capped the pressure-to-width range inside compiled library code. On the web, felt ink latency is the risk, so the stroke hot path stays out of Svelte's reactive update cycle: moving strokes into Svelte state or props would put a re-render on every pointer move. The single canvas avoids a black-canvas compositing bug the web proof of concept hit with a separate grid canvas under Delegated Ink Trails.

## Consequences

- Strokes are stored relative to the grid, not in viewport pixels, so replay works at any canvas size.
- The First run pen check's live pressure readout is a diagnostic, not the drawing hot path: it may listen to `pointermove` directly.
