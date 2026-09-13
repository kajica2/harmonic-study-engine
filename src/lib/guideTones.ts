/**
 * src/lib/guideTones.ts — pure classifier for incoming MIDI notes
 * against the active chord. Used by the practice-loop guide-tone
 * feedback component.
 *
 * Given the chord's notes (e.g. [60, 64, 67, 70] for Cm7) and an
 * incoming MIDI note from the player's EWI / MIDI keyboard, return
 * the role the played note plays in the chord (root, third, fifth,
 * seventh, ninth, color tone, off).
 *
 * Pure function — no React, no MIDI, no DOM. Easy to unit-test.
 */

import { analyzeChord, type ChordAnalysis } from "./theory";

export type GuideToneRole =
  | "root"
  | "third"
  | "fifth"
  | "seventh"
  | "ninth"
  | "color"
  | "off";

export interface GuideToneMatch {
  role: GuideToneRole;
  /** Human-readable label for the role (e.g. "3rd", "9th", "color tone"). */
  label: string;
  /** True when the played note is a "guide tone" (3rd or 7th). */
  isGuideTone: boolean;
  /** True when the played note is in the chord at all. */
  inChord: boolean;
  /** Display string for the role on sus paths where the 3rd is omitted. */
  note?: "omitted";
}

const ROLE_LABEL: Record<GuideToneRole, string> = {
  root: "root",
  third: "3rd",
  fifth: "5th",
  seventh: "7th",
  ninth: "9th",
  color: "color tone",
  off: "off",
};

/**
 * Classify a played MIDI note against the chord's notes.
 *
 * Algorithm:
 *   1. De-duplicate chord notes + sort ascending.
 *   2. Reduce to pitch classes (mod 12) so a 3rd in any octave
 *      counts as the 3rd.
 *   3. Walk the lowest 4 notes' intervals from the bass to assign
 *      roles by position: bass → root, 2nd → 3rd, 3rd → 5th,
 *      4th → 7th. Notes above the 4th are tensions (9th, etc.).
 *   4. Match the played note's pitch class against the chord's
 *      pitch classes; report the role of the first match.
 *   5. If the chord's 3rd is absent (sus chord), the 2nd slot is
 *      "omitted" — a 4th or 2nd in that slot gets classified
 *      as 11th/sus4 or sus2 instead.
 *
 * Returns the role + a structured result for the UI to render.
 */
export function classifyGuideTone(
  playedMidi: number,
  chordNotes: number[],
  analysis?: ChordAnalysis,
): GuideToneMatch {
  const fallback: ChordAnalysis =
    analysis ?? analyzeChord(chordNotes.length > 0 ? chordNotes : []);

  const sorted = [...new Set(chordNotes)].sort((a, b) => a - b);
  const playedPc = ((playedMidi % 12) + 12) % 12;

  if (sorted.length === 0) {
    return {
      role: "off",
      label: ROLE_LABEL.off,
      isGuideTone: false,
      inChord: false,
    };
  }

  // Pitch-class set of the chord
  const chordPcs = new Set(sorted.map((n) => ((n % 12) + 12) % 12));
  const inChord = chordPcs.has(playedPc);

  // Build the slot → role mapping from the chord's notes. We use
  // pitch classes relative to the bass (lowest note) so the
  // mapping is inversion-agnostic.
  const bassPc = ((sorted[0] % 12) + 12) % 12;
  const slotRoles: { slot: number; role: GuideToneRole; omitted?: boolean }[] =
    [];
  // Walk each unique pitch class above the bass; classify by interval.
  // Limit to first 4 stable positions (root, 3rd-or-sus, 5th, 7th).
  for (let i = 0; i < sorted.length && slotRoles.length < 5; i++) {
    const pc = ((sorted[i] % 12) + 12) % 12;
    const interval = ((pc - bassPc) + 12) % 12;
    if (i === 0) slotRoles.push({ slot: 0, role: "root" });
    else if (interval === 3) slotRoles.push({ slot: i, role: "third" });
    else if (interval === 4) slotRoles.push({ slot: i, role: "third" });
    else if (interval === 5) slotRoles.push({ slot: i, role: "fifth" });
    else if (interval === 7) slotRoles.push({ slot: i, role: "fifth" });
    else if (interval === 10) slotRoles.push({ slot: i, role: "seventh" });
    else if (interval === 11) slotRoles.push({ slot: i, role: "seventh" });
    else if (interval === 2) slotRoles.push({ slot: i, role: "ninth" });
    else if (interval === 9) slotRoles.push({ slot: i, role: "ninth" });
    else slotRoles.push({ slot: i, role: "color" });
  }

  // Find the slot whose pitch class matches the played note.
  const matchedSlot = slotRoles.find((s) => {
    const pc = ((sorted[s.slot] % 12) + 12) % 12;
    return pc === playedPc;
  });

  // If the played note is in the chord but the slot role is "color"
  // (e.g. played the 6th of a Cmaj7 chord — chord tone but not a
  // guide tone), prefer the chord's own tensions metadata if we
  // have it from analyzeChord.
  if (matchedSlot && matchedSlot.role === "color" && fallback.tensions.length) {
    // Heuristic: if the played pc matches a tension in the chord,
    // label it that way. For now, just keep "color".
  }

  // Detect sus chord (3rd is missing). Heuristic: chord family
  // is "major" or "dominant" but no slot has role "third".
  const hasThird = slotRoles.some((s) => s.role === "third");
  const isSusChord =
    (fallback.family === "major" || fallback.family === "dominant") &&
    !hasThird;

  // If the played note isn't in the chord pitch classes, return
  // an "off" / non-chord-tone match.
  if (!matchedSlot) {
    return {
      role: "off",
      label: "non-chord tone",
      isGuideTone: false,
      inChord: false,
    };
  }

  // If the matched slot's interval is 5 (semitones) and the chord
  // is sus, treat the 4th as a sus note (label "4 (sus)").
  let label = ROLE_LABEL[matchedSlot.role];
  if (isSusChord && matchedSlot.role === "fifth") {
    const interval = ((playedPc - bassPc) + 12) % 12;
    if (interval === 5) label = "4 (sus)";
  }
  if (isSusChord && matchedSlot.role === "third") {
    label = "3rd (omitted on sus — you added it back)";
  }

  return {
    role: matchedSlot.role,
    label,
    isGuideTone: matchedSlot.role === "third" || matchedSlot.role === "seventh",
    inChord: true,
    ...(matchedSlot.role === "third" && isSusChord ? { note: "omitted" } : {}),
  };
}
