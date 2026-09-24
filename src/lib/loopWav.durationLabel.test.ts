/**
 * src/lib/loopWav.durationLabel.test.ts - GAP-e fix-round pins.
 *
 * formatLoopDurationLabel(formLen, tempo, meter) is the pure home of
 * the CommitStage "~Xs" WAV-label math (extracted from
 * PlaySessionRail, LOW-3). It must agree with barSeconds() - the
 * same seconds-per-form-bar law renderPathToWav uses - and it must
 * speak in FORM bars, never padded steps.
 *
 * Pure logic, node project (loopWav.form.test.ts precedent: no
 * JSDOM_FILES entry needed; no module-level audio construction).
 */
import { describe, it, expect } from "vitest";
import { formatLoopDurationLabel, barSeconds } from "./loopWav";

describe("formatLoopDurationLabel (TD-019 / GAP-e)", () => {
  it("4/4: form bars x barSeconds, integral values drop the .0", () => {
    // 120 BPM 4/4 -> 2s/bar; a 16-bar form -> 32s.
    expect(formatLoopDurationLabel(16, 120, "4/4")).toBe("~32s");
    // 32-bar standard -> 64s.
    expect(formatLoopDurationLabel(32, 120, "4/4")).toBe("~64s");
    // 100 BPM -> 2.4s/bar; 5 bars -> exactly 12s.
    expect(formatLoopDurationLabel(5, 100, "4/4")).toBe("~12s");
  });

  it("6/8: meter-honest (the legacy label was meter-blind)", () => {
    // 120 BPM 6/8 -> 1.5s/bar (barSeconds parity).
    expect(barSeconds(120, "6/8")).toBeCloseTo(1.5, 10);
    expect(formatLoopDurationLabel(16, 120, "6/8")).toBe("~24s");
    // Rounding leg: 7 bars @ 138 BPM -> 9.130... -> "~9.1s".
    expect(formatLoopDurationLabel(7, 138, "6/8")).toBe("~9.1s");
  });

  it("speaks FORM bars, not padded steps (the 3x over-prediction)", () => {
    // A 16-bar form padded to 96 steps at 120 BPM: honest content is
    // 32s; the legacy steps*(60/tempo)*4 label said 192s (6x). The
    // label takes formLen, so the pad cannot leak in.
    expect(formatLoopDurationLabel(16, 120, "4/4")).toBe("~32s");
    expect(formatLoopDurationLabel(96, 120, "4/4")).toBe("~192s");
  });

  it("parity: one decimal, half-up, matches barSeconds exactly", () => {
    for (const formLen of [1, 4, 7, 16, 32]) {
      for (const tempo of [60, 97, 120, 240]) {
        for (const meter of ["4/4", "6/8", "3/4", "tintal"]) {
          const sec = Math.round(formLen * barSeconds(tempo, meter) * 10) / 10;
          expect(formatLoopDurationLabel(formLen, tempo, meter)).toBe(
            `~${sec}s`,
          );
        }
      }
    }
  });
});
