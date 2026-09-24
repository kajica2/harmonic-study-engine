/**
 * src/components/ExploreSurface.tsx - PRD-001 Phase 5 (REQ-EXP-1/2/10-13/15/20-22, REQ-IDEA-3).
 *
 * The real Explore surface (D98: LOCAL state only - seed text, parsed
 * seed, cards, vary input, history index; NO zustand change, NO
 * session version bump, DirtyMap.explore stays "none"; persistence is
 * explicit via Save -> hse.ideas).
 *
 * Ops matrix (D93): chord -> substitute + expand; progression ->
 * reharmonize(3) + first-chord substitute + voicelead(5 styles);
 * scale -> harmonized triads + modal tint + voicelead; interval ->
 * transposed realizations + voicelead; free -> preset chips only.
 *
 * The two DIRTY components stay IMPORTED and RENDERED with today's
 * props (READ-only - their files are never edited): the form chrome
 * below the cards grid is unchanged from the Phase 1 stub.
 *
 * Hear (D96): hearState mirrors composePreviewPlayer (one
 * subscription, StrictMode-safe); onHear calls hearIdeaCard (live-
 * gated click path); stop on unmount + on Send navigation.
 *
 * Crossover (D97/D97b): Send-to-Compose dogfoods parseChordChart +
 * buildChartSession + setComposeChart; Send-to-Etude carries
 * constraints (honestly labeled "Practice in this key", never a
 * literal transplant); Save mints an Idea via cardToIdea.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormPlanner } from "./FormPlanner";
import { FormTemplatePicker } from "./FormTemplatePicker";
import { planForm, MIN_PATH_BARS, MAX_PATH_BARS } from "../lib/formPlanner";
import { SeedPicker } from "./SeedPicker";
import { IdeaCard } from "./IdeaCard";
import { ConceptDrawer } from "./ConceptDrawer";
import { useSessionStore } from "../state/sessionStore";
import { DEFAULT_ETUDE_CONSTRAINTS } from "../lib/etudeEngine";
import {
  composePreviewPlayer,
  type PreviewState,
} from "../lib/composePreview";
import { hearIdeaCard } from "../lib/exploreHear";
import {
  parseExploreSeed,
  ideaToSeedText,
} from "../../engine/explore/seeds";
import type {
  ExploreSeed,
  IdeaCard as IdeaCardData,
  TechniqueToken,
} from "../../engine/explore/types";
import { substituteChord } from "../../engine/explore/substitute";
import { reharmonizeProgression } from "../../engine/explore/reharmonize";
import { expandChord } from "../../engine/explore/expand";
import {
  varyMelody,
  VARY_KINDS,
  type VaryKind,
} from "../../engine/explore/vary";
import {
  voiceLeadOptions,
  voiceLeadingGate,
  drop2Gate,
  VOICELEAD_ORDER,
} from "../../engine/explore/voicelead";
import {
  buildIdeaCards,
  cardToEtudeConstraints,
  cardToIdea,
  progressionToChartText,
  type CardItem,
} from "../../engine/explore/cards";
import type { SubstituteCandidate } from "../../engine/explore/types";
import {
  buildCellFromSymbol,
  parseChordSymbol,
} from "../../engine/compose/chordsym";
import {
  buildChartSession,
  parseChordChart,
} from "../../engine/compose/chordchart";
import type {
  ChordCell,
  KeyCandidate,
} from "../../engine/compose/types";
import { restCell } from "../../engine/compose/types";
import { spellChordName } from "../../engine/core/chords";
import { createRng, hashSeed } from "../../engine/core/rng";
import { getConcept } from "../../engine/pedagogy/concepts";
import { getStyleProfile } from "../../engine/styles/index";
import type { VoicingStyle } from "../../engine/styles/types";

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** C-major spelling default (documented; cards spell via D11 here). */
const DEFAULT_KEY: KeyCandidate = {
  tonicPc: 0,
  mode: "major",
  correlation: 0,
};

