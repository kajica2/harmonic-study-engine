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

// ---------------------------------------------------------------------------
// Extensible API Provider Registry
// Add new providers here. Each provider needs:
// - baseUrl: the API endpoint
// - model: the model identifier
// - keyEnv: env var name for the API key
// ---------------------------------------------------------------------------
export interface ApiProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  keyEnv: string;
  headers?: Record<string, string>;
}

export const API_PROVIDERS: ApiProvider[] = [
  // OpenRouter (gateway to many models: Gemini, MiniMax, etc.)
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: "google/gemini-2.5-flash",
    keyEnv: "VITE_OPENROUTER_API_KEY",
  },
  // x.ai Grok (direct API)
  {
    id: "grok",
    name: "x.ai Grok",
    baseUrl: "https://api.x.ai/v1/chat/completions",
    model: "grok-2-1212",
    keyEnv: "VITE_GROK_API_KEY",
  },
  // Google AI Studio (Gemini direct)
  {
    id: "google",
    name: "Google AI (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.0-flash",
    keyEnv: "VITE_GEMINI_API_KEY",
  },
  // Anthropic (Claude)
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1/messages",
    model: "claude-3-5-haiku-20241022",
    keyEnv: "VITE_ANTHROPIC_API_KEY",
    headers: {
      "anthropic-version": "2023-06-01",
    },
  },
  // Cohere
  {
    id: "cohere",
    name: "Cohere",
    baseUrl: "https://api.cohere.ai/v1/chat",
    model: "command-a-03-2025",
    keyEnv: "VITE_COHERE_API_KEY",
  },
  // Ollama (local/self-hosted)
  {
    id: "ollama",
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434/api/chat",
    model: "llama3",
    keyEnv: "VITE_OLLAMA_API_KEY",
  },
];

// Get provider by ID
export function getProvider(id: string): ApiProvider | undefined {
  return API_PROVIDERS.find(p => p.id === id);
}

// Get API key for provider from env
export function getProviderApiKey(provider: ApiProvider): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[provider.keyEnv];
}

// Check which providers have valid keys configured
export function getConfiguredProviders(): ApiProvider[] {
  return API_PROVIDERS.filter(p => {
    const key = getProviderApiKey(p);
    return key && key.trim().length > 0;
  });
}

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

// ---------------------------------------------------------------------------
// MiniMax etude generation via OpenRouter (minimax/minimax-01)
// ---------------------------------------------------------------------------
const MINIMAX_STYLES: Record<string, string> = {
  jazz:      "jazz harmony with ii-V-I progressions, tritone substitutions, and modal interchange",
  classical: "classical voice leading with smooth motion and functional harmony (Riemannian functions)",
  modern:    "modern chromatic harmony with upper structures, altered dominants, and planing",
  romantic:  "romantic-era rich seventh chords, augmented sixths, and lush modulations",
};

export async function generateMiniMaxEtude(
  rootMidi: number = 60,
  stepsCount: number = 16,
  apiKey: string,
  algorithm: string = "jazz",
): Promise<HarmonicPath> {
  const style = MINIMAX_STYLES[algorithm] ?? MINIMAX_STYLES.jazz;

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
        model: "minimax/minimax-01",
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
    choices?: { message?: { content: string } }[];
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
    throw new Error(`Failed to parse MiniMax response as JSON: ${jsonStr.slice(0, 200)}`);
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
      descriptions: `AI MiniMax (${algorithm}): ${chord.quality} on ${NOTE_NAMES[chordRootPc]}`,
    };
  });

  return {
    id: `minimacx-${Date.now()}`,
    title: parsed.title ?? `MiniMax Etude (${algorithm})`,
    description: parsed.description ?? "AI-generated progression via MiniMax-01 on OpenRouter.",
    steps,
  };
}

// ---------------------------------------------------------------------------
// Grok etude generation via x.ai API (direct, not via OpenRouter)
// ---------------------------------------------------------------------------
const GROK_STYLES: Record<string, string> = {
  jazz:      "jazz harmony with ii-V-I progressions, tritone substitutions, and modal interchange",
  classical: "classical voice leading with smooth motion and functional harmony (Riemannian functions)",
  modern:    "modern chromatic harmony with upper structures, altered dominants, and planing",
  romantic:  "romantic-era rich seventh chords, augmented sixths, and lush modulations",
};

