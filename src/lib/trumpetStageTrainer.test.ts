/**
 * src/lib/trumpetStageTrainer.test.ts — behavior pins for the
 * processBlock scoring state machine.
 *
 * Focus: dropout resilience. A single silent / low-confidence block
 * mid-note must NOT kill a held attempt (the "shaky" bug); sustained
 * silence must.
 */

import { describe, it, expect } from "vitest";
import {
  createStageSession,
  processBlock,
  SAMPLE_RATE,
  SILENT_BLOCKS_TO_MISS,
} from "./trumpetStageTrainer";
import type { StageConfig } from "./trumpetStage";

const CONFIG: StageConfig = {
  chordRoot: "C",
  chordQuality: "maj7",
  degreeSequence: ["1", "3"],
  perNoteToleranceCents: 7,
  // Long sustain so the dropout tests can feed several blocks
  // without the sustain window closing mid-test.
  sustainSeconds: 5,
  timeoutSeconds: 15,
};

/** Short-sustain config for the "closes as hit" test. */
const SHORT_SUSTAIN: StageConfig = { ...CONFIG, sustainSeconds: 0.6 };

/** Synthesize a trumpet-ish block at `freq` Hz with an ADSR-ish
 *  envelope (steady sustain so the detector sees a clean pitch). */
function toneBlock(freq: number, amp = 0.3): Float32Array {
  const block = new Float32Array(8192);
  const amps = [1.0, 0.55, 0.3, 0.18, 0.1];
  for (let i = 0; i < block.length; i++) {
    let v = 0;
    for (let h = 0; h < amps.length; h++) {
      v += amps[h] * Math.sin(2 * Math.PI * freq * (h + 1) * (i / SAMPLE_RATE));
    }
    block[i] = v * amp;
  }
  return block;
}

const SILENCE = new Float32Array(8192);

/** C4 = 261.63 Hz — the "1" of Cmaj7. E4 = 329.63 Hz — the "3". */
const C4 = 261.63;
const E4 = 329.63;

describe("processBlock — dropout resilience", () => {
  it("one silent block mid-note does NOT kill the held attempt", () => {
    const session = createStageSession(CONFIG);
    session.status = "running";
    // t=0: create the first attempt (target C4).
    processBlock(session, SILENCE, 0);
    expect(session.active).not.toBeNull();
    expect(session.active!.targetPc).toBe("C");
    // t=200: a good C4 block lands.
    processBlock(session, toneBlock(C4), 200);
    expect(session.active!.centsSamples.length).toBe(1);
    // t=400: ONE silent block (breath / transient).
    processBlock(session, SILENCE, 400);
    // Attempt must still be live, samples preserved.
    expect(session.active).not.toBeNull();
    expect(session.attempts.length).toBe(0);
    expect(session.active!.centsSamples.length).toBe(1);
    // t=600: good block again — sample count resumes.
    processBlock(session, toneBlock(C4), 600);
    expect(session.active).not.toBeNull();
    expect(session.active!.centsSamples.length).toBe(2);
  });

  it(`sustained silence (${SILENT_BLOCKS_TO_MISS} blocks) DOES finalize as miss`, () => {
    const session = createStageSession(CONFIG);
    session.status = "running";
    processBlock(session, SILENCE, 0); // create attempt
    processBlock(session, toneBlock(C4), 200); // one good sample
    // Now feed SILENT_BLOCKS_TO_MISS silent blocks in a row.
    for (let i = 0; i < SILENT_BLOCKS_TO_MISS; i++) {
      processBlock(session, SILENCE, 400 + i * 200);
    }
    expect(session.attempts.length).toBe(1);
    expect(session.attempts[0].outcome).toBe("miss");
    expect(session.active).toBeNull();
    expect(session.index).toBe(1);
  });

  it("silent-block counter resets after a confident block", () => {
    const session = createStageSession(CONFIG);
    session.status = "running";
    processBlock(session, SILENCE, 0);
    // Two silent blocks — one short of the miss threshold.
    processBlock(session, SILENCE, 200);
    processBlock(session, SILENCE, 400);
    expect(session.active!.silentBlocks).toBe(2);
    // A confident block resets the counter.
    processBlock(session, toneBlock(C4), 600);
    expect(session.active!.silentBlocks).toBe(0);
  });

  it("sustained in-tune tone closes as a hit after the sustain window", () => {
    const session = createStageSession(SHORT_SUSTAIN);
    session.status = "running";
    processBlock(session, SILENCE, 0); // create attempt at t=0
    // Good C4 blocks up to t=600, where the 600ms sustain window closes.
    for (let t = 200; t <= 600; t += 200) {
      processBlock(session, toneBlock(C4), t);
    }
    expect(session.attempts.length).toBe(1);
    expect(session.attempts[0].outcome).toBe("hit");
    expect(session.attempts[0].degree).toBe("1");
    expect(session.lastHitAt).toBeDefined();
  });

  it("wrong pitch class closes immediately as wrong", () => {
    const session = createStageSession(CONFIG);
    session.status = "running";
    processBlock(session, SILENCE, 0); // attempt target = C4
    // Play E4 (the "3") when C4 was expected.
    processBlock(session, toneBlock(E4), 200);
    expect(session.attempts.length).toBe(1);
    expect(session.attempts[0].outcome).toBe("wrong");
    expect(session.index).toBe(1);
  });
});