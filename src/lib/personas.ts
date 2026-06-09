import { InstrumentType } from "./audio";

export type VisualTheme =
  | "kandinsky"
  | "coltrane"
  | "bach"
  | "debussy"
  | "eno"
  | "glass"
  | "monk"
  | "default";

export interface Persona {
  id: string;
  name: string;
  role: string;
  quote: string;
  originalSongId: string; // references PATH id
  instrument: InstrumentType;
  tempo: number;
  arpType:
    | "none"
    | "up"
    | "down"
    | "upDown"
    | "downUp"
    | "random"
    | "converge"
    | "diverge";
  arpRate: number;
  arpGate: number;
  arpOctaves: number;
  visualTheme: VisualTheme;
  accentColor: string; // hex colour for theme matching
  gradientFrom: string; // tailwind gradient
  gradientTo: string; // tailwind gradient
}

export const PERSONAS: Persona[] = [
  {
    id: "kandinsky",
    name: "Wassily Kandinsky",
    role: "Visual Synesthete",
    quote: "Color is a power which directly influences the soul.",
    originalSongId: "path-2", // Neo-Soul Borrowing (colourful)
    instrument: "sine",
    tempo: 65,
    arpType: "converge",
    arpRate: 3,
    arpGate: 90,
    arpOctaves: 1.5,
    visualTheme: "kandinsky",
    accentColor: "#FFC107",
    gradientFrom: "from-amber-500/25",
    gradientTo: "to-red-500/5",
  },
  {
    id: "coltrane",
    name: "John Coltrane",
    role: "Symmetrical Titan",
    quote: "My music is the spiritual expression of what I am.",
    originalSongId: "path-9", // Giant Steps
    instrument: "sax",
    tempo: 130,
    arpType: "up",
    arpRate: 4,
    arpGate: 70,
    arpOctaves: 2,
    visualTheme: "coltrane",
    accentColor: "#20B2AA",
    gradientFrom: "from-teal-500/25",
    gradientTo: "to-cyan-500/5",
  },
  {
    id: "bach",
    name: "J.S. Bach",
    role: "Mathematical Architect",
    quote:
      "There is nothing remarkable about it. All one has to do is hit the right keys.",
    originalSongId: "path-5", // Perfect Cadence
    instrument: "guitar",
    tempo: 75,
    arpType: "upDown",
    arpRate: 2,
    arpGate: 80,
    arpOctaves: 1,
    visualTheme: "bach",
    accentColor: "#D4AF37",
    gradientFrom: "from-yellow-600/25",
    gradientTo: "to-amber-500/5",
  },
  {
    id: "debussy",
    name: "Claude Debussy",
    role: "Sonorous Water-Colorist",
    quote: "Music is the spacing between the notes.",
    originalSongId: "path-7", // Planing & Whole Tone
    instrument: "pad",
    tempo: 55,
    arpType: "diverge",
    arpRate: 2,
    arpGate: 100,
    arpOctaves: 3,
    visualTheme: "debussy",
    accentColor: "#3498DB",
    gradientFrom: "from-blue-500/25",
    gradientTo: "to-purple-500/5",
  },
  {
    id: "eno",
    name: "Brian Eno",
    role: "Spatial Ambient Pioneer",
    quote: "Ambient music must be able to accommodate all levels of interest.",
    originalSongId: "path-8", // Ambient Stasis
    instrument: "pad",
    tempo: 40,
    arpType: "random",
    arpRate: 1,
    arpGate: 100,
    arpOctaves: 4,
    visualTheme: "eno",
    accentColor: "#9B59B6",
    gradientFrom: "from-purple-500/25",
    gradientTo: "to-indigo-500/5",
  },
  {
    id: "glass",
    name: "Philip Glass",
    role: "Rhythmic Minimalist",
    quote: "Music is a place where we exist; it can be continuous.",
    originalSongId: "path-10", // Minimalist Oscillation
    instrument: "pluck",
    tempo: 112,
    arpType: "up",
    arpRate: 4,
    arpGate: 60,
    arpOctaves: 2,
    visualTheme: "glass",
    accentColor: "#E74C3C",
    gradientFrom: "from-rose-600/25",
    gradientTo: "to-violet-600/5",
  },
  {
    id: "monk",
    name: "Thelonious Monk",
    role: "Angular Maverick",
    quote: "The piano ain't got no wrong notes.",
    originalSongId: "path-11", // Monk Angular Chromaticism
    instrument: "trumpet",
    tempo: 85,
    arpType: "random",
    arpRate: 3,
    arpGate: 45,
    arpOctaves: 1,
    visualTheme: "monk",
    accentColor: "#E67E22",
    gradientFrom: "from-orange-500/25",
    gradientTo: "to-amber-600/5",
  },
];
