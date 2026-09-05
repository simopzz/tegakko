// Port types reference only `domain/` types (AD-1).
import type { Card } from '../domain/cards';

/**
 * AD-9's `CardRepository` signature: sync, un-wrapped -- no `Result`, no
 * `Promise`, unlike `SettingsRepository`. The catalog is bundled static data
 * (AD-3), so `getAll` can't fail the way IndexedDB can. `getById` throws for
 * an unknown `cardId` -- callers passing one sourced from persisted data
 * (e.g. an `Attempt.cardId`) must be prepared to handle that.
 */
export interface CardRepository {
  getAll(): Card[];
  getById(cardId: string): Card;
}
