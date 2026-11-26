// Pure grading logic: geometry safety checks and combining the geometry,
// model output, and target grapheme into a final algorithmic grade.
// No DOM or storage import ever appears here (docs/adr/0001-hexagonal-boundary.md).

import type { Card } from './cards';
import type { Stroke } from './ink';
import type { AlgorithmGrade } from './attempt';

/** Confidence below which the algorithm refuses to commit and the learner
 * must self-grade. Chosen as a conservative starting point; tune once real
 * accuracy data is available. */
export const CONFIDENCE_THRESHOLD = 0.7;

/** A geometry safety check result. `ok` means the ink is worth showing to
 * the model; otherwise the grader returns `uncertain` without loading or
 * running the recogniser. */
export interface GeometryCheck {
  ok: boolean;
  reason: 'ok' | 'blank' | 'out-of-cell';
  detail: string;
}

export interface ModelResult {
  /** The grapheme the model predicts, or an empty string when it emits the
   * reject/blank class. */
  prediction: string;
  /** The model's confidence in its top prediction, 0..1. */
  confidence: number;
  /** True when the model's top class is the explicit reject/blank class. */
  rejected: boolean;
}

export interface GradeResult {
  grade: AlgorithmGrade;
  confidence: number;
  reason: string;
}

function totalPoints(strokes: Stroke[]): number {
  return strokes.reduce((sum, s) => sum + s.points.length, 0);
}

function boundingBox(strokes: Stroke[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let hasPoint = false;
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      hasPoint = true;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!hasPoint) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Cheap geometry gate run before the model is loaded or invoked. */
export function geometryCheck(strokes: Stroke[]): GeometryCheck {
  if (totalPoints(strokes) < 8) {
    return { ok: false, reason: 'blank', detail: 'Too few points' };
  }
  const box = boundingBox(strokes);
  if (!box || box.width * box.height < 0.005) {
    return { ok: false, reason: 'blank', detail: 'Ink area too small' };
  }
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) {
        return { ok: false, reason: 'out-of-cell', detail: 'Stroke outside the cell' };
      }
    }
  }
  return { ok: true, reason: 'ok', detail: 'Ink looks plausible' };
}

/** Combine geometry, model output, and the expected grapheme into the
 * algorithmic grade. Keeps every branch explicit so the UI can show the
 * learner why a prompt fell back to them. */
export function decideGrade(
  card: Card,
  geometry: GeometryCheck,
  model: ModelResult,
): GradeResult {
  if (!geometry.ok) {
    return { grade: 'uncertain', confidence: 0, reason: geometry.detail };
  }
  if (model.rejected) {
    return { grade: 'uncertain', confidence: model.confidence, reason: 'Ink not recognised' };
  }
  if (model.confidence < CONFIDENCE_THRESHOLD) {
    return {
      grade: 'uncertain',
      confidence: model.confidence,
      reason: `Low confidence (${Math.round(model.confidence * 100)}%)`,
    };
  }
  if (model.prediction === card.grapheme) {
    return { grade: 'correct', confidence: model.confidence, reason: `Matched ${model.prediction}` };
  }
  return {
    grade: 'incorrect',
    confidence: model.confidence,
    reason: `Predicted ${model.prediction}`,
  };
}
