/**
 * src/lib/performanceLog.ts — per-take persistence for the practice loop
 * (roadmap option G, "mastery / performance log").
 *
 * One entry is written every time the player records a take from the
 * practice rail's Record & Export stage. The read side powers the
 * "Recent takes" panel, which shows the last few takes so the player
 * can compare tempo / instrument / rating across sessions.
 *
 * Storage: a single versioned localStorage key, append-only, pruned to
 * `MAX_TAKES`. All accessors are defensive — corrupted JSON falls back
 * to an empty list rather than throwing (same convention as
 * practiceStore.ts).
 */

export interface PerformanceTake {
  id: string;
  /** ISO 8601 timestamp (new Date().toISOString()). */
  recordedAt: string;
  pathId: string;
  pathTitle: string;
  tempo: number;
  /** Time signature as the user sees it, e.g. "4/4". */
  meter: string;
  instrument: string;
  personaId: string;
  /** Expected loop duration in seconds for the path at this tempo. */
  durationSec: number;
  /** Optional self-assessment, 1–5. Set from the Recent takes panel. */
  selfRating?: number;
  /** Optional human note about the take. */
  note?: string;
  /** Guide tones (3rd/7ths) landed during the take, from the
   *  guide-tone classifier (option C). Written after the run ends. */
  transitionsHit?: number;
  /** Note-ons during the take that were NOT a guide tone. */
  transitionsMissed?: number;
  /** Which repetition of this path the take is — counted by
   *  `recordTake` (1 = first take on this path, 2 = second, ...).
   *  Optional in the schema so older takes stay shape-valid; missing
   *  values render as "rep ?". The roadmap calls for a "first try vs
   *  rep #3" comparison row in the Recent takes panel — this field
   *  plus `guideToneAccuracy` powers that diff. */
  rep?: number;
}

/** Versioned key — bump when the shape changes and add a migration. */
const TAKES_KEY = "hse.performance.log.v1";

/** Most recent takes to keep. Mirrors practiceStore's 50-session cap. */
export const MAX_TAKES = 50;

/** Return a fresh PerformanceTake id safe for list React keys. */
function nextId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Read all takes. Never throws — a bad/corrupt payload yields []. */
export function loadTakes(): PerformanceTake[] {
  try {
    const raw = localStorage.getItem(TAKES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Shape-guard each entry so a future schema change can't poison the
    // panel: entries without a string id / recordedAt are dropped.
    return parsed.filter(
      (t): t is PerformanceTake =>
        typeof t === "object" &&
        t !== null &&
        typeof (t as PerformanceTake).id === "string" &&
        typeof (t as PerformanceTake).recordedAt === "string",
    );
  } catch {
    return [];
  }
}

function persist(takes: PerformanceTake[]): void {
  localStorage.setItem(TAKES_KEY, JSON.stringify(takes));
}

/**
 * Append a take (returns the stored copy) and prune to `MAX_TAKES`.
 * `recordedAt` is stamped here so callers can't drift clocks. The
 * `rep` field is auto-computed: 1 = first take on this path, 2 =
 * second, etc. (counted across all stored takes on the same pathId).
 * No shape migration needed — `rep` is optional in the schema, so
 * older takes stay valid.
 */
export function recordTake(
  input: Omit<PerformanceTake, "id" | "recordedAt" | "rep">,
): PerformanceTake {
  const prior = loadTakes().filter((t) => t.pathId === input.pathId).length;
  const take: PerformanceTake = {
    ...input,
    id: nextId(),
    recordedAt: new Date().toISOString(),
    rep: prior + 1,
  };
  const all = [...loadTakes(), take].slice(-MAX_TAKES);
  persist(all);
  return take;
}

/** Wipe the log. Used by the panel's Clear button. */
export function clearTakes(): void {
  localStorage.removeItem(TAKES_KEY);
}

/** Last `limit` takes, newest last (same convention as practiceStore). */
export function getRecentTakes(limit = 5): PerformanceTake[] {
  return loadTakes().slice(-limit);
}

/** Update (or clear) a take's self-rating. No-op when the id is unknown. */
export function updateTakeRating(id: string, rating: number | undefined): void {
  const all = loadTakes();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return;
  if (rating !== undefined && (rating < 1 || rating > 5)) return;
  if (rating === undefined) {
    delete all[idx].selfRating;
  } else {
    all[idx].selfRating = rating;
  }
  persist(all);
}

/**
 * Attach a take's guide-tone tally (option C → option G). No-op for
 * an unknown id; ignores non-negative-integer tallies so a broken
 * callback can't poison the log.
 */
export function recordGuideToneResult(
  id: string,
  result: { transitionsHit: number; transitionsMissed: number },
): void {
  const { transitionsHit, transitionsMissed } = result;
  if (!Number.isInteger(transitionsHit) || transitionsHit < 0) return;
  if (!Number.isInteger(transitionsMissed) || transitionsMissed < 0) return;
  const all = loadTakes();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return;
  all[idx].transitionsHit = transitionsHit;
  all[idx].transitionsMissed = transitionsMissed;
  persist(all);
}

/**
 * Short relative label for a take, e.g. "just now", "12m ago", "3d ago".
 * Pure so the panel can be rendered deterministically (and tested).
 */
export function formatRelativeTime(
  iso: string,
  now: number = Date.now(),
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown time";
  const diffMs = Math.max(0, now - then);
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  return `${wk}w ago`;
}

/**
 * Guide-tone accuracy as a 0..1 fraction, or null when no tally has
 * been recorded yet (older takes, or a take whose recording was
 * interrupted before the trail ended).
 */
export function guideToneAccuracy(
  take: PerformanceTake,
): number | null {
  if (take.transitionsHit === undefined) return null;
  if (take.transitionsMissed === undefined) return null;
  if (!Number.isInteger(take.transitionsHit)) return null;
  if (!Number.isInteger(take.transitionsMissed)) return null;
  const total = take.transitionsHit + take.transitionsMissed;
  if (total === 0) return null;
  return take.transitionsHit / total;
}

/**
 * Look up the immediately-previous take on the same path that has
 * a guide-tone tally. Used by the "first try vs rep #3" diff row in
 * the Recent takes panel. Returns null when there is no prior take
 * with a tally (first take, or only the current take has data).
 *
 * `takes` should be the full log (append-ordered). We match by
 * `pathId` and require both reps to be integers — that filters out
 * pre-`rep`-field legacy entries from the diff even when they
 * happen to sit adjacent.
 */
export function getPreviousTakeWithTally(
  takes: PerformanceTake[],
  take: PerformanceTake,
): PerformanceTake | null {
  if (typeof take.rep !== "number" || take.rep <= 1) return null;
  const targetRep = take.rep - 1;
  // Walk backwards through the log; find the closest entry with the
  // same pathId AND rep === targetRep AND a recorded tally.
  for (let i = takes.length - 1; i >= 0; i--) {
    const t = takes[i];
    if (t.transitionsHit === undefined) continue;
    if (t.transitionsMissed === undefined) continue;
    if (
      t.id !== take.id &&
      t.pathId === take.pathId &&
      t.rep === targetRep &&
      Number.isInteger(t.transitionsHit) &&
      Number.isInteger(t.transitionsMissed)
    ) {
      return t;
    }
  }
  return null;
}