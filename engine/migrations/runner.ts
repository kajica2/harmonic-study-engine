/**
 * engine/migrations/runner.ts - PRD 11.3 sequential application with
 * best-effort read-only fallback on failure.
 */

import type {
  DataMigration,
  MigrationOutcome,
  MigrationRunner,
} from "./types";

/** Returns null when the chain is valid, else a human-readable fault. */
export function validateMigrationChain(
  migrations: readonly DataMigration[],
  currentVersion: number,
): string | null {
  let expected = 1; // baseline shipped shape is version 1
  for (const m of migrations) {
    if (m.from !== expected) {
      return `chain gap: expected from=${expected}, got from=${m.from}`;
    }
    if (m.to !== m.from + 1) {
      return `non-sequential step: ${m.from}->${m.to}`;
    }
    expected = m.to;
  }
  if (expected > currentVersion) {
    return `chain overshoots currentVersion=${currentVersion}`;
  }
  return null;
}

export interface MigrationRunnerOptions {
  /** Ascending, contiguous 1..currentVersion chain (empty at baseline). */
  readonly migrations: readonly DataMigration[];
  readonly currentVersion: number;
  /**
   * Version assumed for payloads with no integer `version` field.
   * Defaults to 1 - matches existing hse.* data written pre-runner.
   */
  readonly assumeVersion?: number;
}

export function createMigrationRunner<T = unknown>(
  opts: MigrationRunnerOptions,
): MigrationRunner<T> {
  const assumeVersion = opts.assumeVersion ?? 1;
  // Validate the chain ONCE at construction. A cyclic or downgrade
  // chain (e.g. [{from:1,to:2},{from:2,to:1}]) would otherwise spin
  // run()'s while-loop forever as cv oscillates.
  const chainFault = validateMigrationChain(
    opts.migrations,
    opts.currentVersion,
  );

  function run(raw: unknown): MigrationOutcome<T> {
    // Pre-loop failures report the caller's object BY REFERENCE:
    // nothing has executed yet, so it cannot have been mutated.
    const fail = (error: string): MigrationOutcome<T> => ({
      ok: false,
      readOnly: true,
      value: raw as T,
      error,
    });

    if (chainFault !== null) return fail(chainFault);

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return fail("payload is not a plain object");
    }
    const stored = (raw as Record<string, unknown>).version;
    const version =
      typeof stored === "number" && Number.isInteger(stored) && stored >= 1
        ? stored
        : assumeVersion;

    if (version > opts.currentVersion) {
      return fail(
        `stored version ${version} is newer than app version ${opts.currentVersion}`,
      );
    }

    // Snapshot the pristine payload immediately before the chain loop
    // (PRD 11.3): if a mid-chain up() violates copy-on-write and
    // mutates the caller's object, failures still report the
    // pre-mutation shape by VALUE. An unserializable payload cannot
    // have been mutated yet - nothing has run - so falling back to the
    // raw reference is safe.
    let pristine: unknown;
    try {
      pristine = JSON.parse(JSON.stringify(raw));
    } catch {
      pristine = raw;
    }
    // Mid-chain failures: return the snapshot, never the (possibly
    // mutated) caller object.
    const failMidChain = (error: string): MigrationOutcome<T> => ({
      ok: false,
      readOnly: true,
      value: pristine as T,
      error,
    });

    const applied: number[] = [];
    let cur: unknown = raw;
    let cv = version;
    while (cv < opts.currentVersion) {
      const step = opts.migrations.find((m) => m.from === cv);
      if (!step) return failMidChain(`no migration path from version ${cv}`);
      let next: unknown;
      try {
        next = step.up(cur);
      } catch (e) {
        return failMidChain(`migration ${step.from}->${step.to} threw: ${String(e)}`);
      }
      if (typeof next !== "object" || next === null) {
        return failMidChain(`migration ${step.from}->${step.to} returned non-object`);
      }
      const nv = (next as Record<string, unknown>).version;
      if (nv !== step.to) {
        return failMidChain(
          `migration ${step.from}->${step.to} produced version ${String(nv)}`,
        );
      }
      cur = next;
      cv = step.to;
      applied.push(step.to);
    }
    return { ok: true, value: cur as T, applied };
  }

  return { currentVersion: opts.currentVersion, run };
}
