/**
 * src/state/sessionStore.test.ts - PRD-001 Phase 1 mode slice +
 * Phase 3 Slice 2 etude slice (T8) + Phase 4 Slice 2 compose slice
 * (D57).
 *
 * Pins the requestMode / resolveDirty state machine, the persist
 * round-trip (mode / globalTranspose / currentIdea / etudeConstraints
 * survive reload, dirty + pendingModeRequest do NOT), the acceptEtude
 * dirty shape (D30 - byte-equal to the handleCoComposeAccept literal),
 * the v2 -> v3 -> v4 migration through the REAL runner, and that the
 * legacy `synesthesia_*` keys are never touched. The Phase 4 block
 * pins the compose slice: partialize EXCLUDES the 30MB project +
 * analysis + undo stacks, the snapshot-undo semantics (cap 32), and
 * the analyzeFull recompute.
 *
 * Runs under jsdom per JSDOM_FILES in vitest.config.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSessionStore,
  SESSION_STORAGE_KEY,
  CURRENT_SESSION_VERSION,
  COMPOSE_UNDO_CAP,
  isMode,
  MODES,
  resolveEffectiveMode,
  resolveBootTranspose,
} from "./sessionStore";
import { useSessionStore as useLegacySessionStore } from "../hooks/useSessionStore";
import { createSessionRunner } from "../../engine/migrations";
import { analyzeProject } from "../../engine/compose";
import {
  EMPTY_OVERRIDES,
  type AnalysisOverrides,
  type NormalizedNote,
  type NormalizedProject,
} from "../../engine/compose/types";
import { K } from "../lib/storage";
import { ideaFromChord } from "../../engine/core/idea";
import type { EtudeConstraints } from "../../engine/etude/types";

const STORE_API = useSessionStore.getState;

beforeEach(() => {
  localStorage.clear();
  // Reset to defaults so order-independent tests see the same starting
  // point (zustand persist rehydrates asynchronously - awaiting it
  // here would couple every test to the microtask queue).
  useSessionStore.getState().resetModeSlice();
});

describe("basic setters", () => {
  it("setMode updates the mode", () => {
    STORE_API().setMode("compose");
    expect(STORE_API().mode).toBe("compose");
  });

  it("setMode(null) returns to legacy / first-run state", () => {
    STORE_API().setMode("etude");
    STORE_API().setMode(null);
    expect(STORE_API().mode).toBeNull();
  });

  it("setGlobalTranspose clamps into [-24, 24]", () => {
    STORE_API().setGlobalTranspose(48);
    expect(STORE_API().globalTranspose).toBe(24);
    STORE_API().setGlobalTranspose(-99);
    expect(STORE_API().globalTranspose).toBe(-24);
    STORE_API().setGlobalTranspose(7);
    expect(STORE_API().globalTranspose).toBe(7);
  });

  it("setCurrentIdea stores and clears an Idea", () => {
    const idea = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
    STORE_API().setCurrentIdea(idea);
    expect(STORE_API().currentIdea).toEqual(idea);
    STORE_API().setCurrentIdea(null);
    expect(STORE_API().currentIdea).toBeNull();
  });
});

describe("requestMode / resolveDirty state machine", () => {
  it("clean request: requestMode commits immediately", () => {
    STORE_API().setMode("etude");
    STORE_API().requestMode("compose");
    expect(STORE_API().mode).toBe("compose");
    expect(STORE_API().pendingModeRequest).toBeNull();
  });

  it("no-op when target equals current mode", () => {
    STORE_API().setMode("etude");
    STORE_API().requestMode("etude");
    expect(STORE_API().mode).toBe("etude");
    expect(STORE_API().pendingModeRequest).toBeNull();
  });

  it("dirty etude: requestMode parks on pendingModeRequest, does NOT switch", () => {
    STORE_API().setMode("etude");
    // Direct dirty mutation is the Phase 1 Etude dirty trigger (R7:
    // setHarmonicStep will dispatch the event in App.tsx). For state
    // machine testing we can poke the slice directly.
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
    });
    STORE_API().requestMode("explore");
    expect(STORE_API().mode).toBe("etude");
    expect(STORE_API().pendingModeRequest).toBe("explore");
  });

  it("resolveDirty(save) -> saveCurrentIdea + mode switch", () => {
    STORE_API().setMode("etude");
    const idea = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
    STORE_API().setCurrentIdea(idea);
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
      pendingModeRequest: "explore",
    });
    STORE_API().resolveDirty("save");
    expect(STORE_API().mode).toBe("explore");
    expect(STORE_API().pendingModeRequest).toBeNull();
    // saveCurrentIdea clears dirty but the in-memory currentIdea stays
    // - the saved idea is now mirrored to hse.ideas.
    expect(STORE_API().currentIdea).not.toBeNull();
    expect(STORE_API().currentIdea?.chord).toBe("Cmaj7");
    const stored = JSON.parse(localStorage.getItem("hse.ideas") as string);
    expect(stored).toHaveLength(1);
    expect(stored[0].chord).toBe("Cmaj7");
  });

  it("resolveDirty(cancel) -> stays on current mode, clears pending", () => {
    STORE_API().setMode("etude");
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
      pendingModeRequest: "explore",
    });
    STORE_API().resolveDirty("cancel");
    expect(STORE_API().mode).toBe("etude");
    expect(STORE_API().pendingModeRequest).toBeNull();
  });

  it("resolveDirty(discard) -> fires window event + mode switch", () => {
    STORE_API().setMode("etude");
    const idea = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);
    STORE_API().setCurrentIdea(idea);
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
      pendingModeRequest: "explore",
    });
    let fired = 0;
    const onRevert = () => {
      fired++;
    };
    window.addEventListener("hse:revert-last-accept", onRevert);
    try {
      STORE_API().resolveDirty("discard");
    } finally {
      window.removeEventListener("hse:revert-last-accept", onRevert);
    }
    expect(fired).toBe(1);
    expect(STORE_API().mode).toBe("explore");
    expect(STORE_API().currentIdea).toBeNull();
  });

  it("compose / explore modes are always-clean (Phase 1 ADR-007)", () => {
    STORE_API().setMode("compose");
    // Poking dirty.etude to a non-clean value doesn't block Compose
    // (we always read the CURRENT mode's dirty slot, which is Compose
    // = 'none' in Phase 1). requestMode from Compose still commits.
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
    });
    STORE_API().requestMode("etude");
    expect(STORE_API().mode).toBe("etude");
    expect(STORE_API().pendingModeRequest).toBeNull();
  });
});

describe("saveCurrentIdea", () => {
  it("appends to hse.ideas and caps at 100", () => {
    // Seed with 100 placeholder Ideas.
    const seed = Array.from({ length: 100 }, (_, i) =>
      ideaFromChord("etude", `C${i}`, 1, i),
    );
    localStorage.setItem("hse.ideas", JSON.stringify(seed));
    const fresh = ideaFromChord("etude", "FRESH", 1_700_000_000_000, 0);
    STORE_API().setCurrentIdea(fresh);
    STORE_API().saveCurrentIdea();
    const raw = localStorage.getItem("hse.ideas");
    expect(raw).toBeTruthy();
    const list = JSON.parse(raw as string);
    expect(list).toHaveLength(100);
    expect(list[list.length - 1].chord).toBe("FRESH");
    expect(list[0].chord).toBe("C1"); // oldest of the 100 seed entries survives
  });

  it("does NOT throw on a corrupted hse.ideas value (recovers to [])", () => {
    localStorage.setItem("hse.ideas", "{not json");
    const fresh = ideaFromChord("etude", "RECOVER", 1_700_000_000_000, 0);
    STORE_API().setCurrentIdea(fresh);
    expect(() => STORE_API().saveCurrentIdea()).not.toThrow();
    // After recovery, the fresh idea is appended; the corrupted value
    // was overwritten.
    const list = JSON.parse(localStorage.getItem("hse.ideas") as string);
    expect(list).toHaveLength(1);
    expect(list[0].chord).toBe("RECOVER");
  });

  it("is a no-op when currentIdea is null", () => {
    STORE_API().setCurrentIdea(null);
    STORE_API().saveCurrentIdea();
    expect(localStorage.getItem("hse.ideas")).toBeNull();
  });
});

describe("persistence", () => {
  it("writes the canonical key on first state change", () => {
    STORE_API().setMode("etude");
    // zustand persist writes async; the synchronous read might still
    // be null on the first call, so we re-set a value to force a write.
    STORE_API().setGlobalTranspose(2);
    // Wait one microtask cycle so zustand's async write settles.
    return Promise.resolve().then(() => {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      expect(raw).toBeTruthy();
      // The KEY is `hse.session` (the localStorage key); the JSON
      // value carries `state.mode` etc.
      expect(SESSION_STORAGE_KEY).toBe("hse.session");
      expect(raw).toContain("etude");
      expect(raw).toContain("globalTranspose");
    });
  });

  it("does NOT touch any synesthesia_* legacy key", () => {
    STORE_API().setMode("compose");
    STORE_API().setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1, 0));
    STORE_API().setGlobalTranspose(3);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("synesthesia_")) {
        throw new Error(
          `sessionStore must not write to legacy key ${k} (Phase 1.5 migrates those)`,
        );
      }
    }
  });
});

describe("isMode / MODES / resolveEffectiveMode helpers", () => {
  it("isMode accepts the 3 known literals only", () => {
    expect(isMode("compose")).toBe(true);
    expect(isMode("etude")).toBe(true);
    expect(isMode("explore")).toBe(true);
    expect(isMode("wat")).toBe(false);
    expect(isMode("")).toBe(false);
  });

  it("MODES preserves display order", () => {
    expect(MODES).toEqual(["compose", "etude", "explore"]);
  });

  it("resolveEffectiveMode falls back to etude for legacy / null", () => {
    expect(resolveEffectiveMode(null)).toBe("etude");
    expect(resolveEffectiveMode("compose")).toBe("compose");
    // URL bootstrap: vitest jsdom has no real URLSearchParams unless
    // we set location, so we only verify the stored branch here. URL
    // branch is covered by the integration smoke in the report.
    window.history.replaceState({}, "", "/?mode=explore");
    expect(resolveEffectiveMode(null)).toBe("explore");
    window.history.replaceState({}, "", "/");
  });
});

// ---------------------------------------------------------------------------
// PRD-001 Phase 2 - transpose slice (D10 / D13 / D15)
// ---------------------------------------------------------------------------

describe("Phase 2: exercise transpose clamp (D10)", () => {
  it("setExerciseTranspose clamps into [-12, 12]", () => {
    STORE_API().setExerciseTranspose(30);
    expect(STORE_API().exerciseTranspose).toBe(12);
    STORE_API().setExerciseTranspose(-30);
    expect(STORE_API().exerciseTranspose).toBe(-12);
    STORE_API().setExerciseTranspose(5);
    expect(STORE_API().exerciseTranspose).toBe(5);
  });

  it("nudgeExerciseTranspose clamps the accumulated result", () => {
    STORE_API().setExerciseTranspose(10);
    STORE_API().nudgeExerciseTranspose(5);
    expect(STORE_API().exerciseTranspose).toBe(12);
    STORE_API().setExerciseTranspose(-10);
    STORE_API().nudgeExerciseTranspose(-5);
    expect(STORE_API().exerciseTranspose).toBe(-12);
  });

  it("advanceKeyCycle rotates +1 mod 12 and wraps 11 -> 0", () => {
    STORE_API().setExerciseTranspose(11);
    STORE_API().advanceKeyCycle();
    expect(STORE_API().exerciseTranspose).toBe(0);
    STORE_API().setExerciseTranspose(4);
    STORE_API().advanceKeyCycle();
    expect(STORE_API().exerciseTranspose).toBe(5);
  });

  it("advanceKeyCycle NEVER touches dirty (D13 structural pin)", () => {
    STORE_API().setMode("etude");
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
    });
    STORE_API().setExerciseTranspose(2);
    STORE_API().advanceKeyCycle();
    expect(STORE_API().exerciseTranspose).toBe(3);
    expect(STORE_API().dirty.etude).toBe("etude-pending-accept");
  });

  it("advanceKeyCycle from all-clean dirty never SETS dirty (D13 complement)", () => {
    // The pin above proves the cycle cannot CLOBBER a dirty value;
    // this one proves the other direction: starting from all-'none'
    // (clean), advanceKeyCycle must not mark any mode dirty
    // (view transform, not a composition edit).
    STORE_API().setMode("etude");
    useSessionStore.setState({
      dirty: { compose: "none", etude: "none", explore: "none" },
    });
    STORE_API().advanceKeyCycle();
    // The rotation itself happened (0 -> 1), so the action ran.
    expect(STORE_API().exerciseTranspose).toBe(1);
    expect(STORE_API().dirty).toEqual({
      compose: "none",
      etude: "none",
      explore: "none",
    });
  });

  it("keyCycleActive toggles independently of the offset", () => {
    expect(STORE_API().keyCycleActive).toBe(false);
    STORE_API().setKeyCycleActive(true);
    expect(STORE_API().keyCycleActive).toBe(true);
    STORE_API().setKeyCycleActive(false);
    expect(STORE_API().keyCycleActive).toBe(false);
  });

  it("resetModeSlice zeroes exerciseTranspose + keyCycleActive", () => {
    STORE_API().setExerciseTranspose(7);
    STORE_API().setKeyCycleActive(true);
    STORE_API().resetModeSlice();
    expect(STORE_API().exerciseTranspose).toBe(0);
    expect(STORE_API().keyCycleActive).toBe(false);
    expect(STORE_API().globalTranspose).toBe(0);
  });
});

describe("Phase 2: resolveBootTranspose precedence (D10)", () => {
  it("URL wins over persisted + legacy", () => {
    expect(
      resolveBootTranspose({ urlValue: "2", persistedValue: 5, legacyValue: "9" }),
    ).toBe(2);
  });

  it("persisted wins over legacy when URL absent", () => {
    expect(
      resolveBootTranspose({ urlValue: null, persistedValue: 5, legacyValue: "9" }),
    ).toBe(5);
  });

  it("legacy synesthesia_transposeShift adopted only when > 0", () => {
    expect(
      resolveBootTranspose({ urlValue: null, persistedValue: null, legacyValue: "3" }),
    ).toBe(3);
    // A stored 0 must NOT be adopted as a "preference" - it is the
    // default, and adopting it would shadow nothing. But a NEGATIVE
    // legacy value is ignored (only > 0 is adopted per D10).
    expect(
      resolveBootTranspose({ urlValue: null, persistedValue: null, legacyValue: "-5" }),
    ).toBe(0);
    expect(
      resolveBootTranspose({ urlValue: null, persistedValue: null, legacyValue: "0" }),
    ).toBe(0);
  });

  it("URL non-finite falls through to persisted", () => {
    expect(
      resolveBootTranspose({ urlValue: "abc", persistedValue: 4, legacyValue: null }),
    ).toBe(4);
  });

  it("clamps the resolved value into [-24, 24]", () => {
    expect(
      resolveBootTranspose({ urlValue: "999", persistedValue: null, legacyValue: null }),
    ).toBe(24);
    expect(
      resolveBootTranspose({ urlValue: "-999", persistedValue: null, legacyValue: null }),
    ).toBe(-24);
  });

  it("all-absent resolves to 0", () => {
    expect(
      resolveBootTranspose({ urlValue: null, persistedValue: null, legacyValue: null }),
    ).toBe(0);
  });
});

describe("Phase 2: v1 -> v2 migration through the real runner", () => {
  it("adds exerciseTranspose + keyCycleActive defaults to a v1 payload", () => {
    const runner = createSessionRunner<Record<string, unknown>>();
    const out = runner.run({ version: 1, mode: "etude", globalTranspose: 3 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      // Phase 4 Slice 2 (D57): the chain is now 1->2->3->4, so a v1
      // payload lands at v4 and additionally gains composeSession:
      // null.
      expect(out.value.version).toBe(4);
      expect(out.value.exerciseTranspose).toBe(0);
      expect(out.value.keyCycleActive).toBe(false);
      expect(out.value.etudeConstraints).toBeNull();
      expect(out.value.composeSession).toBeNull();
      expect(out.value.mode).toBe("etude");
      expect(out.value.globalTranspose).toBe(3);
    }
  });

  it("preserves pre-existing transpose values on a malformed v1 payload", () => {
    const runner = createSessionRunner<Record<string, unknown>>();
    // A v1 payload that somehow already carries values keeps them.
    const out = runner.run({ version: 1, exerciseTranspose: 8, keyCycleActive: true });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.exerciseTranspose).toBe(8);
      expect(out.value.keyCycleActive).toBe(true);
    }
  });
});

describe("Phase 2: v2 persistence round-trip", () => {
  it("persists exerciseTranspose + keyCycleActive (dirty / pending do NOT)", async () => {
    STORE_API().setMode("etude");
    STORE_API().setExerciseTranspose(6);
    STORE_API().setKeyCycleActive(true);
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
      pendingModeRequest: "compose",
    });
    // Let zustand persist's async write settle.
    await Promise.resolve();
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(parsed.version).toBe(CURRENT_SESSION_VERSION);
    expect(parsed.state.exerciseTranspose).toBe(6);
    expect(parsed.state.keyCycleActive).toBe(true);
    // Session-scoped fields are NOT persisted.
    expect(parsed.state.dirty).toBeUndefined();
    expect(parsed.state.pendingModeRequest).toBeUndefined();
  });
});

describe("Phase 2: REQ-TRANS-7 no-bake proof", () => {
  it("mutating transposes + cycling never rewrites the paths payload", async () => {
    const seedPaths = [
      {
        id: "p1",
        title: "T",
        description: "d",
        steps: [{ name: "Cmaj7", notes: [60, 64, 67, 71], descriptions: "" }],
      },
    ];
    localStorage.setItem(K.paths, JSON.stringify(seedPaths));
    const before = localStorage.getItem(K.paths);

    // Drive transposes through the legacy bridge + the store + a full
    // cycle rotation; none of these may bake into the stored paths.
    const { result } = renderHook(() => useLegacySessionStore());
    act(() => result.current.setTransposeShift(4));
    STORE_API().setExerciseTranspose(2);
    for (let i = 0; i < 12; i++) STORE_API().advanceKeyCycle();
    await Promise.resolve();

    expect(localStorage.getItem(K.paths)).toBe(before);
    // The cycle is a view transform: the path steps are byte-identical.
    const parsed = JSON.parse(localStorage.getItem(K.paths) as string);
    expect(parsed[0].steps[0].notes).toEqual([60, 64, 67, 71]);
  });
});

// ---------------------------------------------------------------------------
// PRD-001 Phase 3 Slice 2 (T8): the etude constraints slice (D23/D30).
// ---------------------------------------------------------------------------

function etudeConstraints(
  over: Partial<EtudeConstraints> = {},
): EtudeConstraints {
  return {
    version: 1,
    styleId: "jazz",
    key: 0,
    mode: "major",
    difficulty: 3,
    bars: 8,
    tempo: null,
    seed: 42,
    harmony: {
      allowedQualities: null,
      allowedNumerals: null,
      startOn: null,
      endOn: null,
      requireChromaticism: false,
    },
    melody: {
      maxIntervalSemitones: null,
      chordTonesOnStrongBeats: false,
      range: null,
    },
    rhythm: { straightRhythmsOnly: false },
    ...over,
  };
}

describe("Phase 3 Slice 2: acceptEtude dirty semantics (D30)", () => {
  it("acceptEtude writes constraints + the EXACT handleCoComposeAccept dirty shape", () => {
    const c = etudeConstraints({ seed: 7 });
    STORE_API().acceptEtude(c);
    const s = STORE_API();
    expect(s.etudeConstraints).toEqual(c);
    // The literal below is grep-identical to App.tsx handleCoComposeAccept's
    // setState (compose/explore pinned to "none", etude pending accept).
    expect(s.dirty).toEqual({
      compose: "none",
      etude: "etude-pending-accept",
      explore: "none",
    });
  });

  it("setEtudeConstraints never touches dirty (boot-restore path)", () => {
    const c = etudeConstraints();
    STORE_API().setEtudeConstraints(c);
    expect(STORE_API().etudeConstraints).toEqual(c);
    expect(STORE_API().dirty.etude).toBe("none");
    STORE_API().setEtudeConstraints(null);
    expect(STORE_API().etudeConstraints).toBeNull();
    expect(STORE_API().dirty.etude).toBe("none");
  });

  it("resetModeSlice zeroes etudeConstraints", () => {
    STORE_API().acceptEtude(etudeConstraints());
    STORE_API().resetModeSlice();
    expect(STORE_API().etudeConstraints).toBeNull();
    expect(STORE_API().dirty.etude).toBe("none");
  });
});

describe("Phase 3 Slice 2: etude persistence round-trip (D23)", () => {
  it("constraints survive set -> clear-store -> rehydrate; dirty does NOT", async () => {
    const c = etudeConstraints({ seed: 1234, bars: 16 });
    STORE_API().acceptEtude(c);
    // Let zustand persist's write settle.
    await Promise.resolve();
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(parsed.version).toBe(CURRENT_SESSION_VERSION);
    expect(parsed.state.etudeConstraints).toEqual(c);
    // dirty is session-scoped - NOT persisted (ADR-007 re-derives it).
    expect(parsed.state.dirty).toBeUndefined();

    // Simulate a RELOAD: wipe in-memory state (this also re-writes the
    // envelope, so restore the captured one), then rehydrate.
    STORE_API().resetModeSlice();
    localStorage.setItem(SESSION_STORAGE_KEY, raw as string);
    expect(STORE_API().etudeConstraints).toBeNull();
    useSessionStore.persist.rehydrate();
    expect(STORE_API().etudeConstraints).toEqual(c);
    // dirty was NOT in the envelope - the fresh default survives.
    expect(STORE_API().dirty.etude).toBe("none");
  });

  it("v2 -> v3 -> v4 migration through the REAL runner seeds etudeConstraints null", () => {
    const out = createSessionRunner<{
      version: number;
      mode?: string;
      etudeConstraints?: unknown;
    }>().run({ version: 2, mode: "etude" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      // Phase 4 Slice 2 (D57): the chain continues to v4 (the runner
      // always lands at CURRENT_SESSION_VERSION).
      expect(out.value.version).toBe(4);
      expect(out.value.etudeConstraints).toBeNull();
      expect(out.value.mode).toBe("etude");
    }
  });
});
// ---------------------------------------------------------------------------
// PRD-001 Phase 4 Slice 2 (D57): the compose session slice.
// ---------------------------------------------------------------------------

/** Small pure fixture project (no DOM, no audio). `farNote` pushes
 *  endTick past the 4-minute default window (230400 ticks at 120 BPM
 *  ppq 480) so `truncated` flips on the analyzeFull recompute. */
