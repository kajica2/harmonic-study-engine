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

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { SynesthesiaCanvas } from "./SynesthesiaCanvas";
import { SynesthesiaProvider } from "./SynesthesiaProvider";
import { UploadDropZone } from "./UploadDropZone";
import { AnalysisCard } from "./AnalysisCard";
import { AccompanimentPanel } from "./AccompanimentPanel";
import { ComposePianoRoll, type RollLayer } from "./ComposePianoRoll";
import { ROLL_PALETTE } from "./EtudePianoRoll";
import { useSessionStore } from "../state/sessionStore";
import {
  composePreviewPlayer,
  previewIsCapped,
  renderAccompaniment,
  type PreviewState,
} from "../lib/composePreview";
import { readMidiFile, sha256Hex, type ReadableMidiFile } from "../lib/composeMidi";
import { analyzeProject, generateAccompaniment } from "../../engine/compose";
import { blendKeyEvidence } from "../../engine/compose/key";
import { extractMelody } from "../../engine/compose/melody";
import { getStyleProfile } from "../../engine/styles";
import {
  EMPTY_OVERRIDES,
  mergeAnalysis,
  type AccompanimentRequest,
  type AccompRole,
  type AnalysisError,
  type AnalysisOverrides,
  type KeyCandidate,
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

  const overrides: AnalysisOverrides = composeSession?.overrides ?? EMPTY_OVERRIDES;
  const analyzeFull = composeSession?.analyzeFull ?? false;
  // D73 default-at-read: missing persisted request -> the defaults.
  const accompRequest: AccompanimentRequest = composeSession?.request ?? DEFAULT_ACCOMPANIMENT_REQUEST;
  const loaded = composeProject !== null && composeAnalysis !== null && composeSession !== null;
  const prompt = !loaded && composeSession !== null;

  // --- derived truth (memoized; NO engine recompute per render) -----
  // D63: a meter override re-runs the analysis on a patched PROJECT
  // copy (bar boundaries change); tempo is record-only (no re-run -
  // the tick grid is tempo-independent).
  // MED-001 (reviewer): the patched project is HOISTED, not built
  // inside the analysis memo and discarded - the SAME effective
  // project flows to the card and the piano roll, so the roll's
  // barBoundaries barlines cannot lag the (re-analyzed) chart rows.
  const effectiveProject = useMemo<NormalizedProject | null>(() => {
    if (composeProject === null) return null;
    if (overrides.timeSignature === null) return composeProject;
    const [num, den] = overrides.timeSignature;
    return {
      ...composeProject,
      timeSignatures: [{ tick: 0, numerator: num, denominator: den }],
    };
  }, [composeProject, overrides.timeSignature]);

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
    composePreviewPlayer.markRendering();
    void renderAccompaniment(accompResult, effectiveProject)
      .then((buf) => composePreviewPlayer.play(buf))
      .catch(() => composePreviewPlayer.cancel());
  };

  // Preview lifecycle (PHASE-2-01 live gate + PHASE-3-03 StrictMode):
  // subscribe to the SINGLETON player (double-mount cannot leak a
  // second AudioContext); unmount / mode-switch (this surface
  // unmounting) stops + releases. stop() is idempotent.
  useEffect(() => {
    const unsubscribe = composePreviewPlayer.subscribe(setPreviewState);
    return () => {
      unsubscribe();
      composePreviewPlayer.stop();
    };
  }, []);
  // Re-generate while playing -> stop the stale audition (no-op on
  // mount, idempotent by design).
  useEffect(() => {
    composePreviewPlayer.stop();
  }, [accompResult]);

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
              <button
                type="button"
                onClick={onOpenImportExport}
                className="px-4 py-2 rounded-lg bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-strong)] text-[color:var(--color-text-inverse)] text-sm font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
              >
                Open import / export
              </button>
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
