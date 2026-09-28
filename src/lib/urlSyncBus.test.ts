/**
 * src/lib/urlSyncBus.test.ts - PRD-001 Phase 8 S1 (D149, doc 6.1).
 *
 * jsdom via JSDOM_FILES (vitest 5 ignores per-file env comments -
 * the list is the only opt-in, AGENTS gotcha). 8 pins replicating
 * the SHIPPED writer contract (App.tsx:1540-1604) on the extracted
 * bus: the 200ms coalescing, the idempotent re-arm, the pagehide
 * flush law (pending -> write NOW; no-pending -> NO write, the
 * shipped :1593 law), the StrictMode register/unregister exact
 * inverses, and the never-throw-without-a-writer safety.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  URL_WRITE_DEBOUNCE_MS,
  flushUrlWrite,
  registerUrlWriter,
  scheduleUrlWrite,
} from "./urlSyncBus";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduleUrlWrite (the shipped debounce contract)", () => {
  it("coalesces multiple schedules within 200ms into ONE write", () => {
    expect(URL_WRITE_DEBOUNCE_MS).toBe(200);
    const write = vi.fn();
    const unregister = registerUrlWriter(write);
    scheduleUrlWrite();
    scheduleUrlWrite();
    scheduleUrlWrite();
    vi.advanceTimersByTime(199);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("re-arm EXTENDS the window (clearTimeout + set - the shipped shape)", () => {
    const write = vi.fn();
    const unregister = registerUrlWriter(write);
    scheduleUrlWrite();
    vi.advanceTimersByTime(100);
    scheduleUrlWrite(); // re-arms: 100ms in, another 200 from here
    vi.advanceTimersByTime(100);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(write).toHaveBeenCalledTimes(1);
    unregister();
  });
});

describe("flushUrlWrite (the shipped pagehide law, relocated)", () => {
  it("pending -> clearTimeout + write() NOW, exactly once", () => {
    const write = vi.fn();
    const unregister = registerUrlWriter(write);
    scheduleUrlWrite();
    flushUrlWrite();
    expect(write).toHaveBeenCalledTimes(1); // SYNCHRONOUS (pagehide contract)
    vi.advanceTimersByTime(1_000);
    expect(write).toHaveBeenCalledTimes(1); // timer CLEARED, no double write
    unregister();
  });

  it("no pending -> NO write (the shipped :1593 'URL already current' law)", () => {
    const write = vi.fn();
    const unregister = registerUrlWriter(write);
    flushUrlWrite();
    expect(write).not.toHaveBeenCalled();
    unregister();
  });

  it("flush is synchronous and a later schedule arms a FRESH cycle", () => {
    let settled = false;
    const write = vi.fn(() => {
      settled = true;
    });
    const unregister = registerUrlWriter(write);
    scheduleUrlWrite();
    flushUrlWrite();
    expect(settled).toBe(true); // no await, no timer - the flush IS the write
    scheduleUrlWrite();
    vi.advanceTimersByTime(200);
    expect(write).toHaveBeenCalledTimes(2);
    unregister();
  });
});

describe("registerUrlWriter (StrictMode exact inverses)", () => {
  it("an unregister never clobbers a NEWER registration", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unA = registerUrlWriter(a);
    const unB = registerUrlWriter(b); // remount: b wins
    unA(); // stale inverse - must NOT clear b
    scheduleUrlWrite();
    vi.advanceTimersByTime(200);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    unB();
  });

  it("flush WITHOUT a registered writer never throws (pending timer cleared)", () => {
    scheduleUrlWrite();
    expect(() => flushUrlWrite()).not.toThrow();
    // The pending timer was cleared by the flush: a later schedule +
    // advance fires exactly once with the NEW writer.
    const write = vi.fn();
    const unregister = registerUrlWriter(write);
    scheduleUrlWrite();
    vi.advanceTimersByTime(200);
    expect(write).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("schedule WITHOUT a writer fires a no-op, never a throw", () => {
    scheduleUrlWrite();
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
  });
});