function fixtureProject(opts: { farNote?: boolean } = {}): NormalizedProject {
  const notes: NormalizedNote[] = [];
  const prog = [60, 64, 67, 65, 69, 72, 67, 71, 74];
  let tick = 0;
  for (let i = 0; i < 27; i++) {
    notes.push({ midi: prog[i % 9], tick, durationTicks: 240, velocity: 0.8 });
    tick += 240;
  }
  let endTick = tick;
  if (opts.farNote === true) {
    notes.push({ midi: 60, tick: 300000, durationTicks: 240, velocity: 0.8 });
    endTick = 300240;
  }
  return {
    version: 1,
    format: 1,
    ppq: 480,
    name: "fx",
    fileName: "fx.mid",
    tempos: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    tracks: [
      {
        index: 0,
        name: "fx",
        channel: 0,
        program: 0,
        isPercussion: false,
        notes,
        endTick,
        usesPitchBend: false,
      },
    ],
    endTick,
    durationSec: (endTick / 480) * 0.5,
    warnings: [],
  };
}

function fixtureAnalysis(project: NormalizedProject) {
  const out = analyzeProject(project);
  if (!out.ok) {
    throw new Error(`fixture analysis failed: ${out.error.code}`);
  }
  return out.value;
}

describe("Phase 4 Slice 2: compose slice defaults + clearCompose", () => {
  beforeEach(() => {
    STORE_API().clearCompose();
  });

  it("fresh compose state: session/project/analysis null, stacks empty", () => {
    const s = STORE_API();
    expect(s.composeSession).toBeNull();
    expect(s.composeProject).toBeNull();
    expect(s.composeAnalysis).toBeNull();
    expect(s.composeUndo).toEqual([]);
    expect(s.composeRedo).toEqual([]);
  });

  it("resetModeSlice does NOT widen to compose (D57: compose owns clearCompose)", () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "fx.mid", fileHash: null });
    STORE_API().resetModeSlice();
    expect(STORE_API().composeSession?.fileName).toBe("fx.mid");
    STORE_API().clearCompose();
    expect(STORE_API().composeSession).toBeNull();
    expect(STORE_API().composeProject).toBeNull();
  });
});

