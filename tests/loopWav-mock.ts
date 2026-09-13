/**
 * Mock Web Audio API for loopWav tests.
 *
 * `lib/loopWav.ts` is browser-only — it calls `new OfflineAudioContext(...)`
 * and uses the Web Audio graph (OscillatorNode, GainNode, BiquadFilterNode,
 * DynamicsCompressorNode, etc.) to render a WAV. In Node tests we don't
 * have any of that.
 *
 * Strategy: stub the Web Audio surface with a recording fake. Every
 * oscillator start/stop and every gain ramp gets logged. The test then
 * inspects the schedule to verify "the chord is scheduled for the full
 * bar" / "mono picks the top note" / "arp lands notes within the bar"
 * — which is the actual contract being tested. We don't care about
 * the rendered samples; only the schedule events.
 *
 * The mock is wired via `vi.stubGlobal('OfflineAudioContext', MockOAC)`
 * in the test, not in `setup.ts`, because loopWav is the only
 * consumer; polluting globals would affect every test.
 */

interface MockParam {
  value: number;
  setValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

class FakeParam implements MockParam {
  value = 0;
  events: Array<{ kind: string; value: number; time: number }> = [];
  setValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push({ kind: "set", value: v, time: t });
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push({ kind: "ramp", value: v, time: t });
  }
}

interface MockNode {
  connect(target: MockNode): void;
}

class FakeGain implements MockNode {
  gain = new FakeParam();
  connectedTo: MockNode[] = [];
  connect(t: MockNode) {
    this.connectedTo.push(t);
  }
}

class FakeFilter implements MockNode {
  type = "lowpass";
  Q = new FakeParam();
  frequency = new FakeParam();
  connectedTo: MockNode[] = [];
  connect(t: MockNode) {
    this.connectedTo.push(t);
  }
}

class FakeCompressor implements MockNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  connectedTo: MockNode[] = [];
  connect(t: MockNode) {
    this.connectedTo.push(t);
  }
}

class FakeOscillator implements MockNode {
  type = "sine";
  frequency = new FakeParam();
  startTime: number | null = null;
  stopTime: number | null = null;
  started = false;
  stopped = false;
  connectedTo: MockNode[] = [];
  start(t: number) {
    this.startTime = t;
    this.started = true;
  }
  stop(t: number) {
    this.stopTime = t;
    this.stopped = true;
  }
  connect(t: MockNode) {
    this.connectedTo.push(t);
  }
}

class FakeDestination implements MockNode {
  // The destination is the root sink — anything connected to it
  // is part of the audible graph. We just track what was connected
  // to the destination as a debugging signal.
  connectedTo: MockNode[] = [];
  connect(_t: MockNode) {
    // No-op: destination has no further connections
  }
}

class FakeAudioBuffer {
  numberOfChannels = 1;
  length: number;
  sampleRate: number;
  private data: Float32Array;
  constructor(length: number, sampleRate: number) {
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = new Float32Array(length);
  }
  getChannelData(_ch: number): Float32Array {
    return this.data;
  }
}

export class MockOfflineAudioContext {
  destination = new FakeDestination();
  sampleRate: number;
  length: number;
  // Every node created during the test, captured for inspection.
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  compressors: FakeCompressor[] = [];

  constructor(_channels: number, length: number, sampleRate: number) {
    this.length = length;
    this.sampleRate = sampleRate;
  }

  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createOscillator(): FakeOscillator {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createDynamicsCompressor(): FakeCompressor {
    const c = new FakeCompressor();
    this.compressors.push(c);
    return c;
  }
  async startRendering(): Promise<FakeAudioBuffer> {
    return new FakeAudioBuffer(this.length, this.sampleRate);
  }
}

/**
 * Install the mock on globalThis. Returns a `getMock()` accessor so
 * the test can inspect the recorded schedule. Call this from the
 * test's `beforeEach` so each test gets a fresh mock.
 */
export function installMockOfflineAudioContext(): {
  getMock: () => MockOfflineAudioContext | null;
  uninstall: () => void;
} {
  const original =
    (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext;
  let lastMock: MockOfflineAudioContext | null = null;

  const Patched = function (
    this: MockOfflineAudioContext,
    channels: number,
    length: number,
    sampleRate: number,
  ) {
    // Constructor must be a regular function (not arrow) so `new` works.
    const instance = new MockOfflineAudioContext(channels, length, sampleRate);
    lastMock = instance;
    return instance;
  } as unknown as typeof OfflineAudioContext;
  (globalThis as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext =
    Patched;

  return {
    getMock: () => lastMock,
    uninstall: () => {
      if (original === undefined) {
        delete (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext })
          .OfflineAudioContext;
      } else {
        (globalThis as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext =
          original as typeof OfflineAudioContext;
      }
    },
  };
}