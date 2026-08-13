import type { PracticeSet, PracticeSession } from "./paths";
import { PRACTICE_SETS } from "../data/practice_sets";

const SETS_KEY = "synesthesia_practice_sets";
const SESSIONS_KEY = "synesthesia_practice_sessions";

// ─── Sets ───────────────────────────────────────────────────────────────────

/** Seed sets merged with any user-created sets from localStorage. */
export function loadPracticeSets(): PracticeSet[] {
  const seed = PRACTICE_SETS;
  try {
    const raw = localStorage.getItem(SETS_KEY);
    const user: PracticeSet[] = raw ? JSON.parse(raw) : [];
    return [...seed, ...user];
  } catch {
    return seed;
  }
}

/** Persist only user-created sets (seed sets are always sourced from code). */
function persistUserSets(sets: PracticeSet[]) {
  const userSets = sets.filter((s) => !s.seed);
  localStorage.setItem(SETS_KEY, JSON.stringify(userSets));
}

export function addSet(set: PracticeSet): PracticeSet {
  const all = loadPracticeSets();
  // Replace by ID (upsert) to handle both new and edited sets
  const idx = all.findIndex((s) => s.id === set.id);
  if (idx >= 0) {
    all[idx] = set;
  } else {
    all.push(set);
  }
  persistUserSets(all);
  return set;
}

export function updateSet(set: PracticeSet): PracticeSet {
  return addSet(set);
}

export function deleteSet(id: string): void {
  const all = loadPracticeSets();
  const filtered = all.filter((s) => s.id !== id || s.seed === true);
  persistUserSets(all.filter((s) => s.seed));
  // Re-add non-deleted user sets
  all.filter((s) => !s.seed && s.id !== id).forEach((s) => {
    const current = loadPracticeSets().find((x) => x.id === s.id);
    if (!current?.seed) persistUserSets([...loadPracticeSets().filter((x) => !x.seed && x.id !== id), s]);
  });
  // Simple approach: rebuild user list without the deleted ID
  const seed = PRACTICE_SETS;
  const others = loadPracticeSets().filter((s) => !s.seed && s.id !== id);
  localStorage.setItem(SETS_KEY, JSON.stringify(others));
}

/** Factory for the "New Set" form. */
export function createEmptySet(): PracticeSet {
  return {
    id: `set-${Date.now()}`,
    title: "",
    description: "",
    focusTags: [],
    items: [],
    defaultTempo: 100,
    defaultReps: 1,
    defaultTransposeSemitones: 0,
    seed: false,
  };
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function loadSessions(): PracticeSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSession(session: PracticeSession): void {
  const all = loadSessions();
  all.push(session);
  const trimmed = all.slice(-50);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed));
}

export function getRecentSessions(limit = 5): PracticeSession[] {
  return loadSessions().slice(-limit);
}
