/**
 * src/lib/tunerCapture.test.ts - pins for the refcounted tuner
 * singleton. Five diagnostic paths (unsupported / insecure / denied /
 * no-mic / suspended), one AudioContext per process, refcounted
 * teardown, and getTunerState() status reporting.
 *
 * jsdom env via JSDOM_FILES (vitest.config.ts): we stub window /
 * navigator at module load and reset between tests so the
 * singleton's module-level state can't leak.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import {
  subscribeTuner,
  getTunerState,
  TunerError,
  tunerCaptureErrorMessage,
  __resetTunerForTests,
} from "./tunerCapture";

// ----- Fake AudioContext infrastructure ---------------------------------

let audioCtxCalls = 0;
let fakeState: "running" | "suspended" = "running";
let lastProcessor: FakeProcessor | null = null;
let lastStream: { getTracks: () => Array<{ stop: Mock }> } | null = null;
let trackStopCount = 0;
let closeCount = 0;

class FakeProcessor {
  onaudioprocess: ((ev: FakeAudioProcessEvent) => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGain {
  gain = { value: 0 };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  state: "running" | "suspended" = fakeState;
  sampleRate = 44100;
  destination = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  constructor() {
    audioCtxCalls++;
  }

  resume() {
    // Does NOT mutate - the suspended test relies on this. The
    // success path sets fakeState to "running" in beforeEach.
    return Promise.resolve();
  }

  close() {
    closeCount++;
    return Promise.resolve();
  }

  createMediaStreamSource(_stream: unknown) {
    return new FakeSource();
  }

  createScriptProcessor(_size: number, _in: number, _out: number) {
    lastProcessor = new FakeProcessor();
    return lastProcessor;
  }

  createGain() {
    return new FakeGain();
  }
}

type FakeAudioProcessEvent = {
  inputBuffer: { getChannelData: (_ch: number) => Float32Array };
};

// ----- Stub helpers -----------------------------------------------------

type WindowExtras = {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  isSecureContext?: boolean;
};

function installAudioContext(extra?: WindowExtras): void {
  const w = window as Window & WindowExtras;
  // Save originals so we can restore in afterEach.
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: FakeAudioContext,
  });
  if (extra?.webkitAudioContext !== undefined) {
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      writable: true,
      value: extra.webkitAudioContext,
    });
  } else {
    delete (w as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  }
  // jsdom exposes window.isSecureContext; the secure test depends
  // on it being true (default for http://localhost/). The insecure
  // test flips it to false.
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    writable: true,
    value: extra?.isSecureContext ?? true,
  });
}

function installGetUserMedia(
  behavior:
    | "ok"
    | "denied"
    | "no-mic"
    | "generic"
    | ((...args: unknown[]) => Promise<MediaStream>),
): void {
  let fn: (...args: unknown[]) => Promise<MediaStream>;
  if (behavior === "ok") {
    const tracks = [{ stop: vi.fn(() => trackStopCount++) }];
    lastStream = { getTracks: () => tracks };
    fn = () => Promise.resolve(lastStream as unknown as MediaStream);
  } else if (behavior === "denied") {
    fn = () =>
      Promise.reject(
        new DOMException("permission denied", "NotAllowedError"),
      ) as Promise<MediaStream>;
  } else if (behavior === "no-mic") {
    fn = () =>
      Promise.reject(
        new DOMException("no device", "NotFoundError"),
      ) as Promise<MediaStream>;
  } else if (behavior === "generic") {
    fn = () =>
      Promise.reject(
        new DOMException("unknown", "UnknownError"),
      ) as Promise<MediaStream>;
  } else {
    fn = behavior;
  }
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    writable: true,
    value: { getUserMedia: fn },
  });
}

function removeMediaDevices(): void {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

// ----- Setup / teardown -------------------------------------------------

beforeEach(() => {
  audioCtxCalls = 0;
  fakeState = "running";
  lastProcessor = null;
  lastStream = null;
  trackStopCount = 0;
  closeCount = 0;
  __resetTunerForTests();
});

afterEach(() => {
  __resetTunerForTests();
  // Restore AudioContext + webkitAudioContext so a test that deletes
  // them doesn't leak into the next.
  const w = window as Window & WindowExtras;
  delete (w as { AudioContext?: typeof AudioContext }).AudioContext;
  delete (w as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;
  // Drop any mediaDevices stub the test installed so the next test
  // starts from jsdom's natural undefined baseline.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  // Drop any isSecureContext stub so the next test starts fresh.
  delete (w as { isSecureContext?: boolean }).isSecureContext;
});

// ----- Diagnostics ------------------------------------------------------

describe("diagnostics", () => {
  it("rejects with kind=unsupported when no AudioContext is available", async () => {
    const w = window as Window & WindowExtras;
    delete w.AudioContext;
    delete w.webkitAudioContext;
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });

    let caught: unknown = null;
    try {
      await subscribeTuner(() => {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TunerError);
    expect((caught as TunerError).kind).toBe("unsupported");
    expect((caught as TunerError).message).toBe(
      tunerCaptureErrorMessage("unsupported"),
    );
    expect(getTunerState().status).toBe("unsupported");
  });

  it("rejects with kind=insecure when window.isSecureContext is false", async () => {
    installAudioContext({ isSecureContext: false });
    installGetUserMedia("ok");

    let caught: unknown = null;
    try {
      await subscribeTuner(() => {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TunerError);
    expect((caught as TunerError).kind).toBe("insecure");
    expect(audioCtxCalls).toBe(0);
  });

  it("rejects with kind=denied when getUserMedia throws NotAllowedError", async () => {
    installAudioContext();
    installGetUserMedia("denied");

    let caught: unknown = null;
    try {
      await subscribeTuner(() => {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TunerError);
    expect((caught as TunerError).kind).toBe("denied");
    // No successful graph means the ctx was created but closed on
    // failure.
    expect(audioCtxCalls).toBe(1);
    expect(closeCount).toBe(1);
  });

  it("rejects with kind=no-mic when navigator.mediaDevices is missing", async () => {
    installAudioContext();
    removeMediaDevices();

    let caught: unknown = null;
    try {
      await subscribeTuner(() => {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TunerError);
    expect((caught as TunerError).kind).toBe("no-mic");
    // The check fires BEFORE we try to construct the ctx.
    expect(audioCtxCalls).toBe(0);
  });

  it("rejects with kind=suspended when ctx stays suspended after resume()", async () => {
    fakeState = "suspended";
    installAudioContext();
    installGetUserMedia("ok");

    let caught: unknown = null;
    try {
      await subscribeTuner(() => {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TunerError);
    expect((caught as TunerError).kind).toBe("suspended");
    expect(audioCtxCalls).toBe(1);
    expect(closeCount).toBe(1);
  });
});

// ----- Refcount + getTunerState ----------------------------------------

describe("refcount + getTunerState", () => {
  it("two subscribers share a single AudioContext", async () => {
    installAudioContext();
    installGetUserMedia("ok");

    const h1 = await subscribeTuner(() => {});
    const h2 = await subscribeTuner(() => {});
    expect(audioCtxCalls).toBe(1);

    // getTunerState reports "running" while a listener is alive.
    expect(getTunerState().status).toBe("running");
    expect(getTunerState().message).toBe("");

    // Sample rate is exposed via the handle.
    expect(h1.sampleRate()).toBe(44100);
    expect(h2.sampleRate()).toBe(44100);

    h1.stop();
    h2.stop();
  });

  it("two concurrent subscribeTuner calls share a single AudioContext (MED-001)", async () => {
    installAudioContext();
    installGetUserMedia("ok");

    // Fire two subscribeTuner calls WITHOUT awaiting between them so
    // they race into the setup window together. Promise.all evaluates
    // both arguments synchronously, so both call sites reach the
    // `if (!ctx || !stream || !processor)` guard before either one's
    // setup work completes.
    const [h1, h2] = await Promise.all([
      subscribeTuner(() => {}),
      subscribeTuner(() => {}),
    ]);

    // Singleton guarantee: only one AudioContext was constructed
    // even though both callers raced into setup.
    expect(audioCtxCalls).toBe(1);

    // Both handles report the underlying sample rate from the
    // shared context.
    expect(h1.sampleRate()).toBe(44100);
    expect(h2.sampleRate()).toBe(44100);

    // getTunerState reports running with two listeners held.
    expect(getTunerState().status).toBe("running");
    expect(getTunerState().message).toBe("");

    h1.stop();
    h2.stop();
  });

  it("stop() decrements; last stop closes ctx + stops tracks", async () => {
    installAudioContext();
    installGetUserMedia("ok");

    const h1 = await subscribeTuner(() => {});
    const h2 = await subscribeTuner(() => {});
    expect(closeCount).toBe(0);
    expect(trackStopCount).toBe(0);

    // First stop: graph is still alive (one listener remains).
    h1.stop();
    expect(closeCount).toBe(0);
    expect(trackStopCount).toBe(0);
    // getTunerState still reports running because h2 holds a lock.
    expect(getTunerState().status).toBe("running");

    // Last stop: teardown fires.
    h2.stop();
    expect(closeCount).toBe(1);
    expect(trackStopCount).toBe(1);
    expect(getTunerState().status).toBe("idle");
    expect(getTunerState().message).toBe("");
  });

  it("stop() is idempotent (calling twice is a no-op)", async () => {
    installAudioContext();
    installGetUserMedia("ok");

    const h = await subscribeTuner(() => {});
    h.stop();
    h.stop();
    expect(closeCount).toBe(1);
    expect(trackStopCount).toBe(1);
  });

  it("getTunerState returns 'idle' before any subscribe, 'running' after", async () => {
    installAudioContext();
    installGetUserMedia("ok");

    expect(getTunerState().status).toBe("idle");
    expect(getTunerState().message).toBe("");

    const h = await subscribeTuner(() => {});
    expect(getTunerState().status).toBe("running");

    h.stop();
    expect(getTunerState().status).toBe("idle");
  });

  it("sampleRate returns 0 after teardown", async () => {
    installAudioContext();
    installGetUserMedia("ok");

    const h = await subscribeTuner(() => {});
    expect(h.sampleRate()).toBe(44100);
    h.stop();
    expect(h.sampleRate()).toBe(0);
  });
});

// ----- Message dispatch (helper) ---------------------------------------

describe("tunerCaptureErrorMessage", () => {
  it("returns the user-readable message for each kind", () => {
    expect(tunerCaptureErrorMessage("unsupported")).toMatch(/Web Audio/);
    expect(tunerCaptureErrorMessage("insecure")).toMatch(/HTTPS/);
    expect(tunerCaptureErrorMessage("denied")).toMatch(/denied/);
    expect(tunerCaptureErrorMessage("no-mic")).toMatch(/No microphone/);
    expect(tunerCaptureErrorMessage("suspended")).toMatch(/suspended/);
  });
});