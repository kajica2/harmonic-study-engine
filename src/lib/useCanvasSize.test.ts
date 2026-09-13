// @vitest-environment jsdom
/**
 * Tests for useCanvasSize.
 *
 * Pin:
 *  - Returns the fallback size on first render (no ref yet).
 *  - Returns the element's offsetWidth/offsetHeight after mount.
 *  - Updates on window.resize.
 *  - Updates on ResizeObserver trigger (when the container size changes
 *    without a window resize — e.g. sidebar toggle).
 *  - Cleans up window listener + ResizeObserver on unmount.
 *  - Doesn't re-run the effect when the ref identity changes (we
 *    intentionally don't depend on it — ref mutations are silent).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useCanvasSize } from "./useCanvasSize";

// Polyfill ResizeObserver in jsdom (not present by default).
type ROInstance = { observe: any; disconnect: any; trigger: (w: number, h: number) => void };
let roInstances: ROInstance[] = [];

beforeEach(() => {
  roInstances = [];
  (globalThis as any).ResizeObserver = class {
    private cb: (entries: any[]) => void;
    constructor(cb: (entries: any[]) => void) {
      this.cb = cb;
      roInstances.push({
        observe: vi.fn(),
        disconnect: vi.fn(),
        trigger: (w, h) =>
          this.cb([
            {
              contentRect: { width: w, height: h },
              target: { offsetWidth: w, offsetHeight: h },
            },
          ]),
      });
    }
    observe(el: any) {
      roInstances[roInstances.length - 1].observe(el);
    }
    disconnect() {
      roInstances[roInstances.length - 1].disconnect();
    }
  };
});

afterEach(() => {
  delete (globalThis as any).ResizeObserver;
});

describe("useCanvasSize", () => {
  it("returns the fallback size when ref is null on first render", () => {
    const ref = { current: null } as unknown as React.RefObject<HTMLDivElement>;
    const { result } = renderHook(() => useCanvasSize(ref, { width: 100, height: 50 }));
    expect(result.current).toEqual({ width: 100, height: 50 });
  });

  it("returns the element's offsetWidth/offsetHeight after mount", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "offsetWidth", { configurable: true, value: 320 });
    Object.defineProperty(el, "offsetHeight", { configurable: true, value: 200 });
    document.body.appendChild(el);
    const ref = { current: el } as unknown as React.RefObject<HTMLDivElement>;
    const { result } = renderHook(() => useCanvasSize(ref, { width: 0, height: 0 }));
    expect(result.current).toEqual({ width: 320, height: 200 });
    document.body.removeChild(el);
  });

  it("uses default fallback of 800x400 when none is given", () => {
    const ref = { current: null } as unknown as React.RefObject<HTMLDivElement>;
    const { result } = renderHook(() => useCanvasSize(ref));
    expect(result.current).toEqual({ width: 800, height: 400 });
  });

  it("updates on window resize", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "offsetWidth", { configurable: true, value: 320 });
    Object.defineProperty(el, "offsetHeight", { configurable: true, value: 200 });
    document.body.appendChild(el);
    const ref = { current: el } as unknown as React.RefObject<HTMLDivElement>;
    const { result } = renderHook(() => useCanvasSize(ref, { width: 0, height: 0 }));
    expect(result.current).toEqual({ width: 320, height: 200 });
    // Simulate resize: change offsetWidth, fire window resize event.
    Object.defineProperty(el, "offsetWidth", { configurable: true, value: 640 });
    Object.defineProperty(el, "offsetHeight", { configurable: true, value: 400 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toEqual({ width: 640, height: 400 });
    document.body.removeChild(el);
  });

  it("updates on ResizeObserver trigger (container-only resize)", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "offsetWidth", { configurable: true, value: 320 });
    Object.defineProperty(el, "offsetHeight", { configurable: true, value: 200 });
    document.body.appendChild(el);
    const ref = { current: el } as unknown as React.RefObject<HTMLDivElement>;
    const { result } = renderHook(() => useCanvasSize(ref, { width: 0, height: 0 }));
    expect(roInstances).toHaveLength(1);
    // Simulate a sidebar toggle: container shrinks without window resize.
    Object.defineProperty(el, "offsetWidth", { configurable: true, value: 200 });
    Object.defineProperty(el, "offsetHeight", { configurable: true, value: 180 });
    act(() => {
      roInstances[0].trigger(200, 180);
    });
    expect(result.current).toEqual({ width: 200, height: 180 });
    document.body.removeChild(el);
  });

  it("cleans up window listener and ResizeObserver on unmount", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const ref = { current: el } as React.RefObject<HTMLDivElement>;
    const addSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useCanvasSize(ref, { width: 0, height: 0 }));
    expect(roInstances[0].observe).toHaveBeenCalledWith(el);
    unmount();
    expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(roInstances[0].disconnect).toHaveBeenCalled();
    addSpy.mockRestore();
    document.body.removeChild(el);
  });

  it("does not throw when ref.current is null on unmount", () => {
    const ref = { current: null } as unknown as React.RefObject<HTMLDivElement>;
    const { unmount } = renderHook(() => useCanvasSize(ref, { width: 0, height: 0 }));
    expect(() => unmount()).not.toThrow();
  });
});