export async function generateGrokEtude(
  rootMidi: number = 60,
  stepsCount: number = 16,
  apiKey: string,
  algorithm: string = "jazz",
): Promise<HarmonicPath> {
  const style = GROK_STYLES[algorithm] ?? GROK_STYLES.jazz;

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
    `https://api.x.ai/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-2-1212",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
        temperature: 0.8,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`x.ai API error ${response.status}: ${text}`);
  }

  const data = await response.json() as {
    choices?: { message?: { content: string } }[];
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
    throw new Error(`Failed to parse Grok response as JSON: ${jsonStr.slice(0, 200)}`);
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
      descriptions: `AI Grok (${algorithm}): ${chord.quality} on ${NOTE_NAMES[chordRootPc]}`,
    };
  });

  return {
    id: `grok-${Date.now()}`,
    title: parsed.title ?? `Grok Etude (${algorithm})`,
    description: parsed.description ?? "AI-generated progression via Grok-2 on x.ai.",
    steps,
  };
}

// ---------------------------------------------------------------------------
// Generic provider-based etude generation
// Supports: Google, Anthropic, Cohere, Ollama via unified API
// ---------------------------------------------------------------------------
const PROVIDER_STYLES: Record<string, string> = {
  jazz:      "jazz harmony with ii-V-I progressions, tritone substitutions, and modal interchange",
  classical: "classical voice leading with smooth motion and functional harmony (Riemannian functions)",
  modern:    "modern chromatic harmony with upper structures, altered dominants, and planing",
  romantic:  "romantic-era rich seventh chords, augmented sixths, and lush modulations",
};

function buildEtudePrompt(stepsCount: number, style: string): string {
  return `You are a jazz and harmony expert. Generate a chord progression of exactly ${stepsCount} chords.
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
}

interface ProviderApiConfig {
  id: string;
  baseUrl: string;
  model: string;
  buildHeaders: (key: string) => Record<string, string>;
  buildBody: (model: string, prompt: string) => Record<string, unknown>;
  parseResponse: (data: unknown) => string;
}

const PROVIDER_CONFIGS: Record<string, ProviderApiConfig> = {
  google: {
    id: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.0-flash",
    buildHeaders: (key) => ({
      "Content-Type": "application/json",
    }),
    buildBody: (model, prompt) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
      temperature: 0.8,
    }),
    parseResponse: (data: unknown) => {
      const d = data as { choices?: { message?: { content: string } }[] };
      return d.choices?.[0]?.message?.content ?? "";
    },
  },
  anthropic: {
    id: "anthropic",
    baseUrl: "https://api.anthropic.com/v1/messages",
    model: "claude-3-5-haiku-20241022",
    buildHeaders: (key) => ({
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
    buildBody: (model, prompt) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
      temperature: 0.8,
    }),
    parseResponse: (data: unknown) => {
      const d = data as { content?: { text: string }[] };
      return d.content?.[0]?.text ?? "";
    },
  },
  cohere: {
    id: "cohere",
    baseUrl: "https://api.cohere.ai/v1/chat",
    model: "command-a-03-2025",
    buildHeaders: (key) => ({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    }),
    buildBody: (model, prompt) => ({
      model,
      message: prompt,
      max_tokens: 2048,
      temperature: 0.8,
    }),
    parseResponse: (data: unknown) => {
      const d = data as { text?: string };
      return d.text ?? "";
    },
  },
  ollama: {
    id: "ollama",
    baseUrl: "http://localhost:11434/api/chat",
    model: "llama3",
    buildHeaders: () => ({
      "Content-Type": "application/json",
    }),
    buildBody: (model, prompt) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
    parseResponse: (data: unknown) => {
      const d = data as { message?: { content: string } };
      return d.message?.content ?? "";
    },
  },
};

export async function generateProviderEtude(
  providerId: string,
  rootMidi: number = 60,
  stepsCount: number = 16,
  apiKey: string,
  algorithm: string = "jazz",
): Promise<HarmonicPath> {
  const config = PROVIDER_CONFIGS[providerId];
  if (!config) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const style = PROVIDER_STYLES[algorithm] ?? PROVIDER_STYLES.jazz;
  const prompt = buildEtudePrompt(stepsCount, style);

  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: config.buildHeaders(apiKey),
    body: JSON.stringify(config.buildBody(config.model, prompt)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${providerId} API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const raw = config.parseResponse(data);

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
    throw new Error(`Failed to parse ${providerId} response as JSON: ${jsonStr.slice(0, 200)}`);
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
      descriptions: `AI ${providerId} (${algorithm}): ${chord.quality} on ${NOTE_NAMES[chordRootPc]}`,
    };
  });

  return {
    id: `${providerId}-${Date.now()}`,
    title: parsed.title ?? `${providerId} Etude (${algorithm})`,
    description: parsed.description ?? `AI-generated progression via ${providerId}.`,
    steps,
  };
}
