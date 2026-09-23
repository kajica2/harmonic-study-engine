/**
 * src/components/ComposeSurface.test.tsx - PRD-001 Phase 4 Slice 2
 * (test plan 5 + 10).
 *
 * THE PIN DUPLICATION IS DELIBERATE (RK-S2-3): the three pinned
 * strings are asserted HERE as well as in ModeGate.test.tsx - if the
 * copy drifts, BOTH files fail loudly at the source.
 *
 * Covers: error-banner mapping per !ok arm through the REAL
 * readMidiFile path (tiny byte fixtures), the loaded-state banners
 * (percussion / atonal / truncated + analyze-full / pitch bend), the
 * re-upload PROMPT (session set, project null) with the hash-gated
 * restore vs hash-null drop-with-notice, the D59 undo keyboard
 * (isTyping guard + shift-redo), the loaded privacy line, and the
 * REQ-IO-71 zero-network pin.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ComposeSurface } from "./ComposeSurface";
import { useSessionStore } from "../state/sessionStore";
import { analyzeFixture, buildMidiBytes, makeMidiFile } from "./composeFixtures";
import { EMPTY_OVERRIDES } from "../../engine/compose/types";

const STORE = useSessionStore.getState;

beforeEach(() => {
  localStorage.clear();
  STORE().resetModeSlice();
  STORE().clearCompose();
});

function dropFile(name: string, bytes: Uint8Array): void {
  const zone = screen.getByTestId("upload-drop-zone");
  fireEvent.drop(zone, { dataTransfer: { files: [makeMidiFile(name, bytes)] } });
}

async function uploadToLoaded(name = "song.mid", opts: Parameters<typeof buildMidiBytes>[0] = {}): Promise<void> {
  dropFile(name, buildMidiBytes(opts));
  await waitFor(() => expect(screen.getByTestId("analysis-card")).toBeTruthy());
}

describe("pinned empty-state copy (deliberate duplication of ModeGate's pins)", () => {
  it("heading + import/export button click + privacy aside survive in the empty state", () => {
    const opened = vi.fn();
    render(<ComposeSurface onOpenImportExport={opened} />);
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();
    screen.getByText(/Open import \/ export/).click();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Compose mode (empty state)" })).toBeTruthy();
    expect(screen.getByText(/never leaves this tab/i)).toBeTruthy();
  });

  it("the stub body copy is GONE (only the three pins + real upload UI)", () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    expect(screen.queryByText(/Phase 1 stub/i)).toBeNull();
    expect(screen.getByTestId("upload-drop-zone")).toBeTruthy();
  });
});

describe("!ok arms -> banners, store untouched (D62)", () => {
  it("tooLarge (oversized stub, pre-parse)", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    const stub = {
      name: "big.mid",
      size: 31 * 1024 * 1024,
      arrayBuffer: async () => new ArrayBuffer(8),
    };
    fireEvent.drop(screen.getByTestId("upload-drop-zone"), {
      dataTransfer: { files: [stub] } as unknown as DataTransfer,
    });
    await waitFor(() =>
      expect(screen.getByTestId("compose-error").textContent).toContain("30 MB limit"),
    );
    expect(STORE().composeProject).toBeNull();
    expect(screen.getByTestId("upload-drop-zone")).toBeTruthy(); // drop zone stays
  });

  it("parseFailed (not a MIDI file)", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    dropFile("garbage.mid", new TextEncoder().encode("definitely not standard midi"));
    await waitFor(() => expect(screen.getByTestId("compose-error")).toBeTruthy());
    expect(screen.getByTestId("compose-error").textContent).toContain("Not a valid MIDI file");
    expect(STORE().composeProject).toBeNull();
  });

  it("noNotes (REQ-COMP-50 banner copy)", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    dropFile("empty.mid", buildMidiBytes({ empty: true }));
    await waitFor(() =>
      expect(screen.getByTestId("compose-error").textContent).toContain("No notes found in this file."),
    );
    expect(STORE().composeProject).toBeNull();
  });
});

describe("loaded state (real pipeline: upload -> parse -> analyze -> card)", () => {
  it("uploads the C-major fixture and shows the card + auto key + >= 8 cells + privacy line", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("song.mid");
    expect(screen.getByTestId("analysis-file-name").textContent).toBe("song.mid");
    expect(screen.getByTestId("key-value").getAttribute("data-tier")).toBe("auto");
    expect(screen.getByTestId("key-value").textContent).toContain("C major");
    expect(screen.getAllByTestId(/^chord-cell-/).length).toBeGreaterThanOrEqual(8);
    expect(screen.getByTestId("privacy-line").textContent).toContain("never leaves this tab");
    expect(STORE().composeSession?.fileName).toBe("song.mid");
  });

  it("percussion-only -> manual-entry banner over an all-rest chart", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("drums.mid", { percussionOnly: true });
    expect(screen.getByTestId("banner-percussion").textContent).toContain("only percussion");
    expect(screen.getByTestId("chord-cell-0-0").getAttribute("data-tier")).toBe("manual");
  });

  it("atonal -> chromaticFallback banner + manual key tier", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("series.mid", { atonal: true });
    expect(screen.getByTestId("banner-atonal").textContent).toContain("No clear key detected");
    expect(screen.getByTestId("key-value").getAttribute("data-tier")).toBe("manual");
  });

  it("pitch bends -> 12-TET warning (REQ-COMP-6)", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("bend.mid", { pitchBend: true });
    expect(screen.getByTestId("banner-pitchbend").textContent).toContain("1 track(s) use pitch bends");
  });

  it("parse warnings collapse under 'Parse notes (k)'", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("nt.mid", { noTempo: true });
    const notes = screen.getByTestId("parse-notes");
    expect(notes.textContent).toContain("Parse notes (");
    expect(notes.textContent).toContain("assumed 120 BPM");
  });

  it("truncated -> first-4:00 banner; Analyze-full recomputes + persists (REQ-COMP-53)", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("long.mid", { farNote: true });
    expect(screen.getByTestId("banner-truncated").textContent).toContain("Showing the first 4:00 of");
    fireEvent.click(screen.getByTestId("analyze-full-button"));
    await waitFor(() => expect(screen.queryByTestId("banner-truncated")).toBeNull());
    expect(STORE().composeSession?.analyzeFull).toBe(true);
    expect(STORE().composeAnalysis?.truncated).toBe(false);
  });

  it("melody-track override re-extracts REAL notes (the roll changes, not a label)", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("song.mid");
    const before = screen.getAllByTestId("note-rect").length;
    // Track 0 is the chord track - extracting IT as melody must swap
    // the roll's note set (whole-note blocks, not quarter lines).
    fireEvent.change(screen.getByTestId("melody-select"), { target: { value: "0" } });
    await waitFor(() => expect(screen.getAllByTestId("note-rect").length).not.toBe(before));
    expect(STORE().composeSession?.overrides.melodyTrackIndex).toBe(0);
  });

  it("meter override re-runs the analysis (bar count changes) and clears cells in ONE undo entry", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("song.mid");
    // Pre-edit a cell so the clear is observable.
    fireEvent.click(screen.getByTestId("chord-cell-0-0"));
    fireEvent.change(screen.getByTestId("chord-symbol-input"), { target: { value: "Ab" } });
    fireEvent.keyDown(screen.getByTestId("chord-symbol-input"), { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("chord-cell-0-0").textContent).toBe("Ab"));
    const undoBefore = STORE().composeUndo.length;
    const meter = screen.getByTestId("meter-input");
    fireEvent.change(meter, { target: { value: "3/4" } });
    fireEvent.keyDown(meter, { key: "Enter" });
    await waitFor(() => expect(STORE().composeSession?.overrides.chordCells).toEqual({}));
    // ONE patch -> undo restores BOTH the cell and the meter.
    expect(STORE().composeUndo.length).toBe(undoBefore + 1);
    STORE().undoCompose();
    await waitFor(() => expect(screen.getByTestId("chord-cell-0-0").textContent).toBe("Ab"));
    expect(STORE().composeSession?.overrides.timeSignature).toBeNull();
  });

  it("MED-001: a meter override redraws the ROLL barlines in the NEW meter (barlines == chart rows)", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("song.mid");
    // Pre-override the roll and the chart already agree (4/4, 8 bars).
    expect(screen.getAllByTestId("roll-barline").length).toBe(
      screen.getAllByTestId(/^chord-row-/).length,
    );
    const meter = screen.getByTestId("meter-input");
    fireEvent.change(meter, { target: { value: "3/4" } });
    fireEvent.keyDown(meter, { key: "Enter" });
    // The chart re-bars to 3/4 (11 rows over the 15360-tick fixture)...
    await waitFor(() => expect(screen.getAllByTestId(/^chord-row-/).length).toBe(11));
    // ...and the roll MUST follow. Pre-fix this stayed at 8 OLD-meter
    // barlines: the patched project was built inside the analysis
    // memo and discarded, so the roll drew barBoundaries(rawProject).
    expect(screen.getAllByTestId("roll-barline").length).toBe(
      screen.getAllByTestId(/^chord-row-/).length,
    );
  });

  it("MED-003: no-op blur commits mint NO undo entry and touch no override", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("song.mid");
    fireEvent.blur(screen.getByTestId("tempo-input"));
    fireEvent.blur(screen.getByTestId("meter-input"));
    // The key field's "Change"-then-blur-without-edit path: pre-fix
    // this re-committed the parsed label, flipping DETECTED to
    // MANUAL (provenance lie) + one phantom undo entry.
    fireEvent.click(screen.getByTestId("key-change"));
    fireEvent.blur(screen.getByTestId("key-input"));
    expect(STORE().composeUndo).toEqual([]);
    expect(STORE().composeSession?.overrides).toEqual(EMPTY_OVERRIDES);
    // The no-op commit still CLOSES the editor (via onNoop).
    expect(screen.queryByTestId("key-input")).toBeNull();
    expect(screen.getByTestId("key-value").getAttribute("data-tier")).toBe("auto");
  });

  it("Start over clears the session (back to the pinned empty state)", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("song.mid");
    fireEvent.click(screen.getByTestId("start-over"));
    await waitFor(() => expect(screen.getByTestId("upload-drop-zone")).toBeTruthy());
    expect(STORE().composeSession).toBeNull();
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();
  });

  it("drop while loaded REPLACES the session; undo does not cross files (RK-S2-5)", async () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("first.mid");
    fireEvent.click(screen.getByTestId("chord-cell-0-0"));
    fireEvent.change(screen.getByTestId("chord-symbol-input"), { target: { value: "Dm7" } });
    fireEvent.keyDown(screen.getByTestId("chord-symbol-input"), { key: "Enter" });
    await waitFor(() => expect(STORE().composeUndo.length).toBe(1));
    // Drop a second file onto the loaded section.
    const section = screen.getByRole("region", { name: "Compose mode" });
    fireEvent.drop(section, { dataTransfer: { files: [makeMidiFile("second.mid", buildMidiBytes({}))] } });
    await waitFor(() => expect(screen.getByTestId("analysis-file-name").textContent).toBe("second.mid"));
    expect(STORE().composeUndo).toEqual([]); // stacks reset at the file boundary
  });
});

describe("re-upload PROMPT + hash-gated restore (D57/D62, RK-S2-8)", () => {
  /** Replace global crypto.subtle with a fixed digest (jsdom lacks it;
   *  a real browser has it - the e2e leg covers the genuine hash).
   *  AWAITED inside the guard: the upload pipeline reads crypto
   *  asynchronously, so a sync restore would un-stub mid-flight. */
  async function withStubbedDigest<T>(fill: number, fn: () => Promise<T>): Promise<T> {
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    const digest = new Uint8Array(32).fill(fill);
    Object.defineProperty(globalThis, "crypto", {
      value: { subtle: { digest: async (): Promise<ArrayBuffer> => digest.buffer.slice(0) } },
      configurable: true,
      writable: true,
    });
    try {
      return await fn();
    } finally {
      if (original !== undefined) Object.defineProperty(globalThis, "crypto", original);
      else delete (globalThis as unknown as Record<string, unknown>).crypto;
    }
  }

  const HEX_07 = "07".repeat(32);

  it("session present + project null -> prompt names the file, heading survives", () => {
    const { project, analysis } = analyzeFixture({});
    STORE().setComposeFile(project, analysis, { fileName: "keep.mid", fileHash: "abc" });
    useSessionStore.setState({ composeProject: null, composeAnalysis: null }); // simulate reload
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    expect(screen.getByTestId("reupload-prompt").textContent).toContain("Re-upload keep.mid");
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();
    expect(screen.getByTestId("upload-drop-zone")).toBeTruthy();
  });

  it("hash MATCH -> overrides + analyzeFull restored with a notice", async () => {
    await withStubbedDigest(7, async () => {
      render(<ComposeSurface onOpenImportExport={() => {}} />);
      dropFile("keep.mid", buildMidiBytes({}));
      await waitFor(() => expect(screen.getByTestId("analysis-card")).toBeTruthy());
      expect(STORE().composeSession?.fileHash).toBe(HEX_07);
      // Edit, then simulate the reload.
      const tempo = screen.getByTestId("tempo-input");
      fireEvent.change(tempo, { target: { value: "128" } });
      fireEvent.keyDown(tempo, { key: "Enter" });
      useSessionStore.setState({ composeProject: null, composeAnalysis: null });
    });
    // (crypto restored - the re-upload below runs with subtle ABSENT
    // unless we re-stub it; re-stub around the second drop instead.)
    await withStubbedDigest(7, async () => {
      await waitFor(() => expect(screen.getByTestId("reupload-prompt")).toBeTruthy());
      dropFile("keep.mid", buildMidiBytes({}));
      await waitFor(() =>
        expect(screen.getByTestId("compose-notice").textContent).toContain("Previous edits restored"),
      );
      expect((screen.getByTestId("tempo-input") as HTMLInputElement).value).toBe("128");
    });
  });

  it("hash MISMATCH -> refused with Use-anyway/Cancel; use-anyway loads fresh", async () => {
    const { project, analysis } = analyzeFixture({});
    STORE().setComposeFile(project, analysis, { fileName: "keep.mid", fileHash: "deadbeef" });
    useSessionStore.setState({ composeProject: null, composeAnalysis: null });
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await withStubbedDigest(7, async () => {
      dropFile("different.mid", buildMidiBytes({}));
      await waitFor(() => expect(screen.getByTestId("hash-mismatch-banner")).toBeTruthy());
      expect(screen.getByTestId("hash-mismatch-banner").textContent).toContain(
        "does not match your saved session",
      );
      fireEvent.click(screen.getByTestId("mismatch-cancel"));
      await waitFor(() => expect(screen.queryByTestId("hash-mismatch-banner")).toBeNull());
      expect(STORE().composeProject).toBeNull(); // still the prompt
      dropFile("different.mid", buildMidiBytes({}));
      await waitFor(() => expect(screen.getByTestId("hash-mismatch-banner")).toBeTruthy());
      fireEvent.click(screen.getByTestId("mismatch-use-anyway"));
      await waitFor(() => expect(screen.getByTestId("analysis-card")).toBeTruthy());
      expect(STORE().composeSession?.fileName).toBe("different.mid");
      expect(STORE().composeSession?.overrides).toEqual(EMPTY_OVERRIDES); // fresh, not restored
    });
  });

  it("hash NULL (F9: subtle absent, e.g. insecure ctx) -> overrides DROPPED with a visible notice, never silently applied", async () => {
    // NOTE (deviation from the design's re-audit line "crypto.subtle
    // ABSENT in jsdom"): jsdom 30 SHIPS SubtleCrypto, so sha256Hex
    // returns a REAL hash in tests here. The F9 null path is therefore
    // exercised by temporarily removing `subtle` (what an insecure
    // browser context looks like).
    const { project, analysis } = analyzeFixture({});
    STORE().setComposeFile(project, analysis, { fileName: "keep.mid", fileHash: "abc" });
    useSessionStore.setState({ composeProject: null, composeAnalysis: null });
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
      value: {}, // crypto present, subtle absent -> sha256Hex -> null
      configurable: true,
      writable: true,
    });
    try {
      render(<ComposeSurface onOpenImportExport={() => {}} />);
      expect(screen.getByTestId("reupload-hash").textContent).toContain("Saved file hash: abc");
      dropFile("keep.mid", buildMidiBytes({}));
      await waitFor(() =>
        expect(screen.getByTestId("compose-notice").textContent).toContain("could not be verified"),
      );
      expect(STORE().composeSession?.overrides).toEqual(EMPTY_OVERRIDES);
    } finally {
      if (original !== undefined) Object.defineProperty(globalThis, "crypto", original);
    }
  });

  it("saved hash itself unavailable -> prompt discloses it up front", () => {
    const { project, analysis } = analyzeFixture({});
    STORE().setComposeFile(project, analysis, { fileName: "keep.mid", fileHash: null });
    useSessionStore.setState({ composeProject: null, composeAnalysis: null });
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    expect(screen.getByTestId("reupload-hash").textContent).toContain("unavailable");
  });
});

