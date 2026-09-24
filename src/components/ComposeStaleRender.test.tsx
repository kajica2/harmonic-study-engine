/**
 * src/components/ComposeStaleRender.test.tsx - MED-003 (S4 fix round).
 *
 * The stale-render `.then` resurrection: a content change or stop()
 * while a slow OfflineAudioContext render is in flight must NEVER let
 * the late resolve call play/playMix (phantom audio; post-unmount
 * ghost up to 90s with no UI to stop it). The component guards BOTH
 * `.then` arms (handlePlayMix AND the S3-pattern handlePreview) with
 * a generation token + content-identity check.
 *
 * Shape: markRendering -> flip content -> resolve render -> play NOT
 * called, with a FAKE player (the render fns are deferred promises we
 * resolve by hand). A positive control proves the guard is not a
 * blanket mute. Generate is correctly DISABLED while rendering, so
 * the flip drives the store directly - the same transition a
 * re-generate/upload produces (new result identity -> the stop effect
 * runs -> the pending generation dies).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ComposeSurface } from "./ComposeSurface";
import { useSessionStore } from "../state/sessionStore";
import {
  renderMixGroups,
  renderAccompaniment,
} from "../lib/composePreview";
import type { PreviewState } from "../lib/composePreview";
import { generateAccompaniment } from "../../engine/compose";
import { buildChartSession, parseChordChart } from "../../engine/compose/chordchart";
import type { MixGroup } from "../../engine/compose/types";
import type {
  AccompanimentRequest,
  AccompanimentResult,
} from "../../engine/compose/types";

const mocks = vi.hoisted(() => {
  const playCalls: AudioBuffer[] = [];
  const playMixCalls: Partial<Record<MixGroup, AudioBuffer>>[] = [];
  let stopCalls = 0;
  let state: PreviewState = "idle";
  const listeners = new Set<(s: PreviewState) => void>();
  const notify = (): void => {
    for (const fn of [...listeners]) fn(state);
  };
  const player = {
    getState: (): PreviewState => state,
    subscribe: (fn: (s: PreviewState) => void): (() => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    markRendering: (): void => {
      state = "rendering";
      notify();
    },
    cancel: (): void => {
      state = "idle";
      notify();
    },
    play: (buf: AudioBuffer): void => {
      playCalls.push(buf);
      state = "playing";
      notify();
    },
    playMix: (groups: Partial<Record<MixGroup, AudioBuffer>>): void => {
      playMixCalls.push(groups);
      state = "playing";
      notify();
    },
    applyMix: (gains: Readonly<Record<MixGroup, number>>): void => {
      void gains;
    },
    stop: (): void => {
      stopCalls += 1;
      state = "idle";
      notify();
    },
  };
  let resolveMix: ((groups: Partial<Record<MixGroup, AudioBuffer>>) => void) | null = null;
  let resolveAcc: ((buf: AudioBuffer) => void) | null = null;
  return {
    player,
    playCalls,
    playMixCalls,
    getStopCalls: () => stopCalls,
    takeResolveMix: (): ((groups: Partial<Record<MixGroup, AudioBuffer>>) => void) | null => {
      const r = resolveMix;
      resolveMix = null;
      return r;
    },
    takeResolveAcc: (): ((buf: AudioBuffer) => void) | null => {
      const r = resolveAcc;
      resolveAcc = null;
      return r;
    },
    holdMix: (r: (groups: Partial<Record<MixGroup, AudioBuffer>>) => void): void => {
      resolveMix = r;
    },
    holdAcc: (r: (buf: AudioBuffer) => void): void => {
      resolveAcc = r;
    },
    reset: (): void => {
      playCalls.length = 0;
      playMixCalls.length = 0;
      stopCalls = 0;
      state = "idle";
      listeners.clear();
      resolveMix = null;
      resolveAcc = null;
    },
  };
});

vi.mock("../lib/composePreview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/composePreview")>();
  return {
    ...actual,
    composePreviewPlayer: mocks.player,
    renderMixGroups: vi.fn(
      (): Promise<Partial<Record<MixGroup, AudioBuffer>>> =>
        new Promise((resolve) => {
          mocks.holdMix(resolve);
        }),
    ),
    renderAccompaniment: vi.fn(
      (): Promise<AudioBuffer> =>
        new Promise((resolve) => {
          mocks.holdAcc(resolve);
        }),
    ),
  };
});

const STORE = useSessionStore.getState;

function makeResult(seed: number): AccompanimentResult {
  const parsed = parseChordChart("C Am F G");
  if (!parsed.ok) throw new Error("stale-render fixture chart failed");
  const { project, analysis } = buildChartSession(parsed.value);
  const req: AccompanimentRequest = {
    version: 1,
    styleId: "jazz",
    roles: ["bass", "chords"],
    density: 3,
    seed,
  };
  const out = generateAccompaniment(
    req,
    analysis.grid,
    project.ppq,
    analysis.key.candidates[0] ?? null,
  );
  if (!out.ok) throw new Error(`stale-render fixture generate failed: ${out.error.code}`);
  return out.value;
}

/** Loaded chart session + a result, seeded BEFORE render (sync). */
function seedLoaded(seed: number): void {
  const parsed = parseChordChart("C Am F G");
  if (!parsed.ok) throw new Error("stale-render fixture chart failed");
  const { project, analysis } = buildChartSession(parsed.value);
  act(() => {
    STORE().setComposeChart("C Am F G", project, analysis);
    STORE().setComposeAccompaniment(makeResult(seed));
  });
}

