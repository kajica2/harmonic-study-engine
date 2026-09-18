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
 * `recordedAt` is stamped here so callers can't drift clocks.
 */
export function recordTake(
  input: Omit<PerformanceTake, "id" | "recordedAt">,
): PerformanceTake {
  const take: PerformanceTake = {
    ...input,
    id: nextId(),
    recordedAt: new Date().toISOString(),
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