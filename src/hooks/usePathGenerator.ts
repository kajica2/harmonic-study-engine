import { useCallback } from "react";
import { generateHarmonicPath } from "../lib/generator";
import type { HarmonicPath } from "../lib/paths";

/**
 * usePathGenerator — synthesize a new HarmonicPath from the
 * local generator and prepend it to the path list, then reset
 * transport state.
 *
 * Extracted from App.tsx so the local-generator code path can be
 * tested without mounting the whole app. The etude / ML
 * generators stay in App.tsx because they pull in async
 * machinery (Magenta / Gemini) — those would need their own
 * hook and the complexity wasn't worth the extraction for a
 * 100-line block.
 *
 * The hook returns a stable callback so consumers can pass it
 * to memo'd components without invalidating them. The caller
 * passes the current path list + length/complexity knobs; the
 * hook captures them via closure on each call.
 */

interface UsePathGeneratorArgs {
  currentPaths: HarmonicPath[];
  setPaths: (paths: HarmonicPath[]) => void;
  setActivePathIndex: (i: number) => void;
  setActiveStepIndex: (i: number) => void;
  setTransposeShift: (shift: number) => void;
  /** Generator length knob (mirrors App.tsx's genLength state). */
  length: number;
  /** Generator complexity knob (mirrors App.tsx's genComplexity state). */
  complexity: number;
}

export function usePathGenerator(args: UsePathGeneratorArgs) {
  return useCallback(() => {
    const newPath = generateHarmonicPath(args.length, args.complexity);
    args.setPaths([newPath, ...args.currentPaths]);
    args.setActivePathIndex(0);
    args.setActiveStepIndex(0);
    args.setTransposeShift(0);
  }, [args]);
}
