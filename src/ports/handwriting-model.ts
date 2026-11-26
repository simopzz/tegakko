// Port for the handwriting recogniser that sits behind the auto-grader.
// It knows nothing about the target card or final grade decision; it just
// looks at strokes and returns a top prediction + confidence + reject flag.
// Concrete recognisers are wired only in `src/app/` (docs/adr/0001-hexagonal-boundary.md).

import type { Stroke } from '../domain/ink';
import type { ModelResult } from '../domain/grading';

export interface HandwritingModel {
  /** Classify the given ink. May lazy-load model weights on the first call.
   * Reject/blank inputs should be returned as `rejected: true` rather than
   * throwing. */
  classify(strokes: Stroke[]): Promise<ModelResult>;
}
