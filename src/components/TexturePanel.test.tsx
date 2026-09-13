import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TexturePanel } from "./TexturePanel";

describe("TexturePanel", () => {
  it("renders 3 track toggle cards (Drums, Bass, Piano)", () => {
    render(
      <TexturePanel
        drumsMuted={false}
        bassMuted={false}
        pianoMuted={false}
        setDrumsMuted={() => {}}
        setBassMuted={() => {}}
        setPianoMuted={() => {}}
      />,
    );
    expect(screen.getByText("Drums")).toBeTruthy();
    expect(screen.getByText("Bass")).toBeTruthy();
    expect(screen.getByText("Piano")).toBeTruthy();
  });

  it("clicking Drums calls setDrumsMuted with toggled value", () => {
    const setDrumsMuted = vi.fn();
    render(
      <TexturePanel
        drumsMuted={false}
        bassMuted={false}
        pianoMuted={false}
        setDrumsMuted={setDrumsMuted}
        setBassMuted={() => {}}
        setPianoMuted={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Drums"));
    expect(setDrumsMuted).toHaveBeenCalledWith(true);
  });

  it("muted state is reflected in aria-pressed", () => {
    render(
      <TexturePanel
        drumsMuted={true}
        bassMuted={false}
        pianoMuted={false}
        setDrumsMuted={() => {}}
        setBassMuted={() => {}}
        setPianoMuted={() => {}}
      />,
    );
    expect(screen.getByText("Drums").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Bass").getAttribute("aria-pressed")).toBe("false");
  });

  it("renders the counter-line button when handler provided", () => {
    render(
      <TexturePanel
        drumsMuted={false}
        bassMuted={false}
        pianoMuted={false}
        setDrumsMuted={() => {}}
        setBassMuted={() => {}}
        setPianoMuted={() => {}}
        counterLineActive={false}
        onToggleCounterLine={() => {}}
      />,
    );
    expect(screen.getByText("Layer counter-line")).toBeTruthy();
  });

  it("counter-line button reflects active state", () => {
    render(
      <TexturePanel
        drumsMuted={false}
        bassMuted={false}
        pianoMuted={false}
        setDrumsMuted={() => {}}
        setBassMuted={() => {}}
        setPianoMuted={() => {}}
        counterLineActive={true}
        onToggleCounterLine={() => {}}
      />,
    );
    expect(screen.getByText("Counter-line on").getAttribute("aria-pressed")).toBe("true");
  });

  it("counter-line button click calls onToggleCounterLine", () => {
    const onToggleCounterLine = vi.fn();
    render(
      <TexturePanel
        drumsMuted={false}
        bassMuted={false}
        pianoMuted={false}
        setDrumsMuted={() => {}}
        setBassMuted={() => {}}
        setPianoMuted={() => {}}
        onToggleCounterLine={onToggleCounterLine}
      />,
    );
    fireEvent.click(screen.getByText("Layer counter-line"));
    expect(onToggleCounterLine).toHaveBeenCalledTimes(1);
  });

  it("omits counter-line button when no handler provided", () => {
    render(
      <TexturePanel
        drumsMuted={false}
        bassMuted={false}
        pianoMuted={false}
        setDrumsMuted={() => {}}
        setBassMuted={() => {}}
        setPianoMuted={() => {}}
      />,
    );
    expect(screen.queryByText(/Layer counter-line|Counter-line on/)).toBeNull();
  });
});
