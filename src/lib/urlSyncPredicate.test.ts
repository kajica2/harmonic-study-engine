/**
 * src/lib/urlSyncPredicate.test.ts - PRD-001 Phase 3 Slice 2 fix
 * round (TESTER GAP-1).
 *
 * Node project (pure logic, no DOM). Pins BOTH directions of the
 * debounced URL writer's subscription predicate: a change to any
 * tracked term (mode / globalTranspose / etudeConstraints) MUST fire,
 * and unrelated store churn MUST NOT. Before the extraction the
 * predicate lived only in App's subscription and deleting the
 * etudeConstraints term was silent.
 */

import { describe, it, expect } from "vitest";
import {
  shouldScheduleUrlWrite,
  type UrlSyncSnapshot,
} from "./urlSyncPredicate";
import { DEFAULT_ETUDE_CONSTRAINTS } from "./etudeEngine";
import type { EtudeConstraints } from "../../engine/etude/types";
import { EMPTY_OVERRIDES, MIXER_DEFAULTS } from "../../engine/compose/types";
import type { ComposeSession } from "../state/sessionStore";

function snap(over: Partial<UrlSyncSnapshot> = {}): UrlSyncSnapshot {
  return {
    mode: "etude",
    globalTranspose: 0,
    etudeConstraints: null,
    composeSession: null,
    ...over,
  };
}

const SESSION_A = {
  fileName: "a.mid",
  fileHash: null,
  overrides: EMPTY_OVERRIDES,
  analyzeFull: false,
} satisfies ComposeSession;
const SESSION_B = { ...SESSION_A, fileName: "b.mid" };

const C7: EtudeConstraints = { ...DEFAULT_ETUDE_CONSTRAINTS, seed: 7 };
const C8: EtudeConstraints = { ...DEFAULT_ETUDE_CONSTRAINTS, seed: 8 };

describe("shouldScheduleUrlWrite - tracked terms fire (GAP-1)", () => {
  it("an etudeConstraints change fires in BOTH directions", () => {
    // null -> constraints (boot URL restore, accept echo, reroll).
    expect(shouldScheduleUrlWrite(snap(), snap({ etudeConstraints: C7 }))).toBe(true);
    // constraints -> null (resetModeSlice / Discard).
    expect(shouldScheduleUrlWrite(snap({ etudeConstraints: C7 }), snap())).toBe(true);
    // constraints -> DIFFERENT constraints (seed change => new URL).
    expect(
      shouldScheduleUrlWrite(
        snap({ etudeConstraints: C7 }),
        snap({ etudeConstraints: C8 }),
      ),
    ).toBe(true);
  });

  it("mode changes fire (including the null legacy state)", () => {
    expect(shouldScheduleUrlWrite(snap(), snap({ mode: "compose" }))).toBe(true);
    expect(shouldScheduleUrlWrite(snap(), snap({ mode: null }))).toBe(true);
    expect(shouldScheduleUrlWrite(snap({ mode: null }), snap({ mode: "etude" }))).toBe(true);
  });

  it("a composeSession change fires in BOTH directions (D86)", () => {
    expect(shouldScheduleUrlWrite(snap(), snap({ composeSession: SESSION_A }))).toBe(true);
    expect(shouldScheduleUrlWrite(snap({ composeSession: SESSION_A }), snap())).toBe(true);
    expect(
      shouldScheduleUrlWrite(
        snap({ composeSession: SESSION_A }),
        snap({ composeSession: SESSION_B }),
      ),
    ).toBe(true);
    // A mixer patch REPLACES the session object -> fires.
    expect(
      shouldScheduleUrlWrite(
        snap({ composeSession: SESSION_A }),
        snap({ composeSession: { ...SESSION_A, mixer: MIXER_DEFAULTS } }),
      ),
    ).toBe(true);
  });

  it("globalTranspose changes fire", () => {
    expect(shouldScheduleUrlWrite(snap(), snap({ globalTranspose: -2 }))).toBe(true);
    expect(shouldScheduleUrlWrite(snap({ globalTranspose: 12 }), snap({ globalTranspose: 0 }))).toBe(true);
  });
});

describe("shouldScheduleUrlWrite - untracked churn stays quiet (GAP-1)", () => {
  it("an unrelated store-state change does NOT fire", () => {
    const prev = snap({ etudeConstraints: C7 });
    // Simulates the FULL zustand state: extra fields (dirty,
    // pendingModeRequest, ...) are outside the tracked slice and must
    // never schedule a write. (A whole-state comparison like
    // `s !== prev` would fail this pin.)
    const next = { ...prev, dirty: { compose: "none", etude: "pending", explore: "none" } };
    expect(shouldScheduleUrlWrite(prev, next)).toBe(false);
  });

  it("an identical snapshot does NOT fire", () => {
    const s = snap({ etudeConstraints: C7 });
    expect(shouldScheduleUrlWrite(s, s)).toBe(false);
    expect(shouldScheduleUrlWrite(s, snap({ etudeConstraints: C7 }))).toBe(false);
  });

  it("value-equal but REPLACED constraints DO fire (reference contract, documented)", () => {
    // The store replaces the object on every set; identity change is
    // the contract (see module header - idempotent debounced writer).
    expect(
      shouldScheduleUrlWrite(
        snap({ etudeConstraints: C7 }),
        snap({ etudeConstraints: { ...C7 } }),
      ),
    ).toBe(true);
  });
});
