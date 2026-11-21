import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { PracticeModule } from './practice';
import { IdbAttemptRepository } from '../adapters/persistence/attempt-repository';
import { IdbTallyRepository } from '../adapters/persistence/tally-repository';
import { IdbSessionRepository } from '../adapters/persistence/session-repository';
import { IdbSettingsRepository } from '../adapters/persistence/settings-repository';
import { resetDb } from '../adapters/persistence/test-reset-db';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { Result } from '../domain/result';
import type { Scope } from '../domain/scope';
import type { Attempt } from '../domain/attempt';
import type { Tally } from '../domain/tally';
import type { Session } from '../domain/session';
import type { AttemptRepository } from '../ports/attempt-repository';
import type { TallyRepository } from '../ports/tally-repository';
import type { SessionRepository } from '../ports/session-repository';
import type { InkSurface } from '../ports/ink-surface';
import { fakeInkSurface } from '../test-utils/fake-ink-surface';

const SCOPE: Scope = { hiragana: ['yoon'] };
const IDLE_MS = 300_000;
const OK_RESULT: Result<void> = { ok: true, value: undefined };

function fakeAttemptRepository(
  listAllResult: Result<Attempt[]> = { ok: true, value: [] },
): AttemptRepository & { adds: Attempt[]; deletes: string[] } {
  const adds: Attempt[] = [];
  const deletes: string[] = [];
  return {
    adds,
    deletes,
    add(attempt: Attempt) {
      adds.push(attempt);
      return Promise.resolve(OK_RESULT);
    },
    listBySession() {
      return Promise.resolve({ ok: true, value: [] });
    },
    listAll() {
      return Promise.resolve(listAllResult);
    },
    deleteLast(sessionId: string) {
      deletes.push(sessionId);
      return Promise.resolve(OK_RESULT);
    },
  };
}

function fakeTallyRepository(
  getAllResult: Result<Tally[]> = { ok: true, value: [] },
): TallyRepository & {
  increments: string[];
  decrements: string[];
  tallies: Map<string, number>;
} {
  const tallies = new Map<string, number>();
  return {
    tallies,
    increments: [],
    decrements: [],
    getAll() {
      return Promise.resolve(getAllResult);
    },
    increment(cardId: string) {
      tallies.set(cardId, (tallies.get(cardId) ?? 0) + 1);
      this.increments.push(cardId);
      return Promise.resolve(OK_RESULT);
    },
    decrement(cardId: string) {
      tallies.set(cardId, Math.max(0, (tallies.get(cardId) ?? 0) - 1));
      this.decrements.push(cardId);
      return Promise.resolve(OK_RESULT);
    },
  };
}

function fakeSessionRepository(): SessionRepository & { adds: Session[] } {
  const adds: Session[] = [];
  return {
    adds,
    add(session: Session) {
      adds.push(session);
      return Promise.resolve(OK_RESULT);
    },
    list() {
      return Promise.resolve({ ok: true, value: [...adds] });
    },
  };
}

function setupModule(overrides: {
  attemptRepository?: AttemptRepository;
  tallyRepository?: TallyRepository;
  sessionRepository?: SessionRepository;
  inkSurfaceFactory?: () => InkSurface;
} = {}) {
  return new PracticeModule({
    attemptRepository: overrides.attemptRepository ?? fakeAttemptRepository(),
    tallyRepository: overrides.tallyRepository ?? fakeTallyRepository(),
    sessionRepository: overrides.sessionRepository ?? fakeSessionRepository(),
    inkSurfaceFactory: overrides.inkSurfaceFactory ?? (() => fakeInkSurface()),
  });
}

