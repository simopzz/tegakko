# Testing

Where tests sit and how to write them.

## The two seams

1. **The whole app** — the primary seam. Tests render `App.svelte` with the real IndexedDB adapters on `fake-indexeddb` and a fake ink surface (`src/test-utils/fake-ink-surface.ts`), act like the learner (click, write, grade), and assert what the learner sees or what persists. Copy [App.integration.test.ts](../../src/app/App.integration.test.ts) as the example.
2. **The generated kanji catalog's output** — the catalog is generated once, so tests pin its output rather than its generator.

Domain unit tests stay. A screen-level test goes when an app-level test covers the same behaviour — and the PR names, for each deleted assertion, where that behaviour is now asserted. A deletion with no named new home is a hole, not a cleanup.

## What a good test asserts

What the learner sees (rendered text, roles) or what persists (repositories read back through their ports) — never internals like module state or private helpers.

## Fakes

Type a fake as the interface it fakes — a helper whose return type is the port or prop type, so the compiler checks every `vi.fn()` against the real signature. Never `ReturnType<typeof vi.fn>`: that skips the check, and the mismatch surfaces only later at the call site.

## Stack

Vitest with `happy-dom`, `fake-indexeddb`, and `@testing-library/svelte` (see `vitest.config.ts`). Every IndexedDB test starts from a clean database via the shared `resetDb()` helper in `src/adapters/persistence/test-reset-db.ts`.

## Layout and look

Checked by screenshot at about 800×1280, not asserted in tests.

## fake-indexeddb and timers

Tests using `fake-indexeddb` must not use `vi.useFakeTimers()` — IndexedDB operations rely on real timers and fake timers cause hangs or timeouts. To control wall-clock time, stub `Date.now()` directly (`vi.spyOn(Date, 'now').mockReturnValue(...)`), or use in-memory fake repositories for the timer-sensitive assertion and reserve real IndexedDB for persistence tests.
