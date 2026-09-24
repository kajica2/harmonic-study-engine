/**
 * src/components/ComposeSurface.tsx - PRD-001 REQ-COMP-1/5/6/20..24/
 * 50..53 (Phase 4 Slice 2, D62/D63).
 *
 * The real upload surface (the Phase 1 stub body copy is gone; the
 * THREE pinned strings stay verbatim: the "Drop a .mid file to get
 * started." heading, the "Open import / export" button wired to
 * onOpenImportExport, and the REQ-IO-70 privacy aside - ModeGate's
 * 13 assertions + the button-click pin must pass UNEDITED).
 *
 * Three states (D63):
 *  - empty  : heading + UploadDropZone + browse + import/export + aside
 *  - prompt : composeSession persisted but the 30MB project is gone
 *             (reload) -> re-upload card; hash-gated restore (D62)
 *  - loaded : AnalysisCard over merged truth only
 *             (mergeAnalysis + blendKeyEvidence, memoized; no raw
 *             analysis field is ever displayed).
 *
 * Pipeline (D63): file -> arrayBuffer ONCE (cached in a structural
 * ReadableMidiFile stub - no double disk read) -> readMidiFile ->
 * sha256Hex(same buffer) -> analyzeProject -> setComposeFile. All
 * awaited in one handler behind a busy flag; parse+analyze is
 * p95 ~70-150ms (S1 harness), main-thread legal. ZERO network calls
 * (REQ-IO-71) - no fetch/XHR/WebSocket anywhere in this file.
 *
 * Undo (D59): a SURFACE-LOCAL Cmd/Ctrl+Z listener (globally unbound,
 * verified) over the store-resident snapshot stacks; App's isTyping
 * guard replicated verbatim; zero App.tsx edits.
 */

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { SynesthesiaCanvas } from "./SynesthesiaCanvas";
import { SynesthesiaProvider } from "./SynesthesiaProvider";
import { UploadDropZone } from "./UploadDropZone";
import { AnalysisCard } from "./AnalysisCard";
import { AccompanimentPanel } from "./AccompanimentPanel";
import { ComposeMixer } from "./ComposeMixer";
import { ChartPastePanel } from "./ChartPastePanel";
import { ComposePianoRoll, type RollLayer } from "./ComposePianoRoll";
import { ROLL_PALETTE } from "./EtudePianoRoll";
import { useSessionStore, CHART_SESSION_FILE_NAME } from "../state/sessionStore";
import {
  composePreviewPlayer,
  computeGroupGains,
  mapOriginalTracks,
  previewIsCapped,
  renderAccompaniment,
  renderMixGroups,
  type MixRenderInput,
  type PreviewState,
} from "../lib/composePreview";
import {
  downloadComposeMidi,
  exportComposeWav,
} from "../lib/composeExport";
import { serializeComposeSession } from "../lib/composeUrl";
import { readMidiFile, sha256Hex, type ReadableMidiFile } from "../lib/composeMidi";
import { analyzeProject, generateAccompaniment } from "../../engine/compose";
import { buildChartSession, parseChordChart, type ChordChart } from "../../engine/compose/chordchart";
import {
  withTempoOverride,
  withTimeSignatureOverride,
} from "../../engine/compose/tempo";
import { blendKeyEvidence } from "../../engine/compose/key";
import { extractMelody } from "../../engine/compose/melody";
import { getStyleProfile } from "../../engine/styles";
import {
  EMPTY_OVERRIDES,
  mergeAnalysis,
  MIXER_DEFAULTS,
  type AccompanimentRequest,
  type AccompanimentResult,
  type AccompRole,
  type AnalysisError,
  type AnalysisOverrides,
  type ComposeAnalysis,
  type KeyCandidate,
  type MixGroup,
  type MixerState,
  type NormalizedProject,
} from "../../engine/compose/types";

interface ComposeSurfaceProps {
  /** Triggered by the "Open import / export" button. */
  onOpenImportExport: () => void;
  /** Optional className passthrough. */
  className?: string;
}