describe('PracticeModule', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a session with empty history and tallies', async () => {
    const surface = fakeInkSurface();
    const module = setupModule({ inkSurfaceFactory: () => surface });

    const handle = await module.start(SCOPE, 3, IDLE_MS, vi.fn());

    expect(handle.session.queue).toHaveLength(3);
    expect(handle.inkSurface).toBe(surface);
  });

  it('still starts a session when attempt history is unreadable', async () => {
    const module = setupModule({
      attemptRepository: fakeAttemptRepository({ ok: false, error: new Error('blocked') }),
    });

    const handle = await module.start(SCOPE, 3, IDLE_MS, vi.fn());

    expect(handle.session.queue).toHaveLength(3);
  });

  it('still starts a session when tally history is unreadable', async () => {
    const module = setupModule({
      tallyRepository: fakeTallyRepository({ ok: false, error: new Error('blocked') }),
    });

    const handle = await module.start(SCOPE, 3, IDLE_MS, vi.fn());

    expect(handle.session.queue).toHaveLength(3);
  });

  it('loads existing attempts and tallies into the session snapshot', async () => {
    const attempts: Attempt[] = [
      {
        id: 'prior',
        sessionId: 'prior-session',
        cardId: 'きゃ:hiragana',
        timestamp: new Date().toISOString(),
        timeToFirstStrokeMs: 100,
        totalTimeMs: 200,
        strokeCount: 1,
        revealUsed: false,
        selfGrade: 'incorrect',
        strokes: [],
      },
    ];
    const tallies: Tally[] = [{ cardId: 'きゃ:hiragana', missCount: 1 }];
    const module = setupModule({
      attemptRepository: fakeAttemptRepository({ ok: true, value: attempts }),
      tallyRepository: fakeTallyRepository({ ok: true, value: tallies }),
    });

    const handle = await module.start(SCOPE, 3, IDLE_MS, vi.fn());

    expect(handle.session.queue).toHaveLength(3);
  });

  it('persists the session through the injected session repository on close', async () => {
    const sessionRepository = fakeSessionRepository();
    const module = setupModule({ sessionRepository });
    const onClose = vi.fn();

    const handle = await module.start(SCOPE, 3, IDLE_MS, onClose);
    handle.session.closeExplicit();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sessionRepository.adds).toHaveLength(1);
  });

  it('closes as complete after grading every card in the sampled queue', async () => {
    const module = setupModule();
    const onClose = vi.fn();

    const handle = await module.start(SCOPE, 3, IDLE_MS, onClose);
    for (let i = 0; i < handle.session.queue.length; i++) {
      handle.session.recordGrade({
        card: handle.session.queue[i]!,
        grade: 'correct',
        strokes: [],
        revealed: false,
        promptShownAt: performance.now(),
        firstStrokeStartedAt: undefined,
      });
      handle.session.clearUndoable();
    }
    expect(handle.session.isLastCard(handle.session.queue.length - 1)).toBe(true);
    handle.session.closeComplete();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ closureReason: 'complete' }));
  });

  it('reverses a grade via undoLastGrade at the module seam', async () => {
    const attemptRepository = fakeAttemptRepository();
    const tallyRepository = fakeTallyRepository();
    const module = setupModule({ attemptRepository, tallyRepository });
    const onClose = vi.fn();

    const handle = await module.start(SCOPE, 3, IDLE_MS, onClose);
    const card = handle.session.queue[0]!;
    handle.session.recordGrade({
      card,
      grade: 'incorrect',
      strokes: [],
      revealed: false,
      promptShownAt: performance.now(),
      firstStrokeStartedAt: undefined,
    });
    await handle.session.undoLastGrade();
    handle.session.closeExplicit();

    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 0, missed: [] }));
    expect(attemptRepository.deletes.length).toBeGreaterThan(0);
    expect(tallyRepository.decrements).toEqual([card.cardId]);
    expect(tallyRepository.tallies.get(card.cardId)).toBe(0);
  });

  it('closes as inactivity when idle time elapses without interaction', async () => {
    vi.useFakeTimers();
    const start = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.setSystemTime(start);
    const module = setupModule();
    const onClose = vi.fn();

    const handle = await module.start(SCOPE, 3, IDLE_MS, onClose);
    vi.setSystemTime(start + IDLE_MS);
    handle.session.checkIdleOnResume();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ closureReason: 'inactivity' }));
    vi.useRealTimers();
  });
});

describe('PracticeModule whole-app seam', () => {
  beforeEach(async () => {
    await resetDb();
    const settings = new IdbSettingsRepository();
    await settings.save({ ...DEFAULT_SETTINGS, penCheckShown: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes an attempt, tally, and session record across a full drill cycle', async () => {
    const surface = fakeInkSurface();
    const attemptRepository = new IdbAttemptRepository();
    const tallyRepository = new IdbTallyRepository();
    const sessionRepository = new IdbSessionRepository();
    const module = new PracticeModule({
      attemptRepository,
      tallyRepository,
      sessionRepository,
      inkSurfaceFactory: () => surface,
    });
    const onClose = vi.fn();

    const handle = await module.start(SCOPE, 3, IDLE_MS, onClose);
    surface.landStroke();
    handle.session.recordGrade({
      card: handle.session.queue[0]!,
      grade: 'incorrect',
      strokes: [{ points: [{ x: 0.5, y: 0.5, pressure: 0.7 }], widthPreset: 'expressive' }],
      revealed: false,
      promptShownAt: performance.now(),
      firstStrokeStartedAt: performance.now(),
    });
    handle.session.closeExplicit();

    await vi.waitFor(async () => {
      const attempts = await attemptRepository.listAll();
      expect(attempts.ok && attempts.value.length).toBe(1);
    });

    const attempts = await attemptRepository.listAll();
    const tallies = await tallyRepository.getAll();
    const sessions = await sessionRepository.list();
    expect(attempts.ok && attempts.value).toHaveLength(1);
    expect(tallies.ok && tallies.value).toHaveLength(1);
    expect(sessions.ok && sessions.value).toHaveLength(1);
  });
});
