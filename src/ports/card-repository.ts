// Port types reference only `domain/` types (AD-1).
import type { Card } from '../domain/cards';

/**
 * AD-9's `CardRepository` signature: sync, un-wrapped -- no `Result`, no
 * `Promise`, unlike `SettingsRepository`. The catalog is bundled static data
 * (AD-3); a plain array read can't fail the way IndexedDB can, so there's
 * nothing to wrap.
 */
export interface CardRepository {
  getAll(): Card[];
  getById(cardId: string): Card;
}
