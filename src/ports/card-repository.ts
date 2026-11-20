// Port types reference only `domain/` types (docs/adr/0001-hexagonal-boundary.md).
import type { Card } from '../domain/cards';

/**
 * Sync, un-wrapped -- no `Result`, no `Promise`, unlike `SettingsRepository`.
 * The catalog is bundled static data, so `getAll` can't fail the way
 * IndexedDB can. `getById` throws for
 * an unknown `cardId` -- callers passing one sourced from persisted data
 * (e.g. an `Attempt.cardId`) must be prepared to handle that.
 */
export interface CardRepository {
  getAll(): Card[];
  getById(cardId: string): Card;
}
