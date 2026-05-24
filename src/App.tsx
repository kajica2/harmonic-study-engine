import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Info, Square, Settings2, Sparkles, Waypoints, FileCode, RefreshCw, Hexagon } from 'lucide-react';
import { audioEngine, InstrumentType } from './lib/audio';
import { rhythmEngine } from './lib/rhythm';
import { midiOut } from './lib/midiOut';
import { PATHS, HarmonicPath } from './lib/paths';
import { PianoKeyboard } from './components/PianoKeyboard';
import { SynesthesiaCanvas } from './components/SynesthesiaCanvas';
import { generateHarmonicPath } from './lib/generator';
import { applyVoiceLeading } from './lib/theory';
import { ImportExportModal } from './components/ImportExportModal';
import { generateEtude, EtudeAlgorithm } from './lib/etude';

const NOTE_WHEEL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function transposeChordName(name: string, shift: number): string {
  if (shift % 12 === 0) return name;
  return name.replace(/(^|[\s/(-])([A-G][b#]?)/g, (match, prefix, note) => {
    let index = NOTE_WHEEL.indexOf(note);
    if (index === -1) {
      const enharmonics: Record<string, string> = {
        'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb'
      };
      index = enharmonics[note] ? NOTE_WHEEL.indexOf(enharmonics[note]) : -1;
    }
    if (index === -1) return match;
    const newIndex = (index + shift + 120) % 12; // +120 ensures positive before modulo
    return prefix + NOTE_WHEEL[newIndex];
  });
}

export default function App() {
  const [activePathIndex, setActivePathIndex] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [activeMidis, setActiveMidis] = useState<number[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 400 });
  
  const [transposeShift, setTransposeShift] = useState(0); // in semitones
  const [voicingType, setVoicingType] = useState<'closed' | 'open'>('closed');
  const [midiOutputs, setMidiOutputs] = useState<any[]>([]);
  const [selectedMidiOutId, setSelectedMidiOutId] = useState<string>('');
  
  const [instrument, setInstrument] = useState<InstrumentType>('epiano');
  const [isPlayingAuto, setIsPlayingAuto] = useState(false);
  const [tempo, setTempo] = useState(60); // BPM
  
  const [kbRange, setKbRange] = useState<{from: number, to: number}>({ from: 36, to: 72 });

  useEffect(() => {
    audioEngine.setInstrument(instrument);
  }, [instrument]);
  const [timeSignature, setTimeSignature] = useState<'4/4' | '6/8' | '7/8' | '11/4' | 'tintal'>('4/4');
  const [beatType, setBeatType] = useState<'none' | 'metronome' | 'jazz' | 'bossa' | 'techno'>('none');

  const [genLength, setGenLength] = useState(1);
  const [genComplexity, setGenComplexity] = useState(1);
  const [paths, setPaths] = useState<HarmonicPath[]>(PATHS);
  
  const [optimizeVoiceLeading, setOptimizeVoiceLeading] = useState(false);
  const [showTheoryLabels, setShowTheoryLabels] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  
  const [arpType, setArpType] = useState<'none' | 'up' | 'down' | 'upDown' | 'downUp' | 'random' | 'converge' | 'diverge'>('none');
  const [arpRate, setArpRate] = useState(4); // 1 to 6 (quarter to 32nd notes)
  const [arpGate, setArpGate] = useState(80); 
  const [arpOctaves, setArpOctaves] = useState(1);
  const [isLooping, setIsLooping] = useState(true);
  const isLoopingRef = useRef(isLooping);

  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  const path = paths[activePathIndex];
  const step = path.steps[activeStepIndex];

  const optimizedStepsNotes = useMemo(() => {
    if (!optimizeVoiceLeading) return path.steps.map(s => s.notes);
    
    const res = [];
    for (let i = 0; i < path.steps.length; i++) {
        if (i === 0) {
            res.push(path.steps[i].notes);
        } else {
            res.push(applyVoiceLeading(res[i-1], path.steps[i].notes));
        }
    }
    return res;
  }, [path.steps, optimizeVoiceLeading]);

  const currentChordNotes = useMemo(() => {
    let current = [...optimizedStepsNotes[activeStepIndex]].sort((a,b) => a - b);
    if (voicingType === 'open') {
      const openNotes = [current[0]]; // keep bass note
      for (let i = 1; i < current.length; i++) {
        // Spread voicing: push every other note up an octave
        openNotes.push(current[i] + (i % 2 !== 0 ? 12 : 0));
      }
      current = openNotes;
    }
    return current.map(n => n + transposeShift);
  }, [optimizedStepsNotes, activeStepIndex, transposeShift, voicingType]);

  useEffect(() => {
    // Initialize audio engine on first interaction
    const handleFirstInteraction = () => {
      audioEngine.init();
      midiOut.init();
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('mousedown', handleFirstInteraction);
    };
    window.addEventListener('keydown', handleFirstInteraction);
    window.addEventListener('mousedown', handleFirstInteraction);
    
    // Subscribe to MIDI outputs
    const unsubscribeMidi = midiOut.onOutputsChange((outputs) => {
      setMidiOutputs(outputs);
      setSelectedMidiOutId(midiOut.getSelectedOutputId() || '');
    });

    return () => {
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('mousedown', handleFirstInteraction);
      unsubscribeMidi();
    };
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (canvasContainerRef.current) {
        setCanvasSize({
          width: canvasContainerRef.current.offsetWidth,
          height: canvasContainerRef.current.offsetHeight
        });
      }
    };
    
    // Initial size
    updateSize();
    
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Update audio when step changes or arp settings change
  const arpNotes = useMemo(() => {
    let notes = [...currentChordNotes];
    if (arpOctaves > 1) {
      let expanded = [...notes];
      const fullOctaves = Math.floor(arpOctaves);
      for (let i = 1; i < fullOctaves; i++) {
        expanded = expanded.concat(notes.map(n => n + 12 * i));
      }
      if (arpOctaves % 1 !== 0) {
        const numNotes = Math.max(1, Math.round(notes.length * (arpOctaves % 1)));
        const partial = notes.slice(0, numNotes).map(n => n + 12 * fullOctaves);
        expanded = expanded.concat(partial);
      }
      notes = Array.from(new Set(expanded)).sort((a, b) => a - b);
    }
    
    if (arpType === 'up') return notes;
    if (arpType === 'down') return [...notes].reverse();
    if (arpType === 'upDown') return [...notes, ...[...notes].reverse().slice(1, -1)];
    if (arpType === 'downUp') return [...notes].reverse().concat([...notes].slice(1, -1));
    if (arpType === 'random') return notes; 
    if (arpType === 'converge') {
        let c = [];
        let l = 0, r = notes.length - 1;
        while(l <= r) {
          c.push(notes[l++]);
          if (l <= r) c.push(notes[r--]);
        }
        return c;
    }
    if (arpType === 'diverge') {
        let d = [];
        let mid = Math.floor(notes.length / 2);
        let l = mid - 1, r = mid;
        while(l >= 0 || r < notes.length) {
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
    
    if (arpType === 'none') {
       setActiveMidis(currentChordNotes);
       audioEngine.playChord(currentChordNotes);
       midiOut.playChord(currentChordNotes);
       
       return () => {
         audioEngine.stopAll();
         midiOut.stopAll();
       };
    } else {
       setActiveMidis([]);
       let arpIndex = 0;
       let lastNote = -1;
       let gateTimeout: ReturnType<typeof setTimeout>;

       let divisor = 1;
       if (arpRate === 2) divisor = 2; // 8th
       else if (arpRate === 3) divisor = 3; // 8th triplet
       else if (arpRate === 4) divisor = 4; // 16th
       else if (arpRate === 5) divisor = 6; // 16th triplet
       else if (arpRate === 6) divisor = 8; // 32nd
       
       const realMsPerTick = (60000 / tempo) / divisor;

       const playNextArp = () => {
          if (lastNote !== -1) {
            audioEngine.stopNote(lastNote);
            midiOut.stopNote(lastNote);
            setActiveMidis(prev => prev.filter(m => m !== lastNote));
          }
          
          if (arpNotes.length === 0) return;

          let noteToPlay = -1;
          if (arpType === 'random') {
             noteToPlay = arpNotes[Math.floor(Math.random() * arpNotes.length)];
          } else {
             noteToPlay = arpNotes[arpIndex % arpNotes.length];
             arpIndex++;
          }

          lastNote = noteToPlay;
          audioEngine.playNote(noteToPlay);
          midiOut.playNote(noteToPlay);
          setActiveMidis(prev => Array.from(new Set([...prev, noteToPlay])));

          if (arpGate < 100) {
             gateTimeout = setTimeout(() => {
                const currentNote = noteToPlay;
                audioEngine.stopNote(currentNote);
                midiOut.stopNote(currentNote);
                setActiveMidis(prev => prev.filter(m => m !== currentNote));
             }, realMsPerTick * (arpGate / 100));
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
          }
       };
    }
  }, [currentChordNotes, arpNotes, arpType, arpRate, arpGate, tempo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setActiveStepIndex(prev => Math.min(prev + 1, path.steps.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setActiveStepIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'ArrowDown') {
        setActivePathIndex(prev => {
          const nextInit = Math.min(prev + 1, paths.length - 1);
          if (nextInit !== prev) setActiveStepIndex(0);
          return nextInit;
        });
      } else if (e.key === 'ArrowUp') {
        setActivePathIndex(prev => {
          const nextInit = Math.max(prev - 1, 0);
          if (nextInit !== prev) setActiveStepIndex(0);
          return nextInit;
        });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
      setActiveStepIndex(prev => {
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

  const handleGeneratePath = () => {
    const newPath = generateHarmonicPath(genLength, genComplexity);
    setPaths([newPath, ...paths]);
    setActivePathIndex(0);
    setActiveStepIndex(0);
    setTransposeShift(0);
  };

  const [etudeAlgorithm, setEtudeAlgorithm] = useState<EtudeAlgorithm>('fibonacci');
  const handleGenerateEtude = () => {
    const lengthMap = [8, 16, 32];
    const newPath = generateEtude(etudeAlgorithm, lengthMap[genLength - 1]);
    setPaths([newPath, ...paths]);
    setActivePathIndex(0);
    setActiveStepIndex(0);
    setTransposeShift(0);
  };

  return (
    <div className="min-h-screen bg-neutral-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,0,255,0.15),rgba(0,0,0,0))] text-neutral-100 font-sans selection:bg-purple-900 selection:text-white flex flex-col">
      <header className="px-6 py-4 border-b border-white/5 bg-black/20 flex justify-between items-center backdrop-blur-xl sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-neutral-100 flex items-center gap-2">
            Kandinsky Synesthesia Lab<span className="text-purple-500">II</span>
          </h1>
          <p className="text-sm text-neutral-500 font-medium">Harmonic Movement & Voicing Explorer</p>
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
              {midiOutputs.map(out => (
                <option key={out.id} value={out.id}>{out.name}</option>
              ))}
            </select>
          </div>
          <span className="flex items-center gap-1 bg-neutral-900 px-2 py-1 rounded"><ChevronUp size={14}/> <ChevronDown size={14}/> Change Path</span>
          <span className="flex items-center gap-1 bg-neutral-900 px-2 py-1 rounded"><ChevronLeft size={14}/> <ChevronRight size={14}/> Step Chord</span>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col lg:flex-row w-full max-w-7xl mx-auto p-4 gap-6">
        
        {/* Left Sidebar: Paths */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-white/5 shadow-2xl">
            
            {/* Arpeggiator Section */}
            <div className="mb-6 pb-6 border-b border-neutral-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm uppercase tracking-widest text-neutral-500 font-semibold flex items-center gap-2">
                  <Settings2 size={14} className="text-purple-400" />
                  Arpeggiator
                </h2>
                <select 
                  value={arpType} 
                  onChange={e => setArpType(e.target.value as any)}
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
              
              {arpType !== 'none' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-400 w-16">Rate ({['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'][arpRate-1]})</span>
                        <input 
                           type="range" min="1" max="6" value={arpRate} onChange={e => setArpRate(Number(e.target.value))}
                           className="flex-1 accent-purple-500"
                           title={['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'][arpRate-1]}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-400 w-16">Gate ({arpGate}%)</span>
                        <input 
                           type="range" min="10" max="100" value={arpGate} onChange={e => setArpGate(Number(e.target.value))}
                           className="flex-1 accent-purple-500"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-400 w-16">Oct ({arpOctaves})</span>
                        <input 
                           type="range" min="1" max="4" step="0.5" value={arpOctaves} onChange={e => setArpOctaves(Number(e.target.value))}
                           className="flex-1 accent-purple-500"
                        />
                    </div>
                  </div>
              )}
            </div>

            {/* Generative Section */}
            <div className="mb-6 pb-6 border-b border-neutral-800">
              <h2 className="text-sm uppercase tracking-widest text-neutral-500 mb-4 font-semibold flex items-center gap-2">
                <Sparkles size={14} className="text-purple-400" />
                Generate Path
              </h2>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>Length</span>
                    <span className="font-mono">{genLength === 1 ? 'Short' : genLength === 2 ? 'Medium' : 'Long'}</span>
                  </div>
                  <input 
                    type="range" min="1" max="3" step="1" 
                    value={genLength} 
                    onChange={e => setGenLength(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>Complexity</span>
                    <span className="font-mono">{genComplexity === 1 ? 'Basic' : genComplexity === 2 ? 'Inter' : 'Advanced'}</span>
                  </div>
                  <input 
                    type="range" min="1" max="3" step="1" 
                    value={genComplexity} 
                    onChange={e => setGenComplexity(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>
                <button 
                  onClick={handleGeneratePath}
                  className="w-full py-2 bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 text-sm rounded border border-purple-800/50 transition-colors mt-2"
                >
                  Generate Progression
                </button>
              </div>

              <div className="h-px w-full bg-neutral-800 my-4"></div>

              <h2 className="text-sm uppercase tracking-widest text-neutral-500 mb-4 font-semibold flex items-center gap-2">
                <Hexagon size={14} className="text-purple-400" />
                Create Etude
              </h2>
              <div className="flex flex-col gap-4">
                <select 
                  value={etudeAlgorithm} 
                  onChange={e => setEtudeAlgorithm(e.target.value as EtudeAlgorithm)}
                  className="bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 rounded px-2 py-2 outline-none w-full"
                >
                  <option value="fibonacci">Fibonacci Intervals</option>
                  <option value="sacred_geometry">Sacred Geometry</option>
                  <option value="coltrane_fractal">Coltrane Fractal</option>
                </select>
                <button 
                  onClick={handleGenerateEtude}
                  className="w-full py-2 bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 text-sm rounded border border-purple-800/50 transition-colors"
                >
                  Generate Etude
                </button>
              </div>
            </div>

            <h2 className="text-sm uppercase tracking-widest text-neutral-500 mb-4 font-semibold">Harmonic Paths</h2>
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
                    ? 'bg-purple-900/20 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]' 
                    : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'
                  }`}
                >
                  <div className="font-medium text-sm text-neutral-200">{p.title}</div>
                  {p.id.startsWith('generated-') && <div className="text-[10px] text-purple-400 mt-1 uppercase">Generated</div>}
                </button>
              ))}
            </div>
            
            <div className="mt-6 pt-6 border-t border-neutral-800">
              <h3 className="text-lg font-medium text-purple-300 mb-2">{path.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed mb-6">
                {path.description}
              </p>
              
              <div className="flex flex-col gap-3">
                {path.steps.map((s, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setActiveStepIndex(idx)}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                      activeStepIndex === idx ? 'bg-purple-500/20 text-purple-200' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="font-mono text-xs opacity-50">{idx + 1}</span>
                    <span className={`font-medium text-sm ${activeStepIndex === idx ? 'text-purple-100' : ''}`}>{s.name}</span>
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
              <div className="text-purple-400 font-mono text-xs mb-2">CURRENT VOICING</div>
              <h2 className="text-4xl font-semibold tracking-tighter text-white mb-2">{transposeChordName(step.name, transposeShift)}</h2>
              <p className="text-neutral-400 text-sm">{step.descriptions}</p>
              
              {/* Toggles */}
              <div className="flex flex-wrap gap-4 mt-5">
                <div className="flex bg-black/60 rounded-lg p-1 border border-white/5 shadow-inner">
                  <button onClick={() => setTransposeShift(p => p - 7)} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors" title="Down a 5th">♭5th</button>
                  <div className="px-3 py-1.5 text-xs text-purple-400 font-mono bg-black/80 rounded flex items-center min-w-[3.5rem] justify-center shadow-inner">
                    {transposeShift > 0 ? '+' : ''}{transposeShift} ST
                  </div>
                  <button onClick={() => setTransposeShift(p => p + 7)} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-white/10 rounded transition-colors" title="Up a 5th">♯5th</button>
                  <button onClick={() => setTransposeShift(0)} className="px-3 py-1.5 text-xs text-neutral-500 hover:text-white hover:bg-white/10 rounded transition-colors" title="Reset Key">⟲</button>
                </div>
                
                <div className="flex bg-black/60 rounded-lg p-1 border border-white/5 shadow-inner">
                  <button onClick={() => setVoicingType('closed')} className={`px-3 py-1.5 text-xs rounded transition-colors ${voicingType === 'closed' ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}>Closed</button>
                  <button onClick={() => setVoicingType('open')} className={`px-3 py-1.5 text-xs rounded transition-colors ${voicingType === 'open' ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}>Open</button>
                </div>

                <div className="flex bg-black/60 rounded-lg p-1 border border-white/5 shadow-inner">
                  <button 
                    onClick={() => setOptimizeVoiceLeading(!optimizeVoiceLeading)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${optimizeVoiceLeading ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}
                  >
                    <Waypoints size={14} /> Optimize Lead
                  </button>
                  <button 
                    onClick={() => setShowTheoryLabels(!showTheoryLabels)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${showTheoryLabels ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}
                  >
                    Theory Labels
                  </button>
                </div>

                <div className="flex items-center bg-black/60 rounded-lg p-1 border border-white/5 gap-2 px-3 shadow-inner">
                  <select 
                    value={instrument} 
                    onChange={e => setInstrument(e.target.value as any)}
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
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded transition-colors ${isPlayingAuto ? 'text-purple-400 font-medium' : 'text-neutral-400 hover:text-white'}`}
                  >
                    {isPlayingAuto ? <Pause size={14} /> : <Play size={14} />} Auto
                  </button>
                  <button 
                    onClick={() => setIsLooping(!isLooping)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded transition-colors ${isLooping ? 'text-purple-400 font-medium' : 'text-neutral-500 hover:text-neutral-400'}`}
                    title="Loop Sequence"
                  >
                    <RefreshCw size={14} /> Loop
                  </button>
                  <div className="h-4 w-px bg-neutral-700 mx-1"></div>
                  <select 
                    value={timeSignature} 
                    onChange={e => setTimeSignature(e.target.value as any)}
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
                    onChange={e => setBeatType(e.target.value as any)}
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
                  <span className="text-xs text-neutral-500 font-mono w-[60px] text-right">{tempo} BPM</span>
                </div>
              </div>

            </div>
            
            <div className="mt-8 md:mt-0 flex gap-2 self-start md:self-center">
              <button 
                onClick={() => setActiveStepIndex(Math.max(activeStepIndex - 1, 0))}
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
                  <Square size={20} className="fill-current text-purple-400" />
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
                  <Play size={22} className="fill-current text-purple-400 translate-x-[2px]" />
                </button>
              )}

              <button 
                onClick={() => setActiveStepIndex(Math.min(activeStepIndex + 1, path.steps.length - 1))}
                disabled={activeStepIndex === path.steps.length - 1}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-30 disabled:hover:bg-purple-600 transition-colors shadow-[0_0_20px_rgba(147,51,234,0.3)]"
                aria-label="Next Voicing"
              >
                <ChevronRight />
              </button>
            </div>
          </div>

          {/* Canvas Area */}
          <div ref={canvasContainerRef} className="flex-1 min-h-[300px] w-full relative bg-black/40 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
             <SynesthesiaCanvas 
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
          
          {/* Piano area */}
          <div className="w-full flex justify-between items-end px-2 mb-2 mt-4">
            <div className="flex gap-4 items-center">
              <span className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">Keyboard Range</span>
              <div className="flex gap-4 text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <span className="w-10">From: {NOTE_WHEEL[kbRange.from % 12]}{Math.floor(kbRange.from/12)-1}</span>
                  <input type="range" min="24" max="60" step="12" value={kbRange.from} onChange={(e) => setKbRange({ ...kbRange, from: Number(e.target.value) })} className="w-20 accent-purple-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10">To: {NOTE_WHEEL[kbRange.to % 12]}{Math.floor(kbRange.to/12)-1}</span>
                  <input type="range" min="48" max="96" step="12" value={kbRange.to} onChange={(e) => setKbRange({ ...kbRange, to: Number(e.target.value) })} className="w-20 accent-purple-500" />
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
                setActiveMidis(prev => Array.from(new Set([...prev, midi])));
              }}
              onStopNote={(midi) => {
                audioEngine.stopNote(midi);
                midiOut.stopNote(midi);
                setActiveMidis(prev => prev.filter(m => m !== midi));
              }}
              startMidi={kbRange.from}
              octaves={Math.max(1, Math.ceil((kbRange.to - kbRange.from) / 12))}
            />
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
    </div>
  );
}
