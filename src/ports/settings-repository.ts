// Port types reference only `domain/` types (AD-1).
import type { Settings } from '../domain/settings';
import type { Result } from '../domain/result';

/**
 * AD-9's `SettingsRepository` signature, adapted for an IndexedDB-backed
 * implementation: `idb` is Promise-based, and adapter failures resolve as a
 * typed `Result` rather than a thrown `DOMException` crossing the port
 * boundary (Consistency Conventions).
 */
export interface SettingsRepository {
  get(): Promise<Result<Settings>>;
  save(settings: Settings): Promise<Result<void>>;
}
