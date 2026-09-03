/**
 * magenta/quantize.ts
 * ───────────────────
 * Quantize / unquantize wrappers around Magenta's sequence utils.
 *
 * Why split out of adapter.ts:
 *   - adapter.ts is the *path-shape* code — easy to unit-test in
 *     isolation. Pulling Magenta's tfjs-laden protobuf types into
 *     vitest's Vite pipeline at import-time means every test in
 *     the suite pays the bundle-resolution cost.
 *   - This file is the *bridge* to Magenta's runtime utils. Tests
 *     that touch quantization mock or skip it; tests that don't,
 *     don't even load tfjs into the test graph.
 *
 * Why the dynamic `require`:
 *   `@magenta/music@1.23.1` declares `main: es5/index.js` in its
 *   package.json but that file is missing from the installed
 *   bundle — only `esm/index.js` is shipped. Vite handles this in
 *   the app via `nodePolyfills`, but Vitest's bare resolve fails.
 *   A lazy `require()` defers the resolution until the function is
 *   actually called, and bypasses static analysis for tests that
 *   never invoke it (the humanizer test mocks these out).
 */
import type { INoteSequence, NoteSequence } from "./INoteSequence";
import { DEFAULT_QPM, STEPS_PER_QUARTER } from "./adapter";

/**
 * Quantize a NoteSequence at the magenta default (4 steps/quarter).
 * Convenience wrapper that papers over the verbose long-form
 * `quantizeNoteSequence(ns, STEPS_PER_QUARTER)` and guards against
 * the throw-on-already-quantized case.
 */
export async function quantize(ns: INoteSequence): Promise<NoteSequence> {
  const m = await loadMm();
  if (m.sequences.isQuantizedSequence(ns)) return m.sequences.clone(ns);
  return m.sequences.quantizeNoteSequence(ns, STEPS_PER_QUARTER);
}

/**
 * Unquantize — convert back to absolute times. Used by the humanizer
 * to apply continuous time/velocity perturbations that aren't
 * representable on the grid.
 */
export async function unquantize(qns: INoteSequence): Promise<NoteSequence> {
  const m = await loadMm();
  if (!m.sequences.isQuantizedSequence(qns)) return m.sequences.clone(qns);
  const qpm = qns.tempos?.[0]?.qpm ?? DEFAULT_QPM;
  return m.sequences.unquantizeSequence(qns, qpm);
}

/**
 * Lazily require `@magenta/music`. The first call resolves and
 * caches; subsequent calls reuse the same reference. We use
 * `require` (not static `import`) so that Vite's static analyzer
 * doesn't try to walk the package graph at build time — vitest's
 * tests mock this module before any call hits this path.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
async function loadMm(): Promise<typeof import("@magenta/music")> {
  // Use a dynamic import inside a try/catch so a missing optional
  // dep surfaces as a clear runtime error rather than a build
  // failure on machines that haven't installed the heavy stack.
  try {
    const mod = await import("@magenta/music");
    return mod;
  } catch (e) {
    throw new Error(
      "magenta/quantize requires @magenta/music. Install with: " +
        "npm install @magenta/music. Original error: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}