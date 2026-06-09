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
} from "lucide-react";
import { audioEngine, InstrumentType } from "./lib/audio";
import { rhythmEngine } from "./lib/rhythm";
import { midiOut } from "./lib/midiOut";
import { PATHS, HarmonicPath } from "./lib/paths";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { SynesthesiaCanvas } from "./components/SynesthesiaCanvas";
import { generateHarmonicPath } from "./lib/generator";
import { applyVoiceLeading } from "./lib/theory";
import { ImportExportModal } from "./components/ImportExportModal";
import { generateEtude, EtudeAlgorithm } from "./lib/etude";
import { PERSONAS, Persona, VisualTheme } from "./lib/personas";
import { recorder } from "./lib/recorder";
import { RecordingModal } from "./components/RecordingModal";
import { LiveScoreDisplay } from "./components/LiveScoreDisplay";

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

export default function App() {
  const [paths, setPaths] = useState<HarmonicPath[]>(() => {
    try {
      const saved = localStorage.getItem("synesthesia_paths");
      return saved ? JSON.parse(saved) : PATHS;
    } catch {
      return PATHS;
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

  const [tempo, setTempo] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_tempo");
      return saved !== null ? Number(saved) : 60;
    } catch {
      return 60;
    }
  });

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

  const [beatType, setBeatType] = useState<
    "none" | "metronome" | "jazz" | "bossa" | "techno"
  >(() => {
    try {
      const saved = localStorage.getItem("synesthesia_beatType");
      return (saved ? JSON.parse(saved) : "none") as any;
    } catch {
      return "none";
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

  const [isLooping, setIsLooping] = useState(() => {
    try {
      const saved = localStorage.getItem("synesthesia_isLooping");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const isLoopingRef = useRef(isLooping);

  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  const canvasContainerRef = useRef<HTMLDivElement>(null);

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
    if (voicingType === "open") {
      const openNotes = [current[0]]; // keep bass note
      for (let i = 1; i < current.length; i++) {
        // Spread voicing: push every other note up an octave
        openNotes.push(current[i] + (i % 2 !== 0 ? 12 : 0));
      }
      current = openNotes;
    }
    return current.map((n) => n + transposeShift);
  }, [optimizedStepsNotes, activeStepIndex, transposeShift, voicingType]);

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
  }, [path.steps.length]);

  useEffect(() => {
    if (isPlayingAuto) {
      rhythmEngine.start();
    } else {
      rhythmEngine.stop();
    }
    return () => rhythmEngine.stop();
  }, [isPlayingAuto]);

  useEffect(() => {
    const volLog = volume / 100;
    audioEngine.setVolume(volLog);
  }, [volume]);

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
      localStorage.setItem(
        "synesthesia_timeSignature",
        JSON.stringify(timeSignature),
      );
      localStorage.setItem("synesthesia_beatType", JSON.stringify(beatType));
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

  const [isRecording, setIsRecording] = useState(false);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [showLiveScore, setShowLiveScore] = useState(true);

  const handleGenerateEtude = async () => {
    const lengthMap = [8, 16, 32];
    const len = lengthMap[genLength - 1];

    if (etudeAlgorithm === "magenta_rnn") {
      try {
        setIsGeneratingML(true);
        // import dynamically or directly from magentaHelper if we import it at top
        const { generateMagentaSequence } = await import("./lib/magentaHelper");
        const rootMidi = 60 + transposeShift;
        const newPath = await generateMagentaSequence(rootMidi, len, 1.2);
        setPaths([newPath, ...paths]);
        setActivePathIndex(0);
        setActiveStepIndex(0);
        setTransposeShift(0);
      } catch (err) {
        console.error("Magenta generation failed:", err);
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
    <div className="min-h-screen bg-neutral-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,0,255,0.15),rgba(0,0,0,0))] text-neutral-100 font-sans selection:bg-purple-900 selection:text-white flex flex-col">
      <header className="px-6 py-4 border-b border-white/5 bg-black/20 flex flex-wrap gap-4 justify-between items-center backdrop-blur-xl sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-neutral-100 flex items-center gap-2">
            Kandinsky Synesthesia Lab<span className="text-purple-500">II</span>
          </h1>
          <p className="text-sm text-neutral-500 font-medium">
            Harmonic Movement & Voicing Explorer
          </p>
        </div>

        <div className="hidden md:flex items-center gap-4 text-xs font-mono text-neutral-400">
          <button
            onClick={() => setShowImportExport(true)}
            className="flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded border border-neutral-800 transition-colors text-neutral-300 hover:text-white"
          >
            <FileCode size={14} className="text-purple-400" />
            <span>Import / Export</span>
          </button>
          <div className="flex items-center gap-2 bg-neutral-900/50 px-2 py-1.5 rounded border border-neutral-800">
            <Settings2 size={12} className="text-purple-400" />
            <select
              value={selectedMidiOutId}
              onChange={(e) => {
                midiOut.selectOutput(e.target.value);
                setSelectedMidiOutId(e.target.value);
              }}
              className="bg-transparent text-neutral-300 outline-none cursor-pointer"
            >
              <option value="">No MIDI Out</option>
              {midiOutputs.map((out) => (
                <option key={out.id} value={out.id}>
                  {out.name}
                </option>
              ))}
            </select>
          </div>
          <span className="flex items-center gap-1 bg-neutral-900 px-2 py-1 rounded">
            <ChevronUp size={14} /> <ChevronDown size={14} /> Change Path
          </span>
          <span className="flex items-center gap-1 bg-neutral-900 px-2 py-1 rounded">
            <ChevronLeft size={14} /> <ChevronRight size={14} /> Step Chord
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col w-full max-w-7xl mx-auto p-4 gap-6">
        {/* Synesthesia Composer Personas Ribbon */}
        <div className="bg-black/30 backdrop-blur-xl border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <User size={16} className="text-purple-400" />
              <h2 className="text-xs uppercase tracking-widest text-neutral-400 font-bold">
                Synesthetic Artist Personas
              </h2>
            </div>
            <p className="text-[11px] text-neutral-500 font-medium hidden sm:block">
              Choose a mastermind to instantly load their custom scaling, audio
              synthesis parameters, and synesthesia canvas visualization.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 overflow-x-auto pb-1">
            {PERSONAS.map((p) => {
              const isActive = selectedPersonaId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPersona(p.id)}
                  className={`relative text-left p-3 rounded-xl border transition-all duration-300 flex flex-col justify-between h-28 group ${
                    isActive
                      ? `bg-gradient-to-br ${p.gradientFrom} ${p.gradientTo} border-neutral-700 shadow-[0_4px_20px_rgba(0,0,0,0.4)]`
                      : "bg-neutral-900/40 border-transparent hover:bg-neutral-900/80 hover:border-neutral-800"
                  }`}
                  style={{
                    borderColor: isActive ? p.accentColor + "30" : undefined,
                    boxShadow: isActive
                      ? `0 0 15px ${p.accentColor}10`
                      : undefined,
                  }}
                >
                  {/* Active Highlighter line */}
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

                    {/* Little active light */}
                    {isActive ? (
                      <span
                        className="w-2 h-2 rounded-full animate-pulse"
                        style={{ backgroundColor: p.accentColor }}
                      />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-700 group-hover:bg-neutral-600" />
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
                        >
                          <option value="fibonacci">Fibonacci Intervals</option>
                          <option value="sacred_geometry">
                            Sacred Geometry
                          </option>
                          <option value="coltrane_fractal">
                            Coltrane Fractal
                          </option>
                          <option value="magenta_rnn">Magenta AI (RNN)</option>
                        </select>
                        <button
                          onClick={handleGenerateEtude}
                          disabled={isGeneratingML}
                          className={`w-full py-2 bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 text-xs rounded border border-purple-800/50 transition-colors font-mono ${isGeneratingML ? "opacity-50 cursor-wait" : ""}`}
                        >
                          {isGeneratingML ? "GENERATING..." : "GENERATE ETUDE"}
                        </button>
                      </div>
                    </div>
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
          <div className="flex-1 flex flex-col gap-6">
            {/* Active Step Info / Stage */}
            <div className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center min-h-[120px] shadow-2xl shadow-black/50">
              <div>
                <div className="text-purple-400 font-mono text-xs mb-2">
                  CURRENT VOICING
                </div>
                <h2 className="text-4xl font-semibold tracking-tighter text-white mb-2">
                  {transposeChordName(step.name, transposeShift)}
                </h2>
                <p className="text-neutral-400 text-sm">{step.descriptions}</p>

                {/* Toggles */}
                <div className="flex flex-wrap gap-4 mt-5">
                  <div className="flex bg-black/60 rounded-lg p-1 border border-white/5 shadow-inner">
                    <button
                      onClick={() => setTransposeShift((p) => p - 7)}
                      className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                      title="Down a 5th"
                    >
                      ♭5th
                    </button>
                    <div className="px-3 py-1.5 text-xs text-purple-400 font-mono bg-black/80 rounded flex items-center min-w-[3.5rem] justify-center shadow-inner">
                      {transposeShift > 0 ? "+" : ""}
                      {transposeShift} ST
                    </div>
                    <button
                      onClick={() => setTransposeShift((p) => p + 7)}
                      className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                      title="Up a 5th"
                    >
                      ♯5th
                    </button>
                    <button
                      onClick={() => setTransposeShift(0)}
                      className="px-3 py-1.5 text-xs text-neutral-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                      title="Reset Key"
                    >
                      ⟲
                    </button>
                  </div>

                  <div className="flex bg-black/60 rounded-lg p-1 border border-white/5 shadow-inner">
                    <button
                      onClick={() => setVoicingType("closed")}
                      className={`px-3 py-1.5 text-xs rounded transition-colors ${voicingType === "closed" ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]" : "text-neutral-400 hover:text-white hover:bg-white/10"}`}
                    >
                      Closed
                    </button>
                    <button
                      onClick={() => setVoicingType("open")}
                      className={`px-3 py-1.5 text-xs rounded transition-colors ${voicingType === "open" ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]" : "text-neutral-400 hover:text-white hover:bg-white/10"}`}
                    >
                      Open
                    </button>
                  </div>

                  <div className="flex bg-black/60 rounded-lg p-1 border border-white/5 shadow-inner">
                    <button
                      onClick={() =>
                        setOptimizeVoiceLeading(!optimizeVoiceLeading)
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${optimizeVoiceLeading ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]" : "text-neutral-400 hover:text-white hover:bg-white/10"}`}
                    >
                      <Waypoints size={14} /> Optimize Lead
                    </button>
                    <button
                      onClick={() => setShowTheoryLabels(!showTheoryLabels)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${showTheoryLabels ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]" : "text-neutral-400 hover:text-white hover:bg-white/10"}`}
                    >
                      Theory Labels
                    </button>
                  </div>

                  <div className="flex items-center bg-black/60 rounded-lg p-1 border border-white/5 gap-2 px-3 shadow-inner">
                    <select
                      value={instrument}
                      onChange={(e) => setInstrument(e.target.value as any)}
                      className="bg-transparent text-xs text-neutral-400 outline-none cursor-pointer hover:text-white font-medium"
                    >
                      <option value="epiano">E-Piano</option>
                      <option value="sine">Pure Sine</option>
                      <option value="pad">Warm Pad</option>
                      <option value="pluck">FM Pluck</option>
                      <option value="trumpet">Trumpet</option>
                      <option value="guitar">Guitar</option>
                      <option value="sax">Saxophone</option>
                    </select>
                    <div className="h-4 w-px bg-neutral-700 mx-1"></div>
                    <button
                      onClick={() => setIsPlayingAuto(!isPlayingAuto)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded transition-colors ${isPlayingAuto ? "text-purple-400 font-medium" : "text-neutral-400 hover:text-white"}`}
                    >
                      {isPlayingAuto ? <Pause size={14} /> : <Play size={14} />}{" "}
                      Auto
                    </button>
                    <button
                      onClick={() => setIsLooping(!isLooping)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded transition-colors ${isLooping ? "text-purple-400 font-medium" : "text-neutral-500 hover:text-neutral-400"}`}
                      title="Loop Sequence"
                    >
                      <RefreshCw size={14} /> Loop
                    </button>
                    <div className="h-4 w-px bg-neutral-700 mx-1"></div>
                    <button
                      onClick={() => {
                        if (isRecording) {
                          recorder.stop();
                          setIsRecording(false);
                          setShowRecordingModal(true);
                        } else {
                          recorder.start();
                          setIsRecording(true);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded transition-colors ${isRecording ? "text-red-500 font-bold bg-red-500/20 animate-pulse" : "text-neutral-500 hover:text-red-400"}`}
                      title="Record to Score"
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${isRecording ? "bg-red-500" : "bg-red-900"}`}
                      />
                      {isRecording ? "REC" : "Record"}
                    </button>
                    <div className="h-4 w-px bg-neutral-700 mx-1"></div>
                    <button
                      onClick={() => setShowLiveScore(!showLiveScore)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded transition-colors ${showLiveScore ? "text-purple-400 font-medium bg-purple-500/10" : "text-neutral-500 hover:text-white"}`}
                      title="Toggle Live Score View"
                    >
                      <BookOpen size={14} /> Score
                    </button>
                    <div className="h-4 w-px bg-neutral-700 mx-1"></div>
                    <select
                      value={timeSignature}
                      onChange={(e) => setTimeSignature(e.target.value as any)}
                      className="bg-transparent text-xs text-neutral-400 outline-none cursor-pointer hover:text-white"
                    >
                      <option value="4/4">4/4</option>
                      <option value="6/8">6/8</option>
                      <option value="7/8">7/8</option>
                      <option value="11/4">11/4</option>
                      <option value="tintal">Tintal (16)</option>
                    </select>
                    <div className="h-4 w-px bg-neutral-700 mx-1"></div>
                    <select
                      value={beatType}
                      onChange={(e) => setBeatType(e.target.value as any)}
                      className="bg-transparent text-xs text-neutral-400 outline-none cursor-pointer hover:text-white"
                    >
                      <option value="none">No Beat</option>
                      <option value="metronome">Metronome</option>
                      <option value="jazz">Jazz Ride</option>
                      <option value="bossa">Bossa Nova</option>
                      <option value="techno">Techno</option>
                    </select>
                    <div className="h-4 w-px bg-neutral-700 mx-1"></div>
                    <input
                      type="range"
                      min="30"
                      max="180"
                      value={tempo}
                      onChange={(e) => setTempo(parseInt(e.target.value))}
                      className="w-20 accent-purple-500"
                      title="Tempo (BPM)"
                    />
                    <span className="text-xs text-neutral-500 font-mono w-[50px] text-right">
                      {tempo} BPM
                    </span>

                    <div className="h-4 w-px bg-neutral-700 mx-1"></div>

                    <div className="flex items-center gap-1.5 text-neutral-400">
                      <Volume2 size={14} />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={volume}
                        onChange={(e) => setVolume(parseInt(e.target.value))}
                        className="w-16 accent-purple-500"
                        title="Volume"
                      />
                    </div>
                    <span className="text-xs text-neutral-500 font-mono w-[30px] text-right">
                      {volume}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 md:mt-0 flex gap-2 self-start md:self-center">
                <button
                  onClick={() =>
                    setActiveStepIndex(Math.max(activeStepIndex - 1, 0))
                  }
                  disabled={activeStepIndex === 0}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-neutral-800 transition-colors"
                  aria-label="Previous Voicing"
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
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 fill-current transition-colors"
                    aria-label="Stop Chord"
                  >
                    <Square
                      size={20}
                      className="fill-current text-purple-400"
                    />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      audioEngine.playChord(currentChordNotes);
                      midiOut.playChord(currentChordNotes);
                      setActiveMidis(currentChordNotes);
                    }}
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors"
                    aria-label="Play Chord"
                  >
                    <Play
                      size={22}
                      className="fill-current text-purple-400 translate-x-[2px]"
                    />
                  </button>
                )}

                <button
                  onClick={() =>
                    setActiveStepIndex(
                      Math.min(activeStepIndex + 1, path.steps.length - 1),
                    )
                  }
                  disabled={activeStepIndex === path.steps.length - 1}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-30 disabled:hover:bg-purple-600 transition-colors shadow-[0_0_20px_rgba(147,51,234,0.3)]"
                  aria-label="Next Voicing"
                >
                  <ChevronRight />
                </button>
              </div>
            </div>

            {/* Canvas Area */}
            <div
              ref={canvasContainerRef}
              className="flex-1 min-h-[300px] w-full relative bg-black/40 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden shadow-2xl"
            >
              <SynesthesiaCanvas
                visualTheme={activePersonaVisualTheme}
                activeMidis={activeMidis}
                width={canvasSize.width}
                height={canvasSize.height}
                showLabels={showTheoryLabels}
                rootMidi={Math.min(...step.notes) + transposeShift}
              />
              <div className="absolute top-4 left-4 flex items-center gap-2 text-xs font-mono text-neutral-500 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Synesthesia Matrix Active
              </div>
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
          onImport={(newPath) => {
            setPaths([newPath, ...paths]);
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
          onClose={() => setShowRecordingModal(false)}
        />
      )}
    </div>
  );
}
