// Port types reference only `domain/` types (docs/adr/0001-hexagonal-boundary.md).
import type { Stroke, StrokeTiming } from '../domain/ink';
import type { WidthPreset } from '../domain/settings';

/**
 * The ink port (docs/adr/0002-ink-adapter-owns-its-canvas.md). Sync and
 * un-wrapped, unlike the repository ports (no `Result`, no
 * `Promise`): rendering ink is a local DOM concern with no failure mode worth
 * surfacing to the UI -- a missing 2D context or an absent `navigator.ink`
 * degrades silently to less capable rendering, never to an error the learner
 * has to read.
 *
 * The implementation owns its canvas node outside Svelte's reactive tree:
 * `mount(node)` is called exactly once per instance and Svelte renders
 * nothing inside that node. `onStrokeComplete` fires once per completed
 * stroke, never per pointer event, and holds a single subscriber -- calling
 * it again replaces the previous callback.
 */
export interface InkSurface {
  /** Attach to (and take ownership of) `node`. Called exactly once per
   * instance; the composition root constructs a fresh instance per drill
   * entry rather than re-mounting one. */
  mount(node: HTMLElement): void;
  /** Release listeners, presenter, and the canvas node. */
  destroy(): void;
  /** Empty the cell: ink gone, guide redrawn, center dot back. */
  clear(): void;
  /** Replace the cell's contents with `strokes`, redrawn at the width
   * preset each stroke carries -- the Undo path: a graded card returns
   * exactly as it was written. */
  restore(strokes: Stroke[]): void;
  /** Register the single stroke-completion subscriber, replacing any previous
   * one. `timing` carries pointer-accurate `startedAt`/`endedAt`
   * (`performance.now()` ms) -- only the adapter sees the raw pointer events
   * these come from. */
  onStrokeComplete(cb: (stroke: Stroke, timing: StrokeTiming) => void): void;
  /** Change the width range used from the *next* stroke onward; strokes
   * already drawn are unaffected. */
  setWidthPreset(preset: WidthPreset): void;
}
