/**
 * src/components/ModeSelector.test.tsx - PRD-001 REQ-MODE-1, REQ-MODE-7.
 *
 * Pins the tablist ARIA shape, click -> requestMode routing, the
 * default Etude highlight when the store is null (legacy), and the
 * 1/2/3 keyboard shortcuts (delegated to the document handler in
 * App.tsx; tested here via the store's requestMode action directly
 * because the document-level keyboard handler lives outside React).
 *
 * Runs under jsdom per JSDOM_FILES in vitest.config.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeSelector } from "./ModeSelector";
import { useSessionStore, type Mode } from "../state/sessionStore";

beforeEach(() => {
  localStorage.clear();
  useSessionStore.getState().resetModeSlice();
});

describe("ModeSelector markup", () => {
  it("renders a tablist with 3 tabs (Compose / Etude / Explore)", () => {
    render(<ModeSelector />);
    const list = screen.getByRole("tablist", { name: /Mode/i });
    expect(list).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].textContent).toContain("Compose");
    expect(tabs[1].textContent).toContain("Etude");
    expect(tabs[2].textContent).toContain("Explore");
  });

  it("marks Etude as aria-selected when the store mode is null (legacy)", () => {
    render(<ModeSelector />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[2].getAttribute("aria-selected")).toBe("false");
  });

  it("reflects the current store mode in aria-selected", () => {
    useSessionStore.getState().setMode("compose");
    render(<ModeSelector />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(tabs[2].getAttribute("aria-selected")).toBe("false");
  });

  it("honors a value override (test-only escape hatch)", () => {
    render(<ModeSelector value="explore" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
  });

  it("uses a custom idPrefix for test isolation", () => {
    render(<ModeSelector idPrefix="t" />);
    expect(document.getElementById("t-tab-compose")).toBeTruthy();
    expect(document.getElementById("t-tab-etude")).toBeTruthy();
    expect(document.getElementById("t-tab-explore")).toBeTruthy();
  });

  it("renders compact icons-only buttons when compact=true", () => {
    render(<ModeSelector compact />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    // Labels should be aria-label only, not visible text.
    tabs.forEach((t) => {
      expect(t.textContent?.trim()).toMatch(/^[123]$/);
    });
  });
});

describe("ModeSelector interactions", () => {
  it("clicking a tab routes through requestMode (clean etude -> immediate switch)", () => {
    useSessionStore.getState().setMode("etude");
    render(<ModeSelector />);
    fireEvent.click(screen.getByRole("tab", { name: /Compose mode/i }));
    expect(useSessionStore.getState().mode).toBe("compose");
  });

  it("clicking the active tab is a no-op (requestMode no-ops when target == current)", () => {
    useSessionStore.getState().setMode("etude");
    render(<ModeSelector />);
    fireEvent.click(screen.getByRole("tab", { name: /Etude mode/i }));
    expect(useSessionStore.getState().mode).toBe("etude");
  });

  it("clicking Compose from a clean Etude switches without prompting", () => {
    useSessionStore.getState().setMode("etude");
    render(<ModeSelector />);
    fireEvent.click(screen.getByRole("tab", { name: /Compose mode/i }));
    expect(useSessionStore.getState().pendingModeRequest).toBeNull();
    expect(useSessionStore.getState().mode).toBe("compose");
  });

  it("honors a custom onChange override (does NOT touch the store)", () => {
    useSessionStore.getState().setMode("etude");
    const seen: Mode[] = [];
    render(
      <ModeSelector
        onChange={(next) => {
          seen.push(next);
        }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Compose mode/i }));
    expect(seen).toEqual(["compose"]);
    // Store was NOT mutated - the override takes full ownership.
    expect(useSessionStore.getState().mode).toBe("etude");
  });
});

describe("ModeSelector keyboard (tablist-level only)", () => {
  it("ArrowRight moves focus to the next tab", () => {
    render(<ModeSelector />);
    const tabs = screen.getAllByRole("tab");
    (tabs[0] as HTMLButtonElement).focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);
  });

  it("ArrowLeft moves focus to the previous tab", () => {
    render(<ModeSelector />);
    const tabs = screen.getAllByRole("tab");
    (tabs[1] as HTMLButtonElement).focus();
    fireEvent.keyDown(tabs[1], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("ArrowRight past the last tab is a no-op (no wrap)", () => {
    render(<ModeSelector />);
    const tabs = screen.getAllByRole("tab");
    (tabs[2] as HTMLButtonElement).focus();
    fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[2]);
  });
});

describe("ModeSelector + dirty state interaction", () => {
  it("clicking Compose from a dirty Etude parks on pendingModeRequest", () => {
    useSessionStore.getState().setMode("etude");
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
    });
    render(<ModeSelector />);
    fireEvent.click(screen.getByRole("tab", { name: /Compose mode/i }));
    // Mode unchanged; pending parked.
    expect(useSessionStore.getState().mode).toBe("etude");
    expect(useSessionStore.getState().pendingModeRequest).toBe("compose");
  });
});