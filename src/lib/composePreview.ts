/**
 * src/lib/composePreview.ts - PRD-001 Phase 4 Slice 3 (D72), ABSORBED
 * by Slice 4 IN PLACE (D77).
 *
 * RENDER-AND-PLAY accompaniment preview (S3) + the S4 MIXER: per-group
 * BAKED AudioBuffers (4x OfflineAudioContext, render ONCE per CONTENT
 * change) played through 4 live GainNodes on ONE AudioContext - knobs
 * are instant AudioParam writes, NEVER re-renders (D77 architecture
 * C). The S3 exports (previewFullSec/previewIsCapped/previewRenderSec/
 * previewFrameCount/renderAccompaniment) and the singleton state
 * machine (idle->rendering->playing, getState/subscribe/markRendering/
 * cancel/play/stop) are UNCHANGED - the panel preview button keeps
 * working byte-identically (the mutation-proven S3 tests survive).
 *
 * HONESTY (D72/D79): the 90s cap applies to the AUDITION (all four
 * groups share previewRenderSec); WAV export has its own 600s cap
 * (D81). Tick->seconds goes through the EFFECTIVE project tempo map
 * (engine/compose/tempo.ts, one truth D46) - the tempo/meter
 * overrides are TRUE since D79 (TD-043 closed at the choke point).
 *
 * StrictMode safety (PHASE-3-03): the player is a MODULE SINGLETON so
 * a double-mount cannot leak a second AudioContext; play()/playMix()
 * stop any current sources first (idempotent); stop() is safe in any
 * state; subscribe() returns an idempotent unsubscribe.
 *
 * jsdom has NO OfflineAudioContext (tests/setup.ts header) - unit
 * tests cover the PURE surfaces only (recipe tables, buffer-length
 * math, cap logic, tick->sec mapping, mapOriginalTracks +
 * computeGroupGains tables, the GAP-2 fake-context pins); the render
 * path is browser-pinned via the e2e state machine + manual
 * verification (loopWav's exact precedent).
 */

import { ticksToSeconds } from "../../engine/compose/tempo";
import { MIX_GROUPS } from "../../engine/compose/types";
import type {
  AccompRole,
  AccompanimentResult,
  MixGroup,
  MixerState,
  NormalizedProject,
  TrackRole,
  TrackRoleAssignment,
} from "../../engine/compose/types";
import { scheduleComposeNote, type MixVoice } from "./composeVoices";

/** D77: re-exported so the player's consumers import the GROUP union
 *  from the player module (canonical definition: engine/compose/types). */
export type { MixGroup } from "../../engine/compose/types";

/** D78: one voiced note of the ORIGINAL group (the file's own tracks,
 *  mapped to a recipe by role). Derived purely (mapOriginalTracks). */
export interface OriginalVoiceNote {
  readonly voice: MixVoice;
  readonly midi: number;
  readonly tick: number;
  readonly durationTicks: number;
  readonly velocity: number;
}

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

// ---------------------------------------------------------------------------
// PRD-001 Phase 4 Slice 4 (D77/D78): the MIXER surfaces. Architecture C:
// per-group BAKED buffers + live GainNodes. Knobs = instant param writes;
// re-render ONLY on content change. NO live scheduler, NO transport.
// ---------------------------------------------------------------------------

/** D78 role -> recipe (the ORIGINAL group's voice mapping). melody gets
 *  the NEW lead recipe (D90); harmony + unknown share the chords recipe
 *  (unknown at 0.7x peak, baked into velocity below); percussion is
 *  SKIPPED by the mapper (channel-9 GM drums as synthesized voices is
 *  scope creep - the UI discloses it, D78). */
const ORIGINAL_VOICE: Readonly<Record<TrackRole, MixVoice | null>> = {
  melody: "lead",
  bass: "bass",
  harmony: "chords",
  unknown: "chords",
  percussion: null, // SKIPPED (D78)
};

/** The unknown-role honest default (D78): chords recipe at 0.7x peak. */
const UNKNOWN_PEAK_SCALE = 0.7;

/**
 * D78 PURE mapper: the file's own tracks -> OriginalVoiceNote[].
 * Skips percussion tracks (isPercussion OR a percussion role), skips
 * empty-note tracks, sorts by tick. Each track's OWN notes are voiced
 * (never the extracted top-line - voicing the melody view on top of
 * its source tracks would double the line, D78).
 */
export function mapOriginalTracks(
  project: NormalizedProject,
  roles: readonly TrackRoleAssignment[],
): readonly OriginalVoiceNote[] {
  const out: OriginalVoiceNote[] = [];
  for (const track of project.tracks) {
    if (track.isPercussion) continue; // D78 disclosure, not silence
    if (track.notes.length === 0) continue;
    const role = roles.find((r) => r.trackIndex === track.index)?.role ?? "unknown";
    const voice = ORIGINAL_VOICE[role];
    if (voice === null) continue; // percussion role (defensive)
    const velScale = role === "unknown" ? UNKNOWN_PEAK_SCALE : 1;
    for (const n of track.notes) {
      out.push({
        voice,
        midi: n.midi,
        tick: n.tick,
        durationTicks: n.durationTicks,
        velocity: Math.max(0, Math.min(1, n.velocity * velScale)),
      });
    }
  }
  out.sort((a, b) => a.tick - b.tick);
  return out;
}

