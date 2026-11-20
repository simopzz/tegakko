// Drill session bookkeeping: everything the
// drill screen does that never renders -- the sampled queue, retroactive
// idle detection, closure, grade/undo persistence and the in-memory mirrors
// those feed. Framework-free on purpose: no Svelte import, no runes, so it is
// unit-testable without mounting and all reactivity stays confined to
// `Drill.svelte`, which owns one instance per drill entry.
//
// Lives in `adapters/ui`, not `domain`: it owns `crypto.randomUUID()`,
// fire-and-forget `console.error` logging and repository orchestration.
// The pure pieces it calls already live in `domain/`.
import type { Card } from '../../domain/cards';
import type { Scope } from '../../domain/scope';
import type { Stroke } from '../../domain/ink';
import type { Attempt, SelfGrade } from '../../domain/attempt';
import type { Tally } from '../../domain/tally';
import type { Result } from '../../domain/result';
import type { AttemptRepository } from '../../ports/attempt-repository';
import type { TallyRepository } from '../../ports/tally-repository';
import type { SessionRepository } from '../../ports/session-repository';
import type { ClosureReason, SessionSummaryView } from '../../domain/session';
import { sampleSessionCards, undoLastGrade } from '../../domain/drill';
import { isSessionIdle, buildSummary, buildSessionRecord } from '../../domain/session';

export interface DrillSessionOptions {
  /** Plain data -- the component snapshots its `$state` proxy before handing
   * it over, since the persisted session record must be structured-
   * cloneable. */
  scope: Scope;
  sessionSize: number;
  /** Lifetime attempt history, loaded once at drill entry -- feeds sampling
   * only (docs/adr/0004-session-sampled-once-by-weakness.md). */
  attempts: Attempt[];
  /** Session-start tally snapshot, loaded once at drill entry. */
  tallies: Tally[];
  idleTimeoutMs: number;
  attemptRepository: AttemptRepository;
  tallyRepository: TallyRepository;
  sessionRepository: SessionRepository;
  onClose: (summary: SessionSummaryView) => void;
}

export interface GradeInput {
  card: Card;
  grade: SelfGrade;
  /** Every completed stroke since the last Clear/grade, embedded verbatim
   * into the persisted `Attempt`. */
  strokes: Stroke[];
  revealed: boolean;
  /** `performance.now()` when the current prompt appeared. */
  promptShownAt: number;
  /** The first post-Clear stroke's start, same clock as `promptShownAt`;
   * `undefined` through a reveal-from-blank grade. */
  firstStrokeStartedAt: number | undefined;
}

function toErrResult(error: unknown): Result<void> {
  return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
}

// Fire-and-forget, logged on failure, never thrown. The `.then(...).catch(...)`
// is attached directly to the repository promise (no extra async layer), so
// a resolved not-ok `Result` is logged one microtask after the write settles
// and a rejection one tick later (through `.then` to `.catch`). Never awaited,
// so a slow or failing write never blocks advancing or reaching the Summary
// screen.
function logOnFailure(write: Promise<Result<void>>, message: string): void {
  void write
    .then((result) => {
      if (!result.ok) console.error(message, result.error);
    })
    .catch((error: unknown) => {
      console.error(message, error);
    });
}

export class DrillSession {
  // Sampled exactly once, at construction, from `attempts` as loaded --
  // weighted-without-replacement, then uniform-shuffled. Fixed for
  // the lifetime of this drill entry: never re-sampled, appended to, or
  // reordered mid-session. Sampling is without replacement, so a complete
  // closure is exact once the queue is exhausted, never "probably done".
  readonly queue: readonly Card[];

  // Minted once per drill entry -- the composition root builds a fresh
  // component (and so a fresh `DrillSession`) per entry, so this is stable
  // for every attempt this instance ever persists, and doubles as the
  // persisted `Session.id` so it stays correlated with `Attempt.sessionId`.
  readonly sessionId = crypto.randomUUID();

  // Closure bookkeeping. `sessionStartedAt` is the origin
  // `close`'s `timeMs` measures from; `lastInteractionAt` is updated by every
  // interaction (`recordInteraction`) and read-only otherwise -- idle
  // detection is retroactive, never a live timer. `closed` guards every
  // closure path against firing twice.
  private readonly sessionStartedAt = Date.now();
  private lastInteractionAt = Date.now();
  private closed = false;

  // Authoritative undo-in-flight flag. Guards `undoLastGrade` against
  // re-entrancy (a double-tap before its `await`s settle would otherwise pop
  // `thisSessionAttempts` and call the domain `undoLastGrade` twice for one
  // grade), and every closure path against closing/persisting ahead of an
  // in-flight reversal.
  private undoing = false;

