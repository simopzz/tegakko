// Plain TS helper, not a `.svelte` module export: `tsc --noEmit` (the first
// half of `typecheck`) only understands `.svelte` files as opaque default
// exports, not their `<script module>` named exports -- svelte-check and
// Vite/Vitest both resolve those fine, but raw `tsc` does not, so a
// same-file `export function` isn't importable from a `.test.ts` file
// without breaking `just check`'s `tsc` step. A real `.ts` module is
// importable from both `History.svelte` and `History.test.ts` without that
// split.
export function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
