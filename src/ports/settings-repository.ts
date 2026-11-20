// Port types reference only `domain/` types (docs/adr/0001-hexagonal-boundary.md).
import type { Settings } from '../domain/settings';
import type { Result } from '../domain/result';

/**
 * Async because `idb` is Promise-based; adapter failures resolve as a typed
 * `Result` rather than a thrown `DOMException` crossing the port boundary.
 */
export interface SettingsRepository {
  get(): Promise<Result<Settings>>;
  save(settings: Settings): Promise<Result<void>>;
}