const SHORT_TECHNIQUE: Readonly<Record<TechniqueToken, string>> = {
  "tritone-sub": "tritone sub",
  "secondary-dominant": "V of next",
  "modal-interchange": "borrowed",
  "passing-diminished": "passing dim",
  extension: "wider",
  alteration: "altered",
  displacement: "displaced",
  inversion: "inverted",
  retrograde: "reversed",
  ornamentation: "ornamented",
  "voice-leading": "smooth",
  "drop-2": "drop 2",
  "diatonic-neighbor": "neighbor",
  original: "kept",
};

const STYLE_NAMES: Readonly<Record<VoicingStyle, string>> = {
  close: "Close",
  drop2: "Drop 2",
  quartal: "Quartal",
  spread: "Spread",
  block: "Block",
};

const VARY_LABEL: Readonly<Record<VaryKind, string>> = {
  displacement: "Displaced",
  inversion: "Inverted",
  retrograde: "Reversed",
  ornamentation: "Ornamented",
};

const VARY_RATIONALE: Readonly<Record<VaryKind, string>> = {
  displacement:
    "Pitch-order rotation (the pitch-only stand-in for rhythmic " +
    "displacement - TD-EXP-SLOT).",
  inversion:
    "Mirrored around the first pitch (out-of-range tones folded by " +
    "octave to stay in range).",
  retrograde: "Exact reversal of the seed pitches.",
  ornamentation:
    "Chromatic passing tones inserted where leaps exceed a whole step.",
};

/** Parse symbols to cells (unparseable -> rest, never throws). */
function cellsFor(symbols: readonly string[], key: KeyCandidate): ChordCell[] {
  return symbols.map((symbol) => {
    const parsed = parseChordSymbol(symbol);
    if (parsed === null) return restCell();
    return buildCellFromSymbol(parsed, key);
  });
}

function candidateItems(
  cands: readonly SubstituteCandidate[],
  origName: string,
  verb: string,
): CardItem[] {
  return cands.map((c) => ({
    label: `${c.cell.name} (${SHORT_TECHNIQUE[c.technique]})`,
    description: `${verb} ${origName} (honest: the label names what was computed).`,
    rationale: c.rationale,
    conceptId: c.conceptId,
    technique: c.technique,
    progression: [c.cell.name],
    chord: null,
    melody: null,
  }));
}

function chordCards(
  seedRaw: string,
  symbol: string,
  key: KeyCandidate,
): readonly IdeaCardData[] {
  const parsed = parseChordSymbol(symbol);
  if (parsed === null) return [];
  const orig = buildCellFromSymbol(parsed, key);
  const subs = substituteChord(orig, { next: null, key });
  const exps = expandChord(orig, key);
  return [
    ...buildIdeaCards(
      seedRaw,
      "substitute",
      candidateItems(subs, orig.name, "A substitution for"),
    ),
    ...buildIdeaCards(
      seedRaw,
      "expand",
      candidateItems(exps, orig.name, "A widening of"),
    ),
  ];
}

function reharmonizeCards(
  seedRaw: string,
  symbols: readonly string[],
  key: KeyCandidate,
  attempt: number,
): readonly IdeaCardData[] {
  const cells = cellsFor(symbols, key);
  if (cells.length === 0) return [];
  const alts = reharmonizeProgression(
    cells,
    key,
    createRng(hashSeed(`${seedRaw}|reharmonize|${attempt}`)),
    3,
  );
  return buildIdeaCards(
    seedRaw,
    "reharmonize",
    alts.map((alt, i) => {
      const changed = alt.filter((c) => c.technique !== "original");
      const first = changed[0];
      return {
        label: `Reharm ${i + 1} (${changed.length} of ${alt.length} bars)`,
        description: "An alternative harmonization of the seed progression.",
        rationale:
          changed.length > 0
            ? changed
                .slice(0, 2)
                .map((c) => c.rationale)
                .join(" ")
            : "No substitution drew a distinct bar; the seed stands.",
        conceptId: changed.map((c) => c.conceptId).find((c) => c !== null) ?? null,
        technique: first?.technique ?? "original",
        progression: alt.map((c) => (c.cell.isRest ? "-" : c.cell.name)),
        chord: null,
        melody: null,
      };
    }),
  );
}

