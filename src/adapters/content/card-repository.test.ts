import { describe, expect, it } from 'vitest';
import { InMemoryCardRepository } from './card-repository';
import { CARDS } from '../../domain/cards';

describe('InMemoryCardRepository', () => {
  it('getAll returns all 158 cards from the real catalog', () => {
    const repository = new InMemoryCardRepository();
    expect(repository.getAll()).toHaveLength(158);
    expect(repository.getAll()).toEqual(CARDS);
  });

  it('getAll returns a fresh array each call, not the shared module array', () => {
    const repository = new InMemoryCardRepository();
    const first = repository.getAll();
    first.pop();
    expect(repository.getAll()).toHaveLength(158);
  });

  it('getById returns the exact card for a known id', () => {
    const repository = new InMemoryCardRepository();
    const card = repository.getById('あ:hiragana');
    expect(card).toEqual({ cardId: 'あ:hiragana', grapheme: 'あ', script: 'hiragana', kind: 'base' });
  });

  it('getById finds a yoon card by its full two-character grapheme id', () => {
    const repository = new InMemoryCardRepository();
    const card = repository.getById('きゃ:hiragana');
    expect(card.grapheme).toBe('きゃ');
    expect(card.kind).toBe('yoon');
  });

  it('getById throws for an unknown id, never returning undefined silently', () => {
    const repository = new InMemoryCardRepository();
    expect(() => repository.getById('nope:hiragana')).toThrow();
  });
});
