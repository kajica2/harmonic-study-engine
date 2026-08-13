import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Pause,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Info,
  Square,
  Settings2,
  Sparkles,
  Waypoints,
  FileCode,
  RefreshCw,
  Hexagon,
  User,
  BookOpen,
  Music,
  Volume2,
  Check,
  Circle,
  Mic,
  Video,
  StopCircle,
} from "lucide-react";
import { audioEngine, InstrumentType } from "./lib/audio";
import { rhythmEngine } from "./lib/rhythm";
import { playbackClock } from "./lib/playbackClock";
import { useTimeoutRef } from "./lib/useTimeoutRef";
import { useHistory } from "./lib/useHistory";
import { playScaleUpDown, getDiatonicScale, SCALE_MODES } from "./lib/scalePlayer";
import { backingEngine, BackingStyle } from "./lib/backingEngine";
import { midiOut } from "./lib/midiOut";
import { PATHS, ALL_PATHS, HarmonicPath } from "./lib/paths";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { SynesthesiaCanvas } from "./components/SynesthesiaCanvas";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { KeyboardShortcutsCheatsheet } from "./components/KeyboardShortcutsCheatsheet";
import { generateHarmonicPath } from "./lib/generator";
import { applyVoiceLeading } from "./lib/theory";
import { ImportExportModal } from "./components/ImportExportModal";
import { generateEtude, generateEtudeAsync, EtudeAlgorithm } from "./lib/etude";
import { toMusicXml, toScore21 } from "./lib/scoreExport";
import { generateGeminiEtude } from "./lib/geminiHelper";
import { synthesizeAndPlay, checkDDSPStatus } from "./lib/ddspSynth";
import { PERSONAS, Persona, VisualTheme } from "./lib/personas";
import { recorder } from "./lib/recorder";
import { audioRecorder, RecordingResult } from "./lib/audioRecorder";
import { exportToMidiFile } from "./lib/midiExport";
import { renderPathToWav, downloadWavFromBlob, RenderMode } from "./lib/loopWav";
import { useAsyncAction } from "./lib/useAsyncAction";
import { InlineErrorPill } from "./components/InlineStatus";
import { RecordingModal } from "./components/RecordingModal";
import { LiveScoreDisplay } from "./components/LiveScoreDisplay";
import { PlaySessionRail } from "./components/PlaySessionRail";
import { MobileCommandBar } from "./components/MobileCommandBar";
import { LeadSheet } from "./components/LeadSheet";
import { ChordInspector, makeInspectorHistory } from "./components/ChordInspector";
import { StageFrame, ToolGroup, ToolChip } from "./components/StageFrame";

const NOTE_WHEEL = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

