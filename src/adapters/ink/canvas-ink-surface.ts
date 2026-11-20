// `InkSurface` adapter: a single <canvas> carrying the genkouyoushi cell
// guide, the center dot, and the ink itself
// (docs/adr/0002-ink-adapter-owns-its-canvas.md).
//
// The mechanics below were validated against a web PoC (since removed)
// because ink feel is judged by human comparison, not by a numeric
// threshold. The load-bearing details, all deliberate:
//
//   * ONE canvas. Two stacked canvases (opaque guide + transparent ink)
//     turn black the instant `navigator.ink` takes the ink canvas over for
//     low-latency compositing -- with `{desynchronized: true}` Chrome forces
//     that canvas's backing surface opaque.
//   * `desynchronized: true`, DPR-scaled backing store, draw in CSS px.
//   * Per-segment straight lines with round cap/join, no smoothing: a curve
//     fit would add a frame of lag, which is the one thing low-latency ink
//     cannot afford.
//   * Width computed ONCE per move event and reused for every coalesced
//     sub-segment of that event.
//   * `navigator.ink` feature-detected, every presenter call in try/catch --
//     a non-Chromium browser or an insecure context degrades to plain canvas
//     rendering, never to a thrown error.
//
// One deliberate design point: pointer coordinates go through
// the canvas's `getBoundingClientRect()` before use (raw `clientX/clientY`
// only works for a fullscreen canvas; this one is an inset cell). Points are
// then stored grid-relative (0..1 within the cell) so they can be persisted
// and replayed at any viewport size.

import type { InkSurface } from '../../ports/ink-surface';
import type { Stroke, StrokePoint, StrokeTiming } from '../../domain/ink';
import { pressureToWidth } from '../../domain/ink';
import type { WidthPreset } from '../../domain/settings';

/** The `theme.css` token values the canvas needs. Passed in by the
 * composition root rather than read here: a canvas has no access to CSS
 * custom properties, and hard-coding hexes inside an adapter would fork the
 * palette away from `theme.css`. */
export interface InkColors {
  /** `--color-ink` */
  ink: string;
  /** `--color-grid-guide` */
  guide: string;
  /** `--color-positive-bg` -- the center dot */
  dot: string;
  /** `--color-surface-canvas` -- the cell ground */
  canvas: string;
}

/** Injectable so tests can hand in a fake 2D context: happy-dom implements
 * no canvas rendering context at all, so the adapter's drawing is verified
 * by recorded calls rather than by pixels. */
export type ContextFactory = (canvas: HTMLCanvasElement) => CanvasRenderingContext2D | null;

const defaultContextFactory: ContextFactory = (canvas) =>
  canvas.getContext('2d', { desynchronized: true });

// Delegated Ink Trails is Chromium-only and absent from lib.dom, so it is
// typed here rather than reached for with `any`.
interface InkTrailStyle {
  color: string;
  diameter: number;
}
interface InkPresenter {
  updateInkTrailStartPoint(event: PointerEvent, style: InkTrailStyle): void;
}
interface InkApi {
  requestPresenter(options: { presentationArea: Element }): Promise<InkPresenter>;
}
function inkApi(): InkApi | null {
  const candidate = (navigator as Navigator & { ink?: InkApi }).ink;
  return candidate ?? null;
}

export interface CanvasInkSurfaceOptions {
  colors: InkColors;
  widthPreset?: WidthPreset;
  contextFactory?: ContextFactory;
}

export class CanvasInkSurface implements InkSurface {
  private readonly colors: InkColors;
  private readonly contextFactory: ContextFactory;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private presenter: InkPresenter | null = null;
  private presenterWarned = false;

  private widthPreset: WidthPreset;
  private strokeCompleteCb: ((stroke: Stroke, timing: StrokeTiming) => void) | null = null;

