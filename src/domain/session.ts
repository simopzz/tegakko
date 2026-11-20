// Pure domain type + functions -- no DOM/IndexedDB/Svelte import ever appears
// here (docs/adr/0001-hexagonal-boundary.md).
//
// The `sessions` IndexedDB store's record shape: a session closes
// three ways (explicit "I'm done", full-scope completion, retroactively
// -detected inactivity), and every closure persists exactly one `Session`
// record plus computes an in-memory `SessionSummaryView` for the Summary
// screen. `time` is deliberately never persisted (see `Session`).

import type { Card, Script } from './cards';
import { CARDS } from './cards';
import type { Scope } from './scope';
import type { Attempt } from './attempt';

export type ClosureReason = 'explicit' | 'full-scope' | 'inactivity';

/** The `sessions` IndexedDB store's record shape. No `duration` field: time
 * is shown only on the Summary screen as the session closes, and History
 * never displays it. */
export interface Session {
  id: string;
  date: string;
  scope: Scope;
  cardsAttempted: number;
  accuracy: number;
  closureReason: ClosureReason;
}

/** One entry in the Session Summary's missed-chip list: a deduped in-scope
 * card the learner self-graded incorrect this session, paired with its
 * running cumulative miss tally. */
export interface MissedChip {
  cardId: string;
  grapheme: string;
  script: Script;
  tallyCount: number;
}

/** In-memory view the Session Summary screen renders from -- never persisted
 * itself (`time` has no store-side equivalent). */
export interface SessionSummaryView {
  accuracy: number;
  timeMs: number;
  revealCount: number;
  closureReason: ClosureReason;
  missed: MissedChip[];
}

/** Retroactive idle check: idle detection is never
 * a live timer, only ever this comparison, evaluated at the next resume or
 * interaction. Boundary is inclusive (`>=`) -- exactly `idleTimeoutMs`
 * elapsed already counts as idle. */
export function isSessionIdle(
  lastInteractionAt: number,
  idleTimeoutMs: number,
  now: number = Date.now(),
): boolean {
  // Clamped at 0: a backward system-clock adjustment mid-session would
  // otherwise yield a negative elapsed time and delay idle detection until
  // the clock catches up (device clock skew -- offline client, no server
  // clock authority; mirrors `closeSession`'s `timeMs` clamp and
  // `domain/drill.ts`'s `score()` clamp).
  return Math.max(0, now - lastInteractionAt) >= idleTimeoutMs;
}

/** `correct / attempts`, `0` (never `NaN`) when there were no attempts. */
export function computeAccuracy(attempts: Attempt[]): number {
  if (attempts.length === 0) return 0;
  const correct = attempts.filter((a) => a.selfGrade === 'correct').length;
  return correct / attempts.length;
}

/** Builds the in-memory view the Session Summary screen renders. Misses are
 * deduped by `cardId` -- a card missed more than once this session still
 * renders as exactly one chip, carrying its final (most current) cumulative
 * tally from `cardTallies`, not a per-occurrence count. */
export function buildSummary(
  sessionAttempts: Attempt[],
  cardTallies: Map<string, number>,
  closureReason: ClosureReason,
  timeMs: number,
): SessionSummaryView {
  const revealCount = sessionAttempts.filter((a) => a.revealUsed).length;

  const missedCardIds = new Set(
    sessionAttempts.filter((a) => a.selfGrade === 'incorrect').map((a) => a.cardId),
  );
  const missed: MissedChip[] = [];
  for (const cardId of missedCardIds) {
    const card: Card | undefined = CARDS.find((c) => c.cardId === cardId);
    if (!card) continue;
    missed.push({
      cardId,
      grapheme: card.grapheme,
      script: card.script,
      tallyCount: cardTallies.get(cardId) ?? 0,
    });
  }

  return {
    accuracy: computeAccuracy(sessionAttempts),
    timeMs,
    revealCount,
    closureReason,
    missed,
  };
}

/** Builds the persisted `sessions` record for this closure. */
export function buildSessionRecord(
  id: string,
  scope: Scope,
  sessionAttempts: Attempt[],
  closureReason: ClosureReason,
  dateIso: string,
): Session {
  return {
    id,
    date: dateIso,
    scope,
    cardsAttempted: sessionAttempts.length,
    accuracy: computeAccuracy(sessionAttempts),
    closureReason,
  };
}
