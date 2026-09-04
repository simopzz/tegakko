// Pure domain type + function -- no DOM/IndexedDB/Svelte import ever appears
// here (AD-1). Filtering the static catalog (`domain/cards.ts`) by scope is a
// pure function, not something the UI or an adapter computes itself
// (capability map: FR-2 -> domain scope filter).
import type { Card, Script, CardKind } from './cards';

/** AD-4's structured `Scope` shape: `Session.scope`'s persisted type, also
 * what the Scope picker (Story 1.2) hands forward and what weak-spot
 * selection (Story 1.7) filters candidates by. */
export interface Scope {
  scripts: Script[];
  units: CardKind[];
}

/** The full catalog, unnarrowed -- the Scope picker's default (FR-2). */
export const FULL_SCOPE: Scope = {
  scripts: ['hiragana', 'katakana'],
  units: ['base', 'yoon'],
};

/** Pure filter: every card whose script is in `scope.scripts` AND whose kind
 * is in `scope.units`. An empty `scripts` or `units` array yields no cards --
 * never treated as "unrestricted". */
export function cardsInScope(cards: Card[], scope: Scope): Card[] {
  return cards.filter(
    (card) => scope.scripts.includes(card.script) && scope.units.includes(card.kind),
  );
}
