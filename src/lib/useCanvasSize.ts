/**
 * useCanvasSize — observes an HTML element's offsetWidth/offsetHeight
 * and re-renders whenever they change (initial mount, window resize,
 * container layout change).
 *
 * Extracted from App.tsx. Returns the current size as `{width, height}`
 * and listens on `window.resize` + ResizeObserver on the target ref.
 * Both listeners are cleaned up on unmount.
 *
 * Used by SynesthesiaCanvas to keep its render surface sized to its
 * container. Defaults to 800×400 if no ref is attached yet.
 *
 * Tests: src/lib/useCanvasSize.test.ts
 */
import { useEffect, useState, type RefObject } from "react";

export interface CanvasSize {
  width: number;
  height: number;
}

export function useCanvasSize(
  ref: RefObject<HTMLElement | null>,
  fallback: CanvasSize = { width: 800, height: 400 },
): CanvasSize {
  const [size, setSize] = useState<CanvasSize>(fallback);

  useEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    };

    // Initial size.
    update();

    window.addEventListener("resize", update);

    // ResizeObserver for container changes that don't bubble up to
    // window.resize (e.g. sidebar toggle changes container width).
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && ref.current) {
      observer = new ResizeObserver(update);
      observer.observe(ref.current);
    }

    return () => {
      window.removeEventListener("resize", update);
      if (observer) observer.disconnect();
    };
    // ref is read-only inside the effect — we intentionally do not
    // depend on it. Re-running on ref identity would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return size;
}