function substituteFirstCards(
  seedRaw: string,
  symbols: readonly string[],
  key: KeyCandidate,
): readonly IdeaCardData[] {
  const cells = cellsFor(symbols, key);
  const idx = cells.findIndex((c) => !c.isRest);
  if (idx < 0) return [];
  const orig = cells[idx] as ChordCell;
  const cands = substituteChord(orig, {
    next: cells[idx + 1] ?? null,
    key,
  });
  return buildIdeaCards(
    seedRaw,
    "substitute",
    candidateItems(cands, orig.name, "A substitution for"),
  );
}

function voiceleadCards(
  seedRaw: string,
  symbols: readonly string[],
  key: KeyCandidate,
  attempt: number,
): readonly IdeaCardData[] {
  const cells = cellsFor(symbols, key).filter((c) => !c.isRest);
  if (cells.length === 0) return [];
  const profile = getStyleProfile("jazz");
  const { options, firstDrop2Bar } = voiceLeadOptions(
    cells,
    profile,
    profile.voicing.registers.chords,
    createRng(hashSeed(`${seedRaw}|voicelead|${attempt}`)),
  );
  return buildIdeaCards(
    seedRaw,
    "voicelead",
    VOICELEAD_ORDER.map((style) => {
      const pitches = options[style] ?? [];
      const sounding = pitches.filter(
        (p): p is readonly number[] => p !== null,
      );
      const vl = voiceLeadingGate(pitches);
      const d2 = sounding.some((p) => drop2Gate(p));
      const styleName = STYLE_NAMES[style];
      const flag = firstDrop2Bar[style] ?? null;
      return {
        label:
          style === "drop2" && flag !== null
            ? `Drop 2 (realized, bar ${flag})`
            : vl || (style === "drop2" && d2)
              ? `${styleName} voicing (realized)`
              : `${styleName} voicing`,
        description:
          `The seed voiced for ${styleName.toLowerCase()} (a re-skin ` +
          `of the compose voicing engine, no new math).`,
        rationale:
          `Realized ${sounding.length} chords in ${styleName.toLowerCase()} shape` +
          (vl ? " with mean voice motion at or under 4 semitones" : "") +
          (style === "drop2" && d2 ? " and a true drop-2 spread" : "") +
          ".",
        conceptId:
          style === "drop2" && d2
            ? "drop-2"
            : vl
              ? "voice-leading"
              : null,
        technique:
          style === "drop2" && d2
            ? ("drop-2" as const)
            : vl
              ? ("voice-leading" as const)
              : ("original" as const),
        progression: [...symbols],
        chord: null,
        melody: null,
      };
    }),
  );
}

// --- Scale harmonization (D93 honest op set) -------------------------------

const SCALE_PCS: Readonly<Record<string, readonly number[]>> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "major-pent": [0, 2, 4, 7, 9],
  "minor-pent": [0, 3, 5, 7, 10],
};

/** Scales whose home is major (borrowed-bVII tint is meaningful). */
const MAJOR_HOME: Readonly<Record<string, boolean>> = {
  ionian: true,
  lydian: true,
  mixolydian: true,
  "major-pent": true,
  chromatic: true,
};

/** Stacked-thirds triad or null (degrees that do not stack thirds are
 *  skipped, never mislabeled). */
function scaleTriad(
  rootPc: number,
  thirdPc: number,
  fifthPc: number,
  key: KeyCandidate,
): ChordCell | null {
  const thirdIv = mod12(thirdPc - rootPc);
  const fifthIv = mod12(fifthPc - rootPc);
  let quality: string | null = null;
  if (thirdIv === 4 && fifthIv === 7) quality = "maj";
  else if (thirdIv === 3 && fifthIv === 7) quality = "min";
  else if (thirdIv === 3 && fifthIv === 6) quality = "dim";
  if (quality === null) return null;
  return buildCellFromSymbol(
    { rootPc: mod12(rootPc), qualitySymbol: quality, bassPc: null },
    key,
  );
}