  // Completed strokes, kept in memory so a resize (which blows away the
  // backing store) can redraw them -- and so `Stroke` itself is the exact
  // persisted shape callers embed in an `Attempt` (each stroke
  // already carries the preset it was drawn with, so `replay()` below never
  // has to consult `this.widthPreset` and a later `setWidthPreset` can't
  // retroactively repaint old ink).
  private strokes: Stroke[] = [];
  private currentPoints: StrokePoint[] = [];
  // The preset is read once at stroke start and used for the whole stroke,
  // so a mid-stroke Settings change can never split one stroke's width range.
  private currentPreset: WidthPreset;
  // `performance.now()` at the in-progress stroke's `pointerdown` -- the
  // timing authority `timeToFirstStrokeMs` needs, since only this
  // adapter sees the raw pointer event.
  private currentStrokeStartedAt = 0;

  private activePointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  // CSS-pixel geometry of the canvas, cached: `getBoundingClientRect()` forces
  // layout, and a stroke can fire hundreds of move events. Invalidated on
  // resize and re-read at each `pointerdown`, so a layout change no resize
  // event covered (a screen swap under the same window size) can't leave a
  // stroke drawing at an offset.
  private rect: { left: number; top: number; width: number; height: number } | null = null;

  constructor(options: CanvasInkSurfaceOptions) {
    this.colors = options.colors;
    this.widthPreset = options.widthPreset ?? 'expressive';
    this.currentPreset = this.widthPreset;
    this.contextFactory = options.contextFactory ?? defaultContextFactory;
  }

