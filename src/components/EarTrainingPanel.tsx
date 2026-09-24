/**
 * src/components/EarTrainingPanel.tsx - PRD-001 Phase 6 (REQ-PED-20/21/22/23/24/25, D104/D106/D108).
 *
 * Etude sub-mode SECTION (below EtudeComposerPanel, above EtudeViews):
 * LOCAL state only (D107): prompts/config/drawer local, SRS/log via
 * adapters OUTSIDE zustand. Training attempts NEVER touch dirty
 * (D106). Q10 copy: accuracy-% + streaks, NO XP/levels (D108).
 */

import React, { useEffect, useRef, useState } from "react";
import { createRng } from "../../engine/core/rng";
import { CONCEPT_IDS, getConcept } from "../../engine/pedagogy/concepts";
import { pickNextConcept } from "../../engine/pedagogy/srs";
import { generateEarPrompt } from "../../engine/ear-training/generate";
import { distractorsFor } from "../../engine/ear-training/distractors";
import { gradeEarAnswer, type EarGrade } from "../../engine/ear-training/check";
import type { EarDifficulty, EarOptions, EarPrompt, EarType } from "../../engine/ear-training/types";
import { isEarType } from "../../engine/ear-training/types";
import { hearEarPrompt } from "../lib/earHear";
import { composePreviewPlayer } from "../lib/composePreview";
import { loadSrs, recordReview } from "../lib/srsStore";
import { appendLog } from "../lib/pedagogyLog";
import { ConceptDrawer } from "./ConceptDrawer";

/**
 * MED-001 (REQ-PED-32): due concept -> drill type. Covers all 10
 * registry concepts; unmapped ids fall back to the interval drill
 * (never throws, never empty).
 */
const CONCEPT_TO_DRILL: Readonly<Record<string, EarType>> = {
  "ii-v-i": "progression",
  "tritone-sub": "chord-quality",
  "secondary-dominant": "progression",
  "modal-interchange": "scale",
  "voice-leading": "interval",
  "drop-2": "chord-inversion",
  cadence: "progression",
  "axis-progression": "progression",
  "walking-bass": "melodic-dictation",
  comping: "harmonic-dictation",
};

const EAR_TYPES: readonly EarType[] = [
  "interval",
  "chord-quality",
  "chord-inversion",
  "progression",
  "scale",
  "melodic-dictation",
  "harmonic-dictation",
];

const INTERVAL_POOL: readonly string[] = [
  "m2", "M2", "m3", "M3", "P4", "tritone", "P5", "m6", "M6", "m7", "M7", "aug",
];

const QUALITY_POOL: readonly string[] = [
  "maj", "min", "maj7", "m7", "dom7", "dim", "halfdim", "maj9", "dom9", "min9", "alt", "sus4", "maj6",
];

const INVERSION_POOL: readonly string[] = ["root", "1st", "2nd", "3rd"];

const SCALE_POOL: readonly string[] = [
  "major", "minor", "dorian", "mixolydian", "lydian", "phrygian", "locrian", "blues", "chromatic",
];

const PIANO_KEYS: readonly { label: string; token: string }[] = [
  { label: "C", token: "C" },
  { label: "C#", token: "C#" },
  { label: "D", token: "D" },
  { label: "D#", token: "D#" },
  { label: "E", token: "E" },
  { label: "F", token: "F" },
  { label: "F#", token: "F#" },
  { label: "G", token: "G" },
  { label: "G#", token: "G#" },
  { label: "A", token: "A" },
  { label: "A#", token: "A#" },
  { label: "B", token: "B" },
];

function poolFor(prompt: EarPrompt): readonly string[] {
  switch (prompt.type) {
    case "interval":
      return INTERVAL_POOL;
    case "chord-quality":
      return QUALITY_POOL;
    case "chord-inversion":
      return INVERSION_POOL;
    case "scale":
      return SCALE_POOL;
    case "progression":
      return [prompt.answerKey, "C G", "C F", "Dm7 G7 Cmaj7", "C7 F7 C7 G7"];
    default:
      return [];
  }
}

function isChoiceType(type: EarType): boolean {
  return (
    type === "interval" ||
    type === "chord-quality" ||
    type === "chord-inversion" ||
    type === "progression" ||
    type === "scale"
  );
}