/**
 * D77 PURE gain math (table-tested in node): the doc's exact formula
 * `level * (muted || (anySolo && !thisSolo) ? 0 : 1)` - MUTE WINS over
 * solo (a muted+soloed row is silent; mute-wins convention,
 * Ableton/Reaper-style - Logic/Pro Tools lean solo-override, so not
 * universal; the D77 body formula is the authority - the handoff-yaml
 * note "thisSolo wins over muted" contradicts it and is flagged as a
 * doc erratum in the dev report). hasOriginal=false forces original 0
 * (chart-only sessions have no original group, D78/D84).
 */
export function computeGroupGains(
  m: MixerState,
  hasOriginal: boolean,
): Record<MixGroup, number> {
  const anySolo = m.original.solo || m.bass.solo || m.chords.solo || m.pad.solo;
  const gate = (g: MixGroup): number => {
    const s = m[g];
    if (s.muted) return 0;
    if (anySolo && !s.solo) return 0;
    return s.level;
  };
  return {
    original: hasOriginal ? gate("original") : 0,
    bass: gate("bass"),
    chords: gate("chords"),
    pad: gate("pad"),
  };
}

/** D77: the mixer render input. project is the EFFECTIVE one
 *  (overrides applied, D79); tracks is the D78 mapping ([] for
 *  chart-only sessions). */
export interface MixRenderInput {
  readonly project: NormalizedProject;
  readonly result: AccompanimentResult | null;
  readonly tracks: readonly OriginalVoiceNote[];
  readonly endTick: number; // max(project.endTick, result.meta.endTick)
}

function renderOneGroup(
  project: NormalizedProject,
  endTick: number,
  capSec: number,
  schedule: (ctx: OfflineAudioContext, master: GainNode, renderSec: number) => void,
): Promise<AudioBuffer> {
  const renderSec = Math.min(previewFullSec(project, endTick), capSec);
  const ctx = new OfflineAudioContext(1, previewFrameCount(renderSec), PREVIEW_SAMPLE_RATE);
  const master = ctx.createGain();
  master.gain.value = 0.9; // D88: own master, conservative recipe peaks
  master.connect(ctx.destination);
  schedule(ctx, master, renderSec);
  return ctx.startRendering();
}

/**
 * D77: render EACH group ONCE to its own mono AudioBuffer. Groups with
 * no content are OMITTED from the partial (the mixer row still renders;
 * playMix just has nothing to play). The 90s AUDITION cap applies to
 * all four by default; WAV export passes its own 600s cap (D81).
 */
interface MixGroupJob {
  readonly group: MixGroup;
  readonly schedule: (ctx: OfflineAudioContext, master: GainNode, renderSec: number) => void;
}

/** The per-group job list SHARED by both render paths (parallel
 *  audition + sequential export) - one builder, zero drift between
 *  what audition renders and what export renders. */
