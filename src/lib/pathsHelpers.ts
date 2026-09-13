/**
 * pathsHelpers.ts — shared helpers between `paths.ts` and
 * `composerPathSeed.ts`. Lives in its own file to break the circular
 * import that would otherwise occur (paths.ts → composerPathSeed.ts
 * → paths.ts).
 *
 * Anything that BOTH modules need goes here:
 *   - HarmonicPath, HarmonicStep types
 *   - STEPS_PER_BAR, MIN_PATH_BARS, MAX_PATH_BARS constants
 *   - padPath() helper
 */

export interface HarmonicStep {
  name: string;
  notes: number[];
  descriptions: string;
}

export interface HarmonicPath {
  id: string;
  title: string;
  description: string;
  steps: HarmonicStep[];
  mvpReady?: boolean;
  feel?: string;
  composer?: string;
  key?: string;
  name?: string;
  sequenceStepper?: boolean;
  sequenceInterval?: number;
  sliceAndRepeat?: boolean;
  techniques?: string[];
  bassIsolation?: boolean;
  motifTracker?: boolean;
}

export const STEPS_PER_BAR = 4;
export const MIN_PATH_BARS = 24;
export const MAX_PATH_BARS = 64;

/**
 * padPath — returns a copy of `path` whose steps array sits inside
 * `[MIN_PATH_BARS, MAX_PATH_BARS]` bars (i.e. steps in
 * `[MIN * STEPS_PER_BAR, MAX * STEPS_PER_BAR]`).
 *
 * Pad strategy: cycle the existing steps. This is the standard
 * practice technique (e.g. playing the 32-bar head three times is
 * a standard practice technique).
 */
export function padPath(path: HarmonicPath): HarmonicPath {
  const minSteps = MIN_PATH_BARS * STEPS_PER_BAR;
  const maxSteps = MAX_PATH_BARS * STEPS_PER_BAR;
  let steps = path.steps;
  // Pad by cycling.
  while (steps.length < minSteps) {
    const need = Math.min(steps.length, minSteps - steps.length);
    steps = steps.concat(steps.slice(0, need));
  }
  // Trim to ceiling.
  if (steps.length > maxSteps) {
    steps = steps.slice(0, maxSteps);
  }
  if (steps === path.steps) return path;
  return { ...path, steps };
}
