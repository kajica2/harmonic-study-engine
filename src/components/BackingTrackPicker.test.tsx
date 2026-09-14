// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BackingTrackPicker } from "./BackingTrackPicker";
import { ACCEPT_ATTR } from "../lib/backingTrack";

// jsdom polyfills (same as backingTrack.test.ts).
if (typeof URL.createObjectURL !== "function") {
  let n = 0;
  (URL as unknown as {
    createObjectURL: (b: Blob) => string;
    revokeObjectURL: (u: string) => void;
  }).createObjectURL = () => `blob:test-${++n}`;
  (URL as unknown as {
    createObjectURL: (b: Blob) => string;
    revokeObjectURL: (u: string) => void;
  }).revokeObjectURL = () => {};
}

function makeFile(name: string, sizeBytes: number, type: string): File {
  const actualBytes = Math.min(sizeBytes, 64 * 1024);
  const blob = new Blob([new Uint8Array(actualBytes)], { type });
  const file = new File([blob], name, { type });
  if (sizeBytes !== actualBytes) {
    Object.defineProperty(file, "size", {
      value: sizeBytes,
      configurable: true,
    });
  }
  return file;
}

describe("BackingTrackPicker", () => {
  it("renders the load button when no track is loaded", () => {
    render(
      <BackingTrackPicker
        track={null}
        onLoaded={() => {}}
        onUnloaded={() => {}}
        isPlayingAuto={false}
        muted={false}
        onToggleMuted={() => { /* null-guard applied — StageFrame fix C */ }}
      />,
    );
    expect(screen.getByTestId("backing-track-load")).toBeTruthy();
    expect(screen.queryByTestId("backing-track-toggle")).toBeNull();
    expect(screen.queryByTestId("backing-track-remove")).toBeNull();
  });

  it("file input has the .mov/.mpg/.mp4 accept attribute", () => {
    render(
      <BackingTrackPicker
        track={null}
        onLoaded={() => {}}
        onUnloaded={() => {}}
        isPlayingAuto={false}
        muted={false}
        onToggleMuted={() => { /* null-guard applied — StageFrame fix C */ }}
      />,
    );
    const input = screen.getByTestId("backing-track-input") as HTMLInputElement;
    expect(input.getAttribute("accept")).toBe(ACCEPT_ATTR);
    // Sanity check: the attribute contains the three requested extensions.
    expect(input.getAttribute("accept")).toContain(".mov");
    expect(input.getAttribute("accept")).toContain(".mpg");
    expect(input.getAttribute("accept")).toContain(".mp4");
  });

  it("calls onLoaded when a valid file is picked", () => {
    const onLoaded = vi.fn();
    render(
      <BackingTrackPicker
        track={null}
        onLoaded={onLoaded}
        onUnloaded={() => {}}
        isPlayingAuto={false}
        muted={false}
        onToggleMuted={() => { /* null-guard applied — StageFrame fix C */ }}
      />,
    );
    const input = screen.getByTestId("backing-track-input") as HTMLInputElement;
    const file = makeFile("solo.mp4", 4096, "video/mp4");
    // fireEvent.change with a real File in jsdom — DataTransfer isn't
    // available, so we set files directly on the input.
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);
    expect(onLoaded).toHaveBeenCalledOnce();
    const arg = onLoaded.mock.calls[0][0];
    expect(arg.name).toBe("solo.mp4");
    expect(arg.mimeType).toBe("video/mp4");
    expect(arg.url).toMatch(/^blob:/);
  });

  it("shows an error and does NOT call onLoaded for an invalid file", () => {
    const onLoaded = vi.fn();
    render(
      <BackingTrackPicker
        track={null}
        onLoaded={onLoaded}
        onUnloaded={() => {}}
        isPlayingAuto={false}
        muted={false}
        onToggleMuted={() => { /* null-guard applied — StageFrame fix C */ }}
      />,
    );
    const input = screen.getByTestId("backing-track-input") as HTMLInputElement;
    const file = makeFile("notes.pdf", 1024, "application/pdf");
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    fireEvent.change(input);
    expect(onLoaded).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/Unsupported/i);
  });

  it("renders the toggle + remove buttons when a track is loaded", () => {
    render(
      <BackingTrackPicker
        track={{
          url: "blob:fake",
          name: "solo.mp4",
          mimeType: "video/mp4",
          sizeBytes: 4096,
        }}
        onLoaded={() => {}}
        onUnloaded={() => {}}
        isPlayingAuto={false}
        muted={false}
        onToggleMuted={() => { /* null-guard applied — StageFrame fix C */ }}
      />,
    );
    expect(screen.getByTestId("backing-track-toggle")).toBeTruthy();
    expect(screen.getByTestId("backing-track-remove")).toBeTruthy();
    expect(screen.getByTestId("backing-track-toggle").textContent).toContain("solo.mp4");
  });

  it("calls onUnloaded when the remove button is clicked", () => {
    const onUnloaded = vi.fn();
    render(
      <BackingTrackPicker
        track={{
          url: "blob:fake",
          name: "solo.mp4",
          mimeType: "video/mp4",
          sizeBytes: 4096,
        }}
        onLoaded={() => {}}
        onUnloaded={onUnloaded}
        isPlayingAuto={false}
        muted={false}
        onToggleMuted={() => { /* null-guard applied — StageFrame fix C */ }}
      />,
    );
    fireEvent.click(screen.getByTestId("backing-track-remove"));
    expect(onUnloaded).toHaveBeenCalledOnce();
  });

  it("calls onToggleMuted when the toggle is clicked", () => {
    const onToggleMuted = vi.fn();
    render(
      <BackingTrackPicker
        track={{
          url: "blob:fake",
          name: "solo.mp4",
          mimeType: "video/mp4",
          sizeBytes: 4096,
        }}
        onLoaded={() => {}}
        onUnloaded={() => {}}
        isPlayingAuto={false}
        muted={false}
        onToggleMuted={onToggleMuted}
      />,
    );
    fireEvent.click(screen.getByTestId("backing-track-toggle"));
    expect(onToggleMuted).toHaveBeenCalledOnce();
  });

  it("shows the muted indicator when muted=true", () => {
    render(
      <BackingTrackPicker
        track={{
          url: "blob:fake",
          name: "solo.mp4",
          mimeType: "video/mp4",
          sizeBytes: 4096,
        }}
        onLoaded={() => {}}
        onUnloaded={() => {}}
        isPlayingAuto={false}
        muted={true}
        onToggleMuted={() => { /* null-guard applied — StageFrame fix C */ }}
      />,
    );
    const toggle = screen.getByTestId("backing-track-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toContain("○");
  });
});
