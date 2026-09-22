/**
 * src/components/DirtyPromptModal.test.tsx - PRD-001 REQ-MODE-4.
 *
 * Pins Save / Discard / Cancel resolution. Renders nothing when the
 * store's pendingModeRequest is null; opens when non-null. Save and
 * Discard commit the mode switch; Cancel keeps the user on the
 * current mode.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DirtyPromptModal } from "./DirtyPromptModal";
import { useSessionStore } from "../state/sessionStore";
import { ideaFromChord } from "../../engine/core/idea";

beforeEach(() => {
  localStorage.clear();
  useSessionStore.getState().resetModeSlice();
});

describe("DirtyPromptModal visibility", () => {
  it("renders nothing when pendingModeRequest is null", () => {
    const { container } = render(<DirtyPromptModal />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the modal when pendingModeRequest is set", () => {
    useSessionStore.setState({ pendingModeRequest: "compose" });
    render(<DirtyPromptModal />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Unsaved changes/i)).toBeTruthy();
  });
});

describe("DirtyPromptModal actions", () => {
  it("Save -> saveCurrentIdea + commits the mode switch", () => {
    useSessionStore.getState().setMode("etude");
    useSessionStore.getState().setCurrentIdea(
      ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0),
    );
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
      pendingModeRequest: "explore",
    });
    render(<DirtyPromptModal />);
    fireEvent.click(screen.getByRole("button", { name: /Save and switch/i }));
    expect(useSessionStore.getState().mode).toBe("explore");
    expect(useSessionStore.getState().pendingModeRequest).toBeNull();
    expect(useSessionStore.getState().dirty.etude).toBe("none");
  });

  it("Discard -> reverts + commits the mode switch", () => {
    useSessionStore.getState().setMode("etude");
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
      pendingModeRequest: "compose",
    });
    let revertFired = 0;
    const onRevert = () => {
      revertFired++;
    };
    window.addEventListener("hse:revert-last-accept", onRevert);
    try {
      render(<DirtyPromptModal />);
      fireEvent.click(screen.getByRole("button", { name: /Discard changes/i }));
    } finally {
      window.removeEventListener("hse:revert-last-accept", onRevert);
    }
    expect(revertFired).toBe(1);
    expect(useSessionStore.getState().mode).toBe("compose");
    expect(useSessionStore.getState().pendingModeRequest).toBeNull();
  });

  it("Cancel -> stays on current mode + clears pending", () => {
    useSessionStore.getState().setMode("etude");
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
      pendingModeRequest: "explore",
    });
    render(<DirtyPromptModal />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(useSessionStore.getState().mode).toBe("etude");
    expect(useSessionStore.getState().pendingModeRequest).toBeNull();
    // dirty stays - we did not actually leave the mode
    expect(useSessionStore.getState().dirty.etude).toBe("etude-pending-accept");
  });
});

describe("DirtyPromptModal test-only overrides", () => {
  it("honors a pending override (does NOT require the store)", () => {
    render(<DirtyPromptModal pending="explore" />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("honors an onResolve override (does NOT touch the store)", () => {
    useSessionStore.getState().setMode("etude");
    useSessionStore.setState({ pendingModeRequest: "explore" });
    const seen: Array<"save" | "discard" | "cancel"> = [];
    render(
      <DirtyPromptModal
        onResolve={(action) => {
          seen.push(action);
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Save and switch/i }));
    expect(seen).toEqual(["save"]);
    expect(useSessionStore.getState().pendingModeRequest).toBe("explore");
  });
});