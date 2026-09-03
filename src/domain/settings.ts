// Pure domain type -- no DOM/IndexedDB/Svelte import ever appears here (AD-1).

/** Ink-width preset (Story 1.3 uses this for stroke width; only stored here
 * this story, per AD-11's singleton `settings` record). */
export type WidthPreset = 'subtle' | 'expressive' | 'calligraphy';

/** The `settings` IndexedDB store's singleton record shape (AD-11). Only
 * `penCheckShown` is meaningfully used by Story 1.1 -- the others get sane
 * defaults so the record shape is stable from the first write onward. */
export interface Settings {
  widthPreset: WidthPreset;
  idleTimeoutMs: number;
  penCheckShown: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  widthPreset: 'expressive',
  idleTimeoutMs: 300_000,
  penCheckShown: false,
};
