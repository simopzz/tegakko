# Coding standards

The rules code review checks. Each rule says what it protects and what enforces it (ADR, lint, compiler, or review only).

## Rules

1. **Hexagonal boundary**: `domain/` and `ports/` never import from `adapters/` or `app/`; adapters never import sibling adapters; concrete adapters are wired only in `src/app/`. Protects the domain's independence from IndexedDB and the UI, so it stays testable and portable. Enforced by lint (`import-x/no-restricted-paths` in `eslint.config.js`, regression-tested in `eslint.config.test.ts`). Decided by [ADR-0001](../adr/0001-hexagonal-boundary.md).

2. **Strict TypeScript, no explicit `any`**: protects the port contracts — a port's signature is the promise adapters and the app rely on. Enforced by the compiler (`"strict": true` in `tsconfig.json`) and lint (`@typescript-eslint/no-explicit-any` as an error, not a warning, in `eslint.config.js`).

3. **Persistence adapters return a `Result`** and never let a raw storage exception escape the adapter boundary (see `toError()` in `src/adapters/persistence/db.ts`). Protects callers from `DOMException`-shaped control flow; failures are typed values the app decides how to present. Review only.

4. **Dates are ISO 8601 strings; record ids come from `crypto.randomUUID()`.** Protects stored records: ISO strings survive structured clone and sort correctly; UUIDs need no coordination. Review only.

5. **Theme values are CSS custom properties** named by token category — `--color-*`, `--font-*`, `--radius-*`, `--spacing-*` — declared once in `src/app/theme.css`. Protects the design tokens (see [design.md](../design.md)) from drifting into per-component literals. Review only.

6. **No global mutable state outside the composition root.** Protects testability and reasoning: everything a module needs arrives as a parameter or port, so tests construct it directly. Review only.

7. **Comments explain only why**, in a line or two, and link an ADR where one exists. No process history — story numbers, ticket ids, dated decisions. Protects the reader from archaeology instead of understanding. Review only.

8. **Names follow [GLOSSARY.md](../../GLOSSARY.md)**, including its _Avoid_ lists: Set not unit/kind, complete not full-scope, miss count not tally in anything the learner reads. Protects the shared vocabulary so code, tests, and UI text mean the same thing. Review only.

9. **Reactive state never crosses a boundary**: Svelte 5 proxies (`$state`, `$derived`) are not structured-cloneable and cause `DataCloneError` in IndexedDB. Use `$state.snapshot(value)` in `.svelte` files, or a deep clone (`JSON.parse(JSON.stringify(value))`) in plain `.ts` files, before handing data to a port or domain function. Review only.
