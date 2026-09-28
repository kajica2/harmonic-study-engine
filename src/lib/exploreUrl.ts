/**
 * src/lib/exploreUrl.ts - PRD-001 Phase 8 S1 (D146).
 *
 * Explore seed text <-> the `eseed` URL key. The seed IS the state:
 * cards regenerate deterministically from it (Phase 5 pin + PRD
 * 11.2's own `/app?mode=explore&seed=...` example), so serializing
 * cards or the op-history would serialize DERIVED values / playheads
 * (two truths for one fact). The bare `seed` key is NOT reused - it
 * collides with the etude core key (integer domain, etudeUrl.ts);
 * `eseed` follows the shipped `tmode` precedent (ADR-015 sec 1).
 *
 * Governor (D146): seeds longer than ESEED_URL_MAX chars SKIP the key
 * (only eseed - never touches other families; the compose wipe
 * discipline). The surface owns the honest notice.
 */

export const EXPLORE_URL_KEYS: readonly ["eseed"] = ["eseed"];

/** Governor (D146): longer seeds skip the key + show the notice. */
export const ESEED_URL_MAX = 200;

/** True when ANY explore key is present. */
export function hasExploreParams(params: URLSearchParams): boolean {
  return EXPLORE_URL_KEYS.some((k) => params.has(k));
}

/** null/""/over-cap -> { eseed: null } (skip key; the surface owns
 *  the notice). Raw text otherwise - URLSearchParams handles the
 *  encoding (spaces/#/=/& survive the round trip). */
export function serializeExploreSeed(
  seedText: string | null,
): Record<"eseed", string | null> {
  if (seedText === null || seedText === "" || seedText.length > ESEED_URL_MAX) {
    return { eseed: null };
  }
  return { eseed: seedText };
}

/** Raw text round-trip. Absent (or empty) -> null (never "" - the
 *  caller keeps the persisted/local value, field-wise doctrine). */
export function parseExploreSeedParam(params: URLSearchParams): string | null {
  const raw = params.get("eseed");
  return raw === null || raw === "" ? null : raw;
}