/** D62: every !ok arm lands on exactly one banner copy. */
function bannerCopy(error: AnalysisError): string {
  if (error.code === "noNotes") return "No notes found in this file.";
  return error.message;
}

function isMidiName(name: string): boolean {
  return /\.(mid|midi)$/i.test(name);
}

/** D73: the accompaniment request defaults when the persisted session
 *  carries none (old v4 payloads default at read - NO v5). Style/seed
 *  are taste; the defaults match the e2e leg-1 contract (jazz,
 *  bass+chords, profile densityDefault, seed 42). */
export const DEFAULT_ACCOMPANIMENT_REQUEST: AccompanimentRequest = Object.freeze({
  version: 1,
  styleId: "jazz",
  roles: Object.freeze(["bass", "chords"]) as readonly AccompRole[],
  density: getStyleProfile("jazz").rhythm.densityDefault,
  seed: 42,
});

/** App.tsx's isTyping guard, replicated VERBATIM (D59) so native
 *  field undo is untouched and the popover input never double-fires. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el?.isContentEditable === true
  );
}

export const ComposeSurface: React.FC<ComposeSurfaceProps> = ({
  onOpenImportExport,
  className = "",
}) => {
  const composeSession = useSessionStore((s) => s.composeSession);
  const composeProject = useSessionStore((s) => s.composeProject);
  const composeAnalysis = useSessionStore((s) => s.composeAnalysis);
  const accompResult = useSessionStore((s) => s.composeAccompaniment);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AnalysisError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<{ fileName: string; file: File } | null>(null);
  const [recentSymbols, setRecentSymbols] = useState<readonly string[]>([]);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  // D84: the chart-paste panel (empty state + [Edit chart] round trip).
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteInitial, setPasteInitial] = useState("");

  const overrides: AnalysisOverrides = composeSession?.overrides ?? EMPTY_OVERRIDES;
  const analyzeFull = composeSession?.analyzeFull ?? false;
  // D73 default-at-read: missing persisted request -> the defaults.
  const accompRequest: AccompanimentRequest = composeSession?.request ?? DEFAULT_ACCOMPANIMENT_REQUEST;
  const loaded = composeProject !== null && composeAnalysis !== null && composeSession !== null;
  // D84: a chart session auto-heals (pure + sub-ms) instead of the
  // MIDI re-upload prompt - the prompt machinery stays UNTOUCHED for
  // file sessions.
  const isChart = loaded && composeSession?.chartText != null;
  const prompt = !loaded && composeSession !== null && composeSession.chartText == null;

  // --- derived truth (memoized; NO engine recompute per render) -----
  // D63: a meter override re-runs the analysis on a patched PROJECT
  // copy (bar boundaries change); tempo NEVER re-runs the analysis
  // (the tick grid is tempo-independent).
  // MED-001 (reviewer): the patched project is HOISTED, not built
  // inside the analysis memo and discarded - the SAME effective
  // project flows to the card, the roll, the preview, the mixer and
  // the exporters.
  // D79 (TD-043 CLOSE-OUT): BOTH overrides now land at this single
  // choke point via the engine's pure helpers - preview, mixer, WAV
  // and MIDI export all inherit the truth with zero call-site churn.
  const effectiveProject = useMemo<NormalizedProject | null>(() => {
    if (composeProject === null) return null;
    return withTimeSignatureOverride(
      withTempoOverride(composeProject, overrides.tempoBpm),
      overrides.timeSignature,
    );
  }, [composeProject, overrides.tempoBpm, overrides.timeSignature]);

  const effectiveAnalysis = useMemo(() => {
    if (effectiveProject === null || composeAnalysis === null) return null;
    if (overrides.timeSignature === null) return composeAnalysis;
    const outcome = analyzeProject(
      effectiveProject,
      analyzeFull ? { window: { fromTick: 0, toTick: effectiveProject.endTick } } : {},
    );
    return outcome.ok ? outcome.value : composeAnalysis;
  }, [effectiveProject, composeAnalysis, overrides.timeSignature, analyzeFull]);

  // Melody-track override drives REAL re-extraction (patched roles ->
  // extractMelody): the roll shows genuine notes, not a relabel.
  // extractMelody is tick-native and meter-INDEPENDENT (no bar
  // references), so the raw project is correct here post-MED-001.
  const melodyResult = useMemo(() => {
    if (composeProject === null || effectiveAnalysis === null) return null;
    if (overrides.melodyTrackIndex === null) return effectiveAnalysis.melody;
    const chosen = overrides.melodyTrackIndex;
    const roles = effectiveAnalysis.roles.map((r) => {
      if (r.trackIndex === chosen) {
        return { trackIndex: r.trackIndex, role: "melody" as const, confidence: 1 };
      }
      if (r.role === "melody") {
        return { trackIndex: r.trackIndex, role: "unknown" as const, confidence: r.confidence };
      }
      return r;
    });
    return extractMelody(composeProject, roles, effectiveAnalysis.window);
  }, [composeProject, effectiveAnalysis, overrides.melodyTrackIndex]);

  const merged = useMemo(() => {
    if (effectiveAnalysis === null || melodyResult === null) return null;
    return { ...mergeAnalysis(effectiveAnalysis, overrides), melody: melodyResult };
  }, [effectiveAnalysis, melodyResult, overrides]);

  // The D58 blend is evidence on the RAW (pre-override) analysis -
  // a manual key override must not launder itself into "detected".
  const blend = useMemo(
    () => (effectiveAnalysis === null ? null : blendKeyEvidence(effectiveAnalysis)),
    [effectiveAnalysis],
  );

  // --- PRD-001 Phase 4 Slice 3 (D71/D72): accompaniment wiring -----
  // The generator gets the MERGED key truth; a chromatic-fallback
  // analysis passes NO key (D69 keyless degradation is honest).
  const accompKey: KeyCandidate | null =
    merged !== null && !merged.key.chromaticFallback && merged.key.candidates.length > 0
      ? merged.key.candidates[0]
      : null;

  const handleGenerate = (): void => {
    if (merged === null || effectiveProject === null) return;
    const outcome = generateAccompaniment(
      accompRequest,
      merged.grid,
      effectiveProject.ppq,
      accompKey,
    );
    if (!outcome.ok) {
      setError(outcome.error); // existing banner channel (D63 arms)
      return;
    }
    setError(null);
    useSessionStore.getState().setComposeAccompaniment(outcome.value);
  };

  const handlePreview = (): void => {
    if (accompResult === null || effectiveProject === null) return;
    if (previewState === "playing") {
      composePreviewPlayer.stop();
      return;
    }
    if (previewState === "rendering") return;
    // MED-003 (S4 fix round): capture the generation + content
    // identity - a content change or stop() before the slow offline
    // render resolves must NEVER play (phantom audio).
    renderGenRef.current += 1;
    const gen = renderGenRef.current;
    const snapResult = accompResult;
    const snapProject = effectiveProject;
    composePreviewPlayer.markRendering();
    void renderAccompaniment(accompResult, effectiveProject)
      .then((buf) => {
        if (gen !== renderGenRef.current) return; // superseded
        const latest = latestContentRef.current;
        if (latest.result !== snapResult || latest.project !== snapProject) return; // flipped
        composePreviewPlayer.play(buf);
      })
      .catch(() => {
        if (gen === renderGenRef.current) composePreviewPlayer.cancel();
      });
  };

  // Preview lifecycle (PHASE-2-01 live gate + PHASE-3-03 StrictMode):
  // subscribe to the SINGLETON player (double-mount cannot leak a
  // second AudioContext); unmount / mode-switch (this surface
  // unmounting) stops + releases. stop() is idempotent.
  useEffect(() => {
    const unsubscribe = composePreviewPlayer.subscribe(setPreviewState);
    return () => {
      unsubscribe();
      // MED-003: a resolve AFTER unmount must never touch the player
      // (post-unmount ghost, up to 90s of audio with no UI to stop it).
      renderGenRef.current += 1;
      composePreviewPlayer.stop();
    };
  }, []);
  // Re-generate while playing -> stop the stale audition (no-op on
  // mount, idempotent by design). MED-003: the bump kills any render
  // still in flight from the previous content (its .then goes quiet).
  useEffect(() => {
    composePreviewPlayer.stop();
    renderGenRef.current += 1;
  }, [accompResult]);

  // --- PRD-001 Phase 4 Slice 4 (D84): chart-paste commit + reload
  // auto-heal. parse + buildChartSession are PURE + sub-ms; the
  // one-shot ref keeps StrictMode from re-running the heal (PHASE-3-03).
  const handleChartCommit = (chartText: string, chart: ChordChart): void => {
    const { project, analysis } = buildChartSession(chart);
    const store = useSessionStore.getState();
    store.setComposeChart(chartText, project, analysis);
    // D84: the {style:} directive pre-syncs the request ONCE at commit
    // (a suggestion, not a lock - the panel still owns it after).
    if (chart.directives.styleId !== null) {
      const cur = store.composeSession?.request ?? DEFAULT_ACCOMPANIMENT_REQUEST;
      store.setComposeRequest({
        ...cur,
        styleId: chart.directives.styleId,
        density: getStyleProfile(chart.directives.styleId).rhythm.densityDefault,
      });
    }
    setPasteOpen(false);
    setPasteInitial("");
    setError(null);
  };

  const chartHealRef = useRef(false);
  useEffect(() => {
    if (chartHealRef.current) return;
    const s = useSessionStore.getState();
    if (s.composeProject !== null || s.composeSession === null) return;
    const chartText = s.composeSession.chartText;
    if (chartText == null) return;
    chartHealRef.current = true;
    const chart = parseChordChart(chartText);
    if (!chart.ok) {
      setError(chart.error); // defensive: persisted text was valid at commit
      return;
    }
    const { project, analysis } = buildChartSession(chart.value);
    s.setComposeChart(chartText, project, analysis, {
      // Persisted overrides (chordCells etc.) SURVIVE the rebuild.
      overrides: s.composeSession.overrides,
      analyzeFull: false,
    });
  }, [composeSession]);

  // --- PRD-001 Phase 4 Slice 4 (D77/D78/D85): the MIXER -------------
  // Mixer state rides composeSession (per-song taste, D85); default at
  // read (NO v5). Knobs are LIVE AudioParam writes (applyMix) - the
  // buffers re-render ONLY on CONTENT change (result/project identity).
  const mixer: MixerState = composeSession?.mixer ?? MIXER_DEFAULTS;
  const originalNotes = useMemo(
    () =>
      effectiveProject !== null && merged !== null
        ? mapOriginalTracks(effectiveProject, merged.roles)
        : [],
    [effectiveProject, merged],
  );
  const hasOriginal = originalNotes.length > 0;
  const hasPercussion =
    effectiveProject !== null &&
    effectiveProject.tracks.some((t) => t.isPercussion && t.notes.length > 0);
  const mixEndTick = Math.max(
    effectiveProject?.endTick ?? 0,
    accompResult?.meta.endTick ?? 0,
  );
  const mixInput: MixRenderInput | null =
    effectiveProject !== null
      ? { project: effectiveProject, result: accompResult, tracks: originalNotes, endTick: mixEndTick }
      : null;
  const canExport = accompResult !== null || originalNotes.length > 0;
  // D86/RK-S4-5: the writer WIPES the compose keys past the governor;
  // the surface says so HONESTLY (never silent truncation).
  const urlTooLarge = useMemo(
    () => serializeComposeSession(composeSession).tooLarge,
    [composeSession],
  );
  // D77: buffers cached per CONTENT identity (result ref + effective
  // project ref). Mixer changes NEVER invalidate.
  const buffersRef = useRef<{
    readonly result: AccompanimentResult | null;
    readonly project: NormalizedProject;
    readonly groups: Partial<Record<MixGroup, AudioBuffer>>;
  } | null>(null);
  // MED-003 (S4 fix round): the stale-render guard. A render started,
  // then content changed (or stop()) before the slow OfflineAudioContext
  // resolved, must NEVER play (phantom audio) or poison the mix cache -
  // and a post-unmount resolve must NEVER touch the singleton player
  // (ghost audio with no UI to stop it). Every render captures its
  // generation + content identity; the .then arms re-check both before
  // playing. Generations bump on every new render, on the content-change
  // stop path below, and on unmount above.
  const renderGenRef = useRef(0);
  // Latest content identity, refreshed EVERY render (synchronous - no
  // effect-vs-resolve task-ordering race: an effect bump could lose to
  // a resolve task that was already queued).
  const latestContentRef = useRef<{
    result: AccompanimentResult | null;
    project: NormalizedProject | null;
  }>({ result: null, project: null });
  latestContentRef.current = { result: accompResult, project: effectiveProject };
  useEffect(() => {
    buffersRef.current = null;
  }, [accompResult, effectiveProject]);

  const handlePlayMix = (): void => {
    if (mixInput === null) return;
    if (previewState === "playing") {
      composePreviewPlayer.stop();
      return;
    }
    if (previewState === "rendering") return;
    // MED-003: capture generation + identity (same contract as preview).
    renderGenRef.current += 1;
    const gen = renderGenRef.current;
    const snapInput = mixInput;
    composePreviewPlayer.markRendering();
    const cached =
      buffersRef.current !== null &&
      buffersRef.current.result === mixInput.result &&
      buffersRef.current.project === mixInput.project
        ? buffersRef.current.groups
        : null;
    const pending = cached !== null ? Promise.resolve(cached) : renderMixGroups(mixInput);
    void pending
      .then((groups) => {
        if (gen !== renderGenRef.current) return; // superseded
        const latest = latestContentRef.current;
        if (latest.result !== snapInput.result || latest.project !== snapInput.project) return; // flipped
        if (cached === null) {
          buffersRef.current = { result: mixInput.result, project: mixInput.project, groups };
        }
        composePreviewPlayer.playMix(groups);
        composePreviewPlayer.applyMix(computeGroupGains(mixer, hasOriginal));
      })
      .catch(() => {
        if (gen === renderGenRef.current) composePreviewPlayer.cancel();
      });
  };

  const handlePatchMixer = (next: MixerState): void => {
    useSessionStore.getState().setComposeMixer(next);
    // LIVE: instant AudioParam writes, zero re-render (D77).
    composePreviewPlayer.applyMix(computeGroupGains(next, hasOriginal));
  };

  const handleExportMidi = (): void => {
    if (effectiveProject === null || merged === null) return;
    downloadComposeMidi(
      { project: effectiveProject, result: accompResult, roles: merged.roles },
      accompKey,
    );
  };

  const handleExportWav = (): void => {
    if (mixInput === null) return;
    void exportComposeWav(mixInput, mixer, hasOriginal, accompKey).catch(() => {
      // Real failure path (render/encode): warn-only, silent UI.
      console.warn("[ComposeSurface] WAV export failed");
    });
  };

  const accompLayers: readonly RollLayer[] | undefined =
    accompResult === null
      ? undefined
      : (["bass", "chords", "pad"] as const)
          .filter((role) => accompResult.meta.roles.includes(role))
          .map((role) => ({
            label: role,
            notes: accompResult.generated[role],
            color:
              role === "bass"
                ? ROLL_PALETTE.accompanimentBass
                : role === "chords"
                  ? ROLL_PALETTE.accompanimentChords
                  : ROLL_PALETTE.accompanimentPad,
          }));
  const inferredCandidate =
    effectiveAnalysis !== null && effectiveAnalysis.key.candidates.length > 0
      ? effectiveAnalysis.key.candidates[0]
      : null;

  // --- async pipeline (D63) ------------------------------------------
  const handleFile = async (file: File): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setMismatch(null);
    try {
      const buf = await file.arrayBuffer();
      // ReadableMidiFile is STRUCTURAL: hand readMidiFile the cached
      // buffer (one disk read) and hash the SAME bytes.
      const stub: ReadableMidiFile = {
        name: file.name,
        size: file.size,
        arrayBuffer: async () => buf,
      };
      const read = await readMidiFile(stub);
      if (!read.ok) {
        setError(read.error);
        return;
      }
      const project = read.value;
      const hash = await sha256Hex(buf);
      const store = useSessionStore.getState();
      const saved = store.composeSession;
      const meta = { fileName: file.name, fileHash: hash };

      if (saved !== null && store.composeProject === null) {
        // PROMPT state: hash-gated restore (D62, RK-S2-8).
        const verifiable = saved.fileHash !== null && hash !== null;
        if (verifiable && saved.fileHash !== null && hash !== null && saved.fileHash !== hash) {
          setMismatch({ fileName: saved.fileName, file });
          return;
        }
        const analyzed = analyzeProject(project);
        if (!analyzed.ok) {
          setError(analyzed.error);
          return;
        }
        if (verifiable) {
          store.setComposeFile(project, analyzed.value, meta, {
            overrides: saved.overrides,
            analyzeFull: saved.analyzeFull,
          });
          setNotice("Previous edits restored - this file matches your saved session.");
        } else {
          // F9 hash unavailable: overrides are DROPPED with a visible
          // notice - never silently re-applied to an unverifiable file.
          store.setComposeFile(project, analyzed.value, meta);
          setNotice("Previous edits could not be verified - they were not restored.");
        }
        return;
      }

      const analyzed = analyzeProject(project);
      if (!analyzed.ok) {
        setError(analyzed.error);
        return;
      }
      store.setComposeFile(project, analyzed.value, meta);
    } catch {
      setError({ code: "internal", message: "Could not process the file" });
    } finally {
      setBusy(false);
    }
  };

  const acceptMismatch = (): void => {
    if (mismatch === null) return;
    const file = mismatch.file;
    setMismatch(null);
    useSessionStore.getState().clearCompose(); // fresh start, then load
    void handleFile(file);
  };

  // --- D59: surface-local undo/redo keyboard (zero App.tsx edits) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== "z") return;
      if (isTypingTarget(e.target)) return;
      const store = useSessionStore.getState();
      if (store.composeProject === null) return; // only while loaded
      e.preventDefault();
      if (e.shiftKey) store.redoCompose();
      else store.undoCompose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const noteSymbol = (symbol: string): void => {
    setRecentSymbols((prev) => [symbol, ...prev.filter((s) => s !== symbol)].slice(0, 8));
  };

  const startOver = (): void => {
    useSessionStore.getState().clearCompose();
    setError(null);
    setNotice(null);
    setMismatch(null);
  };

  // D62: dropping a new file while loaded REPLACES the session
  // (undo does not cross files - RK-S2-5, [Start over] also exists).
  const loadedDropProps = loaded
    ? {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          const file = e.dataTransfer.files.length > 0 ? e.dataTransfer.files[0] : null;
          if (file !== null && isMidiName(file.name)) void handleFile(file);
          else if (file !== null) setError({ code: "parseFailed", message: "Please drop a .mid or .midi file" });
        },
      }
    : {};

  return (
    <section
      role="region"
      aria-label={loaded ? "Compose mode" : "Compose mode (empty state)"}
      aria-busy={busy}
      data-busy={busy ? "true" : "false"}
      data-state={loaded ? "loaded" : prompt ? "prompt" : "empty"}
      className={`flex flex-col gap-4 ${className}`}
      {...loadedDropProps}
    >
      <div className="relative rounded-2xl border border-[color:var(--color-border)] surface-1 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-30" aria-hidden="true">
          <SynesthesiaProvider>
            <Suspense fallback={null}>
              <SynesthesiaCanvas width={800} height={400} />
            </Suspense>
          </SynesthesiaProvider>
        </div>
        <div className="relative z-10 px-6 py-10 flex flex-col items-center gap-4">
          {loaded && merged !== null && blend !== null && effectiveProject !== null ? (
            <div className="w-full max-w-4xl">
              {error !== null && (
                <div role="alert" className="mb-3 rounded border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-300" data-testid="compose-error">
                  {bannerCopy(error)}
                </div>
              )}
              {notice !== null && (
                <p className="mb-3 text-sm text-[color:var(--color-text-2)]" data-testid="compose-notice">
                  {notice}
                </p>
              )}
              {urlTooLarge && (
                <p
                  className="mb-3 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-300"
                  data-testid="compose-url-notice"
                >
                  {"Session too large to share via URL."}
                </p>
              )}
              {isChart && pasteOpen ? (
                // D84 [Edit chart] round trip: the panel REPLACES the
                // summary card while editing; commit rebuilds the session.
                <ChartPastePanel
                  initialText={pasteInitial}
                  onCommit={handleChartCommit}
                  onCancel={() => {
                    setPasteOpen(false);
                    setPasteInitial("");
                  }}
                />
              ) : isChart ? (
                <ChartSummaryCard
                  chartText={composeSession?.chartText ?? ""}
                  analysis={merged}
                  onEdit={() => {
                    setPasteInitial(composeSession?.chartText ?? "");
                    setPasteOpen(true);
                  }}
                  onStartOver={startOver}
                />
              ) : (
                <AnalysisCard
                  project={effectiveProject}
                  merged={merged}
                  blend={blend}
                  inferredCandidate={inferredCandidate}
                  overrides={overrides}
                  onPatch={(next) => useSessionStore.getState().patchComposeOverrides(next)}
                  analyzeFull={analyzeFull}
                  onAnalyzeFull={(b) => useSessionStore.getState().setComposeAnalyzeFull(b)}
                  onStartOver={startOver}
                  recentSymbols={recentSymbols}
                  onSymbolApplied={noteSymbol}
                />
              )}
              <div className="mt-4">
                <AccompanimentPanel
                  grid={merged.grid}
                  ppq={effectiveProject.ppq}
                  keyCandidate={accompKey}
                  request={accompRequest}
                  result={accompResult}
                  busy={previewState === "rendering"}
                  previewState={previewState}
                  previewCapped={
                    accompResult !== null && previewIsCapped(accompResult, effectiveProject)
                  }
                  onPatchRequest={(r) => useSessionStore.getState().setComposeRequest(r)}
                  onGenerate={handleGenerate}
                  onPreview={handlePreview}
                />
                <div className="mt-4">
                  <ComposeMixer
                    mixer={mixer}
                    hasOriginal={hasOriginal}
                    originalLabel={
                      isChart
                        ? "no file - chart only"
                        : hasPercussion
                          ? "Original (drums not played)"
                          : ""
                    }
                    previewState={previewState}
                    canExport={canExport}
                    onPatchMixer={handlePatchMixer}
                    onPlay={handlePlayMix}
                    onStop={() => composePreviewPlayer.stop()}
                    onExportMidi={handleExportMidi}
                    onExportWav={handleExportWav}
                  />
                </div>
                {accompResult !== null && (
                  <div className="mt-3" data-testid="accompaniment-roll">
                    <p className="t-label mb-1 text-[color:var(--color-text-3)]">
                      Generated accompaniment - overlay roll (melody + generated layers)
                    </p>
                    <ComposePianoRoll
                      project={effectiveProject}
                      melody={merged.melody}
                      window={merged.window}
                      truncated={merged.truncated}
                      layers={accompLayers}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-1)]">
                Drop a .mid file to get started.
              </h2>
              {prompt && composeSession !== null && (
                <div
                  className="w-full max-w-md rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-black/20 px-4 py-3 text-center"
                  data-testid="reupload-prompt"
                >
                  <p className="text-sm text-[color:var(--color-text-1)]" data-testid="reupload-file-name">
                    {`Re-upload ${composeSession.fileName} to restore your saved session.`}
                  </p>
                  <p className="t-label mt-1 text-[color:var(--color-text-3)]" data-testid="reupload-hash">
                    {composeSession.fileHash === null
                      ? "Saved session hash unavailable - edits cannot be verified."
                      : `Saved file hash: ${composeSession.fileHash.slice(0, 12)}`}
                  </p>
                </div>
              )}
              {mismatch !== null && (
                <div role="alert" className="w-full max-w-md rounded border border-red-500/60 bg-red-500/10 px-3 py-2 text-center" data-testid="hash-mismatch-banner">
                  <p className="text-sm text-red-300">
                    {"This file does not match your saved session"}
                    {` (${mismatch.fileName}).`}
                  </p>
                  <div className="mt-2 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={acceptMismatch}
                      className="rounded border border-red-400/60 px-2 py-0.5 text-xs text-red-200"
                      data-testid="mismatch-use-anyway"
                    >
                      Use anyway (clear saved session)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMismatch(null)}
                      className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-text-2)]"
                      data-testid="mismatch-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {error !== null && (
                <div role="alert" className="w-full max-w-md rounded border border-red-500/60 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300" data-testid="compose-error">
                  {bannerCopy(error)}
                </div>
              )}
              {notice !== null && (
                <p className="text-sm text-[color:var(--color-text-2)]" data-testid="compose-notice">
                  {notice}
                </p>
              )}
              <div className="w-full max-w-md">
                <UploadDropZone onFile={(file) => void handleFile(file)} busy={busy} />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onOpenImportExport}
                  className="px-4 py-2 rounded-lg bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-strong)] text-[color:var(--color-text-inverse)] text-sm font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
                >
                  Open import / export
                </button>
                {/* D84 (REQ-IO-14): chart-paste entry - a SECONDARY
                    button; the three ModeGate-pinned strings above are
                    VERBATIM (presence pins, additive element legal -
                    S2 drop-zone precedent). */}
                <button
                  type="button"
                  onClick={() => {
                    setPasteInitial("");
                    setPasteOpen(true);
                  }}
                  className="px-4 py-2 rounded-lg border border-[color:var(--color-border)] text-sm text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
                  data-testid="paste-chart-button"
                >
                  Paste a chord chart
                </button>
              </div>
              {pasteOpen && (
                <ChartPastePanel
                  initialText={pasteInitial}
                  onCommit={handleChartCommit}
                  onCancel={() => {
                    setPasteOpen(false);
                    setPasteInitial("");
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
      <aside
        aria-label="Privacy statement"
        className="text-xs text-[color:var(--color-text-3)] italic text-center max-w-md mx-auto"
      >
        All processing happens in your browser. Your MIDI file never
        leaves this tab.
      </aside>
    </section>
  );
};


/**
 * D84: the loaded-chart header (INSTEAD of AnalysisCard - the card's
 * key-confidence / melody-track UI is meaningless for a pasted
 * chart). Directives readout + [Edit chart] round trip + [Start over].
 * The styleId readout is honest: a SUGGESTION applied at commit, the
 * panel owns it after.
 */
const ChartSummaryCard: React.FC<{
  chartText: string;
  analysis: Pick<ComposeAnalysis, "key" | "grid">;
  onEdit: () => void;
  onStartOver: () => void;
}> = ({ chartText, analysis, onEdit, onStartOver }) => {
  const chart = parseChordChart(chartText); // pure + sub-ms (heal already ran)
  const d = chart.ok ? chart.value.directives : null;
  const NAMES: readonly string[] = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const keySeg = analysis.key.chromaticFallback || analysis.key.candidates.length === 0
    ? "none (chromatic)"
    : `${NAMES[analysis.key.candidates[0].tonicPc]} ${analysis.key.candidates[0].mode}`;
  return (
    <div
      className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-black/20 p-4 flex flex-col gap-2"
      data-testid="chart-summary-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[color:var(--color-text-1)]">
          {CHART_SESSION_FILE_NAME}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-text-2)]"
            data-testid="chart-edit-button"
          >
            Edit chart
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-xs text-[color:var(--color-text-2)]"
            data-testid="chart-start-over"
          >
            Start over
          </button>
        </div>
      </div>
      <p className="t-small text-[color:var(--color-text-2)]" data-testid="chart-directives">
        {`${analysis.grid.bars.length} bars - key: ${keySeg}`}
        {d?.tempoBpm != null ? ` - tempo: ${d.tempoBpm}` : ""}
        {d?.timeSignature != null ? ` - time: ${d.timeSignature[0]}/${d.timeSignature[1]}` : ""}
        {d?.styleId != null ? ` - style: ${d.styleId} (suggestion)` : ""}
      </p>
    </div>
  );
};
