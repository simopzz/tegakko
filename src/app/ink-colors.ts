// A canvas can't read CSS custom properties, so `theme.css`'s token values
// are mirrored here for the ink adapter -- the composition root (App.svelte)
// is the one layer allowed to know both the theme and the adapter. The
// mirror is hand-copied duplication, so `ink-colors.test.ts` asserts each
// value against its token on every run: drift fails CI instead of silently
// recolouring the writing surface.

export const INK_COLORS = Object.freeze({
  ink: '#25231F', // --color-ink
  guide: '#C9D6BF', // --color-grid-guide
  dot: '#DFE8D8', // --color-positive-bg
  canvas: '#FFFAF1', // --color-surface-canvas
});