function transposeChordName(name: string, shift: number): string {
  if (shift % 12 === 0) return name;
  return name.replace(/(^|[\s/(-])([A-G][b#]?)/g, (match, prefix, note) => {
    let index = NOTE_WHEEL.indexOf(note);
    if (index === -1) {
      const enharmonics: Record<string, string> = {
        "C#": "Db",
        "D#": "Eb",
        "F#": "Gb",
        "G#": "Ab",
        "A#": "Bb",
      };
      index = enharmonics[note] ? NOTE_WHEEL.indexOf(enharmonics[note]) : -1;
    }
    if (index === -1) return match;
    const newIndex = (index + shift + 120) % 12; // +120 ensures positive before modulo
    return prefix + NOTE_WHEEL[newIndex];
  });
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [paths, setPaths] = useState<HarmonicPath[]>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_paths");
      const parsed = saved ? JSON.parse(saved) : ALL_PATHS;
      // Bump: when v2 (study materials + new PATHS shape) ships and the
      // user has stale localStorage from before, merge in any missing
      // built-in paths so study materials appear without a manual reset.
      if (saved) {
        const ids = new Set(parsed.map((p: HarmonicPath) => p.id));
        const missing = ALL_PATHS.filter((p) => !ids.has(p.id));
        if (missing.length) return [...parsed, ...missing];
      }
      return parsed;
    } catch {
      return ALL_PATHS;
    }
  });

  const [activePathIndex, setActivePathIndex] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_activePathIndex");
      if (saved !== null) {
        const val = Number(saved);
        const savedPaths = localStorage.getItem("synesthesia_paths");
        const currentPaths = savedPaths ? JSON.parse(savedPaths) : PATHS;
        if (val >= 0 && val < currentPaths.length) return val;
      }
    } catch {}
    return 0;
  });

  const [activeStepIndex, setActiveStepIndex] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_activeStepIndex");
      if (saved !== null) {
        const val = Number(saved);
        const savedPaths = localStorage.getItem("synesthesia_paths");
        const currentPaths = savedPaths ? JSON.parse(savedPaths) : PATHS;

        const activePathIdxSaved = localStorage.getItem(
          "synesthesia_activePathIndex",
        );
        const activePathIdx = activePathIdxSaved
          ? Number(activePathIdxSaved)
          : 0;

        const currentPath = currentPaths[activePathIdx] || currentPaths[0];
        if (currentPath && val >= 0 && val < currentPath.steps.length)
          return val;
      }
    } catch {}
    return 0;
  });

  const [activeMidis, setActiveMidis] = useState<number[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 400 });

  const [transposeShift, setTransposeShift] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_transposeShift");
      return saved !== null ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  const [voicingType, setVoicingType] = useState<"closed" | "open">(() => {
    try {
      const saved = localStorage.getItem("synesthesia_voicingType");
      return saved === "open" ? "open" : "closed";
    } catch {
      return "closed";
    }
  });

  const [midiOutputs, setMidiOutputs] = useState<any[]>([]);
  const [selectedMidiOutId, setSelectedMidiOutId] = useState<string>("");

  const [instrument, setInstrument] = useState<InstrumentType>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_instrument");
      return (saved ? JSON.parse(saved) : "epiano") as InstrumentType;
    } catch {
      return "epiano";
    }
  });

  const [isPlayingAuto, setIsPlayingAuto] = useState(false);
  const [isDDSPLoading, setIsDDSPLoading] = useState(false);
  const ddspAction = useAsyncAction();
  const [ddspServerOnline, setDDSPServerOnline] = useState(false);
  const [isRenderingWav, setIsRenderingWav] = useState(false);
  const [wavExportError, setWavExportError] = useState<string | null>(null);
  const [wavExportStatus, setWavExportStatus] = useState<string | null>(null);
  const [wavMode, setWavMode] = useState<RenderMode>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_wavMode");
      return (saved ? JSON.parse(saved) : "block") as RenderMode;
    } catch {
      return "block";
    }
  });
  // Whether the OpenRouter API key is configured at build time.
  // The Gemini/Cloud options are disabled in the UI when this is false.
  const hasOpenRouterKey = Boolean(
    (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim(),
  );

  const [tempo, setTempo, tempoHistory] = useHistory<number>(
    () => {
      try {
        const saved = localStorage.getItem("synesthesia_tempo");
        return saved !== null ? Number(saved) : 60;
      } catch {
        return 60;
      }
    },
  );

  const [volume, setVolume] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_volume");
      return saved !== null ? Number(saved) : 50;
    } catch {
      return 50;
    }
  });

  // Persona Sync
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_selectedPersonaId");
      return saved ? JSON.parse(saved) : "";
    } catch {
      return "";
    }
  });

  // Collapsible / Foldable states for space optimization
  const [isArpFolded, setIsArpFolded] = useState(false);
  const [isGenFolded, setIsGenFolded] = useState(true); // default folded to conserve screen height
  const [isPathsFolded, setIsPathsFolded] = useState(false);

  const [kbRange, setKbRange] = useState<{ from: number; to: number }>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_kbRange");
      return saved ? JSON.parse(saved) : { from: 36, to: 72 };
    } catch {
      return { from: 36, to: 72 };
    }
  });

  useEffect(() => {
    audioEngine.setInstrument(instrument);
  }, [instrument]);

  const [timeSignature, setTimeSignature] = useState<
    "4/4" | "6/8" | "7/8" | "11/4" | "tintal"
  >(() => {
    try {
      const saved = localStorage.getItem("synesthesia_timeSignature");
      return (saved ? JSON.parse(saved) : "4/4") as any;
    } catch {
      return "4/4";
    }
  });

  const [beatType, setBeatType] = useState<BackingStyle>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_beatType");
      // Migrate old beat-type strings to the new BackingStyle names
      if (saved) {
        const legacy = JSON.parse(saved);
        const map: Record<string, BackingStyle> = {
          none: "off",
          metronome: "off",
          jazz: "swing",
          bossa: "bossa",
          techno: "funk",
        };
        return (map[legacy] ?? "off");
      }
      return "off";
    } catch {
      return "off";
    }
  });

  // Per-track backing mute toggles. Default all on. Lets the user
  // practice with just drums + piano comping (mute bass for bass
  // practice) or strip everything but the bass (drums + piano muted).
  const [drumsMuted, setDrumsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem("synesthesia_drumsMuted") === "1";
    } catch {
      return false;
    }
  });
  const [bassMuted, setBassMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem("synesthesia_bassMuted") === "1";
    } catch {
      return false;
    }
  });
  const [pianoMuted, setPianoMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem("synesthesia_pianoMuted") === "1";
    } catch {
      return false;
    }
  });

  const [genLength, setGenLength] = useState(1);
  const [genComplexity, setGenComplexity] = useState(1);

  const [optimizeVoiceLeading, setOptimizeVoiceLeading] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_optimizeVoiceLeading");
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const [showTheoryLabels, setShowTheoryLabels] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_showTheoryLabels");
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const [showImportExport, setShowImportExport] = useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);

  const [arpType, setArpType] = useState<
    | "none"
    | "up"
    | "down"
    | "upDown"
    | "downUp"
    | "random"
    | "converge"
    | "diverge"
  >(() => {
    try {
      const saved = localStorage.getItem("synesthesia_arpType");
      return (saved ? JSON.parse(saved) : "none") as any;
    } catch {
      return "none";
    }
  });

  const [arpRate, setArpRate] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_arpRate");
      return saved !== null ? Number(saved) : 4;
    } catch {
      return 4;
    }
  });

  const [arpGate, setArpGate] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_arpGate");
      return saved !== null ? Number(saved) : 80;
    } catch {
      return 80;
    }
  });

  const [arpOctaves, setArpOctaves] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_arpOctaves");
      return saved !== null ? Number(saved) : 1;
    } catch {
      return 1;
    }
  });

  // Diatonic-scale practice mode. "auto" picks the mode from
  // the chord's quality (maj / min / mix / locrian), or the user
  // can pin a specific mode. "scaleMode" controls which.
  const [scaleMode, setScaleMode] = useState<string>("auto");
  const [scaleBusy, setScaleBusy] = useState(false);
  const [scaleModeOpen, setScaleModeOpen] = useState(false);

  const [isLooping, setIsLooping] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_isLooping");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const isLoopingRef = useRef(isLooping);

  // Loop a sub-range of bars within a path. Both inclusive.
  // `null` for loopEndBar means "loop to the end of the path".
  // The user sets these by clicking bars in the bar strip (see
  // PlaySessionRail). When `isLooping` is true, the auto-advance
  // wraps between loopStartBar and loopEndBar instead of the full
  // path. When isLooping is false, the range is ignored (full-path
  // playback) but still visible as a hint.
  const [loopStartBar, setLoopStartBar] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_loopStartBar");
      return saved !== null ? Number(saved) : null;
    } catch {
      return null;
    }
  });
  const [loopEndBar, setLoopEndBar] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_loopEndBar");
      return saved !== null ? Number(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const tm = useTimeoutRef();

  const path = paths[activePathIndex];
  const step = path.steps[activeStepIndex];

  const optimizedStepsNotes = useMemo(() => {
    if (!optimizeVoiceLeading) return path.steps.map((s) => s.notes);

    const res = [];
    for (let i = 0; i < path.steps.length; i++) {
      if (i === 0) {
        res.push(path.steps[i].notes);
      } else {
        res.push(applyVoiceLeading(res[i - 1], path.steps[i].notes));
      }
    }
    return res;
  }, [path.steps, optimizeVoiceLeading]);

  const currentChordNotes = useMemo(() => {
    let current = [...optimizedStepsNotes[activeStepIndex]].sort(
      (a, b) => a - b,
    );
    if (instrument === "trumpet" || instrument === "sax") {
      // If arpeggiator is Off, play only the single highest melody note (monophonic)
      if (arpType === "none" && current.length > 0) {
        current = [current[current.length - 1]];
      }
    } else if (voicingType === "open") {
      const openNotes = [current[0]]; // keep bass note
      for (let i = 1; i < current.length; i++) {
        // Spread voicing: push every other note up an octave
        openNotes.push(current[i] + (i % 2 !== 0 ? 12 : 0));
      }
      current = openNotes;
    }
    return current.map((n) => n + transposeShift);
  }, [optimizedStepsNotes, activeStepIndex, transposeShift, voicingType, instrument, arpType]);

  useEffect(() => {
    // Initialize audio engine on first interaction
    const handleFirstInteraction = () => {
      audioEngine.init();
      midiOut.init();
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("mousedown", handleFirstInteraction);
    };
    window.addEventListener("keydown", handleFirstInteraction);
    window.addEventListener("mousedown", handleFirstInteraction);

    // Subscribe to MIDI outputs
    const unsubscribeMidi = midiOut.onOutputsChange((outputs) => {
      setMidiOutputs(outputs);
      setSelectedMidiOutId(midiOut.getSelectedOutputId() || "");
    });

    return () => {
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("mousedown", handleFirstInteraction);
      unsubscribeMidi();
    };
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (canvasContainerRef.current) {
        setCanvasSize({
          width: canvasContainerRef.current.offsetWidth,
          height: canvasContainerRef.current.offsetHeight,
        });
      }
    };

    // Initial size
    updateSize();

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Update audio when step changes or arp settings change
  const arpNotes = useMemo(() => {
    let notes = [...currentChordNotes];
    if (arpOctaves > 1) {
      let expanded = [...notes];
      const fullOctaves = Math.floor(arpOctaves);
      for (let i = 1; i < fullOctaves; i++) {
        expanded = expanded.concat(notes.map((n) => n + 12 * i));
      }
      if (arpOctaves % 1 !== 0) {
        const numNotes = Math.max(
          1,
          Math.round(notes.length * (arpOctaves % 1)),
        );
        const partial = notes
          .slice(0, numNotes)
          .map((n) => n + 12 * fullOctaves);
        expanded = expanded.concat(partial);
      }
      notes = Array.from(new Set(expanded)).sort((a, b) => a - b);
    }

    if (arpType === "up") return notes;
    if (arpType === "down") return [...notes].reverse();
    if (arpType === "upDown")
      return [...notes, ...[...notes].reverse().slice(1, -1)];
    if (arpType === "downUp")
      return [...notes].reverse().concat([...notes].slice(1, -1));
    if (arpType === "random") return notes;
    if (arpType === "converge") {
      let c = [];
      let l = 0,
        r = notes.length - 1;
      while (l <= r) {
        c.push(notes[l++]);
        if (l <= r) c.push(notes[r--]);
      }
      return c;
    }
    if (arpType === "diverge") {
      let d = [];
      let mid = Math.floor(notes.length / 2);
      let l = mid - 1,
        r = mid;
      while (l >= 0 || r < notes.length) {
        if (r < notes.length) d.push(notes[r++]);
        if (l >= 0) d.push(notes[l--]);
      }
      return d;
    }
    return notes;
  }, [currentChordNotes, arpType, arpOctaves]);

  useEffect(() => {
    audioEngine.stopAll();
    midiOut.stopAll();

    if (arpType === "none") {
      setActiveMidis(currentChordNotes);
      audioEngine.playChord(currentChordNotes);
      midiOut.playChord(currentChordNotes);
      currentChordNotes.forEach((n) => recorder.recordNoteOn(n));

      return () => {
        audioEngine.stopAll();
        midiOut.stopAll();
        currentChordNotes.forEach((n) => recorder.recordNoteOff(n));
      };
    } else {
      setActiveMidis([]);
      let arpIndex = 0;
      let lastNote = -1;
      let gateTimeout: ReturnType<typeof setTimeout>;

      let divisor = 1;
      if (arpRate === 2)
        divisor = 2; // 8th
      else if (arpRate === 3)
        divisor = 3; // 8th triplet
      else if (arpRate === 4)
        divisor = 4; // 16th
      else if (arpRate === 5)
        divisor = 6; // 16th triplet
      else if (arpRate === 6) divisor = 8; // 32nd

      const realMsPerTick = 60000 / tempo / divisor;

      const playNextArp = () => {
        if (lastNote !== -1) {
          audioEngine.stopNote(lastNote);
          midiOut.stopNote(lastNote);
          recorder.recordNoteOff(lastNote);
          setActiveMidis((prev) => prev.filter((m) => m !== lastNote));
        }

        if (arpNotes.length === 0) return;

        let noteToPlay = -1;
        if (arpType === "random") {
          noteToPlay = arpNotes[Math.floor(Math.random() * arpNotes.length)];
        } else {
          noteToPlay = arpNotes[arpIndex % arpNotes.length];
          arpIndex++;
        }

        lastNote = noteToPlay;
        audioEngine.playNote(noteToPlay);
        midiOut.playNote(noteToPlay);
        recorder.recordNoteOn(noteToPlay);
        setActiveMidis((prev) => Array.from(new Set([...prev, noteToPlay])));

        if (arpGate < 100) {
          gateTimeout = setTimeout(
            () => {
              const currentNote = noteToPlay;
              audioEngine.stopNote(currentNote);
              midiOut.stopNote(currentNote);
              recorder.recordNoteOff(currentNote);
              setActiveMidis((prev) => prev.filter((m) => m !== currentNote));
            },
            realMsPerTick * (arpGate / 100),
          );
        }
      };

      playNextArp();
      const intervalId = setInterval(playNextArp, realMsPerTick);

      return () => {
        clearInterval(intervalId);
        clearTimeout(gateTimeout);
        if (lastNote !== -1) {
          audioEngine.stopNote(lastNote);
          midiOut.stopNote(lastNote);
          recorder.recordNoteOff(lastNote);
        }
      };
    }
  }, [currentChordNotes, arpNotes, arpType, arpRate, arpGate, tempo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack typing in form fields.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;
      if (isTyping) return;

      // Global Escape: close any open modal first, then stop playback.
      if (e.key === "Escape") {
        if (showImportExport) {
          setShowImportExport(false);
          e.preventDefault();
          return;
        }
        if (showLeadSheet) {
          setShowLeadSheet(false);
          e.preventDefault();
          return;
        }
        if (showChordInspector) {
          setShowChordInspector(false);
          e.preventDefault();
          return;
        }
        if (showRecordingModal) {
          // RecordingModal handles its own close button; we leave it.
          return;
        }
        if (showCheatsheet) {
          setShowCheatsheet(false);
          e.preventDefault();
          return;
        }
        if (isPlayingAuto) {
          setIsPlayingAuto(false);
          e.preventDefault();
        }
        return;
      }

      // Cheatsheet toggle on ? (Shift+/) regardless of shift state.
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        setShowCheatsheet((v) => !v);
        e.preventDefault();
        return;
      }

      if (e.key === "ArrowRight") {
        setActiveStepIndex((prev) => Math.min(prev + 1, path.steps.length - 1));
      } else if (e.key === "ArrowLeft") {
        setActiveStepIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "ArrowDown") {
        setActivePathIndex((prev) => {
          const nextInit = Math.min(prev + 1, paths.length - 1);
          if (nextInit !== prev) setActiveStepIndex(0);
          return nextInit;
        });
      } else if (e.key === "ArrowUp") {
        setActivePathIndex((prev) => {
          const nextInit = Math.max(prev - 1, 0);
          if (nextInit !== prev) setActiveStepIndex(0);
          return nextInit;
        });
      } else if (e.key === " " || e.code === "Space") {
        // Space → toggle Auto playback
        e.preventDefault();
        setIsPlayingAuto((p) => !p);
      } else if (e.key === "m" || e.key === "M") {
        // M → toggle Play Along (mute synth melody)
        e.preventDefault();
        audioEngine.setMelodyMuted(!audioEngine.melodyMuted);
      } else if (e.key === "[") {
        e.preventDefault();
        setTempo((t) => Math.max(30, t - 5));
      } else if (e.key === "]") {
        e.preventDefault();
        setTempo((t) => Math.min(240, t + 5));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [path.steps.length, paths.length]);

  useEffect(() => {
    rhythmEngine.setTempo(tempo);
  }, [tempo]);

  useEffect(() => {
    rhythmEngine.setTimeSignature(timeSignature);
  }, [timeSignature]);

  useEffect(() => {
    rhythmEngine.setBeat(beatType);
  }, [beatType]);

  useEffect(() => {
    rhythmEngine.setOnMeasureStart(() => {
      setActiveStepIndex((prev) => {
        // Sub-range loop wins when active and a start bar is set.
        const useLoop = isLoopingRef.current && loopStartBar !== null;
        if (useLoop) {
          const totalBars = Math.ceil(path.steps.length / 4);
          const fromStep = loopStartBar! * 4;
          // Inclusive end bar; +1 because we want the wrap to land on
          // the start of (loopEndBar + 1).
          const toStep =
            (Math.min(loopEndBar ?? totalBars - 1, totalBars - 1) + 1) * 4;
          if (prev + 1 >= toStep) return fromStep;
          if (prev < fromStep) return fromStep;
          return prev + 1;
        }
        if (prev >= path.steps.length - 1) {
          if (!isLoopingRef.current) {
            setTimeout(() => setIsPlayingAuto(false), 0);
            return prev;
          }
          return 0;
        }
        return prev + 1;
      });
    });
  }, [path.steps.length, loopStartBar, loopEndBar]);

  useEffect(() => {
    if (isPlayingAuto) {
      rhythmEngine.start();
      playbackClock.start();
    } else {
      rhythmEngine.stop();
      playbackClock.stop();
    }
    return () => {
      rhythmEngine.stop();
      playbackClock.stop();
    };
  }, [isPlayingAuto]);

  // Keep the clock in sync with the active path's tempo + meter + step count
  useEffect(() => {
    playbackClock.setTempo(tempo);
  }, [tempo]);
  useEffect(() => {
    const [n] = timeSignature.split("/").map(Number);
    playbackClock.setTimeSignature(n || 4, 4);
  }, [timeSignature]);
  useEffect(() => {
    playbackClock.setPathStepCount(path.steps.length);
  }, [path.steps.length]);

  useEffect(() => {
    const volLog = volume / 100;
    audioEngine.setVolume(volLog);
  }, [volume]);

  // Backing engine — start/stop with isPlayingAuto; honor the
  // current style (swing / bossa / funk / latin / ballad / off).
  useEffect(() => {
    if (isPlayingAuto) {
      backingEngine.init();
      backingEngine.setStyle(beatType);
      backingEngine.start();
    } else {
      backingEngine.stop();
    }
    return () => backingEngine.stop();
  }, [isPlayingAuto, beatType]);

  // Push per-track mute flags to the backing engine. Cheap; just
  // sets bus gain to 0 when muted. Lets the user drop the bass out
  // for bass practice, or strip the drums for pure comping.
  useEffect(() => {
    backingEngine.setLevels({
      drumsMuted,
      bassMuted,
      pianoMuted,
    });
  }, [drumsMuted, bassMuted, pianoMuted]);

  // Each tick: schedule a window of backing-track beats ahead so
  // the rhythm section stays in phase with the melody playback
  // clock. Uses the playbackClock's `tick` event so we share one
  // rAF source across the whole app.
  useEffect(() => {
    if (!isPlayingAuto || beatType === "off") return;
    const off = playbackClock.subscribe((d) => {
      const ctx = audioEngine.getCtx?.();
      if (!ctx) return;
      const secPerBar = (60 / tempo) * 4;
      const startSec = ctx.currentTime + 0.05;
      const stepIdx = Math.floor((d.timeSec / secPerBar)) % path.steps.length;
      const beatInBar = d.beat; // 0..numBeats
      // Only schedule ahead at the start of a new bar to avoid
      // double-scheduling. Cheaper than a per-tick schedule.
      if (beatInBar < 0.1) {
        void backingEngine.scheduleAhead(
          path.steps,
          stepIdx + 1,
          Math.floor(stepIdx / 4),
          startSec,
          secPerBar,
        );
      }
    });
    return off;
  }, [isPlayingAuto, beatType, tempo, path.steps.length]);

  // Sync state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("synesthesia_paths", JSON.stringify(paths));
      localStorage.setItem(
        "synesthesia_activePathIndex",
        String(activePathIndex),
      );
      localStorage.setItem(
        "synesthesia_activeStepIndex",
        String(activeStepIndex),
      );
      localStorage.setItem(
        "synesthesia_selectedPersonaId",
        JSON.stringify(selectedPersonaId),
      );
      localStorage.setItem(
        "synesthesia_transposeShift",
        String(transposeShift),
      );
      localStorage.setItem("synesthesia_voicingType", voicingType);
      localStorage.setItem(
        "synesthesia_instrument",
        JSON.stringify(instrument),
      );
      localStorage.setItem("synesthesia_tempo", String(tempo));
      localStorage.setItem(
        "synesthesia_optimizeVoiceLeading",
        JSON.stringify(optimizeVoiceLeading),
      );
      localStorage.setItem(
        "synesthesia_showTheoryLabels",
        JSON.stringify(showTheoryLabels),
      );
      localStorage.setItem("synesthesia_arpType", JSON.stringify(arpType));
      localStorage.setItem("synesthesia_arpRate", String(arpRate));
      localStorage.setItem("synesthesia_arpGate", String(arpGate));
      localStorage.setItem("synesthesia_arpOctaves", String(arpOctaves));
      localStorage.setItem("synesthesia_isLooping", JSON.stringify(isLooping));
      localStorage.setItem("synesthesia_loopStartBar", String(loopStartBar ?? ""));
      localStorage.setItem("synesthesia_loopEndBar", String(loopEndBar ?? ""));
      localStorage.setItem("synesthesia_timeSignature", JSON.stringify(timeSignature));
      localStorage.setItem("synesthesia_wavMode", JSON.stringify(wavMode));
      localStorage.setItem("synesthesia_beatType", JSON.stringify(beatType));
      localStorage.setItem("synesthesia_drumsMuted", drumsMuted ? "1" : "0");
      localStorage.setItem("synesthesia_bassMuted", bassMuted ? "1" : "0");
      localStorage.setItem("synesthesia_pianoMuted", pianoMuted ? "1" : "0");
      localStorage.setItem("synesthesia_kbRange", JSON.stringify(kbRange));
      localStorage.setItem("synesthesia_volume", String(volume));
    } catch (e) {
      console.warn("localStorage persistence error:", e);
    }
  }, [
    paths,
    activePathIndex,
    activeStepIndex,
    selectedPersonaId,
    transposeShift,
    voicingType,
    instrument,
    tempo,
    optimizeVoiceLeading,
    showTheoryLabels,
    arpType,
    arpRate,
    arpGate,
    arpOctaves,
    isLooping,
    timeSignature,
    beatType,
    drumsMuted,
    bassMuted,
    pianoMuted,
    kbRange,
    volume,
  ]);

  const handleGeneratePath = () => {
    const newPath = generateHarmonicPath(genLength, genComplexity);
    setPaths([newPath, ...paths]);
    setActivePathIndex(0);
    setActiveStepIndex(0);
    setTransposeShift(0);
  };

  const [etudeAlgorithm, setEtudeAlgorithm] =
    useState<EtudeAlgorithm>("magenta_rnn");
  const [isGeneratingML, setIsGeneratingML] = useState(false);
  const [etudeStatus, setEtudeStatus] = useState<string | null>(null);
  const [hdStatus, setHdStatus] = useState<string | null>(null);
  const [, setHDSoundsTick] = useState(0); // force re-render when HD toggles

  const [isRecording, setIsRecording] = useState(false);
  const [showRecordingModal, setShowRecordingModal] = useState(false);

  // Media recording (audio + canvas video → MP4 via server transcode)
  const [isMediaRecording, setIsMediaRecording] = useState(false);
  const [mediaRecordingStatus, setMediaRecordingStatus] = useState<
    string | null
  >(null);
  const [mediaRecordingError, setMediaRecordingError] = useState<string | null>(
    null,
  );
  const [mediaRecordingElapsed, setMediaRecordingElapsed] = useState(0);
  const [mp4BlobUrl, setMp4BlobUrl] = useState<string | null>(null);
  const ddspApiUrl =
    (import.meta.env.VITE_DDSP_API as string | undefined) ||
    "http://127.0.0.1:8765";
  const synesthesiaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showLeadSheet, setShowLeadSheet] = useState(false);
  const [showChordInspector, setShowChordInspector] = useState(false);
  const inspectorHistory = useMemo(() => makeInspectorHistory(), []);
  const [showLiveScore, setShowLiveScore] = useState(true);

  const handleGenerateEtude = async () => {
    const lengthMap = [8, 16, 32];
    const len = lengthMap[genLength - 1];
    const rootMidi = 60 + transposeShift;

    const isGemini = etudeAlgorithm.startsWith("gemini_");
    if (isGemini && !hasOpenRouterKey) {
      // Cloud options are visually disabled in the select, but guard
      // here too in case the user opened the DevTools and re-enabled.
      setEtudeStatus(
        "Cloud generation needs VITE_OPENROUTER_API_KEY in your .env. Pick a local model for now.",
      );
      return;
    }
    if (etudeAlgorithm === "magenta_rnn" || isGemini) {
      try {
        setIsGeneratingML(true);
        setEtudeStatus(null);
        let newPath: HarmonicPath;
        if (isGemini) {
          const geminiAlgo = etudeAlgorithm.replace("gemini_", "");
          const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;
          newPath = await generateGeminiEtude(rootMidi, len, apiKey, geminiAlgo);
        } else {
          const { generateMagentaSequence } = await import("./lib/magentaHelper");
          // generateMagentaSequence now resolves with a melodic
          // fallback rather than throwing when the model fails
          // (e.g. tfjs util-fetch broken in Vite). The path's
          // description makes the fallback obvious.
          newPath = await generateMagentaSequence(rootMidi, len, 1.2);
          if (newPath.description.toLowerCase().includes("fallback")) {
            setEtudeStatus(
              "Magenta failed to load in this environment — used a melodic variation instead. The structure still matches the AI style.",
            );
          }
        }
        setPaths([newPath, ...paths]);
        setActivePathIndex(0);
        setActiveStepIndex(0);
        setTransposeShift(0);
      } catch (err) {
        console.error("Etude generation failed:", err);
        setEtudeStatus(
          `Generation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setIsGeneratingML(false);
      }
    } else {
      const newPath = generateEtude(etudeAlgorithm, len);
      setPaths([newPath, ...paths]);
      setActivePathIndex(0);
      setActiveStepIndex(0);
      setTransposeShift(0);
    }
  };

  const handleSelectPersona = (pId: string) => {
    setSelectedPersonaId(pId);
    const p = PERSONAS.find((x) => x.id === pId);
    if (!p) return;

    setInstrument(p.instrument);
    setTempo(p.tempo);
    setArpType(p.arpType);
    setArpRate(p.arpRate);
    setArpGate(p.arpGate);
    setArpOctaves(p.arpOctaves);

    // Find the original path ID
    const pathIdx = paths.findIndex((px) => px.id === p.originalSongId);
    if (pathIdx !== -1) {
      setActivePathIndex(pathIdx);
      setActiveStepIndex(0);
      setTransposeShift(0);
    }
  };

  const activePersonaVisualTheme = useMemo(() => {
    const p = PERSONAS.find((x) => x.id === selectedPersonaId);
    return p ? p.visualTheme : "default";
  }, [selectedPersonaId]);

  return (
    <div className="min-h-screen surface-0 text-[color:var(--color-text-1)] font-sans selection:bg-[color:var(--color-brand-muted)] selection:text-[color:var(--color-brand-strong)] flex flex-col">
      {/* Skip-to-main link for keyboard users */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-[color:var(--color-brand-strong)] focus:text-[color:var(--color-text-inverse)] focus:rounded"
      >
        Skip to main content
      </a>

      {/* Signature brass strip — single deliberate accent */}
      <div className="brass-strip" aria-hidden="true" />

      {/* Mobile-only fixed command bar (hidden on md+) */}
      <MobileCommandBar
        isPlayingAuto={isPlayingAuto}
        setIsPlayingAuto={setIsPlayingAuto}
        activeStepIndex={activeStepIndex}
        setActiveStepIndex={(i) => {
          setActiveStepIndex(Math.max(0, Math.min(i, path.steps.length - 1)));
        }}
        pathLength={path.steps.length}
        onShowInspector={() => setShowChordInspector(true)}
        onShowExport={() => setShowImportExport(true)}
        onCommit={() => {
          recorder.start();
          setIsPlayingAuto(true);
        }}
      />

      <header className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[color:var(--color-border)] surface-1 flex flex-wrap gap-3 sm:gap-4 justify-between items-center backdrop-blur-xl sticky top-0 z-30">
        <div className="min-w-0">
          <h1 className="t-display-2 text-[color:var(--color-text-1)] flex items-center gap-2">
            Harmonic Study Engine
            <span className="text-[color:var(--color-brand-strong)] t-mono">v2</span>
          </h1>
          <p className="t-small text-[color:var(--color-text-3)] truncate">
            Synesthesia-guided harmonic practice for trumpet
          </p>
        </div>

        <div className="hidden md:flex items-center gap-2 lg:gap-3 t-mono text-[color:var(--color-text-2)]">
          <button
            onClick={() => setShowCheatsheet(true)}
            title="Keyboard shortcuts (?)"
            aria-label="Show keyboard shortcuts"
            className="flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 px-2.5 py-1.5 rounded border border-neutral-800 transition-colors text-neutral-400 hover:text-white"
          >
            <kbd className="t-mono text-[10px] font-bold border border-neutral-700 rounded px-1.5 py-0.5">?</kbd>
            <span className="hidden lg:inline">Shortcuts</span>
          </button>
          <button
            onClick={() => setShowImportExport(true)}
            className="flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded border border-neutral-800 transition-colors text-neutral-300 hover:text-white"
          >
            <FileCode size={14} className="text-purple-400" />
            <span>Import / Export</span>
          </button>
          {/* Fix #8 — MIDI Out is a real picker. Shows "MIDI: no devices" as a
              status when nothing is connected, otherwise the active output. */}
          <div
            className="flex items-center gap-2 bg-neutral-900/50 px-2 py-1.5 rounded border border-neutral-800"
            title="Choose a Web MIDI output destination. macOS / ChromeOS / Edge have Web MIDI built in; Firefox needs an extension."
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor:
                  midiOutputs.length === 0
                    ? "#6b7280" // gray — no devices
                    : selectedMidiOutId
                      ? "#22c55e" // green — actively routed
                      : "#a855f7", // purple — devices available, none selected
              }}
              aria-hidden="true"
            />
            <Settings2 size={12} className="text-purple-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
              MIDI
            </span>
            {midiOutputs.length === 0 ? (
              <span className="text-xs text-neutral-400 italic">no devices</span>
            ) : (
              <select
                value={selectedMidiOutId}
                onChange={(e) => {
                  midiOut.selectOutput(e.target.value);
                  setSelectedMidiOutId(e.target.value);
                }}
                className="bg-transparent text-neutral-300 outline-none cursor-pointer text-xs"
              >
                <option value="">none</option>
                {midiOutputs.map((out) => (
                  <option key={out.id} value={out.id}>
                    {out.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </header>

      <main
        id="main"
        className="flex-1 flex flex-col w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 gap-4 sm:gap-6 max-w-screen-2xl pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-6"
      >
        <div id="adv-live" role="status" aria-live="polite" className="sr-only" />

        {/* Play Session Rail — guided workflow */}
        <PlaySessionRail
          paths={paths}
          activePath={path}
          activePathIndex={activePathIndex}
          setActivePathIndex={setActivePathIndex}
          isPlayingAuto={isPlayingAuto}
          setIsPlayingAuto={setIsPlayingAuto}
          isLooping={isLooping}
          setIsLooping={setIsLooping}
          loopStartBar={loopStartBar}
          loopEndBar={loopEndBar}
          setLoopBar={(from, to) => {
            setLoopStartBar(from);
            setLoopEndBar(to);
          }}
          tempo={tempo}
          setTempo={setTempo}
          meter={timeSignature}
          beat={beatType}
          setMeter={setTimeSignature}
          setBeat={setBeatType}
          transposeShift={transposeShift}
          setTransposeShift={setTransposeShift}
          selectedPersonaId={selectedPersonaId}
          setSelectedPersonaId={setSelectedPersonaId}
          personas={PERSONAS}
          activeStepIndex={activeStepIndex}
          setActiveStepIndex={setActiveStepIndex}
          onCommit={async () => {
            // Start the media recorder (audio + canvas → MP4).
            // Start the auto-playback so the user has something to
            // play along with (or play over). recorder.start() still
            // captures MIDI notes in parallel; the modal shows the
            // MIDI score and the MP4 download link.
            setMediaRecordingError(null);
            setMp4BlobUrl(null);
            try {
              const mime = await audioRecorder.start({
                canvas: synesthesiaCanvasRef.current,
                includeMic: true,
                videoFps: 24,
              });
              setIsMediaRecording(true);
              setMediaRecordingStatus(
                `Recording (${mime.includes("video") ? "video" : "audio-only"})…`,
              );
              // Tick elapsed seconds while recording
              const tick = () => {
                setMediaRecordingElapsed(audioRecorder.elapsedSec);
              };
              const interval = setInterval(tick, 250);
              // Stop after path duration + 4s lead-out
              const pathDur = path.steps.length * (60 / tempo) * 4;
              const stopAfter = (pathDur + 4) * 1000;
              const timeout = setTimeout(() => {
                audioRecorder.stop();
                clearInterval(interval);
              }, stopAfter);
              // Subscribe to result once
              const off = audioRecorder.onResult(async (result) => {
                clearInterval(interval);
                clearTimeout(timeout);
                off();
                setIsMediaRecording(false);
                setMediaRecordingStatus(
                  `Recording captured (${result.durationSec.toFixed(1)}s) — uploading…`,
                );
                try {
                  const form = new FormData();
                  form.append("audio", result.blob, "recording.webm");
                  form.append("duration_sec", String(result.durationSec));
                  const r = await fetch(`${ddspApiUrl}/recordings/upload`, {
                    method: "POST",
                    body: form,
                  });
                  if (!r.ok) {
                    throw new Error(`server ${r.status}: ${await r.text()}`);
                  }
                  const transcoded = r.headers.get("X-Transcoded") === "true";
                  const mp4 = await r.blob();
                  const url = URL.createObjectURL(
                    new Blob([mp4], { type: "video/mp4" }),
                  );
                  setMp4BlobUrl(url);
                  setMediaRecordingStatus(
                    `MP4 ready — ${(mp4.size / 1024 / 1024).toFixed(2)} MB` +
                      (transcoded ? " (transcoded)" : " (passthrough)"),
                  );
                  setShowRecordingModal(true);
                } catch (e) {
                  setMediaRecordingError(
                    e instanceof Error ? e.message : String(e),
                  );
                  setMediaRecordingStatus(null);
                }
              });
            } catch (e) {
              setMediaRecordingError(
                e instanceof Error ? e.message : String(e),
              );
              setMediaRecordingStatus(null);
            }
          }}
          onExportMidi={() => {
            const dataUri = exportToMidiFile(path);
            const a = document.createElement("a");
            a.href = dataUri;
            a.download = `${path.id}.mid`;
            a.click();
          }}
          onExportWav={async () => {
            setIsRenderingWav(true);
            setWavExportError(null);
            setWavExportStatus("Rendering…");
            try {
              const wav = await renderPathToWav(path, {
                tempo,
                instrument,
                meter: timeSignature,
                mode: wavMode,
              });
              downloadWavFromBlob(wav, `${path.id}.${wavMode}.wav`);
              setWavExportStatus(`Downloaded ${path.id}.${wavMode}.wav`);
              // Auto-clear the success message after a few seconds.
              // Uses the shared timeout ref so unmount during the 4s
              // window doesn't leak a setState into a dead component.
              tm.set(() => setWavExportStatus(null), 4000);
            } catch (e) {
              setWavExportError(
                e instanceof Error ? e.message : String(e),
              );
              setWavExportStatus(null);
            } finally {
              setIsRenderingWav(false);
            }
          }}
          wavExportError={wavExportError}
          wavExportStatus={wavExportStatus}
          onDismissWavExportError={() => setWavExportError(null)}
          isExportingWav={isRenderingWav}
          wavMode={wavMode}
          setWavMode={setWavMode}
          onOpenLeadSheet={() => setShowLeadSheet(true)}
          onOpenInspector={() => setShowChordInspector(true)}
          optimizedStepsNotes={optimizedStepsNotes}
          onPlayChord={(notes) => audioEngine.playChord(notes)}
          onStopChord={(notes) => audioEngine.stopChord(notes)}
          onCommitVoicing={(stepIndex, notes) => {
            const key = `${path.id}::${stepIndex}`;
            const prevNotes = path.steps[stepIndex]?.notes ?? [];
            inspectorHistory.push(key, prevNotes);
            const newSteps = path.steps.map((s, i) =>
              i === stepIndex ? { ...s, notes } : s,
            );
            const newPath = { ...path, steps: newSteps };
            setPaths(paths.map((pp, i) => (i === activePathIndex ? newPath : pp)));
          }}
        />

        {/* Synesthesia Composer Personas Ribbon */}
        <div className="bg-[color:var(--color-bg-1)] border border-[color:var(--color-border)] rounded-[var(--radius-xl)] p-4 sm:p-5 flex flex-col gap-4 shadow-[0_4px_18px_rgba(0,0,0,0.35)]">
          <div className="flex items-baseline justify-between gap-3 px-1 flex-wrap">
            <div className="flex items-baseline gap-3">
              <User size={18} className="text-[color:var(--color-brand-strong)]" aria-hidden="true" />
              <div>
                <div className="t-label text-[color:var(--color-text-3)]">Personas</div>
                <h2 className="t-display-2 text-[color:var(--color-text-1)]">
                  Choose a mastermind
                </h2>
              </div>
            </div>
            <p className="t-small text-[color:var(--color-text-2)] max-w-[24ch] sm:max-w-[36ch] text-right">
              Each persona loads their own synesthesia canvas, instrument
              voicing, and color story.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-3 overflow-x-auto pb-1">
            {PERSONAS.map((p) => {
              const isActive = selectedPersonaId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPersona(p.id)}
                  aria-pressed={isActive}
                  className={`relative text-left p-3 rounded-xl border transition-all duration-300 flex flex-col justify-between h-28 group ${
                    isActive
                      ? `bg-gradient-to-br ${p.gradientFrom} ${p.gradientTo} shadow-[0_4px_20px_rgba(0,0,0,0.4)]`
                      : "bg-neutral-900/40 border-transparent hover:bg-neutral-900/80 hover:border-neutral-800"
                  }`}
                  style={{
                    borderColor: isActive ? p.accentColor : undefined,
                    borderWidth: isActive ? 2 : undefined,
                    boxShadow: isActive
                      ? `0 0 0 2px ${p.accentColor}40, 0 4px 20px rgba(0,0,0,0.4)`
                      : undefined,
                  }}
                >
                  {/* Active top-strip — non-color signal (shape) */}
                  {isActive && (
                    <div
                      className="absolute top-0 inset-x-0 h-1 rounded-t-xl"
                      style={{ backgroundColor: p.accentColor }}
                    />
                  )}

                  <div className="flex items-start justify-between w-full">
                    {/* Compact Profile Circle */}
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold tracking-tighter"
                      style={{
                        backgroundColor: isActive
                          ? p.accentColor + "15"
                          : "rgba(255,255,255,0.05)",
                        color: p.accentColor,
                      }}
                    >
                      {p.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>

                    {/* Non-color active indicator: a check mark + a
                        solid ring. Color-blind safe because the shape
                        (✓) and ring carry the meaning, not the color. */}
                    {isActive ? (
                      <span
                        className="flex items-center gap-1 px-1.5 py-0.5 surface-1 border rounded-[var(--radius-sm)]"
                        style={{ borderColor: p.accentColor }}
                        title="Currently selected"
                        aria-label="Active persona"
                      >
                        <Check size={10} style={{ color: p.accentColor }} aria-hidden="true" />
                        <span
                          className="text-[8px] font-mono uppercase tracking-wider"
                          style={{ color: p.accentColor }}
                        >
                          active
                        </span>
                      </span>
                    ) : (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-neutral-700 group-hover:bg-neutral-600"
                        title="Click to select this persona"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <div className="mt-2 last:mb-0">
                    <div className="font-semibold text-xs text-neutral-200 truncate group-hover:text-white transition-colors">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-neutral-500 font-medium truncate mt-0.5">
                      {p.role}
                    </div>
                  </div>

                  {/* Quote block */}
                  <div className="text-[8px] text-neutral-400 font-serif italic truncate w-full opacity-60 mt-1">
                    "{p.quote}"
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
          {/* Left Sidebar: Paths */}
          <div className="w-full lg:w-80 flex flex-col gap-4">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-white/5 shadow-2xl">
              {/* Arpeggiator Section */}
              <div className="mb-6 pb-6 border-b border-neutral-800">
                <div
                  onClick={() => setIsArpFolded(!isArpFolded)}
                  className="flex items-center justify-between mb-2 cursor-pointer select-none group"
                >
                  <h2 className="text-sm uppercase tracking-widest text-neutral-500 font-semibold flex items-center gap-2 group-hover:text-neutral-300 transition-colors">
                    <Settings2 size={14} className="text-purple-400" />
                    Arpeggiator
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-600 font-mono">
                      {arpType !== "none" && !isArpFolded ? arpType : ""}
                    </span>
                    <button className="text-neutral-500 hover:text-neutral-300 transition-colors">
                      {isArpFolded ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronUp size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {!isArpFolded && (
                  <div className="mt-4 pt-1 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-400">Mode</span>
                      <select
                        value={arpType}
                        onChange={(e) => setArpType(e.target.value as any)}
                        className="bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 rounded px-2 py-1 outline-none"
                      >
                        <option value="none">Off</option>
                        <option value="up">Up</option>
                        <option value="down">Down</option>
                        <option value="upDown">Up/Down</option>
                        <option value="downUp">Down/Up</option>
                        <option value="random">Random</option>
                        <option value="converge">Converge</option>
                        <option value="diverge">Diverge</option>
                      </select>
                    </div>

                    {arpType !== "none" && (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-neutral-400 w-16">
                            Rate (
                            {
                              ["1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"][
                                arpRate - 1
                              ]
                            }
                            )
                          </span>
                          <input
                            type="range"
                            min="1"
                            max="6"
                            value={arpRate}
                            onChange={(e) => setArpRate(Number(e.target.value))}
                            className="flex-1 accent-purple-500"
                            title={
                              ["1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"][
                                arpRate - 1
                              ]
                            }
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-neutral-400 w-16">
                            Gate ({arpGate}%)
                          </span>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={arpGate}
                            onChange={(e) => setArpGate(Number(e.target.value))}
                            className="flex-1 accent-purple-500"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-neutral-400 w-16">
                            Oct ({arpOctaves})
                          </span>
                          <input
                            type="range"
                            min="1"
                            max="4"
                            step="0.5"
                            value={arpOctaves}
                            onChange={(e) =>
                              setArpOctaves(Number(e.target.value))
                            }
                            className="flex-1 accent-purple-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Generative Section */}
              <div className="mb-6 pb-6 border-b border-neutral-800">
                <div
                  onClick={() => setIsGenFolded(!isGenFolded)}
                  className="flex items-center justify-between mb-2 cursor-pointer select-none group"
                >
                  <h2 className="text-sm uppercase tracking-widest text-neutral-500 font-semibold flex items-center gap-2 group-hover:text-neutral-300 transition-colors">
                    <Sparkles size={14} className="text-purple-400" />
                    Generator Lab
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-600 font-mono">
                      {isGenFolded ? "Closed" : "Open"}
                    </span>
                    <button className="text-neutral-500 hover:text-neutral-300 transition-colors">
                      {isGenFolded ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronUp size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {!isGenFolded && (
                  <div className="mt-4 pt-1 flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                      <div className="text-xs font-semibold text-neutral-400 mb-1 flex items-center gap-1">
                        <Music size={12} className="text-purple-400" /> Path
                        Creator
                      </div>
                      <div className="flex flex-col gap-2 bg-neutral-900/40 p-2.5 rounded-lg border border-neutral-800">
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between text-xs text-neutral-400">
                            <span>Length</span>
                            <span className="font-mono text-purple-400">
                              {genLength === 1
                                ? "Short"
                                : genLength === 2
                                  ? "Medium"
                                  : "Long"}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="3"
                            step="1"
                            value={genLength}
                            onChange={(e) =>
                              setGenLength(parseInt(e.target.value))
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div className="flex flex-col gap-2 mt-1">
                          <div className="flex justify-between text-xs text-neutral-400">
                            <span>Complexity</span>
                            <span className="font-mono text-purple-400">
                              {genComplexity === 1
                                ? "Basic"
                                : genComplexity === 2
                                  ? "Inter"
                                  : "Advanced"}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="3"
                            step="1"
                            value={genComplexity}
                            onChange={(e) =>
                              setGenComplexity(parseInt(e.target.value))
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <button
                          onClick={handleGeneratePath}
                          className="w-full py-2 bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 text-xs rounded border border-purple-800/50 transition-colors mt-2 font-mono"
                        >
                          GENERATE PATH
                        </button>
                      </div>
                    </div>

                    <div className="h-px w-full bg-neutral-800 my-1"></div>

                    <div className="flex flex-col gap-3">
                      <div className="text-xs font-semibold text-neutral-400 mb-1 flex items-center gap-1">
                        <Hexagon size={12} className="text-purple-400" /> Etude
                        Assistant
                      </div>
                      <div className="flex flex-col gap-2 bg-neutral-900/40 p-2.5 rounded-lg border border-neutral-800">
                        <select
                          value={etudeAlgorithm}
                          onChange={(e) =>
                            setEtudeAlgorithm(e.target.value as EtudeAlgorithm)
                          }
                          className="bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 rounded px-2 py-2 outline-none w-full"
                          aria-label="Generation model"
                        >
                          <optgroup label="Local deterministic (always works)">
                            <option value="fibonacci">Fibonacci Intervals</option>
                            <option value="sacred_geometry">
                              Sacred Geometry
                            </option>
                            <option value="coltrane_fractal">
                              Coltrane Fractal
                            </option>
                            <option value="trumpet_etude">Trumpet Etude</option>
                          </optgroup>
                          <optgroup label="Local ML">
                            <option value="magenta_rnn">Magenta AI (RNN)</option>
                          </optgroup>
                          <optgroup
                            label={`Cloud (requires VITE_OPENROUTER_API_KEY)${
                              hasOpenRouterKey ? " ✓" : " — not configured"
                            }`}
                            disabled={!hasOpenRouterKey}
                          >
                            <option value="gemini_jazz">Gemini Jazz (ii-V-I)</option>
                            <option value="gemini_classical">Gemini Classical</option>
                            <option value="gemini_modern">Gemini Modern</option>
                            <option value="gemini_romantic">Gemini Romantic</option>
                          </optgroup>
                        </select>
                        <button
                          onClick={handleGenerateEtude}
                          disabled={isGeneratingML}
                          className={`w-full py-2 bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 text-xs rounded border border-purple-800/50 transition-colors font-mono ${isGeneratingML ? "opacity-50 cursor-wait" : ""}`}
                        >
                          {isGeneratingML ? "GENERATING..." : "GENERATE ETUDE"}
                        </button>

                        {/* Inline status — replaces old alert() popups for both
                            the Magenta-fallback case and the missing-key case. */}
                        {etudeStatus && (
                          <div
                            role="status"
                            aria-live="polite"
                            className="text-[11px] t-mono text-[color:var(--color-warn)] leading-snug mt-1 px-1"
                          >
                            {etudeStatus}
                          </div>
                        )}

                        {/* Score export — MusicXML & Score21 of the most recent path */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={async () => {
                              setIsRenderingWav(true);
                              setWavExportError(null);
                              setWavExportStatus("Rendering…");
                              try {
                                const wavBlob = await renderPathToWav(path, {
                                  tempo,
                                  instrument,
                                  meter: timeSignature,
                                });
                                downloadWavFromBlob(wavBlob, `${path.id}.wav`);
                                setWavExportStatus(
                                  `Downloaded ${path.id}.wav`,
                                );
                                window.setTimeout(
                                  () => setWavExportStatus(null),
                                  4000,
                                );
                              } catch (e) {
                                setWavExportError(
                                  e instanceof Error ? e.message : String(e),
                                );
                                setWavExportStatus(null);
                              } finally {
                                setIsRenderingWav(false);
                              }
                            }}
                            disabled={isRenderingWav}
                            title={`Render the loop offline and download as a ${tempo} BPM WAV using the ${instrument} instrument. No backend needed.`}
                            className="py-1.5 bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-200 text-[11px] rounded border border-cyan-800/50 transition-colors font-mono disabled:opacity-50 disabled:cursor-wait"
                          >
                            {isRenderingWav ? "RENDERING…" : `↓ Loop WAV (${tempo})`}
                          </button>
                          <button
                            onClick={() => {
                              const s21 = toScore21(path, { transpose: transposeShift });
                              downloadText(`${path.id}.s21.md`, s21, "text/markdown");
                            }}
                            title="Download Score21 markdown — scorable chord-and-pitch representation"
                            className="py-1.5 bg-amber-900/30 hover:bg-amber-900/50 text-amber-200 text-[11px] rounded border border-amber-800/50 transition-colors font-mono"
                          >
                            ↓ Score21
                          </button>
                          <button
                            onClick={() => {
                              const xml = toMusicXml(path, {
                                title: path.title,
                                composer: "harmonic-study-engine",
                                tempo: tempo,
                                transpose: transposeShift,
                              });
                              downloadText(
                                `${path.id}.musicxml`,
                                xml,
                                "application/vnd.recordare.musicxml+xml",
                              );
                            }}
                            title="Download MusicXML — open in MuseScore, Finale, Sibelius, Dorico"
                            className="py-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-200 text-[11px] rounded border border-emerald-800/50 transition-colors font-mono col-span-2"
                          >
                            ↓ MusicXML
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Inline status / error for the export cluster — same shared
                    state as the rail, so the rail also surfaces the result. */}
                {wavExportError && (
                  <div className="mt-2">
                    <InlineErrorPill onDismiss={() => setWavExportError(null)}>
                      WAV render failed: {wavExportError}
                    </InlineErrorPill>
                  </div>
                )}
                {wavExportStatus && !wavExportError && (
                  <div
                    className="mt-2 t-small text-[color:var(--color-info)] font-mono"
                    role="status"
                    aria-live="polite"
                  >
                    {wavExportStatus}
                  </div>
                )}
              </div>

              {/* Harmonic Paths Selector */}
              <div className="mb-2">
                <div
                  onClick={() => setIsPathsFolded(!isPathsFolded)}
                  className="flex items-center justify-between mb-3 cursor-pointer select-none group"
                >
                  <h2 className="text-sm uppercase tracking-widest text-neutral-500 font-semibold group-hover:text-neutral-300 transition-colors">
                    Harmonic Paths
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-600 font-mono">
                      ({paths.length} items)
                    </span>
                    <button className="text-neutral-500 hover:text-neutral-300 transition-colors">
                      {isPathsFolded ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronUp size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {!isPathsFolded && (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {paths.map((p, idx) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActivePathIndex(idx);
                          setActiveStepIndex(0);
                        }}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          activePathIndex === idx
                            ? "bg-purple-900/20 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]"
                            : "bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10"
                        }`}
                      >
                        <div className="font-medium text-sm text-neutral-200">
                          {p.title}
                        </div>
                        {p.id.startsWith("generated-") && (
                          <div className="text-[10px] text-purple-400 mt-1 uppercase">
                            Generated
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-neutral-800">
                <h3 className="text-lg font-medium text-purple-300 mb-2">
                  {path.title}
                </h3>
                <p className="text-sm text-neutral-400 leading-relaxed mb-6">
                  {path.description}
                </p>

                <div className="flex flex-col gap-3">
                  {path.steps.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveStepIndex(idx)}
                      className={`flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                        activeStepIndex === idx
                          ? "bg-purple-500/20 text-purple-200"
                          : "text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
                      }`}
                    >
                      <span className="font-mono text-xs opacity-50">
                        {idx + 1}
                      </span>
                      <span
                        className={`font-medium text-sm ${activeStepIndex === idx ? "text-purple-100" : ""}`}
                      >
                        {s.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Content: Visualization & Keyboard */}
          <div className="flex-1 flex flex-col gap-4 sm:gap-6 min-w-0">
            {/* Active Step Info / Stage */}
            <StageFrame
              accent
              active
              eyebrow={`Step ${activeStepIndex + 1} of ${path.steps.length}`}
              title={transposeChordName(step.name, transposeShift)}
              meta={
                <span className="flex items-center gap-2">
                  <span className="t-mono text-[10px] text-[color:var(--color-text-3)] uppercase tracking-wider">
                    Transpose
                  </span>
                  <ToolChip
                    active
                    onClick={() => setTransposeShift((p) => p - 7)}
                    title="Down a perfect fifth"
                  >
                    ♭5th
                  </ToolChip>
                  <ToolChip active onClick={() => setTransposeShift(0)} title="Reset transpose">
                    {transposeShift > 0 ? "+" : ""}{transposeShift} st
                  </ToolChip>
                  <ToolChip
                    active
                    onClick={() => setTransposeShift((p) => p + 7)}
                    title="Up a perfect fifth"
                  >
                    ♯5th
                  </ToolChip>
                </span>
              }
              actions={
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 self-end">
                    <button
                      onClick={() => {
                        if (scaleBusy) return;
                        audioEngine.stopAll();
                        midiOut.stopAll();
                        const chordName = step.name || "Cmaj";
                        const scale = getDiatonicScale(chordName);
                        setScaleBusy(true);
                        setHDSoundsTick((t) => t + 1); // noop re-render
                        const dur = playScaleUpDown(scale, tempo);
                        tm.set(() => setScaleBusy(false), (dur ?? 1) * 1000 + 200);
                      }}
                      disabled={scaleBusy}
                      title={`Play the diatonic scale of ${step.name || "this chord"} (${scaleMode === "auto" ? "auto mode" : scaleMode})`}
                      aria-label={`Play scale of ${step.name || "this chord"}`}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs font-mono border transition-colors ${
                        scaleBusy
                          ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)] bg-[color:var(--color-brand)]/10"
                          : "surface-1 border-[color:var(--color-border)] text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] hover:border-[color:var(--color-brand-strong)]"
                      }`}
                    >
                      {scaleBusy ? "▶ Playing scale…" : "↗ Scale"}
                    </button>
                    <button
                      onClick={() => setScaleModeOpen(!scaleModeOpen)}
                      title="Choose scale mode (auto / major / minor / dorian / mixolydian / …)"
                      aria-label="Scale mode"
                      className="px-2 py-1 rounded-[var(--radius-md)] text-[10px] t-mono surface-1 border border-[color:var(--color-border)] text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)]"
                    >
                      {scaleMode === "auto" ? "auto" : scaleMode}
                    </button>
                  </div>
                  {scaleModeOpen && (
                    <div className="flex flex-wrap gap-1 self-end max-w-[280px] justify-end">
                      {(["auto", ...SCALE_MODES] as string[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setScaleMode(m);
                            setScaleModeOpen(false);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] t-mono border transition-colors ${
                            scaleMode === m
                              ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] border-[color:var(--color-brand)]"
                              : "surface-1 border-[color:var(--color-border)] text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 self-end">
                  <button
                    onClick={() => setActiveStepIndex(Math.max(activeStepIndex - 1, 0))}
                    disabled={activeStepIndex === 0}
                    aria-label="Previous chord"
                    className="w-11 h-11 flex items-center justify-center rounded-full surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-2)] disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft />
                  </button>
                  {activeMidis.length > 0 ? (
                    <button
                      onClick={() => {
                        audioEngine.stopAll();
                        midiOut.stopAll();
                        setActiveMidis([]);
                        setIsPlayingAuto(false);
                      }}
                      aria-label="Stop chord"
                      className="w-11 h-11 flex items-center justify-center rounded-full surface-1 border border-[color:var(--color-border)] active:bg-[color:var(--color-bg-2)] transition-colors"
                    >
                      <Square size={18} className="fill-current text-[color:var(--color-brand)]" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        audioEngine.playChord(currentChordNotes);
                        midiOut.playChord(currentChordNotes);
                        setActiveMidis(currentChordNotes);
                      }}
                      aria-label="Play chord"
                      className="w-11 h-11 flex items-center justify-center rounded-full bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] hover:bg-[color:var(--color-brand-strong)] active:scale-95 transition-transform"
                    >
                      <Play size={20} className="fill-current translate-x-[1px]" />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setActiveStepIndex(
                        Math.min(activeStepIndex + 1, path.steps.length - 1),
                      )
                    }
                    disabled={activeStepIndex === path.steps.length - 1}
                    aria-label="Next chord"
                    className="w-11 h-11 flex items-center justify-center rounded-full bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] hover:bg-[color:var(--color-brand-strong)] disabled:opacity-30 disabled:hover:bg-[color:var(--color-brand)] active:scale-95 transition-transform"
                  >
                    <ChevronRight />
                  </button>
                  </div>
                </div>
              }
            >
              {step.descriptions && (
                <p className="t-small text-[color:var(--color-text-2)] -mt-1 mb-3">
                  {step.descriptions}
                </p>
              )}

              {/* Edit voicing — discoverable next to the chord Play / step
                  controls, so the user sees the inspector exists before
                  they have to dig into the Commit & Export stage. */}
              <div className="flex items-center justify-between gap-2 mb-3 px-1 text-xs">
                <p className="t-small text-[color:var(--color-text-3)] flex-1">
                  {activeMidis.length > 0
                    ? "Auditioning this chord — click ◂ ▸ to step, or open the editor to tweak the voicing."
                    : "Click play to audition this chord. Use ◂ ▸ to step through the path."}
                </p>
                <button
                  onClick={() => setShowChordInspector(true)}
                  className="flex-shrink-0 surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-md)] px-2.5 py-1.5 flex items-center gap-1.5 text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] hover:border-[color:var(--color-brand-strong)] transition-colors"
                >
                  <Settings2 size={11} className="text-[color:var(--color-brand)]" />
                  Edit voicing
                  <span className="t-mono text-[10px] text-[color:var(--color-text-3)] ml-1">
                    {optimizedStepsNotes[activeStepIndex]?.length ?? step.notes.length}nd
                  </span>
                </button>
              </div>

              {/*
                Compact state row — always visible. Surfaces the four
                state values the user is most likely to forget they set
                (tempo, meter, instrument, backing). One-line, no
                controls, just a readout so surprises don't happen.
              */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] t-mono text-[color:var(--color-text-3)] mb-3 px-1">
                <span>
                  <span className="text-[color:var(--color-text-2)]">{tempo}</span> BPM
                </span>
                <span>{timeSignature}</span>
                <span className="capitalize">{instrument}</span>
                <span className="capitalize">
                  Backing: <span className="text-[color:var(--color-text-2)]">{beatType === "off" ? "none" : beatType}</span>
                </span>
                {audioEngine.melodyMuted && (
                  <span className="text-[color:var(--color-brand-strong)]">play along</span>
                )}
              </div>

              {/* Tool palette — 1 row of always-visible essentials + an
                  "Advanced" disclosure for the occasional-use controls. */}
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <ToolGroup label="Instrument">
                    <select
                      value={instrument}
                      onChange={(e) => setInstrument(e.target.value as any)}
                      className="bg-transparent text-xs text-[color:var(--color-text-1)] outline-none cursor-pointer hover:text-[color:var(--color-brand-strong)] font-medium px-1 py-1 flex-1 min-w-0"
                      aria-label="Instrument"
                    >
                      <option value="epiano">E-Piano</option>
                      <option value="sine">Pure Sine</option>
                      <option value="pad">Warm Pad</option>
                      <option value="pluck">FM Pluck</option>
                      <option value="trumpet">Trumpet</option>
                      <option value="guitar">Guitar</option>
                      <option value="sax">Saxophone</option>
                    </select>
                  </ToolGroup>

                  <ToolGroup label={`Tempo · ${tempo}`}>
                    <input
                      type="range"
                      min={30}
                      max={180}
                      value={tempo}
                      onChange={(e) => setTempo(parseInt(e.target.value))}
                      className="flex-1 accent-[color:var(--color-brand)] min-w-0"
                      aria-label="Tempo"
                    />
                    <button
                      onClick={tempoHistory.undo}
                      disabled={!tempoHistory.canUndo}
                      title="Undo tempo change"
                      aria-label="Undo tempo change"
                      className="text-[10px] font-mono px-1 py-0.5 rounded surface-1 border border-[color:var(--color-border)] disabled:opacity-30 hover:text-[color:var(--color-text-1)]"
                    >
                      ↶
                    </button>
                    <button
                      onClick={tempoHistory.redo}
                      disabled={!tempoHistory.canRedo}
                      title="Redo tempo change"
                      aria-label="Redo tempo change"
                      className="text-[10px] font-mono px-1 py-0.5 rounded surface-1 border border-[color:var(--color-border)] disabled:opacity-30 hover:text-[color:var(--color-text-1)]"
                    >
                      ↷
                    </button>
                  </ToolGroup>

                  <ToolGroup label={`Volume · ${volume}%`}>
                    <Volume2 size={14} className="text-[color:var(--color-text-3)] ml-1" aria-hidden="true" />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume}
                      onChange={(e) => setVolume(parseInt(e.target.value))}
                      className="flex-1 accent-[color:var(--color-brand)] min-w-0"
                      aria-label="Volume"
                    />
                  </ToolGroup>

                  <ToolGroup label="Transport">
                    <ToolChip
                      active={isPlayingAuto}
                      onClick={() => setIsPlayingAuto(!isPlayingAuto)}
                      title={isPlayingAuto ? "Pause auto-playback" : "Audition the whole path in tempo"}
                    >
                      {isPlayingAuto ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Auto</>}
                    </ToolChip>
                    <ToolChip
                      active={audioEngine.melodyMuted}
                      onClick={() => audioEngine.setMelodyMuted(!audioEngine.melodyMuted)}
                      title={
                        audioEngine.melodyMuted
                          ? "Resume the synth melody"
                          : "Mute the synth — play your own trumpet along with the backing track"
                      }
                      aria-pressed={audioEngine.melodyMuted}
                    >
                      {audioEngine.melodyMuted ? "○ Play Along" : "● Play Along"}
                    </ToolChip>
                    <ToolChip
                      active={isLooping}
                      onClick={() => setIsLooping(!isLooping)}
                      title={
                        isLooping
                          ? loopStartBar !== null
                            ? `Looping bars ${loopStartBar + 1}–${(loopEndBar ?? Math.ceil(path.steps.length / 4) - 1) + 1} — click to stop`
                            : "Looping whole path — click to stop"
                          : "Loop playback"
                      }
                      aria-pressed={isLooping}
                    >
                      {isLooping
                        ? loopStartBar !== null
                          ? `↻ Bars ${loopStartBar + 1}–${(loopEndBar ?? Math.ceil(path.steps.length / 4) - 1) + 1}`
                          : "↻ Loop"
                        : "○ Loop"}
                    </ToolChip>
                  </ToolGroup>
                </div>

                {/* Backing band — second row, only what's essential for
                    a real session. Tracks, HD, and Generator live in
                    the Advanced disclosure below. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <ToolGroup label="Backing">
                    <select
                      value={beatType}
                      onChange={(e) => setBeatType(e.target.value as BackingStyle)}
                      className="bg-transparent text-xs text-[color:var(--color-text-1)] outline-none cursor-pointer hover:text-[color:var(--color-brand-strong)] font-medium px-1 py-1 flex-1 min-w-0"
                      aria-label="Backing style"
                      title="iReal Pro-style accompaniment (drums + bass + piano comping)"
                    >
                      <option value="off">No backing</option>
                      <option value="swing">Swing</option>
                      <option value="bossa">Bossa Nova</option>
                      <option value="funk">Funk</option>
                      <option value="latin">Latin</option>
                      <option value="ballad">Ballad</option>
                      <option value="clave3-2">Clave 3-2 (son)</option>
                      <option value="clave3-3">Clave 3-3 (feeling)</option>
                      <option value="afro-4-4">African 4:4 (12/8)</option>
                      <option value="afro-4-3">African 4:3</option>
                      <option value="afro-3-4">African 3:4</option>
                    </select>
                  </ToolGroup>

                  <ToolGroup label="Tracks">
                    <ToolChip
                      active={!drumsMuted}
                      onClick={() => setDrumsMuted(!drumsMuted)}
                      title={drumsMuted ? "Unmute drums" : "Mute drums"}
                      aria-pressed={!drumsMuted}
                    >
                      {drumsMuted ? "○ Drums" : "● Drums"}
                    </ToolChip>
                    <ToolChip
                      active={!bassMuted}
                      onClick={() => setBassMuted(!bassMuted)}
                      title={
                        bassMuted
                          ? "Unmute bass (e.g. for bass practice)"
                          : "Mute bass line"
                      }
                      aria-pressed={!bassMuted}
                    >
                      {bassMuted ? "○ Bass" : "● Bass"}
                    </ToolChip>
                    <ToolChip
                      active={!pianoMuted}
                      onClick={() => setPianoMuted(!pianoMuted)}
                      title={pianoMuted ? "Unmute piano comping" : "Mute piano comping"}
                      aria-pressed={!pianoMuted}
                    >
                      {pianoMuted ? "○ Piano" : "● Piano"}
                    </ToolChip>
                  </ToolGroup>

                  <ToolGroup label="Voicing">
                    <ToolChip
                      active={voicingType === "closed"}
                      onClick={() => setVoicingType("closed")}
                      title="Closed voicing — notes clustered"
                    >
                      Closed
                    </ToolChip>
                    <ToolChip
                      active={voicingType === "open"}
                      onClick={() => setVoicingType("open")}
                      title="Open voicing — spread across the keyboard"
                    >
                      Open
                    </ToolChip>
                    <ToolChip
                      active={optimizeVoiceLeading}
                      onClick={() => setOptimizeVoiceLeading(!optimizeVoiceLeading)}
                      title="Voice-lead from the previous chord"
                    >
                      {optimizeVoiceLeading ? "● Optimize" : "○ Optimize"}
                    </ToolChip>
                  </ToolGroup>
                </div>

                {/* Advanced — collapsed by default. Holds the
                    occasional-use controls so the main flow stays
                    uncluttered. */}
                <details
                  className="surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
                  onToggle={(e) => {
                    // Announce open/close to screen readers via aria-live.
                    const live = document.getElementById("adv-live");
                    if (live) {
                      live.textContent = (e.currentTarget as HTMLDetailsElement).open
                        ? "Advanced settings expanded."
                        : "Advanced settings collapsed.";
                    }
                  }}
                >
                  <summary
                    aria-label="Advanced settings (meter, HD sounds, generator, offline render)"
                    className="text-xs t-mono text-[color:var(--color-text-3)] cursor-pointer hover:text-[color:var(--color-text-1)] select-none list-none flex items-center gap-1"
                  >
                    <span className="text-[color:var(--color-text-2)]">▶</span>
                    <span>Advanced</span>
                    <span className="text-[10px] text-[color:var(--color-text-3)] ml-1">
                      meter · HD sounds · generator · offline render
                    </span>
                  </summary>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <ToolGroup label="Meter">
                      <select
                        value={timeSignature}
                        onChange={(e) => setTimeSignature(e.target.value as any)}
                        className="bg-transparent text-xs text-[color:var(--color-text-1)] outline-none cursor-pointer hover:text-[color:var(--color-brand-strong)] font-medium px-1 py-1 flex-1 min-w-0"
                        aria-label="Time signature"
                      >
                        <option value="4/4">4/4</option>
                        <option value="6/8">6/8</option>
                        <option value="7/8">7/8</option>
                        <option value="11/4">11/4</option>
                        <option value="tintal">Tintal (16)</option>
                      </select>
                    </ToolGroup>

                    <ToolGroup label="HD Sounds">
                      <ToolChip
                        active={audioEngine.useHDSounds}
                        onClick={() => {
                          const next = !audioEngine.useHDSounds;
                          audioEngine.setHDSounds(next);
                          setHDSoundsTick((t) => t + 1);
                          if (next) {
                            setHdStatus(
                              "Loading FluidR3 soundfonts from jsDelivr (~2s on first use)…",
                            );
                            tm.set(() => setHdStatus(null), 4000);
                          } else {
                            setHdStatus(null);
                          }
                        }}
                        title={
                          audioEngine.useHDSounds
                            ? "Switch back to fast oscillator synth"
                            : "Use real instrument samples (FluidR3 GM bank)"
                        }
                      >
                        {audioEngine.useHDSounds ? "● HD On" : "○ HD Off"}
                      </ToolChip>
                    </ToolGroup>

                  </div>
                  {hdStatus && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="text-[10px] t-mono text-[color:var(--color-info)] leading-snug mt-2 px-1"
                    >
                      {hdStatus}
                    </div>
                  )}

                  {/* Offline render — DDSP — under Advanced because it's
                      slow (~30s) and only useful when the user wants
                      a real sample-based render. */}
                  <div className="mt-3 pt-3 border-t border-[color:var(--color-border)]">
                    <button
                      onClick={async () => {
                        if (ddspAction.status === "running") {
                          ddspAction.cancel();
                          recorder.stop();
                          setIsDDSPLoading(false);
                          return;
                        }
                        setIsDDSPLoading(true);
                        await ddspAction.run(async (signal) => {
                          const notes = path.steps.map((s) =>
                            s.notes.map((n) => n + transposeShift),
                          );
                          const chordDur = 60 / tempo;
                          recorder.start();
                          for (const p of notes[0]) recorder.recordNoteOn(p);
                          const stepStarts = [0];
                          for (let i = 1; i < notes.length; i++) {
                            if (signal.aborted) {
                              recorder.stop();
                              return;
                            }
                            stepStarts.push(stepStarts[i - 1] + chordDur);
                          }
                          let cancelled = false;
                          for (let i = 1; i < stepStarts.length; i++) {
                            if (signal.aborted) {
                              cancelled = true;
                              break;
                            }
                            await new Promise<void>((resolve) => {
                              const t = setTimeout(() => {
                                if (signal.aborted) {
                                  resolve();
                                  return;
                                }
                                for (const p of notes[i - 1]) recorder.recordNoteOff(p);
                                for (const p of notes[i]) recorder.recordNoteOn(p);
                                resolve();
                              }, (stepStarts[i] - stepStarts[i - 1]) * 1000);
                              signal.addEventListener("abort", () => {
                                clearTimeout(t);
                                resolve();
                              });
                            });
                          }
                          if (signal.aborted) {
                            cancelled = true;
                          } else {
                            await synthesizeAndPlay(notes, chordDur);
                          }
                          for (const p of notes[notes.length - 1]) recorder.recordNoteOff(p);
                          recorder.stop();
                          if (!cancelled) setShowRecordingModal(true);
                        });
                        setIsDDSPLoading(false);
                      }}
                      className={`w-full py-2 t-mono text-xs surface-1 border rounded-[var(--radius-md)] flex items-center justify-center gap-2 transition-colors ${
                        ddspAction.status === "running"
                          ? "border-[color:var(--color-err)] text-[color:var(--color-err)] hover:bg-[color:var(--color-err)]/10"
                          : "border-[color:var(--color-border)] text-[color:var(--color-text-1)] hover:border-[color:var(--color-brand-strong)] hover:text-[color:var(--color-brand-strong)]"
                      }`}
                      title={
                        ddspAction.status === "running"
                          ? "Stop the offline render"
                          : "Render the full progression with DDSP (offline, ~30s)"
                      }
                    >
                      {ddspAction.status === "running" ? (
                        <>
                          <Square size={12} fill="currentColor" /> Stop offline render
                        </>
                      ) : (
                        <>
                          <Hexagon size={14} className="text-[color:var(--color-brand)]" />
                          Render offline (DDSP)
                        </>
                      )}
                    </button>
                    {ddspAction.status === "error" && ddspAction.error && (
                      <div className="mt-2">
                        <InlineErrorPill onDismiss={() => ddspAction.cancel()}>
                          DDSP render failed: {String(
                            (ddspAction.error as Error)?.message ||
                              ddspAction.error,
                          )}
                        </InlineErrorPill>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </StageFrame>

            {/* Canvas Area */}
            <div
              ref={canvasContainerRef}
              className="flex-1 min-h-[260px] sm:min-h-[320px] w-full relative bg-black/40 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden shadow-2xl"
            >
              <ErrorBoundary scope="Synesthesia Canvas">
                <SynesthesiaCanvas
                visualTheme={activePersonaVisualTheme}
                activeMidis={activeMidis}
                width={canvasSize.width}
                height={canvasSize.height}
                showLabels={showTheoryLabels}
                rootMidi={Math.min(...step.notes) + transposeShift}
                onCanvasReady={(el) => { synesthesiaCanvasRef.current = el; }}
              />
                </ErrorBoundary>
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-mono text-neutral-500 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Synesthesia Matrix Active
                </div>
                {(isMediaRecording || mediaRecordingStatus || mediaRecordingError) && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full backdrop-blur ${
                      mediaRecordingError
                        ? "bg-red-900/60 text-red-200"
                        : isMediaRecording
                          ? "bg-red-900/60 text-red-200 animate-pulse"
                          : "bg-emerald-900/60 text-emerald-200"
                    }`}
                  >
                    {isMediaRecording ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        REC {mediaRecordingElapsed.toFixed(1)}s
                      </>
                    ) : mediaRecordingError ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        Recording failed
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        {mediaRecordingStatus}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Fix #5: legend so the shapes have meaning */}
            <div
              className="mt-2 px-3 py-2 rounded-lg bg-black/30 border border-white/5 text-[11px] font-mono text-neutral-400 flex flex-wrap items-center gap-x-4 gap-y-1"
              aria-label="Synesthesia canvas legend"
            >
              <span className="text-neutral-500 uppercase tracking-wider text-[10px]">Legend:</span>
              <span><span className="inline-block w-3 h-3 rounded-full align-middle mr-1" style={{ background: "#E67E22" }} />● chord tone</span>
              <span><span className="inline-block w-3 h-3 mr-1" style={{ background: "#E67E22", clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }} />◆ 3rd / 5th</span>
              <span><span className="inline-block w-3 h-3 mr-1" style={{ background: "#E67E22", clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }} />▲ strong</span>
              <span><span className="inline-block w-3 h-3 mr-1 border" style={{ background: "transparent", borderColor: "#E67E22" }} />✕ tension</span>
              <span><span className="inline-block w-3 h-0.5 align-middle mr-1" style={{ background: "#E67E22" }} />─ line (passing)</span>
            </div>

            {showLiveScore && (
              <div className="w-full mt-2">
                <LiveScoreDisplay
                  path={path}
                  activeStepIndex={activeStepIndex}
                  transposeShift={transposeShift}
                  tempo={tempo}
                />
              </div>
            )}

            {/* Piano area */}
            <div className="w-full flex justify-between items-end px-2 mb-2 mt-4">
              <div className="flex gap-4 items-center">
                <span className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">
                  Keyboard Range
                </span>
                <div className="flex gap-4 text-xs text-neutral-400">
                  <div className="flex items-center gap-2">
                    <span className="w-10">
                      From: {NOTE_WHEEL[kbRange.from % 12]}
                      {Math.floor(kbRange.from / 12) - 1}
                    </span>
                    <input
                      type="range"
                      min="24"
                      max="60"
                      step="12"
                      value={kbRange.from}
                      onChange={(e) =>
                        setKbRange({ ...kbRange, from: Number(e.target.value) })
                      }
                      className="w-20 accent-purple-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-10">
                      To: {NOTE_WHEEL[kbRange.to % 12]}
                      {Math.floor(kbRange.to / 12) - 1}
                    </span>
                    <input
                      type="range"
                      min="48"
                      max="96"
                      step="12"
                      value={kbRange.to}
                      onChange={(e) =>
                        setKbRange({ ...kbRange, to: Number(e.target.value) })
                      }
                      className="w-20 accent-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="w-full bg-black/40 backdrop-blur-md rounded-2xl border border-white/5 p-4 shadow-2xl">
              <PianoKeyboard
                activeMidis={activeMidis}
                onPlayNote={(midi) => {
                  audioEngine.playNote(midi);
                  midiOut.playNote(midi);
                  recorder.recordNoteOn(midi);
                  setActiveMidis((prev) =>
                    Array.from(new Set([...prev, midi])),
                  );
                }}
                onStopNote={(midi) => {
                  audioEngine.stopNote(midi);
                  midiOut.stopNote(midi);
                  recorder.recordNoteOff(midi);
                  setActiveMidis((prev) => prev.filter((m) => m !== midi));
                }}
                startMidi={kbRange.from}
                octaves={Math.max(
                  1,
                  Math.ceil((kbRange.to - kbRange.from) / 12),
                )}
              />
            </div>
          </div>
        </div>
      </main>

      {showImportExport && (
        <ImportExportModal
          currentPath={path}
          onImport={(newPaths) => {
            if (newPaths.length === 0) return;
            // Append imported charts to the path list, active = first
            const merged = [...newPaths, ...paths];
            setPaths(merged);
            setActivePathIndex(0);
            setActiveStepIndex(0);
            setTransposeShift(0);
          }}
          onClose={() => setShowImportExport(false)}
        />
      )}

      {showRecordingModal && (
        <RecordingModal
          notes={recorder.notes}
          tempo={tempo}
          mp4Url={mp4BlobUrl}
          onClose={() => {
            setShowRecordingModal(false);
            // Free the blob URL when the modal closes — keeps
            // memory pressure low across many takes.
            if (mp4BlobUrl) {
              URL.revokeObjectURL(mp4BlobUrl);
              setMp4BlobUrl(null);
            }
          }}
        />
      )}

      {showLeadSheet && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Lead Sheet</h2>
              <button
                onClick={() => setShowLeadSheet(false)}
                className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-mono"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <LeadSheet path={path} />
            </div>
          </div>
        </div>
      )}

      {showCheatsheet && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur z-50 flex items-center justify-center p-4">
          <KeyboardShortcutsCheatsheet onClose={() => setShowCheatsheet(false)} />
        </div>
      )}

      {showChordInspector && (
        <ChordInspector
          open={showChordInspector}
          onClose={() => setShowChordInspector(false)}
          path={path}
          stepIndex={activeStepIndex}
          originalNotes={path.steps[Math.max(0, activeStepIndex - 1)]?.notes ?? []}
          currentNotes={optimizedStepsNotes[activeStepIndex] ?? path.steps[activeStepIndex]?.notes ?? []}
          prevNotes={optimizedStepsNotes[Math.max(0, activeStepIndex - 1)] ?? []}
          onApply={(stepIndex, newNotes) => {
            const key = `${path.id}::${stepIndex}`;
            const prevNotes = path.steps[stepIndex]?.notes ?? [];
            inspectorHistory.push(key, prevNotes);
            const next = path.steps.map((s, i) =>
              i === stepIndex ? { ...s, notes: newNotes } : s,
            );
            const np = { ...path, steps: next };
            setPaths(paths.map((pp, i) => (i === activePathIndex ? np : pp)));
            audioEngine.playChord(newNotes);
          }}
          onAudition={(kind, notes) => {
            audioEngine.stopAll();
            if (kind === "arp") {
              // staggered noteOn ~100ms apart via setTimeout
              notes.slice().sort((a, b) => a - b).forEach((n, i) => {
                setTimeout(() => audioEngine.playNote(n), i * 100);
              });
            } else if (kind === "context") {
              // play this chord then the next one
              audioEngine.playChord(notes);
              const nextStep = path.steps[activeStepIndex + 1];
              if (nextStep) {
                setTimeout(() => audioEngine.playChord(nextStep.notes), 1100);
              }
            } else {
              audioEngine.playChord(notes);
            }
          }}
          onStop={() => audioEngine.stopAll()}
        />
      )}
    </div>
  );
}
