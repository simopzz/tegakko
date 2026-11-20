// Pure domain type + function -- no DOM/IndexedDB/Svelte import ever appears
// here (docs/adr/0001-hexagonal-boundary.md). Filtering the static catalog
// (`domain/cards.ts`) by scope is a pure function, not something the UI or an
// adapter computes itself.
import type { Card, Script, CardSet } from './cards';

/** `Session.scope`'s persisted type, also what the Scope picker hands
 * forward and what weak-spot selection filters candidates by. */
export interface Scope {
  scripts: Script[];
  sets: CardSet[];
}

/** The full catalog, unnarrowed -- the Scope picker's default.
 *
 * Frozen, including its arrays: shared module state that no caller may
 * corrupt by mutating what they were handed back. */
export const FULL_SCOPE: Scope = Object.freeze({
  scripts: Object.freeze(['hiragana', 'katakana']) as Script[],
  sets: Object.freeze(['base', 'yoon']) as CardSet[],
});

/** Pure filter: every card whose script is in `scope.scripts` AND whose set
 * is in `scope.sets`. An empty `scripts` or `sets` array yields no cards --
 * never treated as "unrestricted". */
export function cardsInScope(cards: Card[], scope: Scope): Card[] {
  return cards.filter(
    (card) => scope.scripts.includes(card.script) && scope.sets.includes(card.set),
  );
}

/** The Scope picker's percent-of-scope presets: a
 * discrete union, not a cached number, so the effective count is always
 * recomputed from the *current* scoped count rather than drifting when the
 * scope changes underneath an already-made choice. */
export type SessionSizeChoice = 'all' | 0.25 | 0.5 | 0.75;

/** Resolves a `SessionSizeChoice` against a scope's live card count into the
 * exact number of cards a session should sample -- `domain/drill.ts`'s
 * `sampleSessionCards` reads this result as its `sessionSize` argument. The
 * one formula lives here so every caller (the Scope picker's live "N cards
 * this session" hint, `App.svelte`'s `handleStart`) produces identical
 * results and can never drift apart.
 *
 * `'all'` returns `scopedCount` unchanged, matching prior default behavior
 * exactly. Every percent preset rounds to the nearest whole card, floored at
 * a minimum of 1 -- `scopedCount` is always > 0 here (the Scope picker
 * always keeps at least one script and one set active), so this only ever
 * needs a floor, never a guard against an empty scope. */
export function resolveSessionSize(choice: SessionSizeChoice, scopedCount: number): number {
  return choice === 'all' ? scopedCount : Math.max(1, Math.round(choice * scopedCount));
}