describe("Phase 4 Slice 2: setComposeFile + patch/undo/redo (D57/D59)", () => {
  beforeEach(() => {
    STORE_API().clearCompose();
  });

  it("setComposeFile resets overrides, both stacks and analyzeFull", () => {
    const p = fixtureProject();
    const a = fixtureAnalysis(p);
    STORE_API().setComposeFile(p, a, { fileName: "fx.mid", fileHash: "h1" });
    STORE_API().patchComposeOverrides({ ...EMPTY_OVERRIDES, tempoBpm: 100 });
    expect(STORE_API().composeUndo.length).toBe(1);
    STORE_API().setComposeFile(p, a, { fileName: "second.mid", fileHash: "h2" });
    const s = STORE_API();
    expect(s.composeSession?.overrides).toEqual(EMPTY_OVERRIDES);
    expect(s.composeSession?.analyzeFull).toBe(false);
    expect(s.composeUndo).toEqual([]);
    expect(s.composeRedo).toEqual([]);
    expect(s.composeSession?.fileName).toBe("second.mid");
  });

  it("patchComposeOverrides pushes PREVIOUS onto undo and clears redo", () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "fx.mid", fileHash: null });
    const v1: AnalysisOverrides = { ...EMPTY_OVERRIDES, tempoBpm: 100 };
    const v2: AnalysisOverrides = { ...EMPTY_OVERRIDES, tempoBpm: 110 };
    STORE_API().patchComposeOverrides(v1);
    STORE_API().patchComposeOverrides(v2);
    let s = STORE_API();
    expect(s.composeSession?.overrides).toEqual(v2);
    expect(s.composeUndo.length).toBe(2);
    expect(s.composeUndo[0]).toEqual(EMPTY_OVERRIDES); // pre-v1 snapshot
    expect(s.composeUndo[1]).toEqual(v1);
    s.undoCompose();
    s = STORE_API();
    expect(s.composeSession?.overrides).toEqual(v1);
    expect(s.composeRedo.length).toBe(1);
    // A fresh patch after undo clears the redo branch.
    s.patchComposeOverrides({ ...EMPTY_OVERRIDES, tempoBpm: 120 });
    expect(STORE_API().composeRedo).toEqual([]);
  });

  it("undo/redo swap whole-map snapshots; empty stacks are no-ops", () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "fx.mid", fileHash: null });
    STORE_API().undoCompose(); // empty: no-op, no throw
    expect(STORE_API().composeSession?.overrides).toEqual(EMPTY_OVERRIDES);
    const v1: AnalysisOverrides = { ...EMPTY_OVERRIDES, tempoBpm: 90 };
    STORE_API().patchComposeOverrides(v1);
    STORE_API().undoCompose();
    expect(STORE_API().composeSession?.overrides).toEqual(EMPTY_OVERRIDES);
    STORE_API().redoCompose();
    expect(STORE_API().composeSession?.overrides).toEqual(v1);
  });

  it("undo stack caps at 32 and shifts the oldest (D59)", () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "fx.mid", fileHash: null });
    for (let i = 0; i < 40; i++) {
      STORE_API().patchComposeOverrides({ ...EMPTY_OVERRIDES, tempoBpm: 100 + i });
    }
    const s = STORE_API();
    expect(s.composeUndo.length).toBe(COMPOSE_UNDO_CAP);
    // 40 pushes of [EMPTY, 100..138]; the 8 oldest dropped -> head is
    // the snapshot taken before patch 8 (tempoBpm 107).
    expect(s.composeUndo[0].tempoBpm).toBe(107);
    expect(s.composeSession?.overrides.tempoBpm).toBe(139);
  });

  it("patchComposeOverrides is a no-op when no compose file is loaded", () => {
    STORE_API().patchComposeOverrides({ ...EMPTY_OVERRIDES, tempoBpm: 120 });
    expect(STORE_API().composeSession).toBeNull();
    expect(STORE_API().composeUndo).toEqual([]);
  });
});

