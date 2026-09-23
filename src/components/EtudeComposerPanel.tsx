/**
 * EtudeComposerPanel.tsx - PRD-001 Phase 3 Slice 2 (D22/D29/D30,
 * REQ-ETU-1/2/4).
 *
 * Full-width AppMain section on the Etude surface (after the
 * PlaySessionRail). The legacy Etude Assistant in the Generator Lab
 * fold COEXISTS untouched (D22) - this is the deterministic,
 * constraint-driven P0 entry point.
 *
 * State ownership (D23): the DRAFT lives here (local useState, never
 * in the store, never in the URL). Committed constraints arrive via
 * the `committed` prop (store echo / boot URL) and re-seed the draft
 * only when the canonical identity differs - the accept echo is a
 * no-op on a draft the user just generated.
 *
 * Gating (D29): Generate is enabled ONLY when
 * validateEtudeConstraints(draft).ok AND feasibilityOf(draft) ===
 * null. Any feasibility string disables it and is surfaced inline
 * (title + aria-describedby on the button + the role="status" line)
 * - never a bare disabled affordance (PHASE-1-02). Randomize shares
 * the SAME gate (MED-001 fix round): it generates immediately, so a
 * blocked draft disables the button AND short-circuits the handler -
 * never a silent seed-only no-op.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  validateEtudeConstraints,
  type EtudeConstraints,
} from "../../engine/etude/types";
import { feasibilityOf } from "../../engine/etude/assemble";
import { deriveCanonicalId } from "../../engine/core/ids";
import { parseKey, spellTonic } from "../../engine/core/spelling";
import { shippedStyleIds } from "../../engine/styles/index";
import {
  DEFAULT_ETUDE_CONSTRAINTS,
} from "../lib/etudeEngine";
import { StageFrame } from "./StageFrame";

export interface EtudeComposerPanelProps {
  /** Store value: seeds the draft on boot / URL restore / accept echo. */
  committed: EtudeConstraints | null;
  /** Status line: "<title> (seed N)" or null when nothing is loaded. */
  loadedTitle: string | null;
  onAccept: (
    constraints: EtudeConstraints,
    origin: "generate" | "reroll",
  ) => void;
  /** Optional "MusicXML (with melody)" download trigger (D27); the
   *  button renders only when provided AND an etude is loaded. */
  onDownloadMusicXml?: () => void;
}

const KEY_OPTIONS: readonly string[] = Array.from({ length: 12 }, (_, pc) =>
  spellTonic(pc, "major", ""),
);

const inputClass =
  "bg-transparent text-xs text-[color:var(--color-text-1)] outline-none px-1 py-1 border border-[color:var(--color-border)] rounded-[var(--radius-sm)]";

function constraintsKey(c: EtudeConstraints): string {
  // Order-independent identity (canonicalize sorts keys) - the
  // committed-sync comparison per the risk table.
  return deriveCanonicalId("etu", c.seed, c);
}

