import { describe, expect, it } from 'vitest';
import { pressureToWidth, WIDTH_PRESETS } from './ink';
import type { WidthPreset } from './settings';

describe('pressureToWidth', () => {
  // The three ranges are carried over verbatim from the validated PoC
  // (poc-web/index.html) -- the ink-feel acceptance is a side-by-side
  // comparison against it, so a silent drift here would invalidate that.
  it('keeps the PoC ranges: Subtle 2-5, Expressive 1.5-9, Calligraphy 0.75-18', () => {
    expect(WIDTH_PRESETS.subtle).toEqual({ min: 2, max: 5 });
    expect(WIDTH_PRESETS.expressive).toEqual({ min: 1.5, max: 9 });
    expect(WIDTH_PRESETS.calligraphy).toEqual({ min: 0.75, max: 18 });
  });

  const cases: Array<[WidthPreset, number, number, number]> = [
    // preset, width at p=0, at p=0.5, at p=1
    ['subtle', 2, 3.5, 5],
    ['expressive', 1.5, 5.25, 9],
    ['calligraphy', 0.75, 9.375, 18],
  ];

  for (const [preset, atZero, atHalf, atFull] of cases) {
    it(`maps 0 / 0.5 / 1 linearly across the ${preset} range`, () => {
      expect(pressureToWidth(0, preset)).toBeCloseTo(atZero, 10);
      expect(pressureToWidth(0.5, preset)).toBeCloseTo(atHalf, 10);
      expect(pressureToWidth(1, preset)).toBeCloseTo(atFull, 10);
    });
  }

  it('is linear, not eased -- the midpoint is the exact mean of the endpoints', () => {
    for (const preset of ['subtle', 'expressive', 'calligraphy'] as WidthPreset[]) {
      const mean = (pressureToWidth(0, preset) + pressureToWidth(1, preset)) / 2;
      expect(pressureToWidth(0.5, preset)).toBeCloseTo(mean, 10);
    }
  });
});
