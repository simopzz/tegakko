import type { CardRepository } from '../../ports/card-repository';
import type { Card } from '../../domain/cards';
import { CARDS } from '../../domain/cards';

/**
 * `CardRepository` implemented over the static bundled catalog -- never
 * `persistence` (IndexedDB); content never changes at runtime.
 * Sync and un-wrapped: a bundled array read can't fail.
 */
export class InMemoryCardRepository implements CardRepository {
  getAll(): Card[] {
    // A fresh copy each call -- callers must never be able to mutate the
    // shared catalog module by mutating what they got back from `getAll`.
    return [...CARDS];
  }

  getById(cardId: string): Card {
    // Normalize before comparing: the catalog's own `cardId`s are built from
    // NFC-normalized graphemes (domain/cards.ts), but a lookup key sourced
    // from persisted data or an import isn't guaranteed to arrive already
    // normalized.
    const normalizedId = cardId.normalize('NFC');
    const card = CARDS.find((candidate) => candidate.cardId === normalizedId);
    if (!card) {
      throw new Error(`Unknown cardId: ${cardId}`);
    }
    return card;
  }
}
