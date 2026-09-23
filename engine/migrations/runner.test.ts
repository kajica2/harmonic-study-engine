/**
 * engine/migrations/runner.test.ts - pins REQ-FND-5, PRD 11.3,
 * REQ-NFR-5 (the runner never throws and never logs).
 */

import { describe, it, expect } from "vitest";
import { createMigrationRunner, validateMigrationChain } from "./runner";
import type { DataMigration } from "./types";
import { CURRENT_SESSION_VERSION, SESSION_MIGRATIONS, createSessionRunner } from "./index";

const up2 = (data: unknown): unknown => {
  const d = data as Record<string, unknown>;
  return { ...d, version: 2, renamed: d.oldName };
};
const up3 = (data: unknown): unknown => {
  const d = data as Record<string, unknown>;
  return { ...d, version: 3, list: [...(d.list as number[]), 3] };
};
const CHAIN_1_2_3: readonly DataMigration[] = [
  { from: 1, to: 2, up: up2 },
  { from: 2, to: 3, up: up3 },
];

describe("validateMigrationChain", () => {
  it("accepts the empty baseline chain and a contiguous chain", () => {
    expect(validateMigrationChain([], 1)).toBeNull();
    expect(validateMigrationChain(CHAIN_1_2_3, 3)).toBeNull();
  });

  it("detects a gap at the start of the chain", () => {
    expect(validateMigrationChain([{ from: 2, to: 3, up: up3 }], 3)).toContain("chain gap");
  });

  it("detects a non-sequential step", () => {
    expect(validateMigrationChain([{ from: 1, to: 3, up: up3 }], 3)).toContain("non-sequential");
  });

  it("detects a chain overshooting currentVersion", () => {
    expect(validateMigrationChain(CHAIN_1_2_3, 2)).toContain("overshoots");
  });
});

describe("createMigrationRunner", () => {
  it("passes a current-version payload through untouched (empty chain)", () => {
    const runner = createMigrationRunner<{ version: number }>({
      migrations: [],
      currentVersion: 1,
    });
    const raw = { version: 1, a: 1 };
    const out = runner.run(raw);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value).toBe(raw);
      expect(out.applied).toEqual([]);
    }
  });

  it("applies a 1->2->3 chain in order", () => {
    const runner = createMigrationRunner<Record<string, unknown>>({
      migrations: CHAIN_1_2_3,
      currentVersion: 3,
    });
    const out = runner.run({ version: 1, oldName: "x", list: [1, 2] });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.applied).toEqual([2, 3]);
      expect(out.value).toEqual({
        version: 3,
        oldName: "x",
        renamed: "x",
        list: [1, 2, 3],
      });
    }
  });

  it("assumes version 1 for payloads without an integer version", () => {
    const runner = createMigrationRunner({ migrations: [], currentVersion: 1 });
    expect(runner.run({ hello: "world" }).ok).toBe(true);
    const upgraded = createMigrationRunner<Record<string, unknown>>({
      migrations: CHAIN_1_2_3,
      currentVersion: 3,
    }).run({ oldName: "y", list: [1] });
    expect(upgraded.ok).toBe(true);
    if (upgraded.ok) expect(upgraded.applied).toEqual([2, 3]);
  });

  it("honors a custom assumeVersion", () => {
    const runner = createMigrationRunner({
      migrations: CHAIN_1_2_3,
      currentVersion: 3,
      assumeVersion: 3,
    });
    const out = runner.run({ nothing: "here" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.applied).toEqual([]);
  });

  it("degrades to readOnly for a newer-than-app payload", () => {
    const runner = createMigrationRunner({ migrations: [], currentVersion: 1 });
    const raw = { version: 2 };
    const out = runner.run(raw);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.readOnly).toBe(true);
      expect(out.value).toBe(raw);
      expect(out.error).toContain("newer");
    }
  });

  it("degrades to readOnly when no step exists for the stored version", () => {
    // Chain is structurally VALID (1->2 contiguous, no overshoot of
    // currentVersion=4) but simply stops below currentVersion, so the
    // stored version 3 has no outgoing step: exercises the mid-chain
    // "no migration path" branch, not construction-time rejection.
    const runner = createMigrationRunner({
      migrations: [{ from: 1, to: 2, up: up2 }],
      currentVersion: 4,
    });
    const out = runner.run({ version: 3 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("no migration path");
  });

  it("rejects a structurally invalid chain at construction, before any up()", () => {
    const runner = createMigrationRunner({
      migrations: [{ from: 5, to: 6, up: up2 }],
      currentVersion: 6,
    });
    const raw = { version: 1 };
    const out = runner.run(raw);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain("chain gap");
      expect(out.value).toBe(raw); // pre-loop: raw by reference
    }
  });

  it("returns readOnly immediately for a cyclic/downgrade chain (no hang)", () => {
    // Without construction-time validation this chain spins run()'s
    // loop forever (cv oscillates 1<->2 under currentVersion=3): the
    // test would time out. The validator flags 2->1 as non-sequential.
    const cyclic: readonly DataMigration[] = [
      { from: 1, to: 2, up: (d) => ({ ...(d as Record<string, unknown>), version: 2 }) },
      { from: 2, to: 1, up: (d) => ({ ...(d as Record<string, unknown>), version: 1 }) },
    ];
    const runner = createMigrationRunner({ migrations: cyclic, currentVersion: 3 });
    const raw = { version: 1 };
    const out = runner.run(raw);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.readOnly).toBe(true);
      expect(out.value).toBe(raw);
      expect(out.error).toContain("non-sequential");
    }
  });

  it("reports the ORIGINAL payload when up() throws and never mutates input itself", () => {
    const boom = (data: unknown): unknown => {
      // deliberately hostile migration: mutates then throws; the runner
      // must discard all partial progress and report the pre-chain shape.
      (data as Record<string, unknown>).sideEffect = true;
      throw new Error("boom");
    };
    const runner = createMigrationRunner<Record<string, unknown>>({
      migrations: [{ from: 1, to: 2, up: boom }],
      currentVersion: 2,
    });
    const raw = { version: 1, keep: true };
    const pristineDeepCopy = { version: 1, keep: true };
    const out = runner.run(raw);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      // Content assertion (not reference identity): the snapshot taken
      // before the loop must carry no side effect the hostile up()
      // wrote into the caller's object.
      expect(out.value).toEqual(pristineDeepCopy);
      expect(out.error).toContain("threw");
      expect(out.error).toContain("boom");
    }
    // The leak is real: up() DID mutate the caller's object, so only
    // the runner's pre-loop snapshot can vouch for PRD 11.3 here.
    expect(raw).toEqual({ version: 1, keep: true, sideEffect: true });
  });

  it("reports the pristine snapshot when a mid-chain up() mutates and a LATER step fails", () => {
    const leakyUp = (data: unknown): unknown => {
      // Violates copy-on-write: mutates its input, then returns a
      // valid v2 object so the chain continues to the next step.
      const d = data as Record<string, unknown>;
      d.sideEffect = true;
      return { ...d, version: 2 };
    };
    const lateBoom = (): unknown => {
      throw new Error("late boom");
    };
    const runner = createMigrationRunner<Record<string, unknown>>({
      migrations: [
        { from: 1, to: 2, up: leakyUp },
        { from: 2, to: 3, up: lateBoom },
      ],
      currentVersion: 3,
    });
    const raw = { version: 1, keep: true };
    const pristineDeepCopy = { version: 1, keep: true };
    const out = runner.run(raw);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      // Value identity survives: a mutating up() followed by a later
      // failure must still yield the pre-chain content, not the
      // now-mutated caller object.
      expect(out.value).toEqual(pristineDeepCopy);
      expect(out.error).toContain("late boom");
    }
    expect(raw).toEqual({ version: 1, keep: true, sideEffect: true });
  });

  it("does not mutate the input payload on a successful chain (copy-on-write)", () => {
    const raw = { version: 1, oldName: "x", list: [1, 2] };
    const before = JSON.stringify(raw);
    const runner = createMigrationRunner({ migrations: CHAIN_1_2_3, currentVersion: 3 });
    runner.run(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("degrades to readOnly when up() returns the wrong version or a non-object", () => {
    const wrongVersion: DataMigration = {
      from: 1,
      to: 2,
      up: (d) => ({ ...(d as object), version: 99 }),
    };
    const out1 = createMigrationRunner({ migrations: [wrongVersion], currentVersion: 2 }).run({
      version: 1,
    });
    expect(out1.ok).toBe(false);
    if (!out1.ok) expect(out1.error).toContain("produced version 99");

    const nonObject: DataMigration = { from: 1, to: 2, up: () => "nope" };
    const out2 = createMigrationRunner({ migrations: [nonObject], currentVersion: 2 }).run({
      version: 1,
    });
    expect(out2.ok).toBe(false);
    if (!out2.ok) expect(out2.error).toContain("non-object");
  });

  it("rejects non-object payloads without throwing", () => {
    const runner = createMigrationRunner({ migrations: [], currentVersion: 1 });
    for (const input of [null, "str", 42, [1, 2]]) {
      const out = runner.run(input);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.readOnly).toBe(true);
    }
  });

  it("never throws for any malformed input", () => {
    const runner = createMigrationRunner({ migrations: CHAIN_1_2_3, currentVersion: 3 });
    for (const input of [undefined, null, 0, "", [], {}, { version: 0 }, { version: 1.5 }, { version: 4 }]) {
      expect(() => runner.run(input)).not.toThrow();
    }
  });
});