describe("Phase 4 Slice 2: persistence boundary (D57 - the 30MB project NEVER hits localStorage)", () => {
  beforeEach(() => {
    STORE_API().clearCompose();
  });

  it("partialize persists composeSession but EXCLUDES project/analysis/stacks", async () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "fx.mid", fileHash: "abc" });
    STORE_API().patchComposeOverrides({ ...EMPTY_OVERRIDES, tempoBpm: 126 });
    await Promise.resolve();
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(CURRENT_SESSION_VERSION).toBe(4);
    expect(parsed.version).toBe(CURRENT_SESSION_VERSION);
    const session = parsed.state.composeSession as Record<string, unknown>;
    expect(session.fileName).toBe("fx.mid");
    expect(session.fileHash).toBe("abc");
    expect((session.overrides as Record<string, unknown>).tempoBpm).toBe(126);
    expect(session.analyzeFull).toBe(false);
    expect(parsed.state.composeProject).toBeUndefined();
    expect(parsed.state.composeAnalysis).toBeUndefined();
    expect(parsed.state.composeUndo).toBeUndefined();
    expect(parsed.state.composeRedo).toBeUndefined();
  });

  it("reload simulation: session rehydrates, project stays null (prompt state, D62)", async () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "keep.mid", fileHash: "h" });
    await Promise.resolve();
    const raw = localStorage.getItem(SESSION_STORAGE_KEY) as string;
    STORE_API().clearCompose();
    localStorage.setItem(SESSION_STORAGE_KEY, raw);
    useSessionStore.persist.rehydrate();
    const s = STORE_API();
    expect(s.composeSession?.fileName).toBe("keep.mid");
    expect(s.composeProject).toBeNull();
  });
});

