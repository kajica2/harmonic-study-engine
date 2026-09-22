/**
 * engine/migrations/types.ts - REQ-FND-5 / REQ-NFR-6 / PRD 11.3.
 */

export interface DataMigration {
  /** Upgrade from this schema version... */
  readonly from: number;
  /** ...to exactly from + 1. Runner validates contiguity. */
  readonly to: number;
  /**
   * Pure, copy-on-write transform. MUST NOT mutate its input: on a
   * later step's failure the runner reports the ORIGINAL payload.
   * May throw; the runner catches and degrades to read-only.
   * Returned object must carry `version === to`.
   */
  readonly up: (data: unknown) => unknown;
}

/**
 * Discriminated union; the runner NEVER throws and NEVER logs
 * (REQ-NFR-5 + engine purity). Callers map ok:false to a read-only
 * view plus console.warn in the ADAPTER layer, not here.
 */
export type MigrationOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly applied: readonly number[] }
  | {
      readonly ok: false;
      readonly readOnly: true;
      /** Best-effort: the original stored shape, unmodified. */
      readonly value: T;
      readonly error: string;
    };

export interface MigrationRunner<T = unknown> {
  readonly currentVersion: number;
  run(raw: unknown): MigrationOutcome<T>;
}
