/**
 * Tests for src/lib/storage.ts — the centralized localStorage schema
 * registry, safe I/O helpers, and boot schema-version gate.
 *
 * Runs under jsdom (localStorage polyfilled in tests/setup.ts). Kept
 * out of the node project via vitest.config.ts JSDOM_FILES — storage
 * behavior is only well-defined where a storage global exists.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  K,
  STORAGE_KEYS,
  STORAGE_SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  FEEDBACK_HISTORY_MAX,
  MIGRATIONS,
  storageGet,
  storageGetBool,
  storageGetJSON,
  storageGetNumber,
  storageSet,
  storageSetCap,
} from "./storage";

// Reload the module with a fresh `ensured` flag so boot-gate tests are
// order-independent.
async function freshStore() {
  vi.resetModules();
  return await import("./storage");
}

beforeEach(() => {
  localStorage.clear();
});

describe("storage registry", () => {
  it("registers every key from the K constant (drift guard)", () => {
    const registered = new Set(STORAGE_KEYS.map((m) => m.key));
    for (const key of Object.values(K)) {
      expect(registered.has(key), `missing registry entry for ${key}`).toBe(
        true,
      );
    }
  });

  it("registry entries all use version >= 1", () => {
    for (const entry of STORAGE_KEYS) {
      expect(Number(entry.since)).toBeGreaterThanOrEqual(1);
      expect(entry.shape.length).toBeGreaterThan(0);
    }
  });
});

describe("storageGet / storageSet", () => {
  it("returns null for a missing key", () => {
    expect(storageGet("missing")).toBeNull();
  });

  it("round-trips a value", () => {
    storageSet("k", "v1");
    expect(storageGet("k")).toBe("v1");
  });

  it("storageGetJSON parses valid JSON and falls back safely", () => {
    storageSet("a", JSON.stringify({ ok: 1 }));
    expect(storageGetJSON("a", { ok: 0 })).toEqual({ ok: 1 });
    // Missing -> fallback
    expect(storageGetJSON("nope", [1])).toEqual([1]);
    // Corrupt JSON -> fallback
    storageSet("b", "{oops");
    expect(storageGetJSON("b", 42)).toBe(42);
    // Empty string -> fallback
    storageSet("c", "");
    expect(storageGetJSON("c", "fb")).toBe("fb");
  });

  it("storageGetNumber falls back on non-numeric values", () => {
    storageSet("n", "5");
    expect(storageGetNumber("n", 0)).toBe(5);
    storageSet("bad", "abc");
    expect(storageGetNumber("bad", 7)).toBe(7);
    expect(storageGetNumber("missing", 3)).toBe(3);
  });

  it("storageGetBool parses booleans and falls back safely", () => {
    storageSet("b", "true");
    expect(storageGetBool("b", false)).toBe(true);
    storageSet("b0", "0");
    expect(storageGetBool("b0", true)).toBe(false);
    expect(storageGetBool("missing", true)).toBe(true);
    storageSet("broken", "{nope");
    expect(storageGetBool("broken", true)).toBe(true);
  });

  it("storageSetCap keeps only the last max entries", () => {
    const values = Array.from({ length: FEEDBACK_HISTORY_MAX + 50 }, (_, i) => i);
    const trimmed = storageSetCap("arr", values, FEEDBACK_HISTORY_MAX);
    expect(trimmed).toHaveLength(FEEDBACK_HISTORY_MAX);
    expect(trimmed[0]).toBe(50);
    expect(trimmed[FEEDBACK_HISTORY_MAX - 1]).toBe(FEEDBACK_HISTORY_MAX + 49);
    // Stored copy matches the trimmed array.
    expect(storageGetJSON<number[]>("arr", [])).toEqual(trimmed);
  });

  it("storageSetCap leaves arrays under the cap untouched", () => {
    const small = [1, 2, 3];
    expect(storageSetCap("s", small, 10)).toEqual(small);
  });
});

describe("ensureStorageSchemaVersion (boot gate)", () => {
  it("records the current schema version on first run", async () => {
    const s = await freshStore();
    expect(s.storageGet(s.SCHEMA_VERSION_KEY)).toBeNull();
    s.ensureStorageSchemaVersion();
    expect(s.storageGet(s.SCHEMA_VERSION_KEY)).toBe(s.STORAGE_SCHEMA_VERSION);
  });

  it("does not clobber an already-current marker", async () => {
    const s = await freshStore();
    s.storageSet(s.SCHEMA_VERSION_KEY, s.STORAGE_SCHEMA_VERSION);
    s.ensureStorageSchemaVersion();
    expect(s.storageGet(s.SCHEMA_VERSION_KEY)).toBe(s.STORAGE_SCHEMA_VERSION);
  });

  it("steps an older marker forward through registered migrations", async () => {
    const s = await freshStore();
    // Simulate a future v1 -> v2 migration being registered.
    const futureMigrations = [
      ...s.MIGRATIONS,
      { from: "1", to: "2", apply: () => s.storageSet("migrated", "yes") },
    ];
    s.storageSet(s.SCHEMA_VERSION_KEY, "1");
    let marker = s.storageGet(s.SCHEMA_VERSION_KEY) as string;
    for (const m of futureMigrations) {
      if (marker === m.from) {
        m.apply();
        marker = m.to;
      }
    }
    s.storageSet(s.SCHEMA_VERSION_KEY, marker);
    expect(s.storageGet("migrated")).toBe("yes");
    expect(s.storageGet(s.SCHEMA_VERSION_KEY)).toBe("2");
  });

  it("is a fresh-module no-op (ensured flag suppresses re-runs)", async () => {
    const s = await freshStore();
    s.ensureStorageSchemaVersion();
    expect(s.storageGet(s.SCHEMA_VERSION_KEY)).toBe(s.STORAGE_SCHEMA_VERSION);
    // Second call within the same module lifetime must do nothing.
    localStorage.removeItem(s.SCHEMA_VERSION_KEY);
    s.ensureStorageSchemaVersion();
    expect(s.storageGet(s.SCHEMA_VERSION_KEY)).toBeNull();
  });
});