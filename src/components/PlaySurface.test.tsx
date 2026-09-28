/**
 * src/components/PlaySurface.test.tsx - PRD-001 Phase 8 S1 (D148,
 * doc 6.1). jsdom via the components auto-glob.
 *
 * 8 pins, led by the AUTOPLAY-HONESTY law: a valid idea renders
 * ARMED and playIdea is NEVER called before the click (no fake
 * autoplay tricks); the click plays; scale/seed/malformed/absent
 * land in the honest EMPTY/CTA states without throwing. The preview
 * singleton + ideaHear play/stop are faked (the real codec + card
 * builder stay - ideaShare/ideaHear own those pins).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PlaySurface } from "./PlaySurface";
import { composePreviewPlayer } from "../lib/composePreview";
import { ideaToPlayCard, playIdea, stopIdea } from "../lib/ideaHear";
import { ideaFromChord, type Idea } from "../../engine/core/idea";

const fake = vi.hoisted(() => {
  const listeners = new Set<(s: string) => void>();
  let state = "idle";
  const notify = () => {
    for (const l of Array.from(listeners)) l(state);
  };
  return {
    setState: (s: string) => {
      state = s;
      notify();
    },
    getState: () => state,
    subscribe: (fn: (s: string) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    stop: () => {
      state = "idle";
      notify();
    },
  };
});

vi.mock("../lib/composePreview", () => ({
  composePreviewPlayer: {
    getState: fake.getState,
    subscribe: fake.subscribe,
    stop: vi.fn(fake.stop),
  },
}));

// playIdea/stopIdea are spies; ideaToPlayCard stays REAL (the
// playable gate is part of the surface contract).
vi.mock("../lib/ideaHear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/ideaHear")>();
  return {
    ...actual,
    playIdea: vi.fn(() => true),
    stopIdea: vi.fn(),
  };
});

const IDEA = ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0);

function setPlayUrl(idea: Idea | null): void {
  if (idea === null) {
    window.history.replaceState({}, "", "/play");
    return;
  }
  const b64 = btoa(encodeURIComponent(JSON.stringify(idea)));
  window.history.replaceState({}, "", `/play?idea=${encodeURIComponent(b64)}`);
}

beforeEach(() => {
  fake.setState("idle");
  vi.mocked(playIdea).mockClear();
  vi.mocked(stopIdea).mockClear();
  vi.mocked(composePreviewPlayer.stop).mockClear();
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("PlaySurface armed state (the autoplay-honesty contract)", () => {
  it("a valid chord idea renders ARMED with summary + Play - and NEVER calls playIdea before the click", () => {
    setPlayUrl(IDEA);
    render(<PlaySurface />);
    expect(screen.getByTestId("play-surface")).toBeTruthy();
    expect(screen.getByTestId("play-armed")).toBeTruthy();
    expect(screen.getByTestId("play-button")).toBeTruthy();
    expect(screen.getByTestId("play-idea-summary").textContent).toBe(
      "chord - Cmaj7",
    );
    // THE pin: no fake-autoplay tricks (D148 rejected option (d)).
    expect(playIdea).not.toHaveBeenCalled();
  });

  it("the Play click plays the decoded idea exactly once", () => {
    setPlayUrl(IDEA);
    render(<PlaySurface />);
    fireEvent.click(screen.getByTestId("play-button"));
    expect(playIdea).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playIdea).mock.calls[0][0]).toEqual(IDEA);
  });

  it("the Play button is focused on mount (Space/Enter IS the gesture)", () => {
    setPlayUrl(IDEA);
    render(<PlaySurface />);
    expect(document.activeElement).toBe(screen.getByTestId("play-button"));
  });
});

describe("PlaySurface playing state", () => {
  it("player 'playing' swaps to Stop + data-state=playing; Stop delegates", () => {
    setPlayUrl(IDEA);
    render(<PlaySurface />);
    act(() => {
      fake.setState("playing");
    });
    expect(screen.getByTestId("play-surface").getAttribute("data-state")).toBe(
      "playing",
    );
    expect(screen.getByTestId("play-playing")).toBeTruthy();
    fireEvent.click(screen.getByTestId("play-stop-button"));
    expect(stopIdea).toHaveBeenCalledTimes(1);
  });

  it("return to idle lands back on Replay (armed), CTA hidden while playing", () => {
    setPlayUrl(IDEA);
    render(<PlaySurface />);
    act(() => {
      fake.setState("playing");
    });
    expect(screen.queryByTestId("play-open-app")).toBeNull();
    act(() => {
      fake.setState("idle");
    });
    expect(screen.getByTestId("play-armed")).toBeTruthy();
    expect(screen.getByTestId("play-open-app")).toBeTruthy();
  });
});

describe("PlaySurface empty states (honest CTAs)", () => {
  it("scale/seed ideas -> EMPTY with the summary + the voicing CTA copy (the honest carve)", () => {
    const scaleIdea = { ...IDEA, kind: "scale", chord: null, scale: "dorian" } as Idea;
    setPlayUrl(scaleIdea);
    const { unmount } = render(<PlaySurface />);
    expect(screen.getByTestId("play-empty")).toBeTruthy();
    expect(screen.getByTestId("play-idea-summary").textContent).toBe(
      "scale - dorian",
    );
    expect(screen.getByTestId("play-empty").textContent).toContain(
      "This idea kind needs the full app - pick a voicing or generate there.",
    );
    expect(screen.getByTestId("play-open-app").getAttribute("href")).toBe("/");
    // ideaToPlayCard stays real: the gate itself is null for scale.
    expect(ideaToPlayCard(scaleIdea)).toBeNull();
    unmount();
    // A seed is a GENERATION TOKEN, not music: same empty family.
    const seedIdea = { ...IDEA, kind: "seed", chord: null, seed: 42 } as Idea;
    setPlayUrl(seedIdea);
    render(<PlaySurface />);
    expect(screen.getByTestId("play-empty")).toBeTruthy();
    expect(screen.getByTestId("play-idea-summary").textContent).toBe("seed - 42");
  });

  it("a malformed idea param -> EMPTY, no throw (decode warn routes through ideaShare)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.replaceState({}, "", "/play?idea=%25%25%25garbage%25%25%25");
    render(<PlaySurface />);
    expect(screen.getByTestId("play-empty")).toBeTruthy();
    expect(screen.queryByTestId("play-idea-summary")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("no idea param -> EMPTY with the no-playable-idea copy + href=/ CTA", () => {
    setPlayUrl(null);
    render(<PlaySurface />);
    expect(screen.getByTestId("play-empty")).toBeTruthy();
    expect(screen.getByTestId("play-empty").textContent).toContain(
      "This link has no playable idea - open the full app to make one.",
    );
    expect(screen.getByTestId("play-open-app").getAttribute("href")).toBe("/");
  });
});
