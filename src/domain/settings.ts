// Pure domain type -- no DOM/IndexedDB/Svelte import ever appears here
// (docs/adr/0001-hexagonal-boundary.md).

/** Ink-width preset: the pressure-to-width range a stroke is drawn with. */
export type WidthPreset = 'subtle' | 'expressive' | 'calligraphy';

/** The `settings` IndexedDB store's singleton record shape. Every field gets
 * a sane default so the record shape is stable from the first write onward. */
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