function scaleCards(
  seedRaw: string,
  rootPc: number,
  modeName: string,
  key: KeyCandidate,
): { main: readonly IdeaCardData[]; mainSymbols: readonly string[] } {
  const steps = SCALE_PCS[modeName] ?? SCALE_PCS.ionian ?? [0, 2, 4, 5, 7, 9, 11];
  const at = (degree: number): number =>
    mod12(rootPc + (steps[degree % steps.length] as number));
  const triads: { degree: string; cell: ChordCell }[] = [];
  const degrees: readonly { degree: string; idx: number }[] = [
    { degree: "i", idx: 0 },
    { degree: "iv", idx: 3 },
    { degree: "v", idx: 4 },
  ];
  for (const { degree, idx } of degrees) {
    const triad = scaleTriad(at(idx), at(idx + 2), at(idx + 4), key);
    if (triad !== null) triads.push({ degree, cell: triad });
  }
  if (triads.length === 0) return { main: [], mainSymbols: [] };
  const symbols = triads.map((t) => t.cell.name);
  const cards: IdeaCardData[] = [
    ...buildIdeaCards(seedRaw, "substitute", [
      {
        label: "Scale harmonized (i-iv-v)",
        description:
          `Diatonic triads stacked in thirds on ${triads.map((t) => t.degree).join(", ")} ` +
          `of the ${modeName} scale.`,
        rationale:
          triads.length === 3
            ? "All three degrees stack clean thirds."
            : "Degrees that do not stack thirds are skipped, never relabeled.",
        conceptId: null,
        technique: "original",
        progression: symbols,
        chord: null,
        melody: null,
      },
    ]),
  ];
  // Borrowed-bVII tint (major-home only; root verified non-diatonic
  // in the scale MECHANICALLY before the modal claim ships).
  if (MAJOR_HOME[modeName] === true) {
    const flatSeven = mod12(rootPc + 10);
    const scaleSet = new Set(steps.map((s) => mod12(rootPc + s)));
    if (!scaleSet.has(flatSeven)) {
      const tint = buildCellFromSymbol(
        { rootPc: flatSeven, qualitySymbol: "maj", bassPc: null },
        key,
      );
      cards.push(
        ...buildIdeaCards(seedRaw, "substitute", [
          {
            label: "Borrowed bVII tint",
            description:
              `A flat-seven major triad resolving to ${symbols[0]}.`,
            rationale:
              `${tint.name} borrows its root from outside the ${modeName} ` +
              `pitch set (parallel-mode color).`,
            conceptId: "modal-interchange",
            technique: "modal-interchange",
            progression: [tint.name, symbols[0] as string],
            chord: null,
            melody: null,
          },
        ]),
      );
    }
  }
  return { main: cards, mainSymbols: symbols };
}

// --- Interval realization (D93 honest op set) -------------------------------

function transposeSymbols(
  pcs: readonly number[],
  shift: number,
  key: KeyCandidate,
): readonly string[] {
  return pcs.map(
    (pc) =>
      buildCellFromSymbol(
        { rootPc: mod12(pc + shift), qualitySymbol: "maj", bassPc: null },
        key,
      ).name,
  );
}

function intervalCards(
  seedRaw: string,
  semitones: number,
  direction: "up" | "down",
  raw: string,
  key: KeyCandidate,
): { cards: readonly IdeaCardData[]; realized: readonly string[] } {
  const tonicName = spellChordName(key.tonicPc, "", key.tonicPc, key.mode);
  const base = [
    key.tonicPc,
    direction === "up"
      ? mod12(key.tonicPc + semitones)
      : mod12(key.tonicPc - semitones),
  ];
  const realized = transposeSymbols(base, 0, key);
  const upFifth = transposeSymbols(base, 7, key);
  const downSemi = transposeSymbols(base, -1, key);
  const cards = buildIdeaCards(seedRaw, "substitute", [
    {
      label: `${raw} from ${tonicName}`,
      description:
        `The interval realized as major triads from ${tonicName} ` +
        `(the surface-key tonic).`,
      rationale: "Concrete pitches for an abstract distance.",
      conceptId: null,
      technique: "original",
      progression: [...realized],
      chord: null,
      melody: null,
    },
    {
      label: `Up a fifth (${upFifth.join("-")})`,
      description: "The realization transposed up a perfect fifth.",
      rationale: "Same interval, new tonic a fifth above.",
      conceptId: null,
      technique: "original",
      progression: [...upFifth],
      chord: null,
      melody: null,
    },
    {
      label: `Down a semitone (${downSemi.join("-")})`,
      description: "The realization transposed down a semitone.",
      rationale: "Same interval, new tonic a semitone below.",
      conceptId: null,
      technique: "original",
      progression: [...downSemi],
      chord: null,
      melody: null,
    },
  ]);
  return { cards, realized };
}