  // Populated only by this drill entry's own grades/undos -- the only
  // attempts array `buildSummary`/`buildSessionRecord` ever read from.
  // Routing those through the learner's entire *lifetime* `attempts` instead
  // would auto-close a returning learner's session after a single grade and
  // report lifetime totals on the Summary screen. Sampling reads `attempts`
  // directly, once, so there is no sampling-side mirror to keep in sync.
  private readonly thisSessionAttempts: Attempt[] = [];

  // Plain per-card miss-count map, seeded once from the session-start
  // `tallies` and updated in memory alongside `thisSessionAttempts` by
  // grades/undos, never re-fetched. Read by `recordGrade`'s
  // toast count and the Summary.
  private readonly cardTallies: Map<string, number>;

  // The last grade's card/grade plus its in-flight `add()`/`increment()`
  // promises -- `undoLastGrade` awaits both before calling `deleteLast`/
  // `decrement`, so a fast Undo can never race the write it's meant to
  // reverse. Cleared on advance and after an undo.
  private lastGrade: { cardId: string; grade: SelfGrade } | null = null;
  private pendingAttemptWrite: Promise<Result<void>> | undefined;
  private pendingTallyWrite: Promise<Result<void>> | undefined;

  private readonly scope: Scope;
  private readonly idleTimeoutMs: number;
  private readonly attemptRepository: AttemptRepository;
  private readonly tallyRepository: TallyRepository;
  private readonly sessionRepository: SessionRepository;
  private readonly onClose: (summary: SessionSummaryView) => void;

  constructor(options: DrillSessionOptions) {
    this.scope = options.scope;
    this.idleTimeoutMs = options.idleTimeoutMs;
    this.attemptRepository = options.attemptRepository;
    this.tallyRepository = options.tallyRepository;
    this.sessionRepository = options.sessionRepository;
    this.onClose = options.onClose;
    this.cardTallies = new Map(options.tallies.map((t) => [t.cardId, t.missCount]));
    this.queue = sampleSessionCards(options.attempts, options.scope, options.sessionSize);
  }

  /** Every interaction routes through here first -- if idle time has already
   * elapsed, the interaction closes the session (`'inactivity'`) instead of
   * landing, and is itself dropped (returns `false`). Also dropped while an
   * undo is in flight: it must neither bump `lastInteractionAt` nor
   * close/persist ahead of the reversal. */
  recordInteraction(): boolean {
    if (this.closed || this.undoing) return false;
    if (isSessionIdle(this.lastInteractionAt, this.idleTimeoutMs)) {
      this.close('inactivity', this.lastInteractionAt);
      return false;
    }
    this.lastInteractionAt = Date.now();
    return true;
  }

  /** Fired on resume (`visibilitychange`/`focus`): the same idle check as
   * `recordInteraction`, but never updates `lastInteractionAt` -- a resume is
   * not, on its own, proof of presence. Dropped mid-undo: closing then would
   * persist the session counting the not-yet-reversed grade while the
   * in-flight undo still reverses it afterward, desyncing the persisted
   * session from the attempts/tallies store. */
  checkIdleOnResume(): void {
    if (this.undoing) return;
    if (isSessionIdle(this.lastInteractionAt, this.idleTimeoutMs)) {
      this.close('inactivity', this.lastInteractionAt);
    }
  }

  /** "I'm done" always closes with `'explicit'` immediately, regardless of
   * elapsed idle time -- never gated by the idle check, so a deliberate close
   * is never relabeled as an idle one. Dropped mid-undo, same reasoning as
   * `checkIdleOnResume`. */
  closeExplicit(): void {
    if (this.closed || this.undoing) return;
    this.close('explicit');
  }

  /** `true` when `index` is the queue's final entry -- tapping past it closes
   * the session as complete. */
  isLastCard(index: number): boolean {
    return index + 1 >= this.queue.length;
  }

  /** Complete closure -- rides "Next character" past the last
   * queue entry rather than a control of its own. */
  closeComplete(): void {
    this.close('complete');
  }

  /** Persists one attempt (always -- ink or not, reveal or not) and, on a
   * Missed grade, bumps the card's tally; neither write is awaited. Returns
   * the card's new cumulative tally for the toast on Missed, `null` on
   * Correct. */
  recordGrade(input: GradeInput): number | null {
    const { card, grade, strokes, revealed, promptShownAt, firstStrokeStartedAt } = input;
    const gradedAt = performance.now();
    const totalTimeMs = gradedAt - promptShownAt;
    const timeToFirstStrokeMs =
      firstStrokeStartedAt === undefined ? totalTimeMs : firstStrokeStartedAt - promptShownAt;
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      cardId: card.cardId,
      timestamp: new Date().toISOString(),
      timeToFirstStrokeMs,
      totalTimeMs,
      strokeCount: strokes.length,
      revealUsed: revealed,
      selfGrade: grade,
      strokes,
    };
    this.thisSessionAttempts.push(attempt);
    this.lastGrade = { cardId: card.cardId, grade };

