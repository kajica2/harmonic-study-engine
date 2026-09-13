/**
 * src/components/QuizPanel.tsx — multiple-choice quiz for music theory.
 *
 * Curated-first per user decision 2026-09-13:
 *   1. Look up (pathId, stepIndex) in src/data/quizzes/<topic>.json
 *   2. Fall back to generateQuiz from src/lib/quizEngine
 *
 * MVP: uses curated JSON for known topics; auto-gen fills gaps.
 * Tracks correct/total in useSessionStore.quizScore.
 */

import React, { useMemo, useState } from "react";
import { Check, X, Brain } from "lucide-react";
import romanNumeralQuizzes from "../data/quizzes/roman-numerals.json";
import tensionQuizzes from "../data/quizzes/tensions.json";
import voiceLeadingQuizzes from "../data/quizzes/voice-leading.json";
import modulationsQuizzes from "../data/quizzes/modulations.json";
import formQuizzes from "../data/quizzes/form.json";
import { generateQuiz } from "../lib/quizEngine";

type QuizTopic = "roman-numerals" | "tensions" | "voice-leading" | "modulations" | "form";

const CURATED: Record<QuizTopic, Array<{
  id: string;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
}>> = {
  "roman-numerals": romanNumeralQuizzes as any,
  "tensions": tensionQuizzes as any,
  "voice-leading": voiceLeadingQuizzes as any,
  "modulations": modulationsQuizzes as any,
  "form": formQuizzes as any,
};

interface QuizPanelProps {
  pathId: string;
  stepIndex: number;
  topic: QuizTopic;
  /** Optional: deterministic seed for auto-gen. Default 1. */
  seed?: number;
  /** When user answers, called with (wasCorrect, correct, total). */
  onAnswer?: (wasCorrect: boolean, correct: number, total: number) => void;
  /** Optional: pass current score from session for display. */
  score?: { correct: number; total: number };
}

export const QuizPanel: React.FC<QuizPanelProps> = ({
  pathId,
  stepIndex,
  topic,
  seed = 1,
  onAnswer,
  score,
}) => {
  // Pick a curated question deterministically from the topic, OR
  // fall back to generateQuiz.
  const question = useMemo(() => {
    const pool = CURATED[topic];
    if (pool && pool.length > 0) {
      const idx = (hashStr(`${pathId}:${stepIndex}`) + seed) % pool.length;
      return pool[idx];
    }
    return generateQuiz({ pathId, stepIndex, seed });
  }, [pathId, stepIndex, topic, seed]);

  const [picked, setPicked] = useState<number | null>(null);

  function answer(idx: number) {
    setPicked(idx);
    onAnswer?.(idx === question.correct, (score?.correct ?? 0) + (idx === question.correct ? 1 : 0), (score?.total ?? 0) + 1);
  }

  return (
    <section
      role="region"
      aria-label={`Quiz: ${topic}`}
      className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 flex flex-col gap-2"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 flex items-center gap-1">
          <Brain size={11} aria-hidden="true" />
          Quiz · {topic.replace(/-/g, " ")}
        </span>
        {score && (
          <span className="text-[10px] font-mono text-neutral-500">
            {score.correct}/{score.total}
          </span>
        )}
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[12px] font-mono text-neutral-200 mb-1">
          {question.prompt}
        </legend>
        <div role="radiogroup" aria-label="Answer choices">
          {question.options.map((opt, idx) => {
            const isPicked = picked === idx;
            const isCorrect = picked !== null && idx === question.correct;
            const isWrong = isPicked && idx !== question.correct;
            return (
              <button
                key={`${question.id}-${idx}`}
                type="button"
                role="radio"
                aria-checked={isPicked}
                disabled={picked !== null}
                onClick={() => answer(idx)}
                className={`text-left text-[11px] font-mono px-2 py-1 rounded border transition-colors ${
                  isCorrect
                    ? "border-emerald-600/70 bg-emerald-900/30 text-emerald-100"
                    : isWrong
                      ? "border-red-700/70 bg-red-950/30 text-red-100"
                      : picked !== null
                        ? "border-neutral-800 bg-neutral-900/40 text-neutral-500"
                        : "border-neutral-800 bg-neutral-900/40 text-neutral-200 hover:bg-neutral-800"
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  {isCorrect && <Check size={10} aria-hidden="true" />}
                  {isWrong && <X size={10} aria-hidden="true" />}
                  {opt}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {picked !== null && question.explanation && (
        <p className="text-[10px] font-mono text-neutral-400 leading-snug">{question.explanation}</p>
      )}
    </section>
  );
};

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