describe("session registry (Phase 2 + Slice 2: v1 -> v2 -> v3)", () => {
  it("current is version 3 with a contiguous 1->2->3 chain", () => {
    expect(CURRENT_SESSION_VERSION).toBe(3);
    expect(validateMigrationChain(SESSION_MIGRATIONS, CURRENT_SESSION_VERSION)).toBeNull();
    expect(SESSION_MIGRATIONS.map((m) => [m.from, m.to])).toEqual([[1, 2], [2, 3]]);
  });

  it("createSessionRunner upgrades a v1 payload to v3 with defaults", () => {
    const out = createSessionRunner<{
      version: number;
      exerciseTranspose?: number;
      keyCycleActive?: boolean;
      etudeConstraints?: unknown;
    }>().run({ version: 1 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.version).toBe(3);
      expect(out.value.exerciseTranspose).toBe(0);
      expect(out.value.keyCycleActive).toBe(false);
      expect(out.value.etudeConstraints).toBeNull();
    }
  });

  it("v2 -> v3 seeds etudeConstraints null and preserves a present value", () => {
    const bare = createSessionRunner<{
      version: number;
      etudeConstraints?: unknown;
    }>().run({ version: 2, mode: "etude" });
    expect(bare.ok).toBe(true);
    if (bare.ok) {
      expect(bare.value.version).toBe(3);
      expect(bare.value.etudeConstraints).toBeNull();
      expect(bare.value.mode).toBe("etude");
    }
    const carried = createSessionRunner<{
      version: number;
      etudeConstraints?: unknown;
    }>().run({ version: 2, etudeConstraints: { version: 1, seed: 7 } });
    expect(carried.ok).toBe(true);
    if (carried.ok) {
      expect(carried.value.etudeConstraints).toEqual({ version: 1, seed: 7 });
    }
  });
});
