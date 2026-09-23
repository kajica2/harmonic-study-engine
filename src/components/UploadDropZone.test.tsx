/**
 * src/components/UploadDropZone.test.tsx - PRD-001 Phase 4 Slice 2
 * (test plan 4): drag counter (no flicker), drop + extension gate,
 * busy disabling, keyboard-accessible browse.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadDropZone } from "./UploadDropZone";

function fileNamed(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "audio/midi" });
}

describe("UploadDropZone", () => {
  it("renders the browse affordance + hidden .mid/.midi input", () => {
    render(<UploadDropZone onFile={() => {}} busy={false} />);
    expect(screen.getByTestId("upload-browse")).toBeTruthy();
    const input = screen.getByTestId("midi-file-input") as HTMLInputElement;
    expect(input.accept).toBe(".mid,.midi");
    expect(input.getAttribute("aria-label")).toBe("MIDI file input");
  });

  it("dragenter highlights, nested enter/leave does NOT flicker, dragleave out clears", () => {
    render(<UploadDropZone onFile={() => {}} busy={false} />);
    const zone = screen.getByTestId("upload-drop-zone");
    fireEvent.dragEnter(zone);
    fireEvent.dragEnter(zone); // descendant re-enter
    fireEvent.dragLeave(zone); // descendant leave
    expect(zone.getAttribute("data-over")).toBe("true"); // still over (counter)
    fireEvent.dragLeave(zone); // real leave
    expect(zone.getAttribute("data-over")).toBe("false");
  });

  it("drop with a .mid file calls onFile and clears the highlight", () => {
    const onFile = vi.fn();
    render(<UploadDropZone onFile={onFile} busy={false} />);
    const zone = screen.getByTestId("upload-drop-zone");
    fireEvent.dragEnter(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [fileNamed("song.mid")] } });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("song.mid");
    expect(zone.getAttribute("data-over")).toBe("false");
  });

  it("drop of a .midi file is accepted; a wrong extension is REJECTED with a visible message", () => {
    const onFile = vi.fn();
    render(<UploadDropZone onFile={onFile} busy={false} />);
    const zone = screen.getByTestId("upload-drop-zone");
    fireEvent.drop(zone, { dataTransfer: { files: [fileNamed("song.MIDI")] } });
    expect(onFile).toHaveBeenCalledTimes(1);
    fireEvent.drop(zone, { dataTransfer: { files: [fileNamed("notes.txt")] } });
    expect(onFile).toHaveBeenCalledTimes(1); // not called again
    expect(screen.getByTestId("upload-rejected").textContent).toContain("notes.txt");
  });

  it("busy disables the input + browse and ignores drops", () => {
    const onFile = vi.fn();
    render(<UploadDropZone onFile={onFile} busy />);
    const zone = screen.getByTestId("upload-drop-zone");
    fireEvent.drop(zone, { dataTransfer: { files: [fileNamed("song.mid")] } });
    expect(onFile).not.toHaveBeenCalled();
    expect((screen.getByTestId("midi-file-input") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("upload-browse") as HTMLButtonElement).disabled).toBe(true);
  });

  it("browse button is keyboard accessible (button role) and clicks the hidden input", () => {
    render(<UploadDropZone onFile={() => {}} busy={false} />);
    const input = screen.getByTestId("midi-file-input");
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "browse for one" }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("input change routes the file and resets the value (same-file reselect works)", () => {
    const onFile = vi.fn();
    render(<UploadDropZone onFile={onFile} busy={false} />);
    const input = screen.getByTestId("midi-file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileNamed("again.mid")] } });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });
});
