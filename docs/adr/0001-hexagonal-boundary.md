# Hexagonal boundary, enforced by lint

The code is split into `domain/` (pure TypeScript), `ports/` (interfaces), `adapters/` (IndexedDB, in-memory catalog, ink canvas, Svelte UI, JSON export/import) and `app/` (composition root). `domain/` and `ports/` never import from `adapters/` or `app/`, and an adapter never imports a sibling adapter: the one cross-adapter need, the UI driving the ink canvas, goes through the `InkSurface` port. Only `app/` wires concrete adapters together.

We chose this so storage details (IndexedDB record shapes) and UI details (Svelte reactivity) can't leak into the weak-spot and session logic, which stays testable without a browser. The rule is enforced by `eslint.config.js` (`import-x/no-restricted-paths`), so a new sibling-adapter import fails `mise run check` instead of slipping through review.
