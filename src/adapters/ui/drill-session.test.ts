import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrillSession, type DrillSessionOptions, type GradeInput } from './drill-session';
import type { Scope } from '../../domain/scope';
import type { Attempt, SelfGrade } from '../../domain/attempt';
import type { Card } from '../../domain/cards';
import type { Result } from '../../domain/result';
import type { AttemptRepository } from '../../ports/attempt-repository';
import type { TallyRepository } from '../../ports/tally-repository';
import type { SessionRepository } from '../../ports/session-repository';
import type { Session } from '../../domain/session';
import * as drill from '../../domain/drill';

const SCOPE: Scope = { hiragana: ['yoon'] }; // 33 cards
const OK: Result<void> = { ok: true, value: undefined };
const START = new Date('2026-01-01T00:00:00.000Z').getTime();
const IDLE_MS = 300_000;

// In-memory fakes mirroring `Drill.test.ts`'s, against the ports. Each
// write method returns whatever the matching `*Result` field holds at call
// time -- a `Result`, or a `Promise` to hand back verbatim (rejected/gated).
type Outcome = Result<void> | Promise<Result<void>>;
const settle = (o: Outcome): Promise<Result<void>> => (o instanceof Promise ? o : Promise.resolve(o));

function fakeAttemptRepository(): AttemptRepository & {
  adds: Attempt[];
  deletes: string[];
  addResult: Outcome;
} {
  const repo = {
    adds: [] as Attempt[],
    deletes: [] as string[],
    addResult: OK as Outcome,
    add(attempt: Attempt) {
      repo.adds.push(attempt);
      return settle(repo.addResult);
    },
    listBySession: () => Promise.resolve<Result<Attempt[]>>({ ok: true, value: [] }),
    listAll: () => Promise.resolve<Result<Attempt[]>>({ ok: true, value: [] }),
    deleteLast(sessionId: string) {
      repo.deletes.push(sessionId);
      return Promise.resolve(OK);
    },
  };
  return repo;
}

function fakeTallyRepository(): TallyRepository & {
  increments: string[];
  decrements: string[];
  incrementResult: Outcome;
  decrementResult: Outcome;
} {
  const repo = {
    increments: [] as string[],
    decrements: [] as string[],
    incrementResult: OK as Outcome,
    decrementResult: OK as Outcome,
    getAll: () => Promise.resolve({ ok: true as const, value: [] }),
    increment(cardId: string) {
      repo.increments.push(cardId);
      return settle(repo.incrementResult);
    },
    decrement(cardId: string) {
      repo.decrements.push(cardId);
      return settle(repo.decrementResult);
    },
  };
  return repo;
}

function fakeSessionRepository(): SessionRepository & { adds: Session[]; addResult: Outcome } {
  const repo = {
    adds: [] as Session[],
    addResult: OK as Outcome,
    add(session: Session) {
      repo.adds.push(session);
      return settle(repo.addResult);
    },
    list: () => Promise.resolve<Result<Session[]>>({ ok: true, value: [] }),
  };
  return repo;
}

function setup(overrides: Partial<DrillSessionOptions> = {}) {
  const attemptRepository = fakeAttemptRepository();
  const tallyRepository = fakeTallyRepository();
  const sessionRepository = fakeSessionRepository();
  const onClose = vi.fn();
  const session = new DrillSession({
    scope: SCOPE,
    sessionSize: 3,
    attempts: [],
    tallies: [],
    idleTimeoutMs: IDLE_MS,
    attemptRepository,
    tallyRepository,
    sessionRepository,
    onClose,
    ...overrides,
  });
  return { session, attemptRepository, tallyRepository, sessionRepository, onClose };
}

function gradeInput(card: Card, grade: SelfGrade): GradeInput {
  return {
    card,
    grade,
    strokes: [],
    revealed: false,
    promptShownAt: performance.now(),
    firstStrokeStartedAt: undefined,
  };
}