describe("Phase 4 Slice 2: analyzeFull recompute + v3->v4 (D57/REQ-COMP-53)", () => {
  beforeEach(() => {
    STORE_API().clearCompose();
  });

  it("setComposeAnalyzeFull(true) recomputes over the full window; (false) restores the default", () => {
    const p = fixtureProject({ farNote: true });
    const a = fixtureAnalysis(p);
    expect(a.truncated).toBe(true);
    STORE_API().setComposeFile(p, a, { fileName: "long.mid", fileHash: null });
    STORE_API().setComposeAnalyzeFull(true);
    let s = STORE_API();
    expect(s.composeSession?.analyzeFull).toBe(true);
    expect(s.composeAnalysis?.truncated).toBe(false);
    expect(s.composeAnalysis?.window.toTick).toBe(p.endTick);
    STORE_API().setComposeAnalyzeFull(false);
    s = STORE_API();
    expect(s.composeSession?.analyzeFull).toBe(false);
    expect(s.composeAnalysis?.truncated).toBe(true);
  });

  it("setComposeFile with restore.analyzeFull re-runs the full-window analysis", () => {
    const p = fixtureProject({ farNote: true });
    const a = fixtureAnalysis(p);
    const overrides: AnalysisOverrides = { ...EMPTY_OVERRIDES, tempoBpm: 128 };
    STORE_API().setComposeFile(
      p,
      a,
      { fileName: "long.mid", fileHash: "h" },
      { overrides, analyzeFull: true },
    );
    const s = STORE_API();
    expect(s.composeSession?.overrides).toEqual(overrides);
    expect(s.composeSession?.analyzeFull).toBe(true);
    expect(s.composeAnalysis?.truncated).toBe(false);
    expect(s.composeUndo).toEqual([]); // undo NEVER crosses files (RK-S2-5)
  });

  it("setComposeAnalyzeFull is a no-op without a loaded project", () => {
    STORE_API().setComposeAnalyzeFull(true);
    expect(STORE_API().composeSession).toBeNull();
  });

  it("v3 -> v4 through the REAL runner appends composeSession null (persisted-shape pin)", () => {
    const out = createSessionRunner<{
      version: number;
      composeSession?: unknown;
      mode?: string;
    }>().run({ version: 3, mode: "compose" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.version).toBe(4);
      expect(out.value.composeSession).toBeNull();
      expect(out.value.mode).toBe("compose");
    }
  });
});