function parseSeedText(raw: string): number {
  const n = Number(raw.trim());
  if (Number.isFinite(n) && raw.trim() !== "") return n >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function EarTrainingPanel(): React.ReactElement {
  const [earType, setEarType] = useState<EarType>("interval");
  const [difficulty, setDifficulty] = useState<EarDifficulty>(1);
  const [seedText, setSeedText] = useState("1");
  const [prompt, setPrompt] = useState<EarPrompt | null>(null);
  const [options, setOptions] = useState<EarOptions | null>(null);
  const [attempt, setAttempt] = useState("");
  const [grade, setGrade] = useState<EarGrade | null>(null);
  const [srsLine, setSrsLine] = useState<string | null>(null);
  const [hearState, setHearState] = useState(composePreviewPlayer.getState());
  const [drawerConceptId, setDrawerConceptId] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const promptShownAt = useRef<number>(0);

  useEffect(() => {
    const unsubscribe = composePreviewPlayer.subscribe(setHearState);
    setHearState(composePreviewPlayer.getState());
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      composePreviewPlayer.stop();
    };
  }, []);

  const showPrompt = (next: EarPrompt, seed: number): void => {
    setPrompt(next);
    setGrade(null);
    setSrsLine(null);
    setAttempt("");
    promptShownAt.current = Date.now();
    if (isChoiceType(next.type)) {
      const pool = poolFor(next);
      const distractors = distractorsFor(next.answerKey, pool, createRng(seed + 1), 3);
      const choices = [...distractors, next.answerKey];
      // Deterministic order: shuffle with a second handle so the
      // answer position is seeded, not random.
      const shuffled = createRng(seed + 2).shuffle(choices);
      setOptions({ prompt: next, choices: shuffled, correctIndex: shuffled.indexOf(next.answerKey) });
    } else {
      setOptions(null);
    }
  };

  const handleGenerate = (): void => {
    const seed = parseSeedText(seedText);
    const next = generateEarPrompt({ type: earType, difficulty, seed, rng: createRng(seed) });
    showPrompt(next, seed);
  };

  // MED-001: due-biased practice. Picks the most-overdue concept via
  // pickNextConcept, maps it to a drill, and generates that prompt.
  const handlePracticeDue = (): void => {
    const nowMs = Date.now();
    const winning = pickNextConcept(CONCEPT_IDS, loadSrs(), nowMs, createRng(nowMs >>> 0));
    const drill = CONCEPT_TO_DRILL[winning] ?? "interval";
    setEarType(drill);
    const seed = nowMs >>> 0;
    const next = generateEarPrompt({ type: drill, difficulty, seed, rng: createRng(seed) });
    showPrompt(next, seed);
  };

  const handleSubmit = (rawAttempt: string): void => {
    if (prompt === null) return;
    const g = gradeEarAnswer(prompt, rawAttempt);
    setGrade(g);
    const binary = g.correct ? 5 : 2;
    const nowMs = Date.now();
    const srs = recordReview(prompt.conceptId, binary as 2 | 5, nowMs);
    const durationSec = Math.max(0, Math.min(3600, (nowMs - promptShownAt.current) / 1000));
    appendLog({
      atMs: nowMs,
      mode: "ear",
      refId: prompt.id,
      outcome: g.partial !== null && !g.correct && (g.partial ?? 0) > 0 ? "partial" : g.correct ? "correct" : "incorrect",
      durationSec,
      conceptId: prompt.conceptId,
    });
    const nextTotal = totalCount + 1;
    const nextCorrect = correctCount + (g.correct ? 1 : 0);
    const nextStreak = g.correct ? streak + 1 : 0;
    setTotalCount(nextTotal);
    setCorrectCount(nextCorrect);
    setStreak(nextStreak);
    const due = srs.intervalDays <= 1 ? "due tomorrow" : `due in ${srs.intervalDays} days`;
    setSrsLine(`SRS ${srs.conceptId}: streak ${srs.streak}, ${due}`);
  };

  const handleHear = (): void => {
    if (prompt === null) return;
    void hearEarPrompt(prompt);
  };

  const accuracy = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
  const honestyLine = `${correctCount}/${totalCount} correct (${accuracy}%) - streak ${streak}`;
  const concept = prompt !== null ? getConcept(prompt.conceptId) : null;
  // PHASE-1-02 affordance honesty: shown always, disabled with a
  // tomorrow-title when nothing is due (no false affordance).
  const dueNowMs = Date.now();
  const dueSnapshot = loadSrs();
  const dueCount = CONCEPT_IDS.filter((id) => {
    const st = dueSnapshot[id];
    return st === undefined || st.lastSeenMs === 0 || st.nextDueMs <= dueNowMs;
  }).length;
  const nothingDue = dueCount === 0;

  return (
    <section aria-label="Ear training" data-testid="ear-section" className="flex flex-col gap-3 rounded border border-[color:var(--color-border)] p-4">
      <h2 className="t-h2 text-[color:var(--color-text-1)]">Ear training</h2>
      {prompt === null && (
        <p className="text-sm text-[color:var(--color-text-2)]">
          Hear a prompt, name what you heard, and build harmonic hearing. Try an example below - no progress is saved until your first answer.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-sm">
          Type
          <select
            aria-label="Ear type"
            value={earType}
            onChange={(e) => {
              const v = e.target.value;
              if (isEarType(v)) setEarType(v);
            }}
            data-testid="ear-type"
            className="rounded border border-[color:var(--color-border)] bg-black/20 px-1 py-0.5 text-sm"
          >
            {EAR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          Difficulty
          <select
            aria-label="Ear difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value) as EarDifficulty)}
            data-testid="ear-difficulty"
            className="rounded border border-[color:var(--color-border)] bg-black/20 px-1 py-0.5 text-sm"
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          Seed
          <input
            type="text"
            aria-label="Ear seed"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            data-testid="ear-seed"
            className="w-20 rounded border border-[color:var(--color-border)] bg-black/20 px-2 py-0.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={handleGenerate}
          data-testid="ear-generate"
          className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm"
        >
          Generate
        </button>
        <button
          type="button"
          onClick={handlePracticeDue}
          disabled={nothingDue}
          title={nothingDue ? "Nothing due - come back tomorrow" : `Practice due (${dueCount} due)`}
          data-testid="ear-practice-due"
          className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm disabled:opacity-50"
        >
          Practice due
        </button>
      </div>

      {prompt !== null && (
        <div className="flex flex-col gap-2" data-testid="ear-prompt">
          <p className="text-sm">{prompt.question}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleHear}
              data-testid="ear-hear"
              data-preview={hearState}
              className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm"
            >
              Hear prompt
            </button>
          </div>
          {options !== null ? (
            <div className="flex flex-wrap gap-2">
              {options.choices.map((choice, i) => (
                <button
                  key={`${choice}-${i}`}
                  type="button"
                  onClick={() => handleSubmit(choice)}
                  data-testid={`ear-option-${i}`}
                  className="rounded border border-[color:var(--color-border)] px-2 py-1 text-sm"
                >
                  {choice}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1" aria-label="On-screen piano">
                {PIANO_KEYS.map((k) => (
                  <button
                    key={k.label}
                    type="button"
                    aria-label={`Piano ${k.label}`}
                    onClick={() => setAttempt((prev) => (prev === "" ? k.token : `${prev} ${k.token}`))}
                    className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs"
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                Answer
                <input
                  type="text"
                  aria-label="Ear attempt"
                  value={attempt}
                  onChange={(e) => setAttempt(e.target.value)}
                  data-testid="ear-attempt"
                  className="w-64 rounded border border-[color:var(--color-border)] bg-black/20 px-2 py-0.5 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => handleSubmit(attempt)}
                data-testid="ear-submit"
                className="w-fit rounded border border-[color:var(--color-border)] px-3 py-1 text-sm"
              >
                Submit
              </button>
            </div>
          )}
        </div>
      )}

      {grade !== null && (
        <div className="flex flex-col gap-1">
          <p data-testid="ear-feedback" role="status" className="text-sm">
            {grade.detail}
          </p>
          {!grade.correct && concept !== null && (
            <button
              type="button"
              data-testid="ear-concept-offer"
              onClick={() => setDrawerConceptId(concept.id)}
              className="w-fit rounded border border-[color:var(--color-border)] px-2 py-1 text-xs underline"
            >
              {`What is ${concept.title}?`}
            </button>
          )}
        </div>
      )}

      <p data-testid="ear-streak" className="text-xs text-[color:var(--color-text-2)]">
        {honestyLine}
        {srsLine !== null ? ` - ${srsLine}` : ""}
      </p>

      {drawerConceptId !== null && (
        <ConceptDrawer key={drawerConceptId} conceptId={drawerConceptId} onClose={() => setDrawerConceptId(null)} />
      )}
    </section>
  );
}