function buildMixGroupJobs(input: MixRenderInput): MixGroupJob[] {
  const { project, result, tracks } = input;
  const jobs: MixGroupJob[] = [];
  if (tracks.length > 0) {
    jobs.push({
      group: "original",
      schedule: (ctx, master, renderSec) => {
        for (const n of tracks) {
          const whenSec = ticksToSeconds(project, n.tick);
          if (whenSec >= renderSec) continue; // capped: honest truncation
          const durSec = Math.max(
            0.02,
            ticksToSeconds(project, n.tick + n.durationTicks) - whenSec,
          );
          scheduleComposeNote(
            ctx,
            master,
            n.voice,
            n.midi,
            whenSec,
            Math.min(durSec, renderSec - whenSec),
            n.velocity,
          );
        }
      },
    });
  }
  if (result !== null) {
    for (const role of ROLE_ORDER) {
      const notes = result.generated[role];
      if (notes.length === 0) continue;
      jobs.push({
        group: role,
        schedule: (ctx, master, renderSec) => {
          for (const n of notes) {
            const whenSec = ticksToSeconds(project, n.tick);
            if (whenSec >= renderSec) continue;
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
        },
      });
    }
  }
  return jobs;
}

/**
 * AUDITION path (D77): 4 PARALLEL OfflineAudioContext renders
 * (Promise.all). Latency matters here and the 90s cap bounds the peak
 * (~64MB of buffers) - deliberately NOT sequentialized by MED-001.
 */
export async function renderMixGroups(
  input: MixRenderInput,
  capSec: number = PREVIEW_CAP_SEC,
): Promise<Partial<Record<MixGroup, AudioBuffer>>> {
  const { project, endTick } = input;
  const done = await Promise.all(
    buildMixGroupJobs(input).map((job) =>
      renderOneGroup(project, endTick, capSec, job.schedule).then(
        (buf) => [job.group, buf] as const,
      ),
    ),
  );
  const out: Partial<Record<MixGroup, AudioBuffer>> = {};
  for (const [group, buf] of done) out[group] = buf;
  return out;
}

/**
 * MED-001 (S4 fix round): the EXPORT path render. renderMixGroups at
 * the 600s cap means FOUR concurrent OfflineAudioContexts (~423MB of
 * buffers) PLUS the sum PLUS the encode. This variant awaits EACH
 * group's render before constructing the NEXT context and hands the
 * buffer to `onGroup` (the caller mixes it into its accumulator),
 * retaining NOTHING between groups: peak = ONE group buffer + the
 * accumulator (~212MB), not 4 + sum. Byte-identical output to the
 * parallel path (same job builder, same schedule).
 */
export async function renderMixGroupsSequential(
  input: MixRenderInput,
  capSec: number,
  onGroup: (group: MixGroup, buf: AudioBuffer) => void,
): Promise<void> {
  const { project, endTick } = input;
  for (const job of buildMixGroupJobs(input)) {
    const buf = await renderOneGroup(project, endTick, capSec, job.schedule);
    onGroup(job.group, buf);
    // `buf` goes OUT OF SCOPE here - the renderer holds no reference
    // across iterations (the accumulator owns the mix).
  }
}

export type PreviewState = "idle" | "rendering" | "playing";

/**
 * The play/stop singleton. Lazy live AudioContext (created on first
 * play, reused forever); no clock, no transport. S4 (D77) adds the
 * MIXER playback path (playMix/applyMix) on the SAME context and the
 * SAME state machine - the S3 single-buffer play() is untouched.
 */
class ComposePreviewPlayer {
  private state: PreviewState = "idle";
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  // D77 mix path: up to 4 sources + 4 group gains + one master, torn
  // down together (same stopSource discipline, now per-source list).
  private mixSources: AudioBufferSourceNode[] = [];
  private mixGains: Partial<Record<MixGroup, GainNode>> = {};
  private mixMaster: GainNode | null = null;
  private lastGains: Readonly<Record<MixGroup, number>> | null = null;
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

  /**
   * D77: play the per-group buffers through per-group GainNodes on the
   * SAME live context, all started at ONE instant
   * (ctx.currentTime + 0.05 - small resume margin, sample-accurate
   * sync, zero drift bookkeeping by construction). Stops any prior
   * single source AND prior mix first (same idempotent discipline,
   * PHASE-3-03). Initial gains come from the last applyMix (the mixer
   * state survives a re-play); defaults to 1.
   */
  playMix(buffers: Partial<Record<MixGroup, AudioBuffer>>): void {
    this.stop();
    const groups = MIX_GROUPS.filter((g) => buffers[g] !== undefined);
    if (groups.length === 0) return; // nothing to play: stays idle (honest)
    if (typeof AudioContext === "undefined") {
      this.transition("idle");
      throw new Error("Web Audio is unavailable in this environment");
    }
    if (this.ctx === null) {
      this.ctx = new AudioContext();
    }
    const ctx = this.ctx;
    void ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.9; // D88: own master, conservative recipe peaks
    master.connect(ctx.destination);
    this.mixMaster = master;
    const start = ctx.currentTime + 0.05;
    let remaining = groups.length;
    for (const group of groups) {
      const gain = ctx.createGain();
      gain.gain.value = this.lastGains === null ? 1 : this.lastGains[group];
      gain.connect(master);
      this.mixGains[group] = gain;
      const src = ctx.createBufferSource();
      src.buffer = buffers[group] as AudioBuffer;
      src.connect(gain);
      src.onended = () => {
        remaining -= 1;
        if (remaining === 0 && this.mixMaster === master) {
          this.teardownMix();
          this.transition("idle");
        }
      };
      src.start(start);
      this.mixSources.push(src);
    }
    this.transition("playing");
  }

  /**
   * D77: LIVE knob writes - setTargetAtTime 0.02 on the group gains.
   * Never re-renders, never touches the state machine. Stashes the
   * gains so the NEXT playMix starts at them (called on every mixer
   * change by the surface, playing or not).
   */
  applyMix(gains: Readonly<Record<MixGroup, number>>): void {
    this.lastGains = gains;
    if (this.ctx === null) return;
    const now = this.ctx.currentTime;
    for (const group of MIX_GROUPS) {
      const node = this.mixGains[group];
      if (node !== undefined) {
        node.gain.setTargetAtTime(gains[group], now, 0.02);
      }
    }
  }

  stop(): void {
    this.stopSource();
    this.teardownMix();
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

  /** D77: tear down up to 4 sources + gains + master (idempotent). */
  private teardownMix(): void {
    for (const src of this.mixSources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // already ended
      }
      src.disconnect();
    }
    this.mixSources = [];
    for (const group of MIX_GROUPS) {
      const node = this.mixGains[group];
      if (node !== undefined) node.disconnect();
    }
    this.mixGains = {};
    if (this.mixMaster !== null) {
      this.mixMaster.disconnect();
      this.mixMaster = null;
    }
  }

  private transition(next: PreviewState): void {
    this.state = next;
    for (const fn of [...this.listeners]) fn(next);
  }
}

/** Module singleton (StrictMode double-mount cannot leak a second ctx). */
export const composePreviewPlayer = new ComposePreviewPlayer();
