import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasInkSurface, type ContextFactory, type InkColors } from './canvas-ink-surface';
import type { Stroke, StrokeTiming } from '../../domain/ink';
import { pressureToWidth } from '../../domain/ink';

// happy-dom implements no canvas 2D rendering context, so the adapter's
// drawing is verified against an injected fake that records calls -- pixels
// are out of reach here by construction (a recorded gap; ink *feel* is a
// human judgement call regardless).
interface DrawnSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  color: string;
}

interface FakeContext {
  ctx: CanvasRenderingContext2D;
  segments: DrawnSegment[];
  arcs: Array<{ x: number; y: number; r: number; color: string }>;
  dashPatterns: number[][];
}

function fakeContext(): FakeContext {
  const segments: DrawnSegment[] = [];
  const arcs: Array<{ x: number; y: number; r: number; color: string }> = [];
  const dashPatterns: number[][] = [];

  let pending: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  let pendingArc: { x: number; y: number; r: number } | null = null;

  const state = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  };
  const saved: Array<typeof state> = [];

  const ctx = {
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(value: number) {
      state.lineWidth = value;
    },
    get lineCap() {
      return state.lineCap;
    },
    set lineCap(value: string) {
      state.lineCap = value;
    },
    get lineJoin() {
      return state.lineJoin;
    },
    set lineJoin(value: string) {
      state.lineJoin = value;
    },
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: (pattern: number[]) => dashPatterns.push([...pattern]),
    save: () => saved.push({ ...state }),
    restore: () => {
      const previous = saved.pop();
      if (previous) Object.assign(state, previous);
    },
    beginPath: () => {
      pending = [];
      pendingArc = null;
    },
    moveTo: (x: number, y: number) => {
      // A real context keeps every subpath of a path until `stroke()` --
      // record them all, not just the last (guide lines share one path).
      pending.push({ x0: x, y0: y, x1: x, y1: y });
    },
    lineTo: (x: number, y: number) => {
      const last = pending[pending.length - 1];
      if (last) {
        last.x1 = x;
        last.y1 = y;
      }
    },
    arc: (x: number, y: number, r: number) => {
      pendingArc = { x, y, r };
    },
    fill: () => {
      if (pendingArc) arcs.push({ ...pendingArc, color: state.fillStyle });
    },
    stroke: () => {
      for (const segment of pending) {
        segments.push({
          ...segment,
          width: state.lineWidth,
          color: state.strokeStyle,
        });
      }
      pending = [];
    },
  };

  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments, arcs, dashPatterns };
}

const COLORS: InkColors = {
  ink: '#201E1D',
  guide: '#CCDBB2',
  dot: '#E1EECC',
  canvas: '#F9F4ED',
};

const CELL = 400;

function host(): HTMLElement {
  const node = document.createElement('div');
  document.body.appendChild(node);
  return node;
}

/** happy-dom reports every box as 0x0, which would make grid-relative
 * coordinates collapse -- stub a real 400x400 cell at the origin. */
function sizeCanvas(node: HTMLElement): HTMLCanvasElement {
  const canvas = node.querySelector('canvas');
  if (!canvas) throw new Error('adapter did not create a canvas');
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: CELL, height: CELL, right: CELL, bottom: CELL, x: 0, y: 0 }) as DOMRect;
  return canvas;
}

interface PointerInit {
  pointerId?: number;
  pointerType?: string;
  pressure?: number;
  clientX?: number;
  clientY?: number;
}

function pointerEvent(type: string, init: PointerInit = {}): PointerEvent {
  const event = new Event(type, { bubbles: true }) as Event & Record<string, unknown>;
  event.pointerId = init.pointerId ?? 1;
  event.pointerType = init.pointerType ?? 'pen';
  event.pressure = init.pressure ?? 0.5;
  event.clientX = init.clientX ?? 0;
  event.clientY = init.clientY ?? 0;
  return event as unknown as PointerEvent;
}

/** A move event carrying coalesced sub-events, the way a high-sampling-rate
 * pen reports several positions between two animation frames. happy-dom
 * doesn't model these at all, so the sub-events are attached by hand. */
function coalescedMove(
  init: PointerInit,
  subPoints: Array<[number, number, number]>,
): PointerEvent {
  const event = pointerEvent('pointermove', init) as PointerEvent & Record<string, unknown>;
  const subs = subPoints.map(([x, y, pressure]) =>
    pointerEvent('pointermove', { ...init, clientX: x, clientY: y, pressure }),
  );
  event.getCoalescedEvents = () => subs;
  return event;
}

