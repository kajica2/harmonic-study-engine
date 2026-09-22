/**
 * src/components/ModeGate.test.tsx - PRD-001 REQ-MODE-1..3.
 *
 * Pins the surface selection by effective mode, the URL bootstrap on
 * mount (URL > store > etude default), and that the Etude surface
 * receives the AppMain slot unchanged.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModeGate } from "./ModeGate";
import { useSessionStore } from "../state/sessionStore";

beforeEach(() => {
  localStorage.clear();
  useSessionStore.getState().resetModeSlice();
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