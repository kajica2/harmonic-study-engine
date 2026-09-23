/**
 * src/components/ModeGate.test.tsx - PRD-001 REQ-MODE-1..4.
 *
 * Pins the surface selection by effective mode, the URL bootstrap on
 * mount (URL > store > etude default), and that the Etude surface
 * receives the AppMain slot unchanged.
 *
 * Fix-round-2 regression block: the gate is LIVE after mount - a
 * post-mount store.mode change MUST switch the surface (selector
 * clicks, 1/2/3 shortcuts, dirty-prompt Save/Discard), while the URL
 * is consulted at boot ONLY (the App-level store->URL sync is 200ms
 * debounced; a post-mount URL re-read would race a just-written
 * store mode and revert the surface).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { ModeGate } from "./ModeGate";
import { DirtyPromptModal } from "./DirtyPromptModal";
import { useSessionStore } from "../state/sessionStore";
import { ideaFromChord } from "../../engine/core/idea";

beforeEach(() => {
  localStorage.clear();
  useSessionStore.getState().resetModeSlice();
  window.history.replaceState({}, "", "/");
});

describe("ModeGate surface selection", () => {
  it("renders AppMain when mode is etude (explicit)", () => {
    useSessionStore.getState().setMode("etude");
    render(
      <ModeGate
        AppMain={<div data-testid="app-main">etude-surface</div>}
        onOpenImportExport={() => {}}
      />,
    );
    expect(screen.getByTestId("app-main")).toBeTruthy();
  });

  it("renders AppMain when mode is null (legacy first-run -> etude)", () => {
    render(
      <ModeGate
        AppMain={<div data-testid="app-main">legacy-surface</div>}
        onOpenImportExport={() => {}}
      />,
    );
    expect(screen.getByTestId("app-main")).toBeTruthy();
  });

  it("renders ComposeSurface when mode is compose", () => {
    useSessionStore.getState().setMode("compose");
    render(
      <ModeGate
        AppMain={<div data-testid="app-main">should-not-show</div>}
        onOpenImportExport={() => {}}
      />,
    );
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();
    expect(screen.queryByTestId("app-main")).toBeNull();
  });

  it("renders ExploreSurface when mode is explore", () => {
    useSessionStore.getState().setMode("explore");
    render(
      <ModeGate
        AppMain={<div data-testid="app-main">should-not-show</div>}
        onOpenImportExport={() => {}}
      />,
    );
    expect(screen.getByText(/Explore a seed/i)).toBeTruthy();
    expect(screen.queryByTestId("app-main")).toBeNull();
  });

  it("Compose surface wires onOpenImportExport to the button click", () => {
    useSessionStore.getState().setMode("compose");
    let opened = 0;
    render(
      <ModeGate
        AppMain={<div>no</div>}
        onOpenImportExport={() => {
          opened++;
        }}
      />,
    );
    screen.getByText(/Open import \/ export/).click();
    expect(opened).toBe(1);
  });
});

describe("ModeGate URL bootstrap on mount", () => {
  it("URL ?mode=compose wins over a stored 'etude'", () => {
    useSessionStore.getState().setMode("etude");
    window.history.replaceState({}, "", "/?mode=compose");
    render(
      <ModeGate
        AppMain={<div data-testid="app-main">no</div>}
        onOpenImportExport={() => {}}
      />,
    );
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();
    // The store was also updated so the URL-bootstrap is sticky.
    expect(useSessionStore.getState().mode).toBe("compose");
    window.history.replaceState({}, "", "/");
  });

  it("falls back to stored mode when URL has no ?mode param", () => {
    useSessionStore.getState().setMode("explore");
    window.history.replaceState({}, "", "/");
    render(
      <ModeGate
        AppMain={<div>no</div>}
        onOpenImportExport={() => {}}
      />,
    );
    expect(screen.getByText(/Explore a seed/i)).toBeTruthy();
  });

  it("falls back to etude when both URL and store are empty", () => {
    window.history.replaceState({}, "", "/");
    render(
      <ModeGate
        AppMain={<div data-testid="app-main">etude-fallback</div>}
        onOpenImportExport={() => {}}
      />,
    );
    expect(screen.getByTestId("app-main")).toBeTruthy();
    expect(useSessionStore.getState().mode).toBe("etude");
  });
});

describe("ModeGate live surface switching after mount (fix round 2)", () => {
  const mountGate = () =>
    render(
      <ModeGate
        AppMain={<div data-testid="app-main">etude-surface</div>}
        onOpenImportExport={() => {}}
      />,
    );

  it("etude -> compose -> explore -> etude via store writes switches surfaces", () => {
    useSessionStore.getState().setMode("etude");
    mountGate();
    expect(screen.getByTestId("app-main")).toBeTruthy();

    act(() => {
      useSessionStore.getState().setMode("compose");
    });
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();
    expect(screen.queryByTestId("app-main")).toBeNull();

    act(() => {
      useSessionStore.getState().setMode("explore");
    });
    expect(screen.getByText(/Explore a seed/i)).toBeTruthy();
    expect(screen.queryByText(/Drop a .mid file/i)).toBeNull();

    act(() => {
      useSessionStore.getState().setMode("etude");
    });
    expect(screen.getByTestId("app-main")).toBeTruthy();
    expect(screen.queryByText(/Explore a seed/i)).toBeNull();
  });

  it("legacy null boot (-> etude) also switches live on the first setMode", () => {
    // resetModeSlice leaves mode === null; boot renders the etude
    // fallback and the mount effect writes "etude" back.
    mountGate();
    expect(screen.getByTestId("app-main")).toBeTruthy();
    expect(useSessionStore.getState().mode).toBe("etude");

    act(() => {
      useSessionStore.getState().setMode("compose");
    });
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();
    expect(screen.queryByTestId("app-main")).toBeNull();
  });
});

describe("ModeGate URL-read-once rule (fix round 2)", () => {
  const mountGate = () =>
    render(
      <ModeGate
        AppMain={<div data-testid="app-main">etude-surface</div>}
        onOpenImportExport={() => {}}
      />,
    );

  it("post-mount setMode wins over a still-stale URL (debounced-sync race)", () => {
    // Boot: URL ?mode=compose wins (unchanged precedence, pinned in
    // the bootstrap describe above). Then the store moves while the
    // URL is still stale - exactly the window the App-level 200ms
    // debounced replaceState creates. The gate MUST follow the store,
    // never re-read the URL.
    useSessionStore.getState().setMode("etude");
    window.history.replaceState({}, "", "/?mode=compose");
    mountGate();
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();

    act(() => {
      useSessionStore.getState().setMode("etude");
    });
    expect(screen.getByTestId("app-main")).toBeTruthy();
    expect(screen.queryByText(/Drop a .mid file/i)).toBeNull();
    // URL was deliberately left stale above; prove that is what we
    // are overriding (a URL re-read would flip us back to compose).
    expect(window.location.search).toBe("?mode=compose");
  });

  it("mutating the URL after mount does NOT hijack the surface", () => {
    useSessionStore.getState().setMode("explore");
    const { rerender } = render(
      <ModeGate
        AppMain={<div data-testid="app-main">etude-surface</div>}
        onOpenImportExport={() => {}}
      />,
    );
    expect(screen.getByText(/Explore a seed/i)).toBeTruthy();

    act(() => {
      window.history.replaceState({}, "", "/?mode=compose");
    });
    // Force a real re-render with the URL now claiming compose. A
    // post-boot URL re-read (the regression) would flip the surface;
    // the live contract must keep Explore.
    rerender(
      <ModeGate
        AppMain={<div data-testid="app-main">etude-surface</div>}
        onOpenImportExport={() => {}}
      />,
    );
    expect(screen.getByText(/Explore a seed/i)).toBeTruthy();
    expect(screen.queryByText(/Drop a .mid file/i)).toBeNull();
  });
});

describe("ModeGate + DirtyPromptModal end-to-end (REQ-MODE-4 fix round 2)", () => {
  const seedDirtyEtude = () => {
    useSessionStore.getState().setMode("etude");
    useSessionStore.getState().setCurrentIdea(
      ideaFromChord("etude", "Cmaj7", 1_700_000_000_000, 0),
    );
    useSessionStore.setState({
      dirty: { compose: "none", etude: "etude-pending-accept", explore: "none" },
    });
  };

  const mountGateWithModal = () =>
    render(
      <>
        <ModeGate
          AppMain={<div data-testid="app-main">etude-surface</div>}
          onOpenImportExport={() => {}}
        />
        <DirtyPromptModal />
      </>,
    );

  it("requestMode while dirty parks the switch - surface UNCHANGED", () => {
    seedDirtyEtude();
    mountGateWithModal();
    act(() => {
      useSessionStore.getState().requestMode("compose");
    });
    expect(useSessionStore.getState().pendingModeRequest).toBe("compose");
    expect(useSessionStore.getState().mode).toBe("etude");
    // Etude surface stays; modal is up; compose surface NOT mounted.
    expect(screen.getByTestId("app-main")).toBeTruthy();
    expect(screen.queryByText(/Drop a .mid file/i)).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Save and switch -> mode committed -> ComposeSurface renders", () => {
    seedDirtyEtude();
    mountGateWithModal();
    act(() => {
      useSessionStore.getState().requestMode("compose");
    });
    fireEvent.click(screen.getByRole("button", { name: /Save and switch/i }));
    expect(useSessionStore.getState().mode).toBe("compose");
    expect(useSessionStore.getState().pendingModeRequest).toBeNull();
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();
    expect(screen.queryByTestId("app-main")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Discard changes -> mode committed -> ComposeSurface renders", () => {
    seedDirtyEtude();
    mountGateWithModal();
    act(() => {
      useSessionStore.getState().requestMode("compose");
    });
    fireEvent.click(screen.getByRole("button", { name: /Discard changes/i }));
    expect(useSessionStore.getState().mode).toBe("compose");
    expect(screen.getByText(/Drop a .mid file/i)).toBeTruthy();
    expect(screen.queryByTestId("app-main")).toBeNull();
  });

  it("Cancel -> stays on the Etude surface", () => {
    seedDirtyEtude();
    mountGateWithModal();
    act(() => {
      useSessionStore.getState().requestMode("compose");
    });
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(useSessionStore.getState().mode).toBe("etude");
    expect(useSessionStore.getState().pendingModeRequest).toBeNull();
    expect(screen.getByTestId("app-main")).toBeTruthy();
    expect(screen.queryByText(/Drop a .mid file/i)).toBeNull();
  });
});