    // Captured (not awaited here) so `undoLastGrade` can await the same
    // promise before calling `deleteLast`.
    this.pendingAttemptWrite = this.attemptRepository.add(attempt);
    logOnFailure(this.pendingAttemptWrite, 'Failed to persist attempt:');

    // Every self-graded Missed bumps the card's running miss tally -- never
    // Correct. Committed to the in-memory mirror here (not just computed) so
    // a later Missed on the same card this session reads the updated count;
    // `undoLastGrade`'s decrement reverses exactly this write.
    if (grade !== 'incorrect') {
      this.pendingTallyWrite = undefined;
      return null;
    }
    this.pendingTallyWrite = this.tallyRepository.increment(card.cardId);
    logOnFailure(this.pendingTallyWrite, 'Failed to increment tally:');
    const missCount = (this.cardTallies.get(card.cardId) ?? 0) + 1;
    this.cardTallies.set(card.cardId, missCount);
    return missCount;
  }

  /** Forgets the last grade and its pending writes, so it can no longer be
   * undone -- called by the component on "Next character" and after an undo
   * completes. (The queue pointer never passes a card while its Undo is
   * offered, so undo needs no queue reinsertion.) */
  clearUndoable(): void {
    this.lastGrade = null;
    this.pendingAttemptWrite = undefined;
    this.pendingTallyWrite = undefined;
  }

  /** Reverses the last grade. A no-op when nothing is undoable or an undo is
   * already in flight. */
  async undoLastGrade(): Promise<void> {
    if (!this.lastGrade || this.undoing) return;
    this.undoing = true;
    try {
      const { cardId, grade } = this.lastGrade;
      // Await the pending writes first -- a fast Undo must never race the
      // store it's meant to reverse. Their resolved `Result` (not just
      // settlement) matters below: a write that never actually landed has
      // nothing in the store to reverse.
      const attemptWriteResult = await this.pendingAttemptWrite?.catch(toErrResult);
      const tallyWriteResult =
        grade === 'incorrect' ? await this.pendingTallyWrite?.catch(toErrResult) : undefined;

      // Unconditional, regardless of the repository calls' outcome below --
      // the in-memory mirrors must reflect "this grade never happened"
      // either way.
      this.thisSessionAttempts.pop();
      if (grade === 'incorrect') {
        this.cardTallies.set(cardId, Math.max(0, (this.cardTallies.get(cardId) ?? 0) - 1));
      }

      // Only reverse what the store actually recorded: if `add()` never
      // succeeded, nothing was persisted for `deleteLast` to remove, and
      // calling it anyway would delete an unrelated, previously-persisted
      // attempt for this session instead of no-op'ing. Same reasoning for
      // `decrement` against a failed `increment()`.
      if (attemptWriteResult?.ok) {
        const wasIncorrect = grade === 'incorrect' && tallyWriteResult?.ok === true;
        const result = await undoLastGrade(
          this.sessionId,
          cardId,
          wasIncorrect,
          this.attemptRepository,
          this.tallyRepository,
        );
        if (!result.ok) console.error('Failed to undo grade:', result.error);
      }

      this.clearUndoable();
    } finally {
      this.undoing = false;
    }
  }

  // Closes the session exactly once, regardless of which of the three
  // triggers fired it. An idle closure passes `closedAt` backdated to
  // `lastInteractionAt` (when activity actually stopped) rather than crediting
  // whenever the app happened to resume; every other closure defaults to
  // `Date.now()`.
  private close(reason: ClosureReason, closedAt: number = Date.now()): void {
    if (this.closed) return;
    this.closed = true;
    const dateIso = new Date(closedAt).toISOString();
    // Clamped at 0: a backward system-clock adjustment mid-session would
    // otherwise yield a negative duration (device clock skew -- offline
    // client, no server clock authority; mirrors `domain/drill.ts`'s
    // `score()` clamp).
    const timeMs = Math.max(0, closedAt - this.sessionStartedAt);
    // `thisSessionAttempts`, never the lifetime `attempts` -- the persisted
    // record and the Summary view reflect only this session's own attempts.
    const summary = buildSummary(this.thisSessionAttempts, this.cardTallies, reason, timeMs);
    const record = buildSessionRecord(
      this.sessionId,
      this.scope,
      this.thisSessionAttempts,
      reason,
      dateIso,
    );
    logOnFailure(this.sessionRepository.add(record), 'Failed to persist session:');
    this.onClose(summary);
  }
}
