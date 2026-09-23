/**
 * src/state/sessionStore.test.ts - PRD-001 Phase 1 mode slice +
 * Phase 3 Slice 2 etude slice (T8).
 *
 * Pins the requestMode / resolveDirty state machine, the persist
 * round-trip (mode / globalTranspose / currentIdea / etudeConstraints
 * survive reload, dirty + pendingModeRequest do NOT), the acceptEtude
 * dirty shape (D30 - byte-equal to the handleCoComposeAccept literal),
 * the v2 -> v3 migration through the REAL runner, and that the legacy
 * `synesthesia_*` keys are never touched.
 *
 * Runs under jsdom per JSDOM_FILES in vitest.config.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSessionStore,
  SESSION_STORAGE_KEY,
  CURRENT_SESSION_VERSION,
  isMode,
  MODES,
  resolveEffectiveMode,
  resolveBootTranspose,
} from "./sessionStore";
import { useSessionStore as useLegacySessionStore } from "../hooks/useSessionStore";
import { createSessionRunner } from "../../engine/migrations";
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
      // Slice 2 (D23): the chain is now 1->2->3, so a v1 payload lands
      // at v3 and additionally gains etudeConstraints: null.
      expect(out.value.version).toBe(3);
      expect(out.value.exerciseTranspose).toBe(0);
      expect(out.value.keyCycleActive).toBe(false);
      expect(out.value.etudeConstraints).toBeNull();
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

  it("v2 -> v3 migration through the REAL runner seeds etudeConstraints null", () => {
    const out = createSessionRunner<{
      version: number;
      mode?: string;
      etudeConstraints?: unknown;
    }>().run({ version: 2, mode: "etude" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.version).toBe(3);
      expect(out.value.etudeConstraints).toBeNull();
      expect(out.value.mode).toBe("etude");
    }
  });
});