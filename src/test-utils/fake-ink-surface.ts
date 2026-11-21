// Test helper: a fake InkSurface that records stroke-completion callbacks
// and exposes a helper to complete a stroke programmatically.
//
// Use this in any test that needs an ink surface without mounting a real
// canvas (docs/adr/0002-ink-adapter-owns-its-canvas.md).

import type { InkSurface } from '../ports/ink-surface';
import type { Stroke, StrokeTiming } from '../domain/ink';
import type { WidthPreset } from '../domain/settings';

export interface FakeInkSurface extends InkSurface {
  /** Number of strokes that have landed on this surface. */
  strokesCompleted: number;
  /** Every `restore()` call, in order. */
  restores: Stroke[][];
  /** Every `setCellCount()` call, in order. */
  cellCounts: number[];
  /** Every `setWidthPreset()` call, in order. */
  widthPresets: WidthPreset[];
  /** How many times the surface was cleared. */
  clears: number;
  /** Emit one completed stroke to the subscriber Drill registered. */
  landStroke(overrides?: {
    x?: number;
    y?: number;
    pressure?: number;
    widthPreset?: 'expressive' | 'subtle' | 'calligraphy';
  }): void;
}

export function fakeInkSurface(): FakeInkSurface {
  let cb: ((stroke: Stroke, timing: StrokeTiming) => void) | null = null;
  const surface: FakeInkSurface = {
    strokesCompleted: 0,
    restores: [],
    cellCounts: [],
    widthPresets: [],
    clears: 0,
    mount() {},
    destroy() {},
    clear() {
      surface.clears += 1;
    },
    restore(strokes: Stroke[]) {
      surface.restores.push(strokes);
    },
    onStrokeComplete(next) {
      cb = next;
    },
    setWidthPreset(preset: WidthPreset) {
      surface.widthPresets.push(preset);
    },
    setCellCount(count: number) {
      surface.cellCounts.push(count);
    },
    landStroke(overrides = {}) {
      const startedAt = performance.now();
      const stroke: Stroke = {
        points: [
          {
            x: overrides.x ?? 0.5,
            y: overrides.y ?? 0.5,
            pressure: overrides.pressure ?? 0.7,
          },
        ],
        widthPreset: overrides.widthPreset ?? 'expressive',
      };
      cb?.(stroke, { startedAt, endedAt: performance.now() });
      surface.strokesCompleted += 1;
    },
  };
  return surface;
}
