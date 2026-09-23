/**
 * engine/compose/melody.ts - PRD-001 Phase 4 Slice 1 (REQ-COMP-11).
 *
 * extractMelody(project, roles, window): if a confident "melody" role
 * exists, that track IS the melody. Otherwise synthesize the TOP LINE:
 * sweep the window's onsets across non-percussion tracks. When the
 * current note's tail ends, ADVANCE to the line's own voice - up OR
 * down (a descending scale must extract as N notes, not one; if the
 * line had hopped to another track, e.g. over a crossing bass, it
 * RETURNS to its home track when that voice has notes sounding). While
 * the current note still sounds, JUMP to a higher voice only when that
 * candidate is metrically primary (>= an eighth after the line's last
 * onset) AND sustained (>= an eighth) - a track change alone never
 * dethrones the line, so a 16th-note ornament on another track cannot
 * hijack it. Output is a monophonic, ascending, non-overlapping note
 * list.
 *
 * KNOWN LIMIT (S1, pinned): if the home track goes permanently silent
 * the line holds its last note (tails extend) rather than migrating
 * DOWN to another instrument; gap absorption means no rests are ever
 * emitted (see docs/PHASE-4-COMPOSE.md errata).
 *
 * Deterministic: fixed sort order + lower-trackIndex tie-break, no rng,
 * no clock.
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import type {
  AnalysisWindow,
  MelodyResult,
  NormalizedNote,
  NormalizedProject,
  TrackRoleAssignment,
} from "./types";

interface Cand {
  readonly trackIndex: number;
  readonly midi: number;
  readonly start: number;
  readonly end: number;
  readonly velocity: number;
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function inWindow(note: NormalizedNote, window: AnalysisWindow): boolean {
  return note.tick >= window.fromTick && note.tick < window.toTick;
}

function melodyTrackCandidates(project: NormalizedProject, window: AnalysisWindow): Cand[] {
  const out: Cand[] = [];
  for (const t of project.tracks) {
    if (t.isPercussion) continue;
    for (const n of t.notes) {
      if (!inWindow(n, window)) continue;
      out.push({
        trackIndex: t.index,
        midi: n.midi,
        start: n.tick,
        end: n.tick + n.durationTicks,
        velocity: n.velocity,
      });
    }
  }
  // start asc, then lower track, then higher pitch first (stable top pick)
  out.sort((a, b) => a.start - b.start || a.trackIndex - b.trackIndex || b.midi - a.midi);
  return out;
}

/** Pick the highest-confidence melody-role track, if any. */
function bestMelodyTrack(roles: readonly TrackRoleAssignment[]): number | null {
  let best: number | null = null;
  let bestConf = -1;
  for (const r of roles) {
    if (r.role === "melody" && r.confidence > bestConf) {
      bestConf = r.confidence;
      best = r.trackIndex;
    }
  }
  return best;
}

function synthesizeTopLine(project: NormalizedProject, window: AnalysisWindow): NormalizedNote[] {
  const cands = melodyTrackCandidates(project, window);
  if (cands.length === 0) return [];
  const eighth = Math.max(1, project.ppq / 2);

  // Distinct onset ticks, ascending.
  const onsets: number[] = [];
  for (let i = 0; i < cands.length; i++) {
    if (i === 0 || cands[i].start !== cands[i - 1].start) onsets.push(cands[i].start);
  }

  const out: NormalizedNote[] = [];
  let active: Cand[] = [];
  let ptr = 0;
  let cur: { midi: number; start: number; end: number; trackIndex: number; velocity: number } | null = null;
  let homeTrack = -1; // track of the line's first note (return target)

  // Highest still-sounding candidate on one track (exact-pitch ties
  // resolved by the sweep's stable sort: lower track, higher pitch).
  const highestOn = (trackIndex: number): Cand | null => {
    let best: Cand | null = null;
    for (const c of active) {
      if (c.trackIndex !== trackIndex) continue;
      if (best === null || c.midi > best.midi) best = c;
    }
    return best;
  };

  for (const t of onsets) {
    while (ptr < cands.length && cands[ptr].start <= t) {
      active.push(cands[ptr]);
      ptr++;
    }
    active = active.filter((c) => c.end > t);
    if (active.length === 0) continue;

    // Highest sounding voice; lower track wins an exact-pitch tie.
    let highest = active[0];
    for (const c of active) {
      if (c.midi > highest.midi || (c.midi === highest.midi && c.trackIndex < highest.trackIndex)) {
        highest = c;
      }
    }

    if (cur === null) {
      cur = { midi: highest.midi, start: t, end: highest.end, trackIndex: highest.trackIndex, velocity: highest.velocity };
      homeTrack = highest.trackIndex;
      continue;
    }

    // (a) The line's note has stopped sounding: ADVANCE to its own
    // voice, up OR down (a descending scale must not fuse into one
    // held note). If the line had hopped off its home track (a jump-up
    // over a crossing voice), prefer returning to the home track.
    if (t >= cur.end) {
      const next: Cand | null =
        (cur.trackIndex !== homeTrack ? highestOn(homeTrack) : null) ?? highestOn(cur.trackIndex);
      if (next !== null) {
        out.push({
          midi: cur.midi,
          tick: cur.start,
          durationTicks: Math.max(1, t - cur.start),
          velocity: cur.velocity,
        });
        cur = { midi: next.midi, start: t, end: next.end, trackIndex: next.trackIndex, velocity: next.velocity };
        continue;
      }
      // no own-voice successor: fall through (sustain / jump-up below)
    }

    // (b) The line still sounds: keep the current voice unless a HIGHER
    // candidate is metrically primary (>= an eighth advance) AND
    // sustained (>= an eighth). A track change alone does NOT bypass
    // this gate - a 16th ornament on another track cannot hijack.
    const metricAdvance = t - cur.start >= eighth;
    const sustained = highest.end - t >= eighth;
    if (highest.midi > cur.midi && metricAdvance && sustained) {
      out.push({
        midi: cur.midi,
        tick: cur.start,
        durationTicks: Math.max(1, t - cur.start),
        velocity: cur.velocity,
      });
      cur = { midi: highest.midi, start: t, end: highest.end, trackIndex: highest.trackIndex, velocity: highest.velocity };
    } else {
      // sustain the current line (extend its tail)
      cur.end = Math.max(cur.end, highest.end);
    }
  }
  if (cur !== null) {
    out.push({
      midi: cur.midi,
      tick: cur.start,
      durationTicks: Math.max(1, cur.end - cur.start),
      velocity: cur.velocity,
    });
  }
  out.sort((a, b) => a.tick - b.tick);
  return out;
}

export function extractMelody(
  project: NormalizedProject,
  roles: readonly TrackRoleAssignment[],
  window: AnalysisWindow,
): MelodyResult {
  const melodyTrack = bestMelodyTrack(roles);
  if (melodyTrack !== null) {
    const track = project.tracks.find((t) => t.index === melodyTrack);
    if (track) {
      const notes = track.notes.filter((n) => inWindow(n, window)).sort((a, b) => a.tick - b.tick);
      return { sourceTrackIndex: track.index, synthesized: false, notes };
    }
  }
  return { sourceTrackIndex: null, synthesized: true, notes: synthesizeTopLine(project, window) };
}
