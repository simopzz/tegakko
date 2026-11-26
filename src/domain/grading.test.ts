import { describe, expect, it } from 'vitest';
import { geometryCheck, decideGrade } from './grading';
import type { Card } from './cards';

function stroke(points: { x: number; y: number }[]) {
  return { points: points.map((p) => ({ ...p, pressure: 0.5 })), widthPreset: 'expressive' as const };
}

function card(grapheme: string): Card {
  return {
    cardId: `${grapheme}:hiragana`,
    grapheme,
    script: 'hiragana',
    set: 'base',
    romaji: 'a',
  };
}

describe('geometryCheck', () => {
  it('rejects empty ink as blank', () => {
    expect(geometryCheck([]).ok).toBe(false);
  });

  it('rejects a tiny dot as blank', () => {
    const strokes = [stroke([{ x: 0.5, y: 0.5 }])];
    expect(geometryCheck(strokes).ok).toBe(false);
  });

  it('rejects strokes drawn far outside the cell', () => {
    const strokes = [stroke(
      Array.from({ length: 12 }, (_, i) => ({ x: -0.2 + (i % 2) * 0.1, y: 0.2 + i * 0.05 })),
    )];
    expect(geometryCheck(strokes).reason).toBe('out-of-cell');
  });

  it('passes a normal stroke inside the cell', () => {
    const strokes = [stroke(
      Array.from({ length: 10 }, (_, i) => ({ x: 0.2 + i * 0.06, y: 0.2 + i * 0.06 })),
    )];
    expect(geometryCheck(strokes).ok).toBe(true);
  });
});

describe('decideGrade', () => {
  it('returns uncertain when geometry fails', () => {
    const result = decideGrade(card('あ'), { ok: false, reason: 'blank', detail: 'blank' }, {
      prediction: 'あ',
      confidence: 0.99,
      rejected: false,
    });
    expect(result.grade).toBe('uncertain');
  });

  it('returns uncertain when the model rejects the input', () => {
    const result = decideGrade(card('あ'), { ok: true, reason: 'ok', detail: '' }, {
      prediction: '',
      confidence: 0.99,
      rejected: true,
    });
    expect(result.grade).toBe('uncertain');
  });

  it('returns uncertain when confidence is below the threshold', () => {
    const result = decideGrade(card('あ'), { ok: true, reason: 'ok', detail: '' }, {
      prediction: 'あ',
      confidence: 0.5,
      rejected: false,
    });
    expect(result.grade).toBe('uncertain');
  });

  it('returns correct when the prediction matches', () => {
    const result = decideGrade(card('あ'), { ok: true, reason: 'ok', detail: '' }, {
      prediction: 'あ',
      confidence: 0.95,
      rejected: false,
    });
    expect(result.grade).toBe('correct');
  });

  it('returns incorrect when the prediction differs', () => {
    const result = decideGrade(card('あ'), { ok: true, reason: 'ok', detail: '' }, {
      prediction: 'い',
      confidence: 0.95,
      rejected: false,
    });
    expect(result.grade).toBe('incorrect');
  });
});
