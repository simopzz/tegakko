// Pure domain types + functions -- no DOM/IndexedDB/Svelte import ever
// appears here (AD-1). The canvas adapter (`adapters/ink`) owns every DOM
// concern; this file owns only the shape of a recorded stroke and the
// pressure->width mapping, so both the live adapter and a future replay path
// compute width identically.

import type { WidthPreset } from './settings';

/** One sampled point of a stroke.
 *
 * `x`/`y` are **grid-relative**: 0..1 within the genkouyoushi cell, not CSS
 * pixels (AD-11 -- Story 1.5 persists strokes and must replay them at any
 * viewport size). `pressure` is already normalized (see the adapter: a
 * non-pen pointer, or a pen reporting exactly 0, becomes 0.5). */
export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

/** One completed stroke: pointerdown through pointerup/cancel. This is the
 * persisted shape (Story 1.5, AD-4) -- `widthPreset` travels with the stroke
 * itself (not a sibling field) so a later `setWidthPreset` can never
 * retroactively change how an already-drawn stroke replays. */
export interface Stroke {
  points: StrokePoint[];
  widthPreset: WidthPreset;
}

/** Pointer-accurate stroke timing, in `performance.now()` ms (AD-2). Only the
 * ink adapter sees the raw `pointerdown`/`pointerup` events these come from --
 * `onStrokeComplete`'s callback-invocation time lags `endedAt` by however
 * long Delegated Ink Trails' async rendering takes, so `Drill.svelte` can't
 * compute this itself from when the callback merely happens to run. */
export interface StrokeTiming {
  startedAt: number;
  endedAt: number;
}

/** Min/max stroke width in CSS px per preset, carried over verbatim from the
 * validated web PoC (`poc-web/index.html`) so ink feel is comparable
 * side-by-side. "Calligraphy" deliberately reaches brush-pen range
 * (hairline to bold) rather than a subtle nuance. */
export const WIDTH_PRESETS: Record<WidthPreset, { min: number; max: number }> = Object.freeze({
  subtle: Object.freeze({ min: 2, max: 5 }),
  expressive: Object.freeze({ min: 1.5, max: 9 }),
  calligraphy: Object.freeze({ min: 0.75, max: 18 }),
}) as Record<WidthPreset, { min: number; max: number }>;

/** Linear pressure->width, exactly the PoC's `min + p * (max - min)`. No
 * easing curve: the PoC's feel was validated with this mapping, and AD's
 * "match or exceed the PoC" bar is a side-by-side judgement, so changing the
 * curve here would invalidate the comparison. */
export function pressureToWidth(pressure: number, preset: WidthPreset): number {
  const { min, max } = WIDTH_PRESETS[preset];
  return min + pressure * (max - min);
}