describe("D59 undo keyboard (surface-local, zero App.tsx edits)", () => {
  async function loadedWithEdit(): Promise<void> {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("song.mid");
    const tempo = screen.getByTestId("tempo-input");
    fireEvent.change(tempo, { target: { value: "140" } });
    fireEvent.keyDown(tempo, { key: "Enter" });
    await waitFor(() => expect(STORE().composeSession?.overrides.tempoBpm).toBe(140));
  }

  it("Cmd+Z (meta) undoes the last override; Shift+Cmd+Z redoes", async () => {
    await loadedWithEdit();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }));
    await waitFor(() => expect(STORE().composeSession?.overrides.tempoBpm).toBeNull());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: true }));
    await waitFor(() => expect(STORE().composeSession?.overrides.tempoBpm).toBe(140));
  });

  it("Ctrl+Z works too (cross-platform); bare 'z' NEVER fires", async () => {
    await loadedWithEdit();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    await waitFor(() => expect(STORE().composeSession?.overrides.tempoBpm).toBeNull());
    // restore, then prove a BARE z (no modifier) is inert:
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true }));
    await waitFor(() => expect(STORE().composeSession?.overrides.tempoBpm).toBe(140));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z" }));
    expect(STORE().composeSession?.overrides.tempoBpm).toBe(140);
  });

  it("isTyping guard: Cmd+Z INSIDE a field is left to the native undo", async () => {
    await loadedWithEdit();
    const tempo = screen.getByTestId("tempo-input");
    fireEvent.keyDown(tempo, { key: "z", metaKey: true });
    expect(STORE().composeSession?.overrides.tempoBpm).toBe(140); // UNCHANGED
  });

  it("no compose project loaded -> the listener is inert", () => {
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    expect(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }));
    }).not.toThrow();
    expect(STORE().composeSession).toBeNull();
  });

  it("unmount removes the listener (StrictMode-safe, no leak across modes)", async () => {
    const { unmount } = render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("song.mid");
    unmount();
    const before = STORE().composeSession?.overrides.tempoBpm;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }));
    expect(STORE().composeSession?.overrides.tempoBpm).toBe(before); // no-op after unmount
    STORE().clearCompose();
  });
});

describe("REQ-IO-71: zero network calls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the full upload -> analyze -> override pipeline never touches the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ComposeSurface onOpenImportExport={() => {}} />);
    await uploadToLoaded("quiet.mid");
    const tempo = screen.getByTestId("tempo-input");
    fireEvent.change(tempo, { target: { value: "100" } });
    fireEvent.keyDown(tempo, { key: "Enter" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