/** pointerdown -> N moves -> pointerup on the adapter's canvas. */
function writeStroke(
  canvas: HTMLCanvasElement,
  points: Array<[number, number]>,
  init: PointerInit = {},
): void {
  const [first, ...rest] = points;
  if (!first) throw new Error('a stroke needs at least one point');
  canvas.dispatchEvent(pointerEvent('pointerdown', { ...init, clientX: first[0], clientY: first[1] }));
  for (const [x, y] of rest) {
    canvas.dispatchEvent(pointerEvent('pointermove', { ...init, clientX: x, clientY: y }));
  }
  canvas.dispatchEvent(pointerEvent('pointerup', { ...init }));
}

describe('CanvasInkSurface', () => {
  let node: HTMLElement;
  let fake: FakeContext;
  let factory: ContextFactory;

  beforeEach(() => {
    node = host();
    fake = fakeContext();
    factory = () => fake.ctx;
  });

  afterEach(() => {
    node.remove();
    vi.restoreAllMocks();
    delete (navigator as Navigator & { ink?: unknown }).ink;
  });

  function mounted(preset: 'subtle' | 'expressive' | 'calligraphy' = 'expressive'): {
    surface: CanvasInkSurface;
    canvas: HTMLCanvasElement;
  } {
    const surface = new CanvasInkSurface({
      colors: COLORS,
      widthPreset: preset,
      contextFactory: factory,
    });
    surface.mount(node);
    const canvas = sizeCanvas(node);
    // Re-measure now that the box is stubbed (mount measured a 0x0 box).
    window.dispatchEvent(new Event('resize'));
    return { surface, canvas };
  }

  it('creates exactly one canvas inside the node it was handed', () => {
    mounted();
    expect(node.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('refuses a second mount on the same instance', () => {
    const { surface } = mounted();
    expect(() => surface.mount(node)).toThrow(/mount called twice/);
  });

  it('draws a dashed cross-guide and, while empty, the center dot', () => {
    mounted();
    expect(fake.dashPatterns.length).toBeGreaterThan(0);
    const dot = fake.arcs.at(-1);
    expect(dot).toEqual({ x: CELL / 2, y: CELL / 2, r: 5, color: COLORS.dot });
  });

  it('draws a solid divider and one cross/dot per cell for a two-cell row', () => {
    // A yoon prompt writes across two genkouyoushi cells in one row.
    const { surface } = mounted();
    fake.segments.length = 0;
    fake.arcs.length = 0;
    fake.dashPatterns.length = 0;

    surface.setCellCount(2);

    const guide = fake.segments.filter((segment) => segment.color === COLORS.guide);
    // The rule between the two cells is solid, drawn before the dashed
    // cross, and sits at the row's midpoint.
    expect(guide[0]).toMatchObject({ x0: 200.5, x1: 200.5, y0: 0, y1: CELL });
    // A dashed vertical inside each cell (dash state set, then strokes).
    expect(fake.dashPatterns.length).toBeGreaterThan(0);
    expect(guide.some((s) => s.x0 === 100.5 && s.x1 === 100.5 && s.y0 === 0 && s.y1 === CELL)).toBe(true);
    expect(guide.some((s) => s.x0 === 300.5 && s.x1 === 300.5 && s.y0 === 0 && s.y1 === CELL)).toBe(true);
    // One centre dot per cell, while empty.
    expect(fake.arcs).toEqual([
      { x: 100, y: 200, r: 5, color: COLORS.dot },
      { x: 300, y: 200, r: 5, color: COLORS.dot },
    ]);
  });

  it('uses a cell count set before mount for the first guide draw', () => {
    const surface = new CanvasInkSurface({ colors: COLORS, contextFactory: factory });
    surface.setCellCount(2);
    surface.mount(node);
    sizeCanvas(node);
    window.dispatchEvent(new Event('resize'));

    // Two dots for the two empty cells (mount's own 0x0 draw leaves two
    // arcs at the origin before this).
    expect(fake.arcs.slice(-2)).toEqual([
      { x: 100, y: 200, r: 5, color: COLORS.dot },
      { x: 300, y: 200, r: 5, color: COLORS.dot },
    ]);
  });

  it('records points grid-relative across the whole row, not per cell', () => {
    const { surface, canvas } = mounted();
    surface.setCellCount(2);
    // A two-cell row is 2:1 -- 800x400, each cell 400x400.
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0 }) as DOMRect;
    window.dispatchEvent(new Event('resize'));
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    // A point 600px into the 800px-wide row: three quarters across.
    writeStroke(canvas, [[600, 100]]);

    const stroke = onStroke.mock.calls[0]?.[0] as Stroke;
    expect(stroke.points[0]).toMatchObject({ x: 0.75, y: 0.25 });
  });

  it('replays stored strokes at a different canvas size, row-relative', () => {
    // The persisted Stroke stays 0..1 across the row, so the same stroke
    // drawn on an 800x400 two-cell canvas lands correctly on a 400x200 one.
    const { surface, canvas } = mounted();
    surface.setCellCount(2);
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0 }) as DOMRect;
    window.dispatchEvent(new Event('resize'));
    writeStroke(canvas, [
      [600, 100],
      [700, 300],
    ]);

    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0 }) as DOMRect;
    fake.segments.length = 0;
    window.dispatchEvent(new Event('resize'));

    const ink = fake.segments.filter((segment) => segment.color === COLORS.ink);
    expect(ink.at(-1)).toMatchObject({ x0: 300, y0: 50, x1: 350, y1: 150 });
  });

  it('fires onStrokeComplete exactly once per stroke, not per pointer event', () => {
    const { surface, canvas } = mounted();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    writeStroke(canvas, [
      [10, 10],
      [20, 20],
      [30, 30],
      [40, 40],
    ]);

    expect(onStroke).toHaveBeenCalledTimes(1);
    const stroke = onStroke.mock.calls[0]?.[0] as Stroke;
    expect(stroke.points).toHaveLength(4);
  });

  it('passes pointer-accurate startedAt/endedAt timing, fresh per stroke rather than stale from a previous one', () => {
    // Real `performance.now()` readings throughout (not a mocked clock):
    // happy-dom's own event dispatch reads `performance.now()` too (for
    // `Event.timeStamp`), so stubbing the global clock would also shift
    // those unrelated reads and desync the adapter's own two calls
    // (pointerdown/pointerup) from whichever queued value the test expects.
    const { surface, canvas } = mounted();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    writeStroke(canvas, [
      [10, 10],
      [20, 20],
    ]);

    // Force real, measurable elapsed time before the second stroke so its
    // `startedAt` can't tie with the first by clock-resolution luck alone.
    const until = performance.now() + 1;
    while (performance.now() < until) {
      /* busy-wait */
    }

    writeStroke(canvas, [
      [30, 30],
      [40, 40],
    ]);

    expect(onStroke).toHaveBeenCalledTimes(2);
    const firstTiming = onStroke.mock.calls[0]?.[1] as StrokeTiming;
    const secondTiming = onStroke.mock.calls[1]?.[1] as StrokeTiming;

    expect(firstTiming.endedAt).toBeGreaterThanOrEqual(firstTiming.startedAt);
    expect(secondTiming.endedAt).toBeGreaterThanOrEqual(secondTiming.startedAt);
    // Not stale from the previous stroke.
    expect(secondTiming.startedAt).toBeGreaterThan(firstTiming.startedAt);
  });

  it('records points grid-relative (0..1 within the cell), not in CSS px', () => {
    const { surface, canvas } = mounted();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    writeStroke(canvas, [
      [0, 0],
      [CELL / 2, CELL],
    ]);

    const stroke = onStroke.mock.calls[0]?.[0] as Stroke;
    expect(stroke.points[0]).toMatchObject({ x: 0, y: 0 });
    expect(stroke.points[1]).toMatchObject({ x: 0.5, y: 1 });
  });

  it('keeps only the latest onStrokeComplete subscriber', () => {
    const { surface, canvas } = mounted();
    const first = vi.fn();
    const second = vi.fn();
    surface.onStrokeComplete(first);
    surface.onStrokeComplete(second);

    writeStroke(canvas, [
      [10, 10],
      [20, 20],
    ]);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('ignores a second pointer that goes down mid-stroke', () => {
    const { surface, canvas } = mounted();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 300, clientY: 300 }));
    // The interloper's move and up are both ignored: the first pointer keeps
    // the stroke, and pointer 2's `up` must not end it.
    canvas.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 320, clientY: 320 }));
    canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 2 }));
    expect(onStroke).not.toHaveBeenCalled();

    canvas.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 20, clientY: 20 }));
    canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 1 }));

    expect(onStroke).toHaveBeenCalledTimes(1);
    const stroke = onStroke.mock.calls[0]?.[0] as Stroke;
    // Two points from pointer 1, none from pointer 2.
    expect(stroke.points).toHaveLength(2);
    expect(stroke.points[1]).toMatchObject({ x: 20 / CELL, y: 20 / CELL });
  });

  it('varies width with pen pressure across the preset range', () => {
    const { canvas } = mounted('calligraphy');
    fake.segments.length = 0;

    canvas.dispatchEvent(
      pointerEvent('pointerdown', { pressure: 0.1, clientX: 10, clientY: 10 }),
    );
    canvas.dispatchEvent(pointerEvent('pointermove', { pressure: 0.9, clientX: 20, clientY: 20 }));
    canvas.dispatchEvent(pointerEvent('pointerup', {}));

    // Guide segments (drawn at stroke start, when the dot is dropped) are
    // not ink -- filter by color so only the stroke's own widths are read.
    const widths = fake.segments
      .filter((segment) => segment.color === COLORS.ink)
      .map((segment) => segment.width);
    expect(widths[0]).toBeCloseTo(pressureToWidth(0.1, 'calligraphy'), 10);
    expect(widths[1]).toBeCloseTo(pressureToWidth(0.9, 'calligraphy'), 10);
    expect(widths[1]).toBeGreaterThan(widths[0]!);
  });

  it('treats a mouse pointer, and a pen reporting exactly 0, as pressure 0.5', () => {
    const { surface, canvas } = mounted('subtle');
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    writeStroke(canvas, [[10, 10]], { pointerType: 'mouse', pressure: 0 });
    writeStroke(canvas, [[20, 20]], { pointerType: 'pen', pressure: 0 });

    for (const call of onStroke.mock.calls) {
      const stroke = call[0] as Stroke;
      expect(stroke.points[0]?.pressure).toBe(0.5);
    }
  });

  it('applies a new width preset from the next stroke onward', () => {
    const { canvas, surface } = mounted('subtle');
    fake.segments.length = 0;

    writeStroke(canvas, [[10, 10]], { pressure: 1 });
    const beforeWidth = fake.segments.at(-1)?.width;

    surface.setWidthPreset('calligraphy');
    fake.segments.length = 0;
    writeStroke(canvas, [[30, 30]], { pressure: 1 });
    const afterWidth = fake.segments.at(-1)?.width;

    expect(beforeWidth).toBeCloseTo(pressureToWidth(1, 'subtle'), 10);
    expect(afterWidth).toBeCloseTo(pressureToWidth(1, 'calligraphy'), 10);
  });

  it('draws one segment per coalesced sub-event, all at the raw event width', () => {
    // PoC-parity rule: width is computed ONCE per move event and
    // reused for every coalesced sub-segment -- recomputing per sub-event
    // would step the width inside a single frame.
    const { surface, canvas } = mounted('calligraphy');
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    canvas.dispatchEvent(pointerEvent('pointerdown', { pressure: 0.2, clientX: 0, clientY: 0 }));
    fake.segments.length = 0;
    canvas.dispatchEvent(
      // The raw event reports 0.4; the sub-events report wildly different
      // pressures, which must not change the width used to draw them.
      coalescedMove({ pressure: 0.4, clientX: 40, clientY: 40 }, [
        [10, 10, 0.9],
        [20, 20, 0.1],
        [40, 40, 0.5],
      ]),
    );
    canvas.dispatchEvent(pointerEvent('pointerup', {}));

    const inkSegments = fake.segments.filter((segment) => segment.color === COLORS.ink);
    expect(inkSegments).toHaveLength(3);
    const expectedWidth = pressureToWidth(0.4, 'calligraphy');
    for (const segment of inkSegments) {
      expect(segment.width).toBeCloseTo(expectedWidth, 10);
    }
    // The segments chain through every sub-point, in order.
    expect(inkSegments.map((segment) => [segment.x0, segment.y0, segment.x1, segment.y1])).toEqual([
      [0, 0, 10, 10],
      [10, 10, 20, 20],
      [20, 20, 40, 40],
    ]);
    // Each sub-event still contributes its own point, at its own pressure --
    // only the *rendered* width is shared.
    const stroke = onStroke.mock.calls[0]?.[0] as Stroke;
    expect(stroke.points.map((point) => point.pressure)).toEqual([0.2, 0.9, 0.1, 0.5]);
  });

  it('discards an aborted stroke on pointercancel instead of completing it', () => {
    // A palm touch or an OS gesture cancels the pointer -- that is not a
    // stroke the learner wrote, so it must not enable Missed/Correct.
    const { surface, canvas } = mounted();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    canvas.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(pointerEvent('pointermove', { clientX: 30, clientY: 30 }));
    fake.segments.length = 0;
    fake.arcs.length = 0;
    canvas.dispatchEvent(pointerEvent('pointercancel', {}));

    expect(onStroke).not.toHaveBeenCalled();
    // The abandoned marks are gone and the cell is empty again: no ink is
    // replayed, and the center dot is back.
    expect(fake.segments.filter((segment) => segment.color === COLORS.ink)).toHaveLength(0);
    expect(fake.arcs.at(-1)).toEqual({ x: CELL / 2, y: CELL / 2, r: 5, color: COLORS.dot });

    // The pointer is released, so a fresh stroke can start immediately.
    writeStroke(canvas, [
      [50, 50],
      [60, 60],
    ]);
    expect(onStroke).toHaveBeenCalledTimes(1);
  });

  it('discards the in-progress stroke on pointerleave instead of completing it', () => {
    // pointerleave is a boundary event, excluded by spec from pointer-capture
    // retargeting -- it still fires at the physical edge mid-stroke even
    // while captured, unlike pointerup. Treating it as a completion would end
    // the stroke early whenever a pen tip grazes the cell edge, so it must be
    // discarded like pointercancel rather than committed.
    const { surface, canvas } = mounted();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    canvas.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(pointerEvent('pointermove', { clientX: 30, clientY: 30 }));
    canvas.dispatchEvent(pointerEvent('pointerleave', {}));

    expect(onStroke).not.toHaveBeenCalled();

    // The pointer is released, so a fresh stroke can start immediately.
    writeStroke(canvas, [
      [50, 50],
      [60, 60],
    ]);
    expect(onStroke).toHaveBeenCalledTimes(1);
  });

  it('replays an existing stroke at the preset it was drawn with, not the current one', () => {
    // `setWidthPreset` applies from the next stroke onward -- a resize
    // repaint must not retroactively rewrite ink already on the cell.
    const { surface, canvas } = mounted('subtle');
    writeStroke(canvas, [[100, 100]], { pressure: 1 });

    surface.setWidthPreset('calligraphy');
    fake.segments.length = 0;
    window.dispatchEvent(new Event('resize'));

    const inkSegments = fake.segments.filter((segment) => segment.color === COLORS.ink);
    expect(inkSegments).toHaveLength(1);
    expect(inkSegments[0]?.width).toBeCloseTo(pressureToWidth(1, 'subtle'), 10);
  });

  it('draws ink in the ink color, round-capped, as straight per-segment lines', () => {
    const { canvas } = mounted();
    fake.segments.length = 0;
    writeStroke(canvas, [
      [10, 10],
      [40, 60],
    ]);

    const inkSegments = fake.segments.filter((segment) => segment.color === COLORS.ink);
    expect(inkSegments.length).toBeGreaterThan(0);
    // The move segment runs exactly from the previous point to the new one.
    expect(inkSegments.at(-1)).toMatchObject({ x0: 10, y0: 10, x1: 40, y1: 60 });
  });

  it('leaves a dot for a tap with no movement', () => {
    const { canvas } = mounted();
    fake.segments.length = 0;
    writeStroke(canvas, [[50, 50]]);

    const inkSegments = fake.segments.filter((segment) => segment.color === COLORS.ink);
    expect(inkSegments.at(-1)).toMatchObject({ x0: 50, y0: 50, x1: 50.01, y1: 50.01 });
  });

  it('drops the center dot as soon as ink starts and restores it on clear()', () => {
    const { surface, canvas } = mounted();

    fake.arcs.length = 0;
    writeStroke(canvas, [
      [10, 10],
      [20, 20],
    ]);
    // Redrawing the guide at stroke start must not repaint the dot.
    expect(fake.arcs).toHaveLength(0);

    surface.clear();
    expect(fake.arcs.at(-1)).toEqual({ x: CELL / 2, y: CELL / 2, r: 5, color: COLORS.dot });
  });

  it('clear() empties the cell -- no ink is replayed afterwards', () => {
    const { surface, canvas } = mounted();
    writeStroke(canvas, [
      [10, 10],
      [20, 20],
    ]);

    fake.segments.length = 0;
    surface.clear();

    expect(fake.segments.filter((segment) => segment.color === COLORS.ink)).toHaveLength(0);
  });

  it('restore() redraws the given strokes at each one\'s own preset, dropping the center dot', () => {
    const { surface } = mounted('subtle');
    const strokes: Stroke[] = [
      {
        points: [
          { x: 0.25, y: 0.25, pressure: 0.8 },
          { x: 0.5, y: 0.5, pressure: 0.6 },
        ],
        widthPreset: 'calligraphy',
      },
    ];

    fake.segments.length = 0;
    fake.arcs.length = 0;
    surface.restore(strokes);

    const ink = fake.segments.filter((segment) => segment.color === COLORS.ink);
    expect(ink).toHaveLength(1);
    expect(ink[0]).toMatchObject({ x0: 0.25 * CELL, y0: 0.25 * CELL, x1: 0.5 * CELL, y1: 0.5 * CELL });
    // The preset the stroke carries, never the surface's current one.
    expect(ink[0]?.width).toBeCloseTo(pressureToWidth(0.6, 'calligraphy'), 10);
    // Ink exists again, so the guide redraw leaves the center dot off.
    expect(fake.arcs).toHaveLength(0);

    // An empty restore empties the cell like clear(), dot back.
    fake.segments.length = 0;
    fake.arcs.length = 0;
    surface.restore([]);
    expect(fake.segments.filter((segment) => segment.color === COLORS.ink)).toHaveLength(0);
    expect(fake.arcs.at(-1)).toEqual({ x: CELL / 2, y: CELL / 2, r: 5, color: COLORS.dot });
  });

  it('restore() copies, so later strokes never mutate the caller\'s array', () => {
    const { surface, canvas } = mounted();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);
    const strokes: Stroke[] = [
      { points: [{ x: 0.2, y: 0.2, pressure: 0.5 }], widthPreset: 'expressive' },
    ];

    surface.restore(strokes);
    writeStroke(canvas, [
      [10, 10],
      [20, 20],
    ]);

    // The restored stroke survived the new one; the caller's array is
    // untouched.
    expect(strokes).toHaveLength(1);
    fake.segments.length = 0;
    window.dispatchEvent(new Event('resize'));
    expect(fake.segments.filter((segment) => segment.color === COLORS.ink)).toHaveLength(2);
  });

  it('replays in-memory strokes after a resize blows away the backing store', () => {
    const { canvas } = mounted();
    writeStroke(canvas, [
      [10, 10],
      [20, 20],
    ]);

    fake.segments.length = 0;
    window.dispatchEvent(new Event('resize'));

    expect(fake.segments.filter((segment) => segment.color === COLORS.ink).length).toBeGreaterThan(
      0,
    );
  });

  it('works with navigator.ink absent -- no throw, strokes still complete', () => {
    expect('ink' in navigator).toBe(false);
    const { surface, canvas } = mounted();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    expect(() =>
      writeStroke(canvas, [
        [10, 10],
        [20, 20],
      ]),
    ).not.toThrow();
    expect(onStroke).toHaveBeenCalledTimes(1);
  });

  it('keeps drawing when updateInkTrailStartPoint throws, warning only once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const updateInkTrailStartPoint = vi.fn(() => {
      throw new Error('presenter is unhappy');
    });
    (navigator as Navigator & { ink?: unknown }).ink = {
      requestPresenter: () => Promise.resolve({ updateInkTrailStartPoint }),
    };

    const { surface, canvas } = mounted();
    await Promise.resolve();
    await Promise.resolve();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    writeStroke(canvas, [
      [10, 10],
      [20, 20],
      [30, 30],
    ]);

    expect(updateInkTrailStartPoint).toHaveBeenCalled();
    expect(onStroke).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('survives a null 2D context: no throw, no rendering, strokes still complete', () => {
    const surface = new CanvasInkSurface({ colors: COLORS, contextFactory: () => null });
    surface.mount(node);
    sizeCanvas(node);
    const canvas = node.querySelector('canvas')!;
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    expect(() =>
      writeStroke(canvas, [
        [10, 10],
        [20, 20],
      ]),
    ).not.toThrow();
    expect(onStroke).toHaveBeenCalledTimes(1);
  });

  it('destroy() detaches every listener and removes the canvas', () => {
    const { surface, canvas } = mounted();
    const onStroke = vi.fn();
    surface.onStrokeComplete(onStroke);

    surface.destroy();

    expect(node.querySelector('canvas')).toBeNull();
    writeStroke(canvas, [
      [10, 10],
      [20, 20],
    ]);
    expect(onStroke).not.toHaveBeenCalled();

    // The window resize listener is gone too -- no draws on a dead adapter.
    fake.segments.length = 0;
    window.dispatchEvent(new Event('resize'));
    expect(fake.segments).toHaveLength(0);
  });
});
