/**
 * src/components/ComposeMixer.test.tsx - PRD-001 Phase 4 Slice 4
 * (test plan 12). Auto-registers in the jsdom project via the vitest
 * JSDOM_FILES glob. The component is FULLY controlled (store-free,
 * audio-free): rows, live-patch payloads, M/S aria-pressed, solo
 * dimming, the chart-only disabled row, transport button states and
 * the export disabled arms.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposeMixer, type ComposeMixerProps } from "./ComposeMixer";
import { MIXER_DEFAULTS, type MixerState } from "../../engine/compose/types";

function mixerWith(over: Partial<MixerState>): MixerState {
  return { ...MIXER_DEFAULTS, ...over };
}

function renderMixer(over: Partial<ComposeMixerProps> = {}) {
  const props: ComposeMixerProps = {
    mixer: MIXER_DEFAULTS,
    hasOriginal: true,
    originalLabel: "Original (drums not played)",
    previewState: "idle",
    canExport: true,
    onPatchMixer: vi.fn(),
    onPlay: vi.fn(),
    onStop: vi.fn(),
    onExportMidi: vi.fn(),
    onExportWav: vi.fn(),
    ...over,
  };
  render(<ComposeMixer {...props} />);
  return props;
}

describe("rows (D78: the 4-group PRD contract)", () => {
  it("renders exactly 4 rows with labels + disclosure sub", () => {
    renderMixer();
    for (const g of ["original", "bass", "chords", "pad"]) {
      expect(screen.getByTestId(`mix-row-${g}`)).toBeTruthy();
    }
    expect(screen.getByTestId("mix-original-sub").textContent).toContain("drums not played");
  });

  it("chart-only: original row disabled with the honest 'no file - chart only' label", () => {
    renderMixer({ hasOriginal: false, originalLabel: "no file - chart only" });
    const row = screen.getByTestId("mix-row-original");
    expect(row.getAttribute("data-disabled")).toBe("true");
    expect(screen.getByTestId("mix-original-sub").textContent).toContain("no file - chart only");
    expect((screen.getByTestId("mix-level-original") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("mix-mute-original") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("knobs are instant patches (D77)", () => {
  it("slider fires onPatchMixer with ONLY that group's level changed", () => {
    const props = renderMixer();
    fireEvent.change(screen.getByTestId("mix-level-bass"), { target: { value: "0.42" } });
    expect(props.onPatchMixer).toHaveBeenCalledTimes(1);
    const next = (props.onPatchMixer as unknown as { mock: { calls: [MixerState][] } }).mock.calls[0][0];
    expect(next.bass.level).toBeCloseTo(0.42, 9);
    expect(next.chords).toEqual(MIXER_DEFAULTS.chords);
    expect(next.original).toEqual(MIXER_DEFAULTS.original);
  });

  it("M toggles muted + aria-pressed; S toggles solo + aria-pressed", () => {
    const props = renderMixer({
      mixer: mixerWith({ chords: { level: 1, muted: true, solo: false } }),
    });
    const mute = screen.getByTestId("mix-mute-chords");
    expect(mute.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(mute);
    const next = (props.onPatchMixer as unknown as { mock: { calls: [MixerState][] } }).mock.calls[0][0];
    expect(next.chords.muted).toBe(false);
    expect(screen.getByTestId("mix-solo-chords").getAttribute("aria-pressed")).toBe("false");
  });

  it("solo dims ALL other rows via data-dimmed (e2e leg 1's STATE assertion)", () => {
    renderMixer({ mixer: mixerWith({ bass: { level: 1, muted: false, solo: true } }) });
    expect(screen.getByTestId("mix-row-bass").getAttribute("data-dimmed")).toBe("false");
    for (const g of ["original", "chords", "pad"]) {
      expect(screen.getByTestId(`mix-row-${g}`).getAttribute("data-dimmed")).toBe("true");
    }
  });

  it("aria-valuetext carries the percent (a11y)", () => {
    renderMixer({ mixer: mixerWith({ pad: { level: 0.42, muted: false, solo: false } }) });
    expect(screen.getByTestId("mix-level-pad").getAttribute("aria-valuetext")).toBe("42 percent");
  });
});

describe("transport + exports (D77/D81)", () => {
  it("Play routes onPlay with data-preview idle", () => {
    const props = renderMixer();
    fireEvent.click(screen.getByTestId("mix-play"));
    expect(props.onPlay).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("mix-play").getAttribute("data-preview")).toBe("idle");
  });

  it("playing shows Stop and routes onStop", () => {
    const props = renderMixer({ previewState: "playing" });
    expect(screen.getByTestId("mix-play").textContent).toContain("Stop");
    fireEvent.click(screen.getByTestId("mix-play"));
    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it("rendering state: play + both exports disabled, label says Rendering", () => {
    renderMixer({ previewState: "rendering" });
    expect((screen.getByTestId("mix-play") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("mix-play").textContent).toContain("Rendering");
    expect((screen.getByTestId("mix-export-midi") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("mix-export-wav") as HTMLButtonElement).disabled).toBe(true);
  });

  it("nothing to export -> both disabled (canExport false)", () => {
    renderMixer({ canExport: false });
    expect((screen.getByTestId("mix-export-midi") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("mix-export-wav") as HTMLButtonElement).disabled).toBe(true);
  });

  it("original-only export IS legal: canExport true enables both", () => {
    renderMixer({ canExport: true });
    expect((screen.getByTestId("mix-export-midi") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("mix-export-wav") as HTMLButtonElement).disabled).toBe(false);
  });

  it("export clicks route to the surface handlers", () => {
    const props = renderMixer();
    fireEvent.click(screen.getByTestId("mix-export-midi"));
    fireEvent.click(screen.getByTestId("mix-export-wav"));
    expect(props.onExportMidi).toHaveBeenCalledTimes(1);
    expect(props.onExportWav).toHaveBeenCalledTimes(1);
  });
});
