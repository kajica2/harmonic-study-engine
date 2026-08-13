import { HarmonicPath, HarmonicStep } from "./paths";

const NOTE_NAMES = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];

function midiNoteName(midi: number): string {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

function midiNoteNameFromChordStep(root: number, semitones: number): string {
  return NOTE_NAMES[(root + semitones) % 12] + (Math.floor((root + semitones) / 12) - 1);
}

// Map chord quality symbol to semitone intervals from root
const CHORD_QUALITIES: Record<string, number[]> = {
  maj:    [0, 4, 7],
  maj7:   [0, 4, 7, 11],
  "7":    [0, 4, 7, 10],
  m:      [0, 3, 7],
  m7:     [0, 3, 7, 10],
  dim:    [0, 3, 6],
  m9:     [0, 3, 7, 10, 14],
  maj9:   [0, 4, 7, 11, 14],
  "13":   [0, 4, 7, 10, 14, 21],
  "7b9":  [0, 4, 7, 10, 13],
  "7#9":  [0, 4, 7, 10, 15],
  "maj7#5": [0, 4, 8, 11],
  "m7b5": [0, 3, 6, 10],
};

export async function generateGeminiEtude(
  rootMidi: number = 60,
  stepsCount: number = 16,
  apiKey: string,
  algorithm: string = "jazz",
): Promise<HarmonicPath> {
  const styleMap: Record<string, string> = {
    jazz:      "jazz harmony with ii-V-I progressions, tritone substitutions, and modal interchange",
    classical: "classical voice leading with smooth motion and functional harmony (Riemannian functions)",
    modern:    "modern chromatic harmony with upper structures, altered dominants, and planing",
    romantic:  "romantic-era rich seventh chords, augmented sixths, and lush modulations",
  };
  const style = styleMap[algorithm] ?? styleMap.jazz;

  const prompt = `You are a jazz and harmony expert. Generate a chord progression of exactly ${stepsCount} chords.
Style: ${style}.
Return ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "title": "A short title for this progression",
  "description": "A one-sentence description of the harmonic journey",
  "chords": [
    { "name": "Dm7", "root_semitones_from_C": 2, "quality": "m7" },
    { "name": "G7", "root_semitones_from_C": 7, "quality": "7" },
    { "name": "Cmaj7", "root_semitones_from_C": 0, "quality": "maj7" }
  ]
}
Rules:
- root_semitones_from_C: C=0, Db=-1, D=2, Eb=3, E=4, F=5, Gb=6, G=7, Ab=8, A=9, Bb=10, B=11.
- Start on a minor or major chord; end on a resolution chord (Cmaj7, Dm7, or Fmaj7).
- Valid qualities: maj, maj7, 7, m, m7, m9, dim, 7b9, 7#9, maj9, m7b5, maj7#5, 13.
- Total chords must be exactly ${stepsCount}.`;

  const response = await fetch(
    `https://openrouter.ai/api/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Harmonic Study Engine",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
        temperature: 0.8,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${text}`);
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? "";

  // Extract JSON block
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : "";

  let parsed: {
    title?: string;
    description?: string;
    chords?: { name: string; root_semitones_from_C: number; quality: string }[];
  };

  try {
    parsed = JSON.parse(jsonStr) as typeof parsed;
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${jsonStr.slice(0, 200)}`);
  }

  const chords = parsed.chords ?? [];
  const rootOctave = Math.floor(rootMidi / 12);
  const rootPc = rootMidi % 12;

  const steps: HarmonicStep[] = chords.map((chord) => {
    const chordRootPc = ((chord.root_semitones_from_C % 12) + 12) % 12;
    const root = rootOctave * 12 + ((rootPc + chordRootPc) % 12);
    const intervals = CHORD_QUALITIES[chord.quality] ?? [0, 4, 7];
    const notes = intervals.map((s) => root + s);
    return {
      name: chord.name,
      notes,
      descriptions: `AI Gemini (${algorithm}): ${chord.quality} on ${NOTE_NAMES[chordRootPc]}`,
    };
  });

  return {
    id: `gemini-${Date.now()}`,
    title: parsed.title ?? `Gemini Etude (${algorithm})`,
    description: parsed.description ?? "AI-generated progression via Gemini on OpenRouter.",
    steps,
  };
}
