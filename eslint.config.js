// @ts-check
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';
import svelte from 'eslint-plugin-svelte';

// eslint-plugin-import-x's no-restricted-paths needs one zone per adapter
// directory -- a same-pattern target/from won't exclude same-dir imports.
// The trailing `/**` matters: `no-restricted-paths` resolves an extglob
// `from` with `minimatch`, which matches path *segments* -- without `/**`,
// `./src/adapters/!(ui)` only matches a path literally equal to one sibling
// adapter's directory name, never a file nested inside it.
const adapterZones = ['content', 'ink', 'persistence', 'ui', 'io'].map((name) => ({
  target: `./src/adapters/${name}`,
  from: `./src/adapters/!(${name})/**`,
}));

// `tseslint.configs.recommended` includes a `typescript-eslint/base` entry
// that sets a top-level `languageOptions.parser` with no `files` filter. If
// that whole array is passed through the Svelte block's own `extends`,
// typescript-eslint's `extends` mechanism scopes every extended config
// (base included) to that block's `files: ['src/**/*.svelte']` -- which
// clobbers the Svelte parser eslint-plugin-svelte just set up (svelte
// SFCs stop parsing entirely: "'>' expected" on the first `<script>` tag).
// Pulling out just the `rules` and merging them in below gets the same
// strictness without touching `languageOptions`/`parser` -- the Svelte
// block's own `parserOptions.parser: tseslint.parser` below is what already
// hands each `<script>` block's content to typescript-eslint correctly.
const tsRecommendedRules = Object.assign(
  {},
  ...tseslint.configs.recommended.map((config) => config.rules ?? {}),
);

export default tseslint.config(
  {
    ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'public/**'],
  },
  {
    files: ['src/**/*.ts', 'vite.config.ts', 'vitest.config.ts', 'eslint.config.js'],
    extends: [...tseslint.configs.recommended],
    plugins: { 'import-x': importPlugin },
    rules: {
      // AD-6: no `any` anywhere, least of all at a port boundary.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Svelte SFCs: svelte-eslint-parser owns the file, delegating each
  // `<script>` block's content to typescript-eslint's parser -- this is
  // what makes `@typescript-eslint/*` rules (no-explicit-any below) see
  // inside .svelte files at all, instead of ESLint ignoring them outright.
  ...svelte.configs['flat/recommended'],
  {
    files: ['src/**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // Same strictness as plain .ts files (typescript-eslint's recommended
      // rule set -- see tsRecommendedRules above for why this isn't a plain
      // `extends`), applied to a component's <script lang="ts"> block.
      ...tsRecommendedRules,
      // AD-6: no `any` anywhere -- same bar as plain .ts.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // AD-1: cross-adapter interaction goes through a port, never a direct
    // sibling-adapter import -- only `app/` may import concrete adapters.
    // Covers both .ts adapter modules and .svelte adapter components (e.g.
    // src/adapters/ui/*.svelte) -- a component doesn't get a boundary pass
    // just because it's markup-flavored.
    files: ['src/adapters/**/*.ts', 'src/adapters/**/*.svelte'],
    plugins: { 'import-x': importPlugin },
    settings: {
      // Extensionless relative imports (`'../persistence/x'`) resolve to
      // `.ts` files; without this, eslint-plugin-import-x's resolver can't
      // find the module at all and silently skips the restricted-paths
      // check instead of reporting a violation.
      'import-x/resolver': {
        node: { extensions: ['.js', '.ts', '.svelte'] },
      },
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: adapterZones }],
    },
  },
);