beforeEach(() => {
  localStorage.clear();
  mocks.reset();
  STORE().resetModeSlice();
  STORE().clearCompose();
});

describe("MED-003 stale-render guard (fake player, deferred renders)", () => {
  it("mix path: markRendering -> flip content -> resolve -> playMix NOT called", async () => {
    seedLoaded(42);
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("mix-play")).toBeTruthy());
    fireEvent.click(screen.getByTestId("mix-play"));
    expect(renderMixGroups).toHaveBeenCalledTimes(1);
    const resolve = mocks.takeResolveMix();
    expect(resolve).not.toBeNull();
    const stopsBefore = mocks.getStopCalls();
    // THE FLIP: a regenerate lands a new result identity (the stop
    // effect runs on it - proving the transition is the real one).
    act(() => {
      STORE().setComposeAccompaniment(makeResult(43));
    });
    expect(mocks.getStopCalls()).toBeGreaterThan(stopsBefore);
    await act(async () => {
      resolve?.({});
    });
    expect(mocks.playMixCalls.length).toBe(0); // NO phantom audio
  });

  it("mix path positive control: no flip -> resolve DOES playMix (not a blanket mute)", async () => {
    seedLoaded(42);
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("mix-play")).toBeTruthy());
    fireEvent.click(screen.getByTestId("mix-play"));
    const resolve = mocks.takeResolveMix();
    expect(resolve).not.toBeNull();
    await act(async () => {
      resolve?.({});
    });
    expect(mocks.playMixCalls.length).toBe(1);
  });

  it("S3 preview path: markRendering -> flip content -> resolve -> play NOT called", async () => {
    seedLoaded(42);
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await waitFor(() =>
      expect((screen.getByTestId("accomp-preview") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId("accomp-preview"));
    expect(renderAccompaniment).toHaveBeenCalledTimes(1);
    const resolve = mocks.takeResolveAcc();
    expect(resolve).not.toBeNull();
    act(() => {
      STORE().setComposeAccompaniment(makeResult(43));
    });
    await act(async () => {
      resolve?.({} as AudioBuffer);
    });
    expect(mocks.playCalls.length).toBe(0); // NO phantom audio
  });

  it("S3 preview positive control: no flip -> resolve DOES play", async () => {
    seedLoaded(42);
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await waitFor(() =>
      expect((screen.getByTestId("accomp-preview") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId("accomp-preview"));
    const resolve = mocks.takeResolveAcc();
    await act(async () => {
      resolve?.({} as AudioBuffer);
    });
    expect(mocks.playCalls.length).toBe(1);
  });

  it("unmount during render -> late resolve never touches the player (no ghost)", async () => {
    seedLoaded(42);
    const { unmount } = render(<ComposeSurface onOpenImportExport={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("mix-play")).toBeTruthy());
    fireEvent.click(screen.getByTestId("mix-play"));
    const resolve = mocks.takeResolveMix();
    expect(resolve).not.toBeNull();
    unmount();
    await act(async () => {
      resolve?.({});
    });
    expect(mocks.playMixCalls.length).toBe(0);
  });
});
