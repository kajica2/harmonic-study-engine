/**
 * src/lib/buildInfo.ts — runtime accessors for the build-time stamp
 * injected by vite.config.ts.
 *
 * `__APP_COMMIT__` and `__APP_BUILD_TIME__` are replaced at build time
 * by Vite's `define` option as **bare-identifier substitutions** —
 * the identifier `__APP_COMMIT__` literally becomes `"5ff516a"` in
 * the emitted bundle. That means a `declare const __APP_COMMIT__`
 * plus a direct `const APP_COMMIT = __APP_COMMIT__` is enough; no
 * globalThis lookup is needed (and would silently break — define
 * doesn't substitute property accesses on globalThis).
 *
 * Pure module — no React, no DOM. Vite replaces the identifiers at
 * build time; vitest doesn't apply vite's `define`, so the values
 * read from `globalThis` if the bare-identifier fallback chain
 * somehow leaves them undefined.
 */

declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

/** Short commit SHA of the deployed build (e.g. "5ff516a"), or "dev"
 *  when running outside Vercel and git is unavailable. Always a
 *  non-empty string. */
export const APP_COMMIT: string =
  typeof __APP_COMMIT__ === "string" && __APP_COMMIT__.length > 0
    ? __APP_COMMIT__
    : "dev";

/** ISO 8601 timestamp of when the bundle was produced. Empty string
 *  when the build-time define is absent (vitest, unbuilt source). */
export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : "";

/**
 * Format the build info as a one-line, monospace-friendly string
 * suitable for the page footer.
 *
 *   formatBuildInfo() -> "build 5ff516a · 2026-09-18 19:51 UTC"
 *
 * Returns just the commit line when build-time is missing or
 * unparseable (defensive — should never happen in practice since
 * the define guarantees a string, but typed access can still lie
 * at runtime in odd builds).
 */
export function formatBuildInfo(): string {
  return formatBuildStamp(APP_COMMIT, APP_BUILD_TIME);
}

/**
 * Pure formatter — takes commit + ISO timestamp explicitly so tests
 * can pin the inputs without going through Vite's build-time
 * substitution (vitest doesn't apply vite.config.ts `define`).
 *
 * Returns "build <commit> · <timestamp>" when the timestamp is
 * valid, or just "build <commit>" when it's missing/invalid.
 */
export function formatBuildStamp(commit: string, buildTimeIso: string): string {
  const time = formatTimestamp(buildTimeIso);
  if (time) return `build ${commit} · ${time}`;
  return `build ${commit}`;
}

/**
 * Format the build timestamp as "YYYY-MM-DD HH:MM UTC". Returns
 * null when the input is missing or invalid.
 */
function formatTimestamp(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

/** Pure read accessor — used by tests and any future code that
 *  wants the commit without rendering the footer. */
export function getBuildCommit(): string {
  return APP_COMMIT;
}
