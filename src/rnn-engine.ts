/**
 * src/rnn-engine.ts
 * ─────────────────
 * Browser entry for the standalone RNN page (`public/rnn.html`).
 *
 * Why this lives in src/ instead of public/:
 *   - The Vite build resolves `@magenta/music` + `@tensorflow/tfjs`
 *     through `node_modules`, where the existing `nodePolyfills`
 *     plugin in vite.config.ts handles the deep tfjs graph (tfjs-core,
 *     tfjs-converter, tfjs-backend-cpu, tfjs-backend-webgl,
 *     tslib, fft.js, ndarray-resample, …).
 *   - A CDN dynamic-import approach can't easily resolve all those
 *     bare specifiers — adding each one to an importmap is brittle
 *     and would silently break when Magenta or tfjs rev a dep.
 *   - Building through Vite gives us a single self-contained IIFE
 *     bundle that the static HTML page can <script src=…> directly.
 *
 * The IIFE exposes two functions on `window.SWRRNN`:
 *   - `generateMagentaSequence(rootMidi, steps, temp)` — async; returns
 *     a HarmonicPath-shaped object with either a real RNN output or
 *     the deterministic fallback.
 *   - `getLastStatus()` — diagnostic; returns the last error message
 *     or 'ok' so the HTML page can surface why the model wasn't
 *     available, without needing a shared module instance.
 *
 * Mirrors the API surface of `src/lib/magentaHelper.ts` (the React
 * app's existing copy) so the behavior is consistent across the
 * two surfaces.
 */

import { generateMagentaSequence as _generateMagentaSequence } from "./lib/magentaHelper";

declare global {
  interface Window {
    SWRRNN: {
      generateMagentaSequence(rootMidi: number, stepsCount: number, temp: number):
        Promise<unknown>;
      getLastStatus(): string;
    };
  }
}

let lastStatus = "ok";

export async function generateMagentaSequence(
  rootMidi: number,
  stepsCount: number,
  temp: number,
): Promise<unknown> {
  try {
    const path = await _generateMagentaSequence(rootMidi, stepsCount, temp);
    // surface the fallback status so the HTML page can show it
    lastStatus = (path.title || "").toLowerCase().includes("fallback")
      ? "fallback"
      : "ok";
    return path;
  } catch (err) {
    lastStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
    // Re-throw so the HTML page can render the error path
    throw err;
  }
}

export function getLastStatus(): string {
  return lastStatus;
}

// Expose for the rnn.html page. Vite's IIFE build wraps the module
// and assigns these to window on script load.
window.SWRRNN = { generateMagentaSequence, getLastStatus };