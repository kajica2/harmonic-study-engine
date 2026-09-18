/**
 * Vitest setup. Runs before every test file.
 *
 * Polyfills `localStorage` / `sessionStorage` on the global object.
 * Vitest's jsdom environment does not carry jsdom's per-origin Storage
 * onto the global `window` (populateGlobal drops the getter even when a
 * non-opaque URL is configured), so store/hook tests that reach for
 * `localStorage.clear()` in `beforeEach` explode with "Cannot read
 * properties of undefined (reading 'clear')". This spec-covering,
 * in-memory implementation restores those APIs and matches the quirks
 * the code under test relies on (key() ordering, string coercion,
 * null on miss). Per-test isolation comes from the existing
 * `beforeEach(() => localStorage.clear())` calls.
 *
 * Note: An earlier iteration tried to polyfill OfflineAudioContext
 * via `web-audio-api`, but that package doesn't actually export
 * OfflineAudioContext (only AudioContext, AudioParam, etc.). The
 * loopWav audio tests need a real Web Audio implementation;
 * dropping them for now is the pragmatic call. When standardized-
 * audio-context gets a usable Node entrypoint, polyfill here.
 */

class MemoryStorage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const storage = new MemoryStorage();
const storageTargets: object[] = [globalThis];
if (typeof window !== "undefined") storageTargets.push(window);

for (const target of storageTargets) {
  Object.defineProperty(target, "localStorage", {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  });
  Object.defineProperty(target, "sessionStorage", {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  });
}