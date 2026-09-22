/**
 * engine/migrations/index.ts - Phase 0 registry (skeleton).
 * Baseline v1: no upgrades exist yet; the chain is empty and the
 * runner is exercised by tests only. Phase 1 wires this to the
 * zustand persist `migrate` callback for key "hse.session".
 */

import type { DataMigration, MigrationRunner } from "./types";
import { createMigrationRunner } from "./runner";

export const CURRENT_SESSION_VERSION = 1;
export const SESSION_MIGRATIONS: readonly DataMigration[] = [];

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
