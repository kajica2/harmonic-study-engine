/**
 * src/components/PracticeHeader.test.tsx - PRD-001 Phase 8 S1 (D149).
 *
 * NEW file (no header component test existed - the S4 D-10 precedent:
 * pure presentational components get a test file when they gain an
 * interaction). jsdom via the components auto-glob (NOT JSDOM_FILES).
 *
 * 4 pins for the study surface's Share button: it renders (status
 * pill absent until a copy - honest empty), the click routes through
 * copyShareUrl EXACTLY once, the shipped status copy renders, and the
 * button lives inside the "Practice loop" region (the single-testid
 * law: five surfaces share `share-url-button`, e2e scopes by region).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PracticeHeader } from "./PracticeHeader";
import { copyShareUrl } from "../lib/shareUrl";
import { DEFAULT_MECHANICS } from "../lib/practiceMechanics";
import { DEFAULT_METRONOME_CONFIG } from "../lib/metronomePatterns";
import type { HarmonicPath } from "../lib/paths";

// The seam itself is pinned in shareUrl.test.ts; here: routing only.
vi.mock("../lib/shareUrl", () => ({
  copyShareUrl: vi.fn(async () => "copied" as const),
  shareStatusText: (s: string) => `status:${s}`,
}));

const PATH: HarmonicPath = {
  id: "study-solar",
  title: "Solar",
  description: "test fixture",
  steps: [{ name: "Cmaj7", notes: [60, 64, 67, 71], descriptions: "" }],
};

function headerProps() {
  return {
    path: PATH,
    activeStepIndex: 0,
    formLen: 1,
    chordName: "Cmaj7",
    timeSignature: "4/4" as const,
    chordNotes: [60, 64, 67, 71],
    isPlaying: false,
    onPlayPause: () => {},
    tempo: 132,
    onTempoChange: () => {},
    isLooping: false,
    onLoopToggle: () => {},
    metronomeOn: false,
    onMetronomeToggle: () => {},
    metronomeConfig: DEFAULT_METRONOME_CONFIG,
    onMetronomeConfigChange: () => {},
    backingStyle: "off" as const,
    onBackingStyleChange: () => {},
    volume: 50,
    onVolumeChange: () => {},
    scoreDisplayMode: "full" as const,
    onScoreDisplayModeChange: () => {},
    mechanics: DEFAULT_MECHANICS,
    mechanicsDisabled: false,
    mechanicsLoopSelection: null,
    rampState: null,
    repPulse: 0,
    windowPhase: "play" as const,
    onMechanicsChange: () => {},
    onRepOutcome: () => {},
    onRampReset: () => {},
    detectionArmed: false,
    detectionUnavailable: true,
    detectionHasDevice: false,
    detectionSawFallback: false,
    detectionHasMidiApi: false,
    detectionGridTargets: 0,
    detectionPhrase: null,
    detectionPassCount: 0,
    latencyRecord: null,
    onManualLatency: () => {},
    onLatencySaved: () => {},
    midiHasDevice: false,
    midiDeviceName: null,
    bassMidiChannel: null,
    noteInputEnabled: false,
    noteInputRootOctave: 4,
    sessions: [],
    lastSession: null,
  };
}

beforeEach(() => {
  vi.mocked(copyShareUrl).mockClear();
});

describe("PracticeHeader Share button (D149)", () => {
  it("renders the share-url-button; the status pill is absent until a copy", () => {
    render(<PracticeHeader {...headerProps()} />);
    expect(screen.getByTestId("share-url-button")).toBeTruthy();
    expect(screen.queryByTestId("share-url-status")).toBeNull();
  });

  it("the click routes through copyShareUrl EXACTLY once (the sanctioned seam)", () => {
    render(<PracticeHeader {...headerProps()} />);
    fireEvent.click(screen.getByTestId("share-url-button"));
    expect(copyShareUrl).toHaveBeenCalledTimes(1);
  });

  it("the shipped status copy renders after the copy settles", async () => {
    render(<PracticeHeader {...headerProps()} />);
    fireEvent.click(screen.getByTestId("share-url-button"));
    await waitFor(() => {
      expect(screen.getByTestId("share-url-status").textContent).toBe(
        "status:copied",
      );
    });
  });

  it("the button lives in the Practice loop region (e2e scoping for the single-testid law)", () => {
    render(<PracticeHeader {...headerProps()} />);
    const region = screen.getByRole("region", { name: "Practice loop" });
    const within = region.querySelector('[data-testid="share-url-button"]');
    expect(within).not.toBeNull();
  });
});