  mount(node: HTMLElement): void {
    if (this.canvas) {
      throw new Error('CanvasInkSurface.mount called twice -- construct a fresh instance instead');
    }
    const canvas = node.ownerDocument.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.background = this.colors.canvas;
    canvas.style.borderRadius = 'var(--radius-lg)';
    node.appendChild(canvas);
    this.canvas = canvas;

    // Guarded exactly once: a null 2D context (happy-dom, a blocked canvas)
    // must not throw and must not stop the drill working -- pointer tracking
    // and `onStrokeComplete` stay live, only rendering is skipped.
    this.ctx = this.contextFactory(canvas);

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerEnd);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);
    // Boundary events (pointerleave/-out/-over/-enter) are excluded from
    // pointer-capture retargeting by spec, so pointerleave still fires at the
    // physical boundary mid-stroke even while captured -- unlike pointerup,
    // which capture keeps delivered to this canvas regardless of where the
    // pointer physically is. Treating it as a completion would end the
    // stroke early exactly when a learner's pen tip grazes the cell edge;
    // discard it like pointercancel instead and let the real pointerup (or a
    // genuine cancel) decide the stroke's fate.
    canvas.addEventListener('pointerleave', this.handlePointerCancel);
    window.addEventListener('resize', this.handleResize);

    this.resize();
    void this.initDelegatedInk(canvas);
  }

  destroy(): void {
    const canvas = this.canvas;
    window.removeEventListener('resize', this.handleResize);
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.handlePointerDown);
      canvas.removeEventListener('pointermove', this.handlePointerMove);
      canvas.removeEventListener('pointerup', this.handlePointerEnd);
      canvas.removeEventListener('pointercancel', this.handlePointerCancel);
      canvas.removeEventListener('pointerleave', this.handlePointerCancel);
      canvas.remove();
    }
    this.canvas = null;
    this.ctx = null;
    this.presenter = null;
    this.strokeCompleteCb = null;
    this.strokes = [];
    this.currentPoints = [];
    this.activePointerId = null;
  }

  clear(): void {
    this.strokes = [];
    this.currentPoints = [];
    this.activePointerId = null;
    this.redraw();
  }

  onStrokeComplete(cb: (stroke: Stroke, timing: StrokeTiming) => void): void {
    // Single subscriber by contract -- a second registration replaces the
    // first rather than fanning out.
    this.strokeCompleteCb = cb;
  }

  setWidthPreset(preset: WidthPreset): void {
    // Read at stroke start, so a change lands on the next stroke and leaves
    // strokes already drawn exactly as they were.
    this.widthPreset = preset;
  }

  // ---- geometry -------------------------------------------------------

  private measure(): { left: number; top: number; width: number; height: number } {
    const canvas = this.canvas;
    if (!canvas) return { left: 0, top: 0, width: 0, height: 0 };
    const box = canvas.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  }

  private geometry(): { left: number; top: number; width: number; height: number } {
    this.rect ??= this.measure();
    return this.rect;
  }

  private handleResize = (): void => {
    this.resize();
  };

  private resize(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    this.rect = this.measure();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const { width, height } = this.rect;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    // Draw in CSS px throughout; the backing store carries the DPR.
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Resizing blows away the backing store -- guide and every in-memory
    // stroke have to be redrawn.
    this.redraw();
  }

  // ---- rendering ------------------------------------------------------

  private get hasInk(): boolean {
    return this.strokes.length > 0 || this.currentPoints.length > 0;
  }

  private redraw(): void {
    this.drawGuide();
    for (const stroke of this.strokes) this.replay(stroke);
  }

  /** Repaint the cell ground and the dashed cross-guide. The center dot is
   * drawn only when the cell is empty -- `showDot` lets `pointerdown`
   * suppress it the instant ink starts, rather than leaving it showing
   * underneath the learner's first stroke. */
  private drawGuide(showDot: boolean = !this.hasInk): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width: w, height: h } = this.geometry();

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.colors.canvas;
    ctx.fillRect(0, 0, w, h);

    // Genkouyoushi cross-guide: dashed, always visible.
    ctx.save();
    ctx.strokeStyle = this.colors.guide;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    const midX = Math.round(w / 2) + 0.5;
    const midY = Math.round(h / 2) + 0.5;
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, h);
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
    ctx.restore();

    if (showDot) this.drawCenterDot(w, h);
  }

  private drawCenterDot(w: number, h: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = this.colors.dot;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** One straight segment, round-capped -- the whole renderer. */
  private segment(x0: number, y0: number, x1: number, y1: number, width: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.colors.ink;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  /** Redraw a completed stroke from its grid-relative points (resize path),
   * at the preset it carries (the one in force when it was drawn) -- never
   * `this.widthPreset`, or a preset change would silently repaint old ink. */
  private replay(stroke: Stroke): void {
    const { width: w, height: h } = this.geometry();
    const { points, widthPreset: preset } = stroke;
    const first = points[0];
    if (!first) return;
    if (points.length === 1) {
      const x = first.x * w;
      const y = first.y * h;
      this.segment(x, y, x + 0.01, y + 0.01, pressureToWidth(first.pressure, preset));
      return;
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (!a || !b) continue;
      this.segment(a.x * w, a.y * h, b.x * w, b.y * h, pressureToWidth(b.pressure, preset));
    }
  }

  // ---- delegated ink trails -------------------------------------------

  private async initDelegatedInk(canvas: HTMLCanvasElement): Promise<void> {
    const ink = inkApi();
    if (!ink) return; // Non-Chromium or insecure context: plain canvas only.
    try {
      const presenter = await ink.requestPresenter({ presentationArea: canvas });
      // `destroy()` may have run while this was in flight.
      if (this.canvas === canvas) this.presenter = presenter;
    } catch (cause) {
      console.warn('navigator.ink.requestPresenter failed; falling back to canvas ink:', cause);
    }
  }

  private updateInkTrail(event: PointerEvent, width: number): void {
    const presenter = this.presenter;
    if (!presenter) return;
    try {
      presenter.updateInkTrailStartPoint(event, { color: this.colors.ink, diameter: width });
    } catch (cause) {
      // Non-fatal, and warned exactly once: canvas rendering keeps working,
      // and a per-event warning would flood the console during a stroke.
      if (!this.presenterWarned) {
        this.presenterWarned = true;
        console.warn('updateInkTrailStartPoint failed; canvas rendering continues:', cause);
      }
    }
  }

  // ---- pointer handling -----------------------------------------------

  /** PoC parity: a non-pen pointer, or a pen reporting a falsy pressure
   * (including exactly 0), is treated as 0.5 so mouse/touch stays operable
   * as a dev/testing degradation. */
  private static normalizePressure(event: PointerEvent): number {
    if (!event.pressure || event.pointerType !== 'pen') return 0.5;
    return event.pressure;
  }

  /** CSS-px offset within the cell -> grid-relative 0..1. A
   * zero-sized cell (a canvas measured before layout, or happy-dom, which
   * reports every box as 0) collapses to 0 rather than producing NaN. */
  private toGridRelative(x: number, y: number, pressure: number): StrokePoint {
    const { width, height } = this.geometry();
    return {
      x: width > 0 ? x / width : 0,
      y: height > 0 ? y / height : 0,
      pressure,
    };
  }

  private handlePointerDown = (event: PointerEvent): void => {
    // A second pointer mid-stroke is ignored outright -- the first keeps the
    // stroke (no palm-rejection heuristics, no stroke hand-off).
    if (this.activePointerId !== null) return;
    const canvas = this.canvas;
    if (!canvas) return;

    // Re-measure once per stroke rather than trusting a stale cache.
    this.rect = this.measure();

    // The center dot goes the moment ink starts, not when the stroke lands,
    // so it is never left showing underneath the learner's first stroke.
    const hadInk = this.hasInk;

    this.activePointerId = event.pointerId;
    const { left, top } = this.geometry();
    this.lastX = event.clientX - left;
    this.lastY = event.clientY - top;

    // happy-dom implements neither capture method; a missing capture only
    // costs stroke tracking outside the canvas bounds, never correctness.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* not available -- ignore */
    }

    this.currentPreset = this.widthPreset;
    this.currentStrokeStartedAt = performance.now();
    const pressure = CanvasInkSurface.normalizePressure(event);
    const width = pressureToWidth(pressure, this.currentPreset);

    if (!hadInk) this.drawGuide(false);

    // Presenter update goes BEFORE the dot is drawn on pointerdown (and
    // AFTER the segments on pointermove) -- PoC ordering.
    this.updateInkTrail(event, width);

    this.currentPoints = [this.toGridRelative(this.lastX, this.lastY, pressure)];

    // A tap with no movement still leaves a dot, via a +0.01 micro-segment.
    this.segment(this.lastX, this.lastY, this.lastX + 0.01, this.lastY + 0.01, width);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) return;

    // Width comes from the raw event once, then applies to every coalesced
    // sub-segment below -- PoC parity.
    const width = pressureToWidth(CanvasInkSurface.normalizePressure(event), this.currentPreset);
    const { left, top } = this.geometry();

    const coalesced =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const events: PointerEvent[] = coalesced.length > 0 ? coalesced : [event];

    for (const sub of events) {
      const x = sub.clientX - left;
      const y = sub.clientY - top;
      this.segment(this.lastX, this.lastY, x, y, width);
      this.lastX = x;
      this.lastY = y;
      this.currentPoints.push(
        this.toGridRelative(x, y, CanvasInkSurface.normalizePressure(sub)),
      );
    }

    this.updateInkTrail(event, width);
  };

  private handlePointerEnd = (event: PointerEvent): void => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;

    try {
      this.canvas?.releasePointerCapture(event.pointerId);
    } catch {
      /* not available (or already released) -- ignore */
    }

    const points = this.currentPoints;
    this.currentPoints = [];
    if (points.length === 0) return;

    const stroke: Stroke = { points, widthPreset: this.currentPreset };
    this.strokes.push(stroke);
    const timing: StrokeTiming = { startedAt: this.currentStrokeStartedAt, endedAt: performance.now() };
    // Exactly one notification per completed stroke, never per pointer event.
    this.strokeCompleteCb?.(stroke, timing);
  };

  /** `pointercancel` means the stroke was aborted by the platform (palm
   * contact, an OS gesture taking over) -- it is not a completed stroke, so
   * it is discarded rather than committed: nothing is recorded, nothing is
   * announced, and the cell repaints without the abandoned marks. Committing
   * it would light up Missed/Correct for ink the learner never wrote. */
  private handlePointerCancel = (event: PointerEvent): void => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    try {
      this.canvas?.releasePointerCapture(event.pointerId);
    } catch {
      /* not available (or already released) -- ignore */
    }
    this.currentPoints = [];
    this.redraw();
  };
}
