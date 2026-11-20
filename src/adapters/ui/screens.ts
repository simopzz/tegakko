// Canonical top-level screen enum, owned here. A single top-level
// Svelte state variable of this type drives which screen renders -- no
// router library. Drill's own sub-states are local component state, not
// members of this union.
export type Screen = 'pen-check' | 'scope-picker' | 'drill' | 'summary' | 'history' | 'settings';
