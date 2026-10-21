/**
 * Daily Study Mode — delivers a randomized practice session each day.
 * 
 * Features:
 * - Random tune from masterclass catalog
 * - Random voicing style (block/arpeggiated/block+arp/mono)
 * - Random drill pattern
 * - Persists for the day (same daily selection for all users)
 */

import React, { useMemo, useEffect, useState } from "react";
import { availableTunes, type MasterclassEntry } from "../data/masterclass";
import { ALL_PATHS, type HarmonicPath } from "../lib/paths";
import { Music, Zap, Clock, Shuffle } from "lucide-react";

type VoicingStyle = "block" | "arp" | "block_then_arp" | "mono";

interface DailyVariation {
  tune: MasterclassEntry;
  path: HarmonicPath;
  voicingStyle: VoicingStyle;
  drillPattern: "rhythm" | "scale" | "chordtones" | "arpeggios";
  seed: number;
}

/** Get deterministic daily seed from date */
function getDailySeed(): number {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/** Seeded random: mutates seed and returns 0-1 */
const seededRandom = (seed: number): (() => number) => {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
};

const VOICING_STYLES: VoicingStyle[] = ["block", "arp", "block_then_arp", "mono"];
const DRILL_PATTERNS: DailyVariation["drillPattern"][] = ["rhythm", "scale", "chordtones", "arpeggios"];

interface DailyStudyProps {
  onSelectTune: (pathId: string, voicingStyle: VoicingStyle) => void;
  onStartDrill: (pattern: DailyVariation["drillPattern"]) => void;
}

export const DailyStudy: React.FC<DailyStudyProps> = ({ onSelectTune, onStartDrill }) => {
  const [isLoading, setIsLoading] = useState(true);

  const dailyVariation = useMemo((): DailyVariation => {
    const seed = getDailySeed();
    const rng = seededRandom(seed);

    // Get available masterclass tunes (inApp: true)
    const tunes = availableTunes().filter((t: MasterclassEntry) => t.inApp);
    
    // Pick random tune
    const tune = tunes[Math.floor(rng() * tunes.length)];
    
    // Find the corresponding path
    const path = ALL_PATHS.find(p => p.id === tune.id) ?? ALL_PATHS[0];
    
    // Random voicing style
    const voicingStyle = VOICING_STYLES[Math.floor(rng() * VOICING_STYLES.length)];
    
    // Random drill pattern
    const drillPattern = DRILL_PATTERNS[Math.floor(rng() * DRILL_PATTERNS.length)];

    return {
      tune,
      path,
      voicingStyle,
      drillPattern,
      seed,
    };
  }, []);

  useEffect(() => {
    // Preload the path data
    setIsLoading(false);
  }, [dailyVariation.path.id]);

  // Voicing display labels
  const voicingLabel = dailyVariation.voicingStyle === "block" ? "Block Chords" 
    : dailyVariation.voicingStyle === "arp" ? "Arpeggiated"
    : dailyVariation.voicingStyle === "block_then_arp" ? "Block + Arp" 
    : "Single Note";

  // Drill display labels
  const drillLabel = dailyVariation.drillPattern === "rhythm" ? "Rhythm Drill (3× iteration)"
    : dailyVariation.drillPattern === "scale" ? "Scale Exercise"
    : dailyVariation.drillPattern === "chordtones" ? "Chord Tones"
    : "Arpeggio Patterns";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Clock size={20} className="text-[color:var(--color-brand)]" />
          <span className="text-xs font-mono text-[color:var(--color-text-3)] uppercase tracking-wider">
            Daily Study
          </span>
        </div>
        <h2 className="text-2xl font-bold text-[color:var(--color-text-1)] mb-1">
          Today's Practice
        </h2>
        <p className="text-sm text-[color:var(--color-text-3)]">
          {today}
        </p>
      </div>

      {/* Today's Selection Card */}
      <div className="bg-[color:var(--color-bg-2)] border border-[color:var(--color-border)] rounded-xl p-5 flex flex-col gap-4">
        
        {/* Tune */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[color:var(--color-brand)]/20 border border-[color:var(--color-brand)]/30">
            <Music size={20} className="text-[color:var(--color-brand-strong)]" />
          </div>
          <div>
            <p className="text-xs font-mono text-[color:var(--color-text-3)] uppercase tracking-wider">
              Tune
            </p>
            <p className="text-lg font-semibold text-[color:var(--color-text-1)]">
              {dailyVariation.tune.title}
            </p>
            {dailyVariation.tune.objective && (
              <p className="text-sm text-[color:var(--color-text-2)] mt-1">
                {dailyVariation.tune.objective}
              </p>
            )}
          </div>
        </div>

        {/* Voicing Style */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[color:var(--color-accent)]/20 border border-[color:var(--color-accent)]/30">
            <Shuffle size={20} className="text-[color:var(--color-accent)]" />
          </div>
          <div>
            <p className="text-xs font-mono text-[color:var(--color-text-3)] uppercase tracking-wider">
              Voicing Style
            </p>
            <p className="text-lg font-semibold text-[color:var(--color-text-1)]">
              {voicingLabel}
            </p>
          </div>
        </div>

        {/* Drill Pattern */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[color:var(--color-accent-2)]/20 border border-[color:var(--color-accent-2)]/30">
            <Zap size={20} className="text-[color:var(--color-accent-2)]" />
          </div>
          <div>
            <p className="text-xs font-mono text-[color:var(--color-text-3)] uppercase tracking-wider">
              Drill Pattern
            </p>
            <p className="text-lg font-semibold text-[color:var(--color-text-1)]">
              {drillLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => onSelectTune(dailyVariation.path.id, dailyVariation.voicingStyle)}
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-lg bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-strong)] text-[color:var(--color-text-inverse)] font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Music size={18} />
          Start Practice
        </button>
        
        <button
          onClick={() => onStartDrill(dailyVariation.drillPattern)}
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-lg border border-[color:var(--color-border)] hover:border-[color:var(--color-brand-strong)] text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Zap size={18} />
          Start Drill
        </button>
      </div>

      {/* Info */}
      <p className="text-xs text-center text-[color:var(--color-text-3)]">
        This selection changes daily at midnight. Come back tomorrow for a new variation.
      </p>
    </div>
  );
};
