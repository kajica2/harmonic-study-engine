/**
 * engine/migrations/index.ts - PRD-001 session migration registry.
 * Baseline v1 (Phase 0/1): empty chain. Phase 2 (D10) appends the
 * v1 -> v2 step that seeds the transpose-slice defaults
 * (exerciseTranspose + keyCycleActive). Phase 3 Slice 2 (D23) appends
 * the v2 -> v3 step that seeds `etudeConstraints: null`, and bumps
 * CURRENT_SESSION_VERSION. The chain must stay contiguous 1 -> 2 -> 3
 * (validateMigrationChain). This version mirrors
 * src/state/sessionStore.ts CURRENT_SESSION_VERSION; the zustand
 * persist envelope carries the same number (ADR-004).
 */

import type { DataMigration, MigrationRunner } from "./types";
import { createMigrationRunner } from "./runner";

export const CURRENT_SESSION_VERSION = 3;

/** v1 -> v2: add the transpose slice with defaults. Copy-on-write,
 *  never mutates, and tolerates a payload with no fields at all
 *  (fresh installs never reach this - zustand only migrates when a
 *  stored envelope exists). */
export const sessionV1ToV2: DataMigration = {
  from: 1,
  to: 2,
  up: (data: unknown): unknown => {
    const base =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    return {
      ...base,
      exerciseTranspose:
        typeof base.exerciseTranspose === "number" &&
        Number.isFinite(base.exerciseTranspose)
          ? base.exerciseTranspose
          : 0,
      keyCycleActive:
        typeof base.keyCycleActive === "boolean" ? base.keyCycleActive : false,
      version: 2,
    };
  },
};

/** v2 -> v3 (PRD-001 Phase 3 Slice 2, D23): add the etude constraints
 *  slice with a null default. Same copy-on-write shape as v1 -> v2;
 *  an existing etudeConstraints value (however produced) is preserved
 *  verbatim - the store's own validation owns its shape. */
export const sessionV2ToV3: DataMigration = {
  from: 2,
  to: 3,
  up: (data: unknown): unknown => {
    const base =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    return {
      ...base,
      etudeConstraints:
        "etudeConstraints" in base ? base.etudeConstraints : null,
      version: 3,
    };
  },
};

export const SESSION_MIGRATIONS: readonly DataMigration[] = [
  sessionV1ToV2,
  sessionV2ToV3,
];

export function createSessionRunner<T = unknown>(): MigrationRunner<T> {
  return createMigrationRunner<T>({
    migrations: SESSION_MIGRATIONS,
    currentVersion: CURRENT_SESSION_VERSION,
  });
}

export { createMigrationRunner, validateMigrationChain } from "./runner";
export type { MigrationRunnerOptions } from "./runner";
export type {
  DataMigration,
  MigrationOutcome,
  MigrationRunner,
} from "./types";
