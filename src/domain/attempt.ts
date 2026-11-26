// Pure domain type -- no DOM/IndexedDB/Svelte import ever appears here
// (docs/adr/0001-hexagonal-boundary.md).
//
// The `attempts` IndexedDB store's record shape.
// Self-grading is sacred: nothing here is computed by judging the ink --
// `selfGrade` is always the learner's own explicit Missed/Correct tap.

import type { Stroke } from './ink';

/** The learner's own explicit grade -- never inferred from the ink. */
export type SelfGrade = 'correct' | 'incorrect';

/** The algorithm's judgement of an attempt. `uncertain` means the model,
 * geometry check, or confidence gate refused to commit and the learner must
 * self-grade. */
export type AlgorithmGrade = 'correct' | 'incorrect' | 'uncertain';

/** One completed prompt cycle: a prompt shown, ink drawn (or not), and a
 * grade. `strokes` embeds the drawn stroke(s) verbatim, grid-relative (0..1),
 * so they replay correctly at any viewport size regardless of when or on what
 * device they were recorded. */
export interface Attempt {
  id: string;
  sessionId: string;
  cardId: string;
  /** ISO-8601, e.g. `new Date().toISOString()`. */
  timestamp: string;
  /** Elapsed ms from prompt shown to the first stroke's `pointerdown`. Equals
   * `totalTimeMs` when no stroke was ever drawn before grading (a
   * revealed-from-blank grade) -- there is no first-stroke instant to
   * measure, so this is never left undefined or negative. */
  timeToFirstStrokeMs: number;
  /** Elapsed ms from prompt shown to the grade tap. */
  totalTimeMs: number;
  strokeCount: number;
  revealUsed: boolean;
  /** The final effective grade: the algorithm's grade unless the learner
   * overrode it. */
  selfGrade: SelfGrade;
  /** The algorithm's grade, if auto-grading ran. `uncertain` covers blanks,
   * low-confidence predictions, and missing-model fallbacks. */
  algorithmGrade?: AlgorithmGrade;
  /** The algorithm's confidence in its prediction, 0..1. */
  algorithmConfidence?: number;
  /** True when the learner explicitly overrode the algorithm's definite
   * correct/incorrect grade. */
  overridden?: boolean;
  strokes: Stroke[];
}
