/**
 * src/components/IdeaBar.test.tsx - PRD-001 REQ-MODE-6, REQ-IDEA-3.
 *
 * Pins the empty-state copy, the populated chip layout, the disabled
 * state of Save / Share when there's no current idea, and the Send-to
 * dropdown's placeholder + disabled option labels.
 *
 * HIGH-003 (Phase 1 fix-round): extends the empty-state describe
 * block with an assertion that clicking the `+` button with a loaded
 * active step mints an etude-source Idea with the transposed chord
 * name in the session store.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IdeaBar } from "./IdeaBar";
import { useSessionStore } from "../state/sessionStore";
import { ideaFromChord } from "../../engine/core/idea";
import type { HarmonicStep } from "../lib/paths";

beforeEach(() => {
  localStorage.clear();
  useSessionStore.getState().resetModeSlice();
  // Stub clipboard so the Share button can be exercised without
  // pulling in the real WebAPI.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("IdeaBar empty state", () => {
  it("renders the PRD 9.6 empty copy verbatim", () => {
    render(<IdeaBar />);
    expect(
      screen.getByText(
        "Play something or generate an etude to start an idea.",
      ),
    ).toBeTruthy();
  });

  it("renders the + button with the correct aria-label", () => {
    render(<IdeaBar />);
    expect(
      screen.getByLabelText("Create idea from current chord"),
    ).toBeTruthy();
  });

  it("disables Save and Share when no idea is present", () => {
    render(<IdeaBar />);
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Share" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("disables the Send-to dropdown when no idea is present", () => {
    render(<IdeaBar />);
    const select = screen.getByLabelText("Send idea to mode") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });

  it("disables the + button with a 'No chord yet' title when no active step", () => {
    render(<IdeaBar activeStep={null} />);
    const btn = screen.getByLabelText("Create idea from current chord") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe("No chord yet");
  });

  it("clicking + with an active step mints an etude-source Idea with the transposed chord", () => {
    const step: HarmonicStep = {
      name: "Cmaj7",
      notes: [60, 64, 67, 71],
      descriptions: "",
    };
    render(<IdeaBar activeStep={step} transposeShift={2} />);
    const btn = screen.getByLabelText("Create idea from current chord") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    const minted = useSessionStore.getState().currentIdea;
    expect(minted).not.toBeNull();
    expect(minted?.source).toBe("etude");
    expect(minted?.kind).toBe("chord");
    // transposeChordName("Cmaj7", +2) -> "Dmaj7"
    expect(minted?.chord).toBe("Dmaj7");
  });
});

describe("IdeaBar populated state", () => {
  it("renders the chord symbol + source pill", () => {
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    expect(screen.getByText("Cmaj7")).toBeTruthy();
    expect(screen.getByText(/from etude/i)).toBeTruthy();
  });

  it("renders enabled Save and Share buttons", () => {
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Share" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("Save writes the idea to hse.ideas", () => {
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const raw = localStorage.getItem("hse.ideas");
    expect(raw).toBeTruthy();
    const list = JSON.parse(raw as string);
    expect(list).toHaveLength(1);
    expect(list[0].chord).toBe("Cmaj7");
  });

  it("Share copies a ?idea=base64 URL to the clipboard", async () => {
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    // Wait one microtask for the async writeText.
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const arg = (
      navigator.clipboard.writeText as unknown as { mock: { calls: string[][] } }
    ).mock.calls[0][0];
    expect(arg).toContain("?idea=");
    expect(arg).toMatch(/%[0-9A-Fa-f]{2}/); // base64 went through encodeURIComponent
  });

  it("Clear (X) button removes the current idea", () => {
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    fireEvent.click(screen.getByLabelText("Clear current idea"));
    expect(useSessionStore.getState().currentIdea).toBeNull();
  });

  it("Send-to dropdown includes Compose + Explore as enabled (D98)", () => {
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    const select = screen.getByLabelText(
      "Send idea to mode",
    ) as HTMLSelectElement;
    const composeOpt = Array.from(select.options).find((o) =>
      o.value.startsWith("compose"),
    );
    const etudeOpt = Array.from(select.options).find((o) =>
      o.value.startsWith("etude"),
    );
    const exploreOpt = Array.from(select.options).find((o) =>
      o.value.startsWith("explore"),
    );
    expect(composeOpt?.disabled).toBe(false);
    expect(etudeOpt?.disabled).toBe(false);
    expect(exploreOpt?.disabled).toBe(false);
  });

  it("Send-to Compose with a chord idea lands a 1-bar chart + switches mode", () => {
    useSessionStore.getState().setMode("etude");
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    fireEvent.change(screen.getByLabelText("Send idea to mode"), {
      target: { value: "compose" },
    });
    const s = useSessionStore.getState();
    expect(s.mode).toBe("compose");
    expect(s.composeSession?.chartText).toContain("Cmaj7");
  });

  it("Send-to Etude with a chord idea carries constraints (bars 1 -> 4) + switches mode", () => {
    useSessionStore.getState().setMode("compose");
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    fireEvent.change(screen.getByLabelText("Send idea to mode"), {
      target: { value: "etude" },
    });
    const s = useSessionStore.getState();
    expect(s.mode).toBe("etude");
    expect(s.etudeConstraints?.bars).toBe(4);
  });

  it("Send-to Explore navigates with the idea as carrier (no store writes)", () => {
    useSessionStore.getState().setMode("etude");
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    fireEvent.change(screen.getByLabelText("Send idea to mode"), {
      target: { value: "explore" },
    });
    const s = useSessionStore.getState();
    expect(s.mode).toBe("explore");
    expect(s.currentIdea?.chord).toBe("Cmaj7");
  });

  it("Send-to Etude calls requestMode('etude') (clean case)", () => {
    useSessionStore.getState().setMode("compose");
    useSessionStore
      .getState()
      .setCurrentIdea(ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0));
    render(<IdeaBar />);
    fireEvent.change(screen.getByLabelText("Send idea to mode"), {
      target: { value: "etude" },
    });
    expect(useSessionStore.getState().mode).toBe("etude");
  });
});