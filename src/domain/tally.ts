// Pure domain type -- no DOM/IndexedDB/Svelte import ever appears here (AD-1).
//
// The `tallies` IndexedDB store's record shape (AD-4/AD-11, Story 1.6).
// Exactly two fields, ever -- no per-card metadata beyond the running miss
// count. Story 1.7 reads this for weak-spot weighting; Story 1.8 decrements
// it on undo.

/** Per-card running count of self-graded misses. */
export interface Tally {
  cardId: string;
  missCount: number;
}
