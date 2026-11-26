// Practice module: owns a single session's lifecycle on behalf of Drill and
// SessionSummary. Loaded once by the composition root (App.svelte), it starts
// a session from a scope + size by loading attempt history and miss counts,
// sampling the queue per domain/drill.ts, and hands Drill a ready-to-use
// DrillSession plus an InkSurface. All repository orchestration lives here,
// so Drill receives neither repositories nor raw attempt/tally snapshots.
//
// The module itself is framework-free: no Svelte imports, no DOM. It lives in
// app/ because it wires concrete port implementations, which only the
// composition root may do (docs/adr/0001-hexagonal-boundary.md).

import type { Scope } from '../domain/scope';
import type { Attempt } from '../domain/attempt';
import type { Tally } from '../domain/tally';
import type { SessionSummaryView } from '../domain/session';
import type { InkSurface } from '../ports/ink-surface';
import type { AttemptRepository } from '../ports/attempt-repository';
import type { TallyRepository } from '../ports/tally-repository';
import type { SessionRepository } from '../ports/session-repository';
import type { HandwritingModel } from '../ports/handwriting-model';
import { DrillSession } from '../adapters/ui/drill-session';
import { err } from '../domain/result';

export interface PracticeModuleOptions {
  attemptRepository: AttemptRepository;
  tallyRepository: TallyRepository;
  sessionRepository: SessionRepository;
  inkSurfaceFactory: () => InkSurface;
  /** Optional recogniser for auto-grading kana. */
  handwritingModel?: HandwritingModel;
}

export interface SessionHandle {
  /** The running session: queue, grading, undo, idle/closure handling. */
  session: DrillSession;
  /** The ink surface created for this session. */
  inkSurface: InkSurface;
}

export class PracticeModule {
  private readonly attemptRepository: AttemptRepository;
  private readonly tallyRepository: TallyRepository;
  private readonly sessionRepository: SessionRepository;
  private readonly inkSurfaceFactory: () => InkSurface;
  private readonly handwritingModel: HandwritingModel | undefined;

  constructor(options: PracticeModuleOptions) {
    this.attemptRepository = options.attemptRepository;
    this.tallyRepository = options.tallyRepository;
    this.sessionRepository = options.sessionRepository;
    this.inkSurfaceFactory = options.inkSurfaceFactory;
    this.handwritingModel = options.handwritingModel;
  }

  /** Start a new session: load history (fail-open to empty), sample the
   * queue, mint an ink surface, and return a handle Drill can render from.
   * `onClose` fires once when the session closes for any reason. */
  async start(
    scope: Scope,
    sessionSize: number,
    idleTimeoutMs: number,
    onClose: (summary: SessionSummaryView) => void,
  ): Promise<SessionHandle> {
    const attempts = await this.loadAttempts();
    const tallies = await this.loadTallies();
    const inkSurface = this.inkSurfaceFactory();
    const session = new DrillSession({
      scope,
      sessionSize,
      attempts,
      tallies,
      idleTimeoutMs,
      attemptRepository: this.attemptRepository,
      tallyRepository: this.tallyRepository,
      sessionRepository: this.sessionRepository,
      handwritingModel: this.handwritingModel,
      onClose,
    });
    return { session, inkSurface };
  }

  private async loadAttempts(): Promise<Attempt[]> {
    const result = await this.attemptRepository.listAll().catch((error: unknown) => {
      console.error('Failed to load attempt history:', error);
      return err<Attempt[]>(error instanceof Error ? error : new Error(String(error)));
    });
    return result.ok ? result.value : [];
  }

  private async loadTallies(): Promise<Tally[]> {
    const result = await this.tallyRepository.getAll().catch((error: unknown) => {
      console.error('Failed to load tallies:', error);
      return err<Tally[]>(error instanceof Error ? error : new Error(String(error)));
    });
    return result.ok ? result.value : [];
  }
}