// ---------------------------------------------------------------------------

export interface ExploreSurfaceProps {
  /** Optional override for the form bar count (defaults to mid-range). */
  barCount?: number;
  /** Optional className passthrough. */
  className?: string;
}

interface HistoryEntry {
  readonly seedText: string;
  readonly cards: readonly IdeaCardData[];
}

type SurfaceOp =
  | "substitute"
  | "expand"
  | "reharmonize"
  | "voicelead"
  | "harmonize"
  | "transpose";

function opsForSeed(seed: ExploreSeed | null): readonly SurfaceOp[] {
  if (seed === null) return [];
  switch (seed.kind) {
    case "chord":
      return ["substitute", "expand"];
    case "progression":
      return ["reharmonize", "substitute", "voicelead"];
    case "scale":
      return ["harmonize", "voicelead"];
    case "interval":
      return ["transpose", "voicelead"];
    case "free":
      return [];
  }
}

const OP_LABEL: Readonly<Record<SurfaceOp, string>> = {
  substitute: "Substitute",
  expand: "Expand",
  reharmonize: "Reharmonize",
  voicelead: "Voice-lead",
  harmonize: "Harmonize",
  transpose: "Transpose",
};

export const ExploreSurface: React.FC<ExploreSurfaceProps> = ({
  barCount,
  className = "",
}) => {
  const composeAnalysis = useSessionStore((s) => s.composeAnalysis);
  const etudeConstraints = useSessionStore((s) => s.etudeConstraints);

  const surfaceKey: KeyCandidate = useMemo(() => {
    const inferred = composeAnalysis?.key.candidates[0] ?? null;
    if (inferred !== undefined && inferred !== null) return inferred;
    if (etudeConstraints !== null) {
      return {
        tonicPc: etudeConstraints.key,
        mode: etudeConstraints.mode,
        correlation: 1,
      };
    }
    return DEFAULT_KEY;
  }, [composeAnalysis, etudeConstraints]);

  const [seedText, setSeedText] = useState("");
  const [seed, setSeed] = useState<ExploreSeed | null>(null);
  const [cards, setCards] = useState<readonly IdeaCardData[]>([]);
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [varyInput, setVaryInput] = useState<readonly number[] | null>(null);
  const [varyText, setVaryText] = useState("");
  const [conceptOpen, setConceptOpen] = useState<string | null>(null);
  const [hearState, setHearState] = useState<PreviewState>(() =>
    composePreviewPlayer.getState(),
  );
  const attemptsRef = useRef<Record<string, number>>({});
  const bootedRef = useRef(false);

  const pushHistory = (nextSeedText: string, nextCards: readonly IdeaCardData[]): void => {
    setHistory((prev) => {
      const base = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : [];
      const next = [...base, { seedText: nextSeedText, cards: nextCards }];
      return next.slice(-20);
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 19));
  };

  const attemptFor = (op: string): number => {
    const next = (attemptsRef.current[op] ?? 0) + 1;
    attemptsRef.current[op] = next;
    return next;
  };

  const runMatrix = useCallback(
    (parsed: ExploreSeed, key: KeyCandidate): readonly IdeaCardData[] => {
    switch (parsed.kind) {
      case "chord":
        return parsed.chord === null
          ? []
          : chordCards(parsed.raw, parsed.chord, key);
      case "progression": {
        if (parsed.progression === null) return [];
        const attempt = attemptFor("reharmonize");
        return [
          ...reharmonizeCards(parsed.raw, parsed.progression, key, attempt),
          ...substituteFirstCards(parsed.raw, parsed.progression, key),
          ...voiceleadCards(parsed.raw, parsed.progression, key, attempt),
        ];
      }
      case "scale": {
        if (parsed.scale === null) return [];
        const { main, mainSymbols } = scaleCards(
          parsed.raw,
          parsed.scale.rootPc,
          parsed.scale.modeName,
          key,
        );
        return [
          ...main,
          ...voiceleadCards(parsed.raw, mainSymbols, key, attemptFor("voicelead")),
        ];
      }
      case "interval": {
        if (parsed.interval === null) return [];
        const { cards: realized, realized: symbols } = intervalCards(
          parsed.raw,
          parsed.interval.semitones,
          parsed.interval.direction,
          parsed.raw,
          key,
        );
        return [
          ...realized,
          ...voiceleadCards(parsed.raw, symbols, key, attemptFor("voicelead")),
        ];
      }
      case "free":
        return [];
    }
    },
    [],
  );

  const commitSeed = (text: string): void => {
    const parsed = parseExploreSeed(text);
    setSeedText(text);
    setSeed(parsed);
    const next = runMatrix(parsed, surfaceKey);
    setCards(next);
    pushHistory(text, next);
  };

  const runOp = (op: SurfaceOp): void => {
    if (seed === null) return;
    const attempt = attemptFor(op);
    let next: readonly IdeaCardData[] = [];
    if (op === "substitute") {
      if (seed.kind === "chord" && seed.chord !== null) {
        next = chordCards(seed.raw, seed.chord, surfaceKey).filter((c) =>
          c.id.includes("substitute"),
        );
      } else if (seed.kind === "progression" && seed.progression !== null) {
        next = substituteFirstCards(seed.raw, seed.progression, surfaceKey);
      }
    } else if (op === "expand") {
      if (seed.kind === "chord" && seed.chord !== null) {
        next = chordCards(seed.raw, seed.chord, surfaceKey).filter((c) =>
          c.id.includes("expand"),
        );
      }
    } else if (op === "reharmonize") {
      if (seed.kind === "progression" && seed.progression !== null) {
        next = reharmonizeCards(seed.raw, seed.progression, surfaceKey, attempt);
      }
    } else if (op === "voicelead") {
      const symbols =
        seed.kind === "progression"
          ? seed.progression
          : seed.kind === "scale" && seed.scale !== null
            ? scaleCards(seed.raw, seed.scale.rootPc, seed.scale.modeName, surfaceKey).mainSymbols
            : seed.kind === "interval" && seed.interval !== null
              ? intervalCards(
                  seed.raw,
                  seed.interval.semitones,
                  seed.interval.direction,
                  seed.raw,
                  surfaceKey,
                ).realized
              : null;
      if (symbols !== null && symbols.length > 0) {
        next = voiceleadCards(seed.raw, symbols, surfaceKey, attempt);
      }
    } else if (op === "harmonize") {
      if (seed.kind === "scale" && seed.scale !== null) {
        next = scaleCards(
          seed.raw,
          seed.scale.rootPc,
          seed.scale.modeName,
          surfaceKey,
        ).main;
      }
    } else if (op === "transpose") {
      if (seed.kind === "interval" && seed.interval !== null) {
        next = intervalCards(
          seed.raw,
          seed.interval.semitones,
          seed.interval.direction,
          seed.raw,
          surfaceKey,
        ).cards;
      }
    }
    setCards(next);
    pushHistory(seedText, next);
  };

  // Boot from the current idea (one-shot, StrictMode-safe): the IdeaBar
  // carrier lands here via requestMode("explore").
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const idea = useSessionStore.getState().currentIdea;
    if (idea === null || idea === undefined) return;
    const text = ideaToSeedText(idea);
    if (text === "") return;
    const parsed = parseExploreSeed(text);
    setSeedText(text);
    setSeed(parsed);
    // Key at boot time (surfaceKey closes over the first render's
    // store snapshot - boot runs once, so read live state here).
    const s = useSessionStore.getState();
    const key =
      s.composeAnalysis?.key.candidates[0] ??
      (s.etudeConstraints !== null
        ? {
            tonicPc: s.etudeConstraints.key,
            mode: s.etudeConstraints.mode,
            correlation: 1 as const,
          }
        : DEFAULT_KEY);
    const built = runMatrix(parsed, key);
    setCards(built);
    setHistory([{ seedText: text, cards: built }]);
    setHistoryIndex(0);
    if (idea.melody !== null && idea.melody.length > 0) {
      setVaryInput([...idea.melody]);
      setVaryText(idea.melody.join(", "));
    }
    // Intentionally empty deps - boot resolution only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hear state mirror (one subscription, StrictMode-safe).
  useEffect(() => {
    const unsubscribe = composePreviewPlayer.subscribe(setHearState);
    setHearState(composePreviewPlayer.getState());
    return unsubscribe;
  }, []);

  // Stop any running audition on unmount (Send navigation stops
  // explicitly in each handler below).
  useEffect(() => {
    return () => {
      composePreviewPlayer.stop();
    };
  }, []);

  const goHistory = (delta: -1 | 1): void => {
    const next = historyIndex + delta;
    if (next < 0 || next >= history.length) return;
    const entry = history[next] as HistoryEntry;
    setHistoryIndex(next);
    setSeedText(entry.seedText);
    setSeed(parseExploreSeed(entry.seedText));
    setCards(entry.cards);
  };

  const handleHear = (card: IdeaCardData): void => {
    void hearIdeaCard(card, surfaceKey);
  };

  const handleStop = (): void => {
    composePreviewPlayer.stop();
  };

  const handleSendToCompose = (card: IdeaCardData): void => {
    if (card.progression === null || card.progression.length === 0) return;
    const text = progressionToChartText(card.progression, surfaceKey);
    const parsed = parseChordChart(text);
    if (!parsed.ok) {
      console.warn("[Explore] Send-to-Compose: chart parse failed, staying put");
      return;
    }
    const { project, analysis } = buildChartSession(parsed.value);
    const store = useSessionStore.getState();
    store.setComposeChart(text, project, analysis);
    composePreviewPlayer.stop();
    store.requestMode("compose");
  };

  const handleSendToEtude = (card: IdeaCardData): void => {
    const store = useSessionStore.getState();
    const base = store.etudeConstraints ?? DEFAULT_ETUDE_CONSTRAINTS;
    store.setEtudeConstraints(cardToEtudeConstraints(card, base));
    composePreviewPlayer.stop();
    store.requestMode("etude");
  };

  const handleSave = (card: IdeaCardData): void => {
    const store = useSessionStore.getState();
    store.setCurrentIdea(cardToIdea(card, "explore", Date.now()));
    store.saveCurrentIdea();
  };

  const applyVaryText = (): void => {
    const nums = varyText
      .split(/[\s,]+/)
      .map((t) => Number(t))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 127);
    if (nums.length === 0) {
      setVaryText(
        varyInput !== null && varyInput.length > 0
          ? varyInput.join(", ")
          : "",
      );
      return;
    }
    setVaryInput(nums);
  };

  const runVary = (kind: VaryKind): void => {
    if (varyInput === null || varyInput.length === 0) return;
    const varied = varyMelody(
      varyInput,
      kind,
      createRng(hashSeed(`${seedText}|vary|${kind}|${attemptFor("vary")}`)),
    );
    const [built] = buildIdeaCards(seedText === "" ? "vary" : seedText, "vary", [
      {
        label: `${VARY_LABEL[kind]} (${varied.length} notes)`,
        description: "A melodic variation of the seed line.",
        rationale: VARY_RATIONALE[kind],
        conceptId: null,
        technique: kind,
        progression: null,
        chord: null,
        melody: [...varied],
      },
    ]);
    if (built === undefined) return;
    const next = [...cards, built];
    setCards(next);
    pushHistory(seedText, next);
  };

  const useCardForVary = (card: IdeaCardData): void => {
    if (card.melody === null || card.melody.length === 0) return;
    setVaryInput([...card.melody]);
    setVaryText(card.melody.join(", "));
  };

  const effectiveBarCount =
    barCount ?? Math.floor((MIN_PATH_BARS + MAX_PATH_BARS) / 2);
  const planResult = planForm({ bars: effectiveBarCount, template: "aaba" });
  const plan = planResult.ok ? planResult.plan : null;
  const ops = opsForSeed(seed);

  return (
    <section
      role="region"
      aria-label="Explore mode"
      className={`flex flex-col gap-4 ${className}`}
    >
      <div
        className="surface-1 border border-[color:var(--color-border)] rounded-2xl p-4"
        data-testid="explore-seed"
      >
        <h2 className="text-sm font-semibold text-[color:var(--color-text-1)] mb-3">
          Explore a seed
        </h2>
        <SeedPicker
          value={seedText}
          onChange={setSeedText}
          onCommit={(parsed) => commitSeed(parsed.raw)}
          autoFocus={false}
        />
        {ops.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Explore operations">
            {ops.map((op) => (
              <button
                key={op}
                type="button"
                data-testid={`op-${op}`}
                onClick={() => runOp(op)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-[color:var(--color-border)] text-neutral-300 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
              >
                {OP_LABEL[op]}
              </button>
            ))}
          </div>
        )}
        {history.length > 1 && (
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              data-testid="explore-back"
              disabled={historyIndex <= 0}
              onClick={() => goHistory(-1)}
              className="px-2 py-1 rounded border border-[color:var(--color-border)] text-[11px] text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>
            <button
              type="button"
              data-testid="explore-forward"
              disabled={historyIndex >= history.length - 1}
              onClick={() => goHistory(1)}
              className="px-2 py-1 rounded border border-[color:var(--color-border)] text-[11px] text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Forward
            </button>
          </div>
        )}
      </div>

      {cards.length > 0 ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
          data-testid="explore-cards"
        >
          {cards.map((card) => (
            <div key={card.id} className="flex flex-col gap-1">
              <IdeaCard
                card={card}
                hearState={hearState}
                onHear={handleHear}
                onStop={handleStop}
                onSendToCompose={handleSendToCompose}
                onSendToEtude={handleSendToEtude}
                onSave={handleSave}
                conceptTitle={
                  card.conceptId === null
                    ? null
                    : getConcept(card.conceptId)?.title ?? null
                }
                onOpenConcept={setConceptOpen}
              />
              {card.melody !== null && card.melody.length > 0 && (
                <button
                  type="button"
                  data-testid={`vary-use-${card.id}`}
                  onClick={() => useCardForVary(card)}
                  className="self-start px-2 py-0.5 text-[11px] t-mono text-[color:var(--color-text-3)] hover:text-white"
                >
                  Use for vary
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p
          className="text-[11px] t-mono text-[color:var(--color-text-3)]"
          data-testid="explore-empty"
        >
          {seed === null || seed.kind === "free"
            ? "Pick a preset chip or type a seed - scales harmonize, intervals transpose."
            : "No cards for this seed yet."}
        </p>
      )}

      {varyInput !== null && varyInput.length > 0 && (
        <div
          className="surface-1 border border-[color:var(--color-border)] rounded-2xl p-4"
          data-testid="explore-vary"
        >
          <h2 className="text-sm font-semibold text-[color:var(--color-text-1)] mb-2">
            Vary a line
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              data-testid="explore-vary-input"
              aria-label="Vary input (MIDI pitches)"
              value={varyText}
              onChange={(e) => setVaryText(e.target.value)}
              onBlur={applyVaryText}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyVaryText();
              }}
              className="flex-1 min-w-40 bg-neutral-900 border border-[color:var(--color-border)] rounded px-2 py-1 text-xs t-mono text-[color:var(--color-text-1)] outline-none"
            />
            {VARY_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                data-testid={`vary-${kind}`}
                onClick={() => runVary(kind)}
                className="px-2.5 py-1 rounded border border-[color:var(--color-border)] text-[11px] text-neutral-300 hover:text-white"
              >
                {VARY_LABEL[kind]}
              </button>
            ))}
          </div>
        </div>
      )}

      <FormTemplatePicker
        activeId={null}
        onPick={() => {
          /* Explore keeps the form chrome read-only (no plan edits). */
        }}
      />
      <FormPlanner plan={plan} />
      {conceptOpen !== null && (
        <ConceptDrawer
          key={conceptOpen}
          conceptId={conceptOpen}
          onClose={() => setConceptOpen(null)}
        />
      )}
    </section>
  );
};
