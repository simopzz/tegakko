// Pure domain type -- no DOM/IndexedDB/Svelte import ever appears here (AD-1).
//
// Adapters resolve failures into this typed shape instead of letting a raw
// `DOMException` (or any other thrown value) cross the port boundary, per
// the architecture spine's Consistency Conventions.

export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(error: Error): Result<T> {
  return { ok: false, error };
}