/** Drains every queued microtask, however deep the chain. */
const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DrillSession', () => {
  it('samples the queue exactly once per construction', () => {
    const spy = vi.spyOn(drill, 'sampleSessionCards');
    const { session } = setup();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(session.queue).toHaveLength(3);
    expect(session.isLastCard(1)).toBe(false);
    expect(session.isLastCard(2)).toBe(true);
  });

  describe('idle detection', () => {
    it('an idle-eligible interaction closes once as inactivity, backdated to the last interaction', () => {
      vi.useFakeTimers();
      vi.setSystemTime(START);
      const { session, onClose, sessionRepository } = setup();

      vi.setSystemTime(START + 60_000);
      expect(session.recordInteraction()).toBe(true);

      vi.setSystemTime(START + 60_000 + IDLE_MS);
      expect(session.recordInteraction()).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({ closureReason: 'inactivity', timeMs: 60_000 }),
      );
      expect(sessionRepository.adds).toHaveLength(1);
      expect(sessionRepository.adds[0]!.date).toBe(new Date(START + 60_000).toISOString());
      expect(sessionRepository.adds[0]!.closureReason).toBe('inactivity');

      // Closed: every further path is a no-op.
      expect(session.recordInteraction()).toBe(false);
      session.checkIdleOnResume();
      session.closeExplicit();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('a resume check closes when idle but never counts as an interaction', () => {
      vi.useFakeTimers();
      vi.setSystemTime(START);
      const { session, onClose } = setup();

      vi.setSystemTime(START + IDLE_MS - 1);
      session.checkIdleOnResume();
      expect(onClose).not.toHaveBeenCalled();

      vi.setSystemTime(START + IDLE_MS);
      session.checkIdleOnResume();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({ closureReason: 'inactivity', timeMs: 0 }),
      );
    });

    it('clamps timeMs at 0 when the clock moves backward', () => {
      vi.useFakeTimers();
      vi.setSystemTime(START);
      const { session, onClose } = setup();
      vi.setSystemTime(START - 10_000);
      session.closeExplicit();
      expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ timeMs: 0 }));
    });
  });

  describe('recordGrade', () => {
    it('a Missed grade on a card with tally 2 fires add + increment and returns 3', () => {
      const { session: probe } = setup();
      const card = probe.queue[0]!;
      const { session, attemptRepository, tallyRepository } = setup({
        tallies: [{ cardId: card.cardId, missCount: 2 }],
      });
      // Tallies are keyed by cardId, not queue membership, so grading
      // `card` directly is fine even if this session sampled it elsewhere.
      expect(session.recordGrade(gradeInput(card, 'incorrect'))).toBe(3);
      expect(attemptRepository.adds).toHaveLength(1);
      expect(attemptRepository.adds[0]).toMatchObject({
        sessionId: session.sessionId,
        cardId: card.cardId,
        selfGrade: 'incorrect',
        strokeCount: 0,
        revealUsed: false,
      });
      expect(tallyRepository.increments).toEqual([card.cardId]);
      // A second Missed on the same card (after moving on) reads the
      // updated mirror.
      session.clearUndoable();
      expect(session.recordGrade(gradeInput(card, 'incorrect'))).toBe(4);
    });

    it('a Correct grade fires add only and returns null', () => {
      const { session, attemptRepository, tallyRepository } = setup();
      expect(session.recordGrade(gradeInput(session.queue[0]!, 'correct'))).toBeNull();
      expect(attemptRepository.adds).toHaveLength(1);
      expect(tallyRepository.increments).toEqual([]);
    });

    it('logs write failures one microtask after they settle, never throwing', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { session, attemptRepository, tallyRepository } = setup();
      const failure = new Error('boom');
      attemptRepository.addResult = { ok: false, error: failure };
      tallyRepository.incrementResult = Promise.reject(failure);

      expect(() => session.recordGrade(gradeInput(session.queue[0]!, 'incorrect'))).not.toThrow();
      await Promise.resolve();
      expect(consoleError).toHaveBeenCalledWith('Failed to persist attempt:', failure);
      await flushAsync();
      expect(consoleError).toHaveBeenCalledWith('Failed to increment tally:', failure);
    });
  });

  describe('undoLastGrade', () => {
    it('reverses a Missed grade in the store and in memory', async () => {
      const { session, attemptRepository, tallyRepository, onClose } = setup();
      const card = session.queue[0]!;
      session.recordGrade(gradeInput(card, 'incorrect'));
      await session.undoLastGrade();

      expect(attemptRepository.deletes).toEqual([session.sessionId]);
      expect(tallyRepository.decrements).toEqual([card.cardId]);
      // Mirrors reversed: the next Missed reads 1 again, and closing reports
      // no attempts.
      expect(session.recordGrade(gradeInput(card, 'incorrect'))).toBe(1);
      await session.undoLastGrade();
      session.closeExplicit();
      expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 0, missed: [] }));
    });

    it('reverses a Correct grade without decrementing, leaving the tally unchanged', async () => {
      const { session: probe } = setup();
      const card = probe.queue[0]!;
      const { session, attemptRepository, tallyRepository, onClose } = setup({
        tallies: [{ cardId: card.cardId, missCount: 2 }],
      });
      session.recordGrade(gradeInput(card, 'incorrect'));
      session.clearUndoable();
      session.recordGrade(gradeInput(card, 'correct'));
      await session.undoLastGrade();

      expect(attemptRepository.deletes).toEqual([session.sessionId]);
      expect(tallyRepository.decrements).toEqual([]);
      session.closeExplicit();
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({
          missed: [expect.objectContaining({ cardId: card.cardId, missCount: 3 })],
        }),
      );
    });

    it('never calls deleteLast when add() resolved not-ok, but still reverses the mirrors', async () => {
      const { session, attemptRepository, tallyRepository, sessionRepository } = setup();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      attemptRepository.addResult = { ok: false, error: new Error('nope') };
      session.recordGrade(gradeInput(session.queue[0]!, 'incorrect'));
      await session.undoLastGrade();

      expect(attemptRepository.deletes).toEqual([]);
      expect(tallyRepository.decrements).toEqual([]);
      session.closeExplicit();
      expect(sessionRepository.adds[0]!.cardsAttempted).toBe(0);
    });

    it('passes wasIncorrect=false when increment() rejected, and logs a failed undo', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const undoSpy = vi
        .spyOn(drill, 'undoLastGrade')
        .mockResolvedValue({ ok: false, error: new Error('undo failed') });
      const { session, tallyRepository } = setup();
      tallyRepository.incrementResult = Promise.reject(new Error('increment failed'));
      const card = session.queue[0]!;
      session.recordGrade(gradeInput(card, 'incorrect'));
      await session.undoLastGrade();

      expect(undoSpy).toHaveBeenCalledTimes(1);
      expect(undoSpy.mock.calls[0]![2]).toBe(false);
      expect(consoleError).toHaveBeenCalledWith('Failed to undo grade:', expect.any(Error));
    });

    it('awaits the pending add() before reversing, and a concurrent second undo is a no-op', async () => {
      const { session, attemptRepository } = setup();
      let release!: (r: Result<void>) => void;
      attemptRepository.addResult = new Promise((resolve) => {
        release = resolve;
      });
      session.recordGrade(gradeInput(session.queue[0]!, 'correct'));

      const first = session.undoLastGrade();
      const second = session.undoLastGrade();
      await flushAsync();
      expect(attemptRepository.deletes).toEqual([]);

      release(OK);
      await Promise.all([first, second]);
      expect(attemptRepository.deletes).toEqual([session.sessionId]);
      // Nothing left to undo.
      await session.undoLastGrade();
      expect(attemptRepository.deletes).toHaveLength(1);
    });

    it('drops interactions, resume checks and explicit close while an undo is in flight', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(START);
      const { session, attemptRepository, onClose } = setup();
      let release!: (r: Result<void>) => void;
      attemptRepository.addResult = new Promise((resolve) => {
        release = resolve;
      });
      session.recordGrade(gradeInput(session.queue[0]!, 'correct'));
      const pending = session.undoLastGrade();

      vi.setSystemTime(START + 10 * IDLE_MS);
      expect(session.recordInteraction()).toBe(false);
      session.checkIdleOnResume();
      session.closeExplicit();
      expect(onClose).not.toHaveBeenCalled();

      release(OK);
      await pending;
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does nothing after clearUndoable()', async () => {
      const { session, attemptRepository } = setup();
      session.recordGrade(gradeInput(session.queue[0]!, 'correct'));
      session.clearUndoable();
      await session.undoLastGrade();
      expect(attemptRepository.deletes).toEqual([]);
    });
  });

  describe('complete close', () => {
    it('closes once with complete, counting only this session\'s attempts', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const lifetime: Attempt[] = [
        {
          id: 'old',
          sessionId: 'earlier',
          cardId: 'きゃ:hiragana',
          timestamp: new Date(0).toISOString(),
          timeToFirstStrokeMs: 1,
          totalTimeMs: 1,
          strokeCount: 1,
          revealUsed: true,
          selfGrade: 'incorrect',
          strokes: [],
        },
      ];
      const { session, sessionRepository, onClose } = setup({ attempts: lifetime, sessionSize: 2 });
      sessionRepository.addResult = { ok: false, error: new Error('disk full') };

      session.recordGrade(gradeInput(session.queue[0]!, 'correct'));
      session.clearUndoable();
      session.recordGrade(gradeInput(session.queue[1]!, 'incorrect'));
      expect(session.isLastCard(1)).toBe(true);
      session.closeComplete();
      session.closeComplete();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({ closureReason: 'complete', accuracy: 0.5, revealCount: 0 }),
      );
      expect(sessionRepository.adds).toHaveLength(1);
      expect(sessionRepository.adds[0]).toMatchObject({
        id: session.sessionId,
        scope: SCOPE,
        cardsAttempted: 2,
        accuracy: 0.5,
        closureReason: 'complete',
      });
      await Promise.resolve();
      expect(consoleError).toHaveBeenCalledWith('Failed to persist session:', expect.any(Error));
    });
  });
});