export function EtudeComposerPanel({
  committed,
  loadedTitle,
  onAccept,
  onDownloadMusicXml,
}: EtudeComposerPanelProps): React.ReactElement {
  const [draft, setDraft] = useState<EtudeConstraints>(
    () => committed ?? DEFAULT_ETUDE_CONSTRAINTS,
  );
  const lastCommittedKey = useRef<string | null>(
    committed ? constraintsKey(committed) : null,
  );

  // Echo-sync: re-seed the draft when the COMMITTED identity changes
  // (boot URL, another tab's accept). Reference-blind by design - the
  // accept echo carries the same canonicalId as the draft that
  // produced it, so the user's mid-edit state is never stomped.
  useEffect(() => {
    const key = committed ? constraintsKey(committed) : null;
    if (key === lastCommittedKey.current) return;
    lastCommittedKey.current = key;
    if (committed) setDraft(committed);
  }, [committed]);

  const validation = validateEtudeConstraints(draft);
  const feasibility = validation.ok ? feasibilityOf(draft) : null;
  const blockingMessage = validation.ok
    ? feasibility
    : validation.errors[0] ?? "Invalid constraints";
  const canGenerate = validation.ok && feasibility === null;

  const patch = useCallback(
    (over: Partial<EtudeConstraints>) => {
      setDraft((d) => ({ ...d, ...over }));
    },
    [],
  );
  const patchHarmony = useCallback(
    (over: Partial<EtudeConstraints["harmony"]>) => {
      setDraft((d) => ({ ...d, harmony: { ...d.harmony, ...over } }));
    },
    [],
  );
  const patchMelody = useCallback(
    (over: Partial<EtudeConstraints["melody"]>) => {
      setDraft((d) => ({ ...d, melody: { ...d.melody, ...over } }));
    },
    [],
  );
  const patchRhythm = useCallback(
    (over: Partial<EtudeConstraints["rhythm"]>) => {
      setDraft((d) => ({ ...d, rhythm: { ...d.rhythm, ...over } }));
    },
    [],
  );

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    onAccept(draft, "generate");
  }, [canGenerate, draft, onAccept]);

  const handleReroll = useCallback(() => {
    // REVIEWER MED-001 (fix round): Randomize generates IMMEDIATELY,
    // so it must honor the same D29 gate as Generate. Without this,
    // an invalid draft updated the seed but loaded nothing - a silent
    // no-op (PHASE-1-02 anti-pattern). The button below mirrors the
    // disabled + title state.
    if (!canGenerate) return;
    const seed = (Math.random() * 0x100000000) >>> 0;
    const next: EtudeConstraints = { ...draft, seed };
    setDraft(next);
    onAccept(next, "reroll");
  }, [canGenerate, draft, onAccept]);

  const statusId = "etude-composer-status";
  const statusText =
    loadedTitle !== null
      ? `Loaded: ${loadedTitle}`
      : blockingMessage ?? "Ready to generate.";

  return (
    <StageFrame
      eyebrow="PRD-001 Phase 3"
      title="Etude Composer"
      meta={loadedTitle ?? undefined}
      accent
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="t-label text-[color:var(--color-text-3)]">Style</span>
            <select
              aria-label="Etude style"
              className={inputClass}
              value={draft.styleId}
              onChange={(e) =>
                patch({ styleId: e.target.value as EtudeConstraints["styleId"] })
              }
            >
              {shippedStyleIds().map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-label text-[color:var(--color-text-3)]">Key</span>
            <select
              aria-label="Etude key"
              className={inputClass}
              value={spellTonic(draft.key, "major", "")}
              onChange={(e) => {
                const parsed = parseKey(e.target.value);
                if (parsed) patch({ key: parsed.tonicPc });
              }}
            >
              {KEY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-label text-[color:var(--color-text-3)]">Mode</span>
            <select
              aria-label="Tonal mode"
              className={inputClass}
              value={draft.mode}
              onChange={(e) =>
                patch({ mode: e.target.value === "minor" ? "minor" : "major" })
              }
            >
              <option value="major">major</option>
              <option value="minor">minor</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-label text-[color:var(--color-text-3)]">Difficulty</span>
            <select
              aria-label="Difficulty"
              className={inputClass}
              value={draft.difficulty}
              onChange={(e) =>
                patch({
                  difficulty: Number(e.target.value) as EtudeConstraints["difficulty"],
                })
              }
            >
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-label text-[color:var(--color-text-3)]">Bars</span>
            <input
              aria-label="Bars"
              type="number"
              min={4}
              max={32}
              step={1}
              className={`${inputClass} w-16`}
              value={draft.bars}
              onChange={(e) => patch({ bars: Number(e.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-label text-[color:var(--color-text-3)]">Tempo</span>
            <span className="flex items-center gap-1.5">
              <input
                aria-label="Use style default tempo"
                type="checkbox"
                checked={draft.tempo === null}
                onChange={(e) =>
                  patch({ tempo: e.target.checked ? null : 120 })
                }
              />
              <span className="text-[10px] text-[color:var(--color-text-3)]">
                auto
              </span>
              <input
                aria-label="Tempo BPM"
                type="number"
                min={40}
                max={300}
                step={1}
                disabled={draft.tempo === null}
                className={`${inputClass} w-16`}
                value={draft.tempo ?? ""}
                onChange={(e) => patch({ tempo: Number(e.target.value) })}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-label text-[color:var(--color-text-3)]">Seed</span>
            <span className="flex items-center gap-1.5">
              <input
                aria-label="Seed"
                type="number"
                min={0}
                step={1}
                className={`${inputClass} w-28`}
                value={draft.seed}
                onChange={(e) => patch({ seed: Number(e.target.value) })}
              />
              <button
                type="button"
                aria-label="Randomize seed"
                onClick={handleReroll}
                disabled={!canGenerate}
                title={
                  blockingMessage ??
                  "Roll a new random seed and generate immediately"
                }
                aria-describedby={canGenerate ? undefined : statusId}
                className="px-2 py-1 rounded-[var(--radius-sm)] text-xs font-mono border border-[color:var(--color-border)] text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] hover:bg-[color:var(--color-bg-2)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Randomize
              </button>
            </span>
          </label>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            title={blockingMessage ?? "Generate and load this etude"}
            aria-describedby={canGenerate ? undefined : statusId}
            className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-mono bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate etude
          </button>

          {loadedTitle !== null && onDownloadMusicXml && (
            <button
              type="button"
              onClick={onDownloadMusicXml}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-mono border border-emerald-800/50 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/50"
              title="Download MusicXML with the melody as a second part (opens in MuseScore)"
            >
              MusicXML (with melody)
            </button>
          )}
        </div>

        <details className="surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-md)] px-3 py-2">
          <summary
            aria-label="Advanced etude constraints"
            className="text-xs t-mono text-[color:var(--color-text-3)] cursor-pointer hover:text-[color:var(--color-text-1)] select-none list-none flex items-center gap-1"
          >
            <span className="text-[color:var(--color-text-2)]">&gt;</span>
            <span>Advanced</span>
            <span className="text-[10px] text-[color:var(--color-text-3)] ml-1">
              start/end chords - chromaticism - rhythm - melody shape
            </span>
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="t-label text-[color:var(--color-text-3)]">Start on</span>
              <input
                aria-label="Start on numeral"
                type="text"
                placeholder="e.g. ii7"
                className={inputClass}
                value={draft.harmony.startOn ?? ""}
                onChange={(e) =>
                  patchHarmony({ startOn: e.target.value.trim() === "" ? null : e.target.value.trim() })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="t-label text-[color:var(--color-text-3)]">End on</span>
              <input
                aria-label="End on numeral"
                type="text"
                placeholder="e.g. I"
                className={inputClass}
                value={draft.harmony.endOn ?? ""}
                onChange={(e) =>
                  patchHarmony({ endOn: e.target.value.trim() === "" ? null : e.target.value.trim() })
                }
              />
            </label>
            <label className="flex items-center gap-1.5 pb-1">
              <input
                aria-label="Require chromatic chord"
                type="checkbox"
                checked={draft.harmony.requireChromaticism}
                onChange={(e) =>
                  patchHarmony({ requireChromaticism: e.target.checked })
                }
              />
              <span className="text-xs text-[color:var(--color-text-2)]">
                Require chromaticism
              </span>
            </label>
            <label className="flex items-center gap-1.5 pb-1">
              <input
                aria-label="Straight rhythms only"
                type="checkbox"
                checked={draft.rhythm.straightRhythmsOnly}
                onChange={(e) =>
                  patchRhythm({ straightRhythmsOnly: e.target.checked })
                }
              />
              <span className="text-xs text-[color:var(--color-text-2)]">
                Straight rhythms only
              </span>
            </label>
            <label className="flex items-center gap-1.5 pb-1">
              <input
                aria-label="Chord tones on strong beats"
                type="checkbox"
                checked={draft.melody.chordTonesOnStrongBeats}
                onChange={(e) =>
                  patchMelody({ chordTonesOnStrongBeats: e.target.checked })
                }
              />
              <span className="text-xs text-[color:var(--color-text-2)]">
                Chord tones on strong beats
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="t-label text-[color:var(--color-text-3)]">
                Max interval (st)
              </span>
              <input
                aria-label="Max melody interval semitones"
                type="number"
                min={1}
                max={24}
                step={1}
                placeholder="profile"
                className={`${inputClass} w-20`}
                value={draft.melody.maxIntervalSemitones ?? ""}
                onChange={(e) =>
                  patchMelody({
                    maxIntervalSemitones:
                      e.target.value.trim() === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <p className="mt-2 text-[10px] text-[color:var(--color-text-3)]">
            Not yet exposed: allowedQualities, allowedNumerals, melody
            range (D29 deferral - the engine treats them as
            unrestricted).
          </p>
        </details>

        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className="text-xs font-mono text-[color:var(--color-text-2)]"
        >
          {statusText}
        </p>
      </div>
    </StageFrame>
  );
}
