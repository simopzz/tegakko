# Coding standards

This file is read during review, not implementation. It covers judgement-call rules that automated checks cannot enforce.

## Reactive state crossing boundaries

Svelte 5 reactive proxies (`$state`, `$derived`) must never be passed directly to IndexedDB, the network, or any other adapter/persistence boundary: proxies cause `DataCloneError` and are not structured-cloneable.

- In `.svelte` files, use `$state.snapshot(value)` before handing data to a port or domain function.
- In plain `.ts` files (where runes are unavailable), use `JSON.parse(JSON.stringify(value))` or another proxy-safe deep clone before passing the value across the boundary.

## fake-indexeddb and timers

Tests using `fake-indexeddb` must not use `vitest`'s fake timers (`vi.useFakeTimers()`). IndexedDB operations rely on real timers; fake timers cause hangs or timeouts.

To control wall-clock time in a fake-indexeddb test, either:

- stub `Date.now()` directly (e.g., `vi.spyOn(Date, 'now').mockReturnValue(...)`), or
- use in-memory fake repositories for the timer-sensitive assertion and reserve real IndexedDB for persistence/integration tests.
