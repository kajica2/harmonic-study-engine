/**
 * usePersistedState — typed localStorage-backed React state.
 *
 * Replaces the ~22 `useState(() => { try { return localStorage.getItem...
 * } catch { return default } })` + `useEffect(() => localStorage.setItem...)`
 * pairs that used to live in App.tsx with a single call site:
 *
 *   const [voicing, setVoicing] = usePersistedState<VoicingId>({
 *     key: "synesthesia_voicingType",
 *     defaultValue: "closed",
 *     // Optional: pre-process the raw string before returning (e.g. legacy
 *     // migration "open" -> "spread"). Runs only on the initial read.
 *     migrate: (raw) => (raw === "open" ? "spread" : raw),
 *     // Optional: write strategy. Default is JSON.stringify.
 *     serialize: (v) => (v ? "1" : "0"),
 *   });
 *
 * Persistence happens inside the setter (not in a separate effect), so
 * there's no extra render churn from a `useEffect` re-firing on every
 * state change. The setter is a stable callback, so consumers can
 * safely pass it through memoized components.
 *
 * Errors (storage quota exceeded, JSON parse failure, schema mismatch
 * after a future migration) fall back to `defaultValue` silently —
 * matches the existing app's behavior where localStorage corruption
 * never blocked startup.
 */

import { useCallback, useRef, useState } from "react";

export interface UsePersistedStateOptions<T> {
  /** The localStorage key. Conventionally prefixed (e.g. `synesthesia_*`). */
  key: string;
  /** Initial value if the key is missing or corrupt. */
  defaultValue: T;
  /**
   * Optional migration hook for legacy values. Runs only on the first
   * read; the result is then persisted under the same key so subsequent
   * loads see the migrated value.
   */
  migrate?: (raw: string) => T;
  /**
   * Custom serializer. Defaults to `JSON.stringify`. Useful for booleans
   * stored as `"1"`/`"0"`, numbers stored as `String(n)`, etc.
   */
  serialize?: (value: T) => string;
  /**
   * Custom deserializer. Defaults to `JSON.parse`. Receives the raw
   * stored string AFTER `migrate` has run, so `migrate` can pre-clean
   * the string before parsing.
   */
  deserialize?: (raw: string) => T;
  /**
   * If true, the read is skipped on the server / during SSR (where
   * `localStorage` is undefined). On the client, behaves normally.
   * Defaults to true — this hook is browser-only.
   */
  ssrSafe?: boolean;
}

const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

function readInitial<T>(
  key: string,
  defaultValue: T,
  migrate?: (raw: string) => T,
  deserialize?: (raw: string) => T,
): T {
  if (!isBrowser) return defaultValue;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return defaultValue;
  }
  if (raw === null) return defaultValue;
  try {
    const cleaned = migrate ? migrate(raw) : raw;
    const parsed = deserialize ? deserialize(cleaned as unknown as string) : JSON.parse(cleaned as unknown as string);
    return parsed as T;
  } catch {
    return defaultValue;
  }
}

export function usePersistedState<T>(
  opts: UsePersistedStateOptions<T>,
): [T, (next: T | ((prev: T) => T)) => void] {
  const {
    key,
    defaultValue,
    migrate,
    serialize,
    deserialize,
    ssrSafe = true,
  } = opts;

  // Capture the read-once flag in a ref so the setter always uses the
  // migration function from the initial render — protects against a
  // future caller changing `migrate` mid-session.
  const migrateRef = useRef(migrate);
  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);

  const [value, setValue] = useState<T>(() => {
    if (ssrSafe && !isBrowser) return defaultValue;
    return readInitial(key, defaultValue, migrate, deserialize);
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function"
            ? (next as (prev: T) => T)(prev)
            : next;
        if (!isBrowser) return resolved;
        try {
          const serialized = serializeRef.current
            ? serializeRef.current(resolved)
            : JSON.stringify(resolved);
          localStorage.setItem(key, serialized);
        } catch {
          // Storage quota / disabled storage — silently ignore so the
          // UI never breaks. The in-memory value is still updated.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