// ---------------------------------------------------------------------------
// PRD-001 Phase 4 Slice 3 (D73): accompaniment request persisted into the
// v4 payload WITHOUT v5; result IN-MEMORY only; request outside undo scope.
// ---------------------------------------------------------------------------

describe("Phase 4 Slice 3: accompaniment request + result (D73)", () => {
  beforeEach(() => {
    STORE_API().clearCompose();
  });

  const REQUEST = {
    version: 1,
    styleId: "jazz",
    roles: ["bass", "chords"],
    density: 3,
    seed: 42,
  } as const;

  it("fresh state: composeAccompaniment null; request absent (optional field)", () => {
    const s = STORE_API();
    expect(s.composeAccompaniment).toBeNull();
    expect(s.composeSession?.request ?? null).toBeNull(); // default at read
  });

  it("setComposeRequest persists INSIDE composeSession and does NOT touch undo (D59 scope)", () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "fx.mid", fileHash: "h" });
    STORE_API().patchComposeOverrides({ ...EMPTY_OVERRIDES, tempoBpm: 100 });
    const undoBefore = STORE_API().composeUndo.length;
    const redoBefore = STORE_API().composeRedo.length;
    STORE_API().setComposeRequest(REQUEST);
    const s = STORE_API();
    expect(s.composeSession?.request).toEqual(REQUEST);
    expect(s.composeUndo.length).toBe(undoBefore); // UNCHANGED
    expect(s.composeRedo.length).toBe(redoBefore); // UNCHANGED
    // Undo still works over overrides only.
    s.undoCompose();
    expect(STORE_API().composeSession?.overrides.tempoBpm).toBeNull();
    expect(STORE_API().composeSession?.request).toEqual(REQUEST); // survives undo
  });

  it("setComposeRequest is a no-op without a session (taste needs a home)", () => {
    STORE_API().setComposeRequest(REQUEST);
    expect(STORE_API().composeSession).toBeNull();
  });

  it("partialize: request rides INSIDE the persisted composeSession; the RESULT never persists", async () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "fx.mid", fileHash: "h" });
    STORE_API().setComposeRequest(REQUEST);
    STORE_API().setComposeAccompaniment({
      version: 1,
      generated: { bass: [], chords: [], pad: [] },
      meta: {
        version: 1,
        styleId: "jazz",
        density: 3,
        seed: 42,
        roles: ["bass", "chords"],
        patternIds: { bass: "walking", chords: "freddieGreen", pad: "sustain" },
        voicingStyle: "drop2",
        swingRatioApplied: 0.64,
        gridDivisions: 2,
        registersUsed: { bass: [28, 48], chords: [48, 72], pad: [60, 84] },
        transpose: 0,
        noteCounts: { bass: 0, chords: 0, pad: 0 },
        rootlessCount: 0,
        quartalFallbackCount: 0,
        unknownQualityCount: 0,
        bars: 0,
        endTick: 0,
        gridFingerprint: "x",
      },
      annotations: [],
    });
    await Promise.resolve();
    const raw = localStorage.getItem(SESSION_STORAGE_KEY) as string;
    const parsed = JSON.parse(raw) as { state: Record<string, unknown>; version: number };
    expect(parsed.version).toBe(4); // NO v5 (D73)
    const session = parsed.state.composeSession as Record<string, unknown>;
    expect(session.request).toEqual(REQUEST); // persisted with the session
    expect(parsed.state.composeAccompaniment).toBeUndefined(); // result excluded
  });

  it("OLD v4 payloads WITHOUT the request field hydrate with default-at-read (NO migration)", () => {
    // Hand-built pre-S3 payload: version 4, composeSession WITHOUT
    // `request`. The read site (`session.request ?? null`) is the
    // migration - CURRENT_SESSION_VERSION stays 4.
    const legacy = {
      state: {
        mode: "compose",
        globalTranspose: 0,
        exerciseTranspose: 0,
        keyCycleActive: false,
        currentIdea: null,
        etudeConstraints: null,
        composeSession: {
          fileName: "old.mid",
          fileHash: null,
          overrides: EMPTY_OVERRIDES,
          analyzeFull: false,
        },
      },
      version: 4,
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(legacy));
    useSessionStore.persist.rehydrate();
    const s = STORE_API();
    expect(CURRENT_SESSION_VERSION).toBe(4);
    expect(s.composeSession?.fileName).toBe("old.mid");
    expect(s.composeSession?.request ?? null).toBeNull(); // default at read
    expect(s.composeAccompaniment).toBeNull();
  });

  it("setComposeFile KEEPS the persisted request (taste survives file swaps) and NULLS the result", () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "a.mid", fileHash: "h" });
    STORE_API().setComposeRequest(REQUEST);
    STORE_API().setComposeAccompaniment({
      version: 1,
      generated: { bass: [], chords: [], pad: [] },
      meta: {
        version: 1,
        styleId: "jazz",
        density: 3,
        seed: 42,
        roles: ["bass", "chords"],
        patternIds: { bass: "walking", chords: "freddieGreen", pad: "sustain" },
        voicingStyle: "drop2",
        swingRatioApplied: 0.64,
        gridDivisions: 2,
        registersUsed: { bass: [28, 48], chords: [48, 72], pad: [60, 84] },
        transpose: 0,
        noteCounts: { bass: 0, chords: 0, pad: 0 },
        rootlessCount: 0,
        quartalFallbackCount: 0,
        unknownQualityCount: 0,
        bars: 0,
        endTick: 0,
        gridFingerprint: "x",
      },
      annotations: [],
    });
    const q = fixtureProject();
    STORE_API().setComposeFile(q, fixtureAnalysis(q), { fileName: "b.mid", fileHash: "h2" });
    const s = STORE_API();
    expect(s.composeSession?.fileName).toBe("b.mid");
    expect(s.composeSession?.request).toEqual(REQUEST); // KEPT
    expect(s.composeAccompaniment).toBeNull(); // NULLed (grid-derived)
  });

  it("clearCompose resets BOTH request (with the session) and result", () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "fx.mid", fileHash: null });
    STORE_API().setComposeRequest(REQUEST);
    STORE_API().clearCompose();
    const s = STORE_API();
    expect(s.composeSession).toBeNull();
    expect(s.composeAccompaniment).toBeNull();
  });

  it("reload simulation: request survives rehydration, result does not exist (D73)", async () => {
    const p = fixtureProject();
    STORE_API().setComposeFile(p, fixtureAnalysis(p), { fileName: "keep.mid", fileHash: "h" });
    STORE_API().setComposeRequest(REQUEST);
    await Promise.resolve();
    const raw = localStorage.getItem(SESSION_STORAGE_KEY) as string;
    STORE_API().clearCompose();
    localStorage.setItem(SESSION_STORAGE_KEY, raw);
    useSessionStore.persist.rehydrate();
    const s = STORE_API();
    expect(s.composeSession?.request).toEqual(REQUEST); // restored
    expect(s.composeAccompaniment).toBeNull(); // never was persisted
    // Generation stays EXPLICIT: rehydration never invents a result.
  });
});
