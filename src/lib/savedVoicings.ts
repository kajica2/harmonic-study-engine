/**
 * savedVoicings — let users save their custom chord voicings to
 * localStorage and recall them from any path.
 *
 * Storage schema (single key, JSON array):
 *   {
 *     id: string,        // uuid
 *     name: string,      // user-supplied label, e.g. "My F#m7b5"
 *     notes: number[],   // MIDI note numbers
 *     tags: string[],    // optional tags: chord symbol, mode, etc.
 *     createdAt: number,  // ms timestamp
 *   }
 *
 * The store is small (typically <1 KB) and persisted under
 * `synesthesia_savedVoicings`. No schema migration needed yet
 * — if we add fields later, we fall back to empty on parse error.
 */

const STORAGE_KEY = "synesthesia_savedVoicings";

export interface SavedVoicing {
  id: string;
  name: string;
  notes: number[];
  tags: string[];
  createdAt: number;
}

export function loadSavedVoicings(): SavedVoicing[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v) =>
        v &&
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        Array.isArray(v.notes) &&
        v.notes.every((n) => typeof n === "number"),
    );
  } catch {
    return [];
  }
}

export function saveVoicing(v: Omit<SavedVoicing, "id" | "createdAt">): SavedVoicing {
  const all = loadSavedVoicings();
  const saved: SavedVoicing = {
    id: `voicing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...v,
  };
  all.push(saved);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Quota exceeded — drop the oldest and try once more
    if (all.length > 1) {
      all.shift();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      } catch {
        /* give up silently */
      }
    }
  }
  return saved;
}

export function deleteVoicing(id: string): void {
  const all = loadSavedVoicings().filter((v) => v.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}