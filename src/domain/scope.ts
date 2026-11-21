// Pure domain type + function -- no DOM/IndexedDB/Svelte import ever appears
// here (docs/adr/0001-hexagonal-boundary.md). Filtering the static catalog
// (`domain/cards.ts`) by scope is a pure function, not something the UI or an
// adapter computes itself.
import type { Card, Script, CardSet } from './cards';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `Session.scope`'s persisted type, also what the Scope picker hands
 * forward and what weak-spot selection filters candidates by: one entry
 * per selected script, listing that script's Sets -- each script narrows
 * on its own terms (a kanji JLPT level never widens a kana scope), which
 * one flat `scripts`/`sets` pair could not express. A script absent from
 * the map is unselected; a present-but-empty Sets array yields no cards
 * (never treated as "unrestricted"). The Scope picker is the guard that
 * keeps every entry non-empty. */
export type Scope = Readonly<Partial<Record<Script, readonly CardSet[]>>>;

/** The Scope picker's default: both kana scripts, all Sets -- kanji is
 * deliberately absent, an opt-in pill rather than part of every fresh
 * load's default selection.
 *
 * Frozen, including its arrays: shared module state that no caller may
 * corrupt by mutating what they were handed back. */
export const FULL_SCOPE: Scope = Object.freeze({
  hiragana: Object.freeze(['base', 'yoon'] as readonly CardSet[]),
  katakana: Object.freeze(['base', 'yoon'] as readonly CardSet[]),
});

/** Pure filter: every card whose script is selected AND whose set is in
 * that script's own Sets list. */
export function cardsInScope(cards: Card[], scope: Scope): Card[] {
  return cards.filter((card) => scope[card.script]?.includes(card.set) === true);
}

/** The Scope picker's fixed-count presets: a discrete union, not a cached
 * number, so the effective count is always recomputed from the *current*
 * scoped count rather than drifting when the scope changes underneath an
 * already-made choice. */
export type SessionSizeChoice = 10 | 20 | 50 | 'all';

/** Resolves a `SessionSizeChoice` against a scope's live card count into the
 * exact number of cards a session should sample -- `domain/drill.ts`'s
 * `sampleSessionCards` reads this result as its `sessionSize` argument. The
 * one formula lives here so the composition root's `handleStart` is the only
 * place a choice becomes a count.
 *
 * `'all'` returns `scopedCount` unchanged. Every count preset clamps down to
 * the scope -- "50" on a 33-card scope just means all of them. */
export function resolveSessionSize(choice: SessionSizeChoice, scopedCount: number): number {
  return choice === 'all' ? scopedCount : Math.min(choice, scopedCount);
}

/** One-line scope readout, e.g. "Hiragana Base+Yoon · Katakana Base" --
 * what Summary and each History row show beside a session's card count,
 * so a narrowed scope reads differently from the full one. Scripts and
 * Sets render in the scope's own stored order. */
export function describeScope(scope: Scope): string {
  return Object.entries(scope)
    .map(([script, sets]) =>
      sets && sets.length > 0
        ? `${capitalize(script)} ${sets.map(capitalize).join('+')}`
        : capitalize(script),
    )
    .join(' · ');
}
