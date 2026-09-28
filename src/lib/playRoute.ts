/**
 * src/lib/playRoute.ts - PRD-001 Phase 8 S1 (D148): the whole
 * "router" - one pathname check, not a library.
 *
 * The honest name for /play is "a second top-level surface behind a
 * one-line branch" (audit #10: the codebase has ZERO router today;
 * this adds exactly one branch). Exact-match law (S4 D-11
 * precedent): ONLY "/play" and "/play/" route (trailingSlash:false
 * canonicalizes, accepting both is one `||`); everything else stays
 * on the App.
 */

export function isPlayRoute(pathname: string): boolean {
  return pathname === "/play" || pathname === "/play/";
}
