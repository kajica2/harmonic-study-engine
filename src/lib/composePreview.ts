/**
 * src/lib/composePreview.ts - PRD-001 Phase 4 Slice 3 (D72).
 *
 * RENDER-AND-PLAY accompaniment preview: OfflineAudioContext renders
 * the generated notes to an AudioBuffer (loopWav precedent - raw API,
 * no deps, no transport, no mixer), and a module-singleton player
 * auditions it via a plain AudioBufferSourceNode. This is the FIRST
 * audio in Compose - it deliberately touches NOTHING in the practice
 * transport stack (no audioEngine/rhythmEngine/backingEngine edits).
 *
 * HONESTY (D72): preview is ACCOMPANIMENT ONLY (mixing with originals
 * = S4). Tick->seconds goes through the PROJECT tempo map
 * (engine/compose/tempo.ts, one truth D46); the tempo OVERRIDE is
 * record-only until S4 (TD-043) and the UI says exactly that. Long
 * grids cap at the first 90 seconds ("preview first 1:30").
 *
 * StrictMode safety (PHASE-3-03): the player is a MODULE SINGLETON so
 * a double-mount cannot leak a second AudioContext; play() stops any
 * current source first (idempotent); stop() is safe in any state;
 * subscribe() returns an idempotent unsubscribe.
 *
 * jsdom has NO OfflineAudioContext (tests/setup.ts header) - unit
 * tests cover the PURE surfaces only (recipe tables, buffer-length
 * math, cap logic, tick->sec mapping through the already-tested tempo
 * functions); the render path is browser-pinned via the e2e state
 * machine + manual verification (loopWav's exact precedent).
 */

import { ticksToSeconds } from "../../engine/compose/tempo";
import type { AccompRole, AccompanimentResult, NormalizedProject } from "../../engine/compose/types";
import { scheduleComposeNote } from "./composeVoices";

export const PREVIEW_SAMPLE_RATE = 44100;
/** D72: a 4-min offline render is seconds of jank; 90s is plenty to
 *  judge a groove. Longer grids render the FIRST 90s (labeled). */
export const PREVIEW_CAP_SEC = 90;
/** Small release tail so the final chord doesn't end mid-decay. */
export const PREVIEW_TAIL_SEC = 1;

const ROLE_ORDER: readonly AccompRole[] = ["bass", "chords", "pad"];

/** Full audio length of the result (project tempo map + tail). */
export function previewFullSec(project: NormalizedProject, endTick: number): number {
  return ticksToSeconds(project, Math.max(0, endTick)) + PREVIEW_TAIL_SEC;
}

/** True when the 90s cap bites (UI: "preview first 1:30"). */
export function previewIsCapped(result: AccompanimentResult, project: NormalizedProject): boolean {
  return previewFullSec(project, result.meta.endTick) > PREVIEW_CAP_SEC;
}

/** Seconds actually rendered (capped). */
export function previewRenderSec(project: NormalizedProject, endTick: number): number {
  return Math.min(previewFullSec(project, endTick), PREVIEW_CAP_SEC);
}

/** Buffer length in frames (>= 1 so OfflineAudioContext never sees 0). */
export function previewFrameCount(renderSec: number, sampleRate: number = PREVIEW_SAMPLE_RATE): number {
  return Math.max(1, Math.ceil(renderSec * sampleRate));
}

/**
 * Render the accompaniment to an AudioBuffer using the PROJECT tempo
 * map. Notes past the cap are skipped (documented, labeled). Throws
 * only if the browser lacks OfflineAudioContext (never in the app;
 * unit tests stay at the pure surfaces above).
 */
export async function renderAccompaniment(
  result: AccompanimentResult,
  project: NormalizedProject,
): Promise<AudioBuffer> {
  const renderSec = previewRenderSec(project, result.meta.endTick);
  const ctx = new OfflineAudioContext(1, previewFrameCount(renderSec), PREVIEW_SAMPLE_RATE);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  for (const role of ROLE_ORDER) {
    for (const n of result.generated[role]) {
      const whenSec = ticksToSeconds(project, n.tick);
      if (whenSec >= renderSec) continue; // capped: honest truncation
      const durSec = Math.max(
        0.02,
        ticksToSeconds(project, n.tick + n.durationTicks) - whenSec,
      );
      scheduleComposeNote(
        ctx,
        master,
        role,
        n.midi,
        whenSec,
        Math.min(durSec, renderSec - whenSec),
        n.velocity,
      );
    }
  }
  return ctx.startRendering();
}

export type PreviewState = "idle" | "rendering" | "playing";

/**
 * The play/stop singleton. Lazy live AudioContext (created on first
 * play, reused forever); no clock, no transport, no mixer.
 */
class ComposePreviewPlayer {
  private state: PreviewState = "idle";
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private listeners = new Set<(s: PreviewState) => void>();

  getState(): PreviewState {
    return this.state;
  }

  subscribe(fn: (s: PreviewState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Surface calls this BEFORE renderAccompaniment (idle->rendering). */
  markRendering(): void {
    this.transition("rendering");
  }

  /** Render failed / was cancelled: back to idle. */
  cancel(): void {
    this.transition("idle");
  }

  play(buffer: AudioBuffer): void {
    this.stopSource(); // re-render/re-play: stop any current source
    if (typeof AudioContext === "undefined") {
      this.transition("idle");
      throw new Error("Web Audio is unavailable in this environment");
    }
    if (this.ctx === null) {
      this.ctx = new AudioContext();
    }
    const ctx = this.ctx;
    void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        this.transition("idle");
      }
    };
    src.start();
    this.source = src;
    this.transition("playing");
  }

  stop(): void {
    this.stopSource();
    if (this.state !== "idle") this.transition("idle");
  }

  private stopSource(): void {
    const src = this.source;
    if (src === null) return;
    this.source = null;
    src.onended = null;
    try {
      src.stop();
    } catch {
      // already ended - nothing to stop
    }
    src.disconnect();
  }

  private transition(next: PreviewState): void {
    this.state = next;
    for (const fn of [...this.listeners]) fn(next);
  }
}

/** Module singleton (StrictMode double-mount cannot leak a second ctx). */
export const composePreviewPlayer = new ComposePreviewPlayer();
