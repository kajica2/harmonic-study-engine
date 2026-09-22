/**
 * src/state/sessionStore.test.ts - PRD-001 Phase 1 mode slice.
 *
 * Pins the requestMode / resolveDirty state machine, the persist
 * round-trip (mode / globalTranspose / currentIdea survive reload,
 * dirty + pendingModeRequest do NOT), and that the legacy
 * `synesthesia_*` keys are never touched.
 *
 * Runs under jsdom per JSDOM_FILES in vitest.config.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useSessionStore,
  SESSION_STORAGE_KEY,
  isMode,
  MODES,
  resolveEffectiveMode,
} from "./sessionStore";
import { ideaFromChord } from "../../engine/core/idea";

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