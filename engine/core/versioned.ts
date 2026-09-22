/**
 * engine/core/versioned.ts - REQ-FND-5 / REQ-NFR-6.
 *
 * Every object this repo serializes (localStorage, URL params, file
 * export) must carry a positive-integer `version`. Migrations are
 * applied on load via engine/migrations/runner.ts.
 *
 * This file is the root of the engine dependency graph: no imports,
 * no DOM, no clock, no randomness.
 */

export interface Versioned {
  /** Positive integer schema version. 1 is the first shipped shape. */
  readonly version: number;
}

/** Runtime narrowing for parsed JSON before migration dispatch. */
export function isVersioned(value: unknown): value is Versioned {
  if (typeof value !== "object" || value === null) return false;
  const v = (value as Record<string, unknown>).version;
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}
