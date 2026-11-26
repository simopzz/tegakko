// Stand-in recogniser used until the real ONNX model is trained and wired.
// It always returns `rejected: true` so every kana attempt falls back to the
// learner via the "uncertain" path, letting the rest of the auto-grade flow
// be built and tested without a model.

import type { HandwritingModel } from '../../ports/handwriting-model';
import type { Stroke } from '../../domain/ink';
import type { ModelResult } from '../../domain/grading';

export class StubHandwritingModel implements HandwritingModel {
  async classify(_strokes: Stroke[]): Promise<ModelResult> {
    void _strokes;
    return { prediction: '', confidence: 0, rejected: true };
  }
}
