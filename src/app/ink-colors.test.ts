import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INK_COLORS } from './ink-colors';

// `INK_COLORS` hand-mirrors `theme.css` (a canvas can't read custom
// properties); this test is what guards the mirror. The key-to-token map
// lives here, not beside the values, so the assertion -- not a comment --
// is what ties each key to its token.
const TOKEN_BY_KEY = {
  ink: '--color-ink',
  guide: '--color-grid-guide',
  dot: '--color-positive-bg',
  canvas: '--color-surface-canvas',
} as const satisfies Record<keyof typeof INK_COLORS, string>;

describe('INK_COLORS', () => {
  it('matches every theme.css token it mirrors', () => {
    // cwd-relative, not import.meta.url: the happy-dom environment rewrites
    // module URLs to a non-file scheme, so only vitest's project-root cwd
    // reliably locates the stylesheet.
    const css = readFileSync('src/app/theme.css', 'utf8');
    for (const key of Object.keys(TOKEN_BY_KEY) as Array<keyof typeof TOKEN_BY_KEY>) {
      const declared = new RegExp(`${TOKEN_BY_KEY[key]}\\s*:\\s*(#[0-9a-fA-F]+)`).exec(css)?.[1];
      expect(declared, `${TOKEN_BY_KEY[key]} missing from theme.css`).toBeDefined();
      expect(INK_COLORS[key].toLowerCase()).toBe(declared!.toLowerCase());
    }
  });
});
