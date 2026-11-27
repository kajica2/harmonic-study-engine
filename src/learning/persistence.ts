import {
  DEFAULT_STATE,
  parseLearningState,
  STORAGE_KEY,
  type LearningState,
} from "./model";

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface ProgressRepository {
  load(): {
    state: LearningState;
    status: "fresh" | "restored" | "invalid" | "unavailable";
  };
  save(state: LearningState): boolean;
  backup(state: LearningState): string;
  /** Validate an import without writing or changing the current practice. */
  restore(text: string): LearningState | null;
}

/**
 * Small synchronous progress adapter. The storage accessor is injected so
 * denied localStorage access and quota exhaustion are ordinary error paths.
 * Practice audio will use a separate async TakeRepositoryPort.
 */
export function createProgressRepository(
  getStorage: () => ProgressStorage,
  lessonIds: readonly string[],
): ProgressRepository {
  const fresh = () => structuredClone(DEFAULT_STATE);
  const restore = (text: string): LearningState | null => {
    // Bound bytes, including non-ASCII text; match the UI's import-file limit.
    if (new TextEncoder().encode(text).byteLength > 1_000_000) return null;
    try {
      return parseLearningState(JSON.parse(text), lessonIds);
    } catch {
      return null;
    }
  };
  return {
    load() {
      try {
        const raw = getStorage().getItem(STORAGE_KEY);
        if (raw === null) return { state: fresh(), status: "fresh" };
        const state = restore(raw);
        return state
          ? { state, status: "restored" }
          : { state: fresh(), status: "invalid" };
      } catch {
        return { state: fresh(), status: "unavailable" };
      }
    },
    save(state) {
      try {
        getStorage().setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch {
        return false;
      }
    },
    backup: (state) => JSON.stringify(state, null, 2),
    restore,
  };
}
