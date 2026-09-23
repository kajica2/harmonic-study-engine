/**
 * engine/compose/accompany.ts - PRD-001 Phase 4 Slice 3 (D70/D71).
 *
 * The accompaniment pipeline: plan (ALL rng draws, grid- and
 * seed-dependent, density-INdependent) -> realize (pure arithmetic:
 * rank filtering, slot->tick swing mapping, annotations). The result
 * is fully determined by (grid, request, seed) - the REQ-FND-3
 * contract holds at the note-tuple level.
 *
 * PIPELINE ORDER IS FIXED (D67): (1) plan pitches at FULL density;
 * (2) resolve hit -> (slot, midi, span, velocity) for every hit;
 * (3) FILTER hits by hit.rank <= density; (4) map slots -> ticks
 * (D70); (5) registers already carry transpose + octave offsets from
 * plan time. Density NEVER enters draw order - raising density only
 * ADDS notes (subset property, accompany.test.ts).
 *
 * DRAW-ORDER CONTRACT (model: engine/etude/assemble.ts header):
 * chords pass (bars ascending, slots ascending, rootless bool per
 * eligible cell) -> pad pass (same shape, NO rootless draws) -> bass
 * pass (approach picks, bars ascending, slots ascending, hits
 * chronological). One Rng per plan call.
 *
 * TD-043: region.slots.length is read PER BAR everywhere (the D60
 * merge appends cells, so 1/2/3-slot bars coexist); cell regions tile
 * [startTick, endTick) exactly via floor arithmetic.
 *
 * swingRatio + gridDivisions get their FIRST real consumer here (D70
 * swing map): 0.5 -> exact straight identity; 0.64 at ppq 480 / gd 4
 * -> slot 1 = 154 (pinned integers).
 *
 * Purity: relative imports only, no clock, no randomness of its own
 * (createRng seeded from the REQUEST), no console.
 */

import { qualityIntervals } from "../core/chords";
import { createRng } from "../core/rng";
import type { Annotation } from "../pedagogy/types";
import { getStyleProfile } from "../styles/index";
import type { BassPatternId, ChordPatternId, MidiRange, StyleProfile } from "../styles/types";
import { resolveBassPitches, countBassDraws } from "./bass";
import {
  bassPattern,
  chordPattern,
  tiledHits,
  PATTERN_VELOCITY,
  PAD_PATTERN_ID,
  type PatternEntry,
} from "./patterns";
import { voiceSequence } from "./voicing";
import type {
  AccompRole,
  AccompanimentMeta,
  AccompanimentPlan,
  AccompanimentRequest,
  AccompanimentResult,
  BarRegions,
  BassHitPitch,
  ChordCell,
  ChordGrid,
  GeneratedNote,
  KeyCandidate,
  Outcome,
} from "./types";

const ROLES: readonly AccompRole[] = ["bass", "chords", "pad"];

const FLAT_NAMES: readonly string[] = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function pcName(pc: number): string {
  return FLAT_NAMES[mod12(pc)];
}

function isSounding(cell: ChordCell): boolean {
  return !cell.isRest && qualityIntervals(cell.qualitySymbol) !== null;
}

/** Interval-above-root display for rootless annotations (truthful:
 *  derived from REALIZED pitches, never from the quality name). */
function intervalName(iv: number): string {
  switch (mod12(iv)) {
    case 0: return "root";
    case 1: return "b9";
    case 2: return "9th";
    case 3: return "b3rd";
    case 4: return "3rd";
    case 5: return "4th";
    case 6: return "b5th";
    case 7: return "5th";
    case 8: return "b13th";
    case 9: return "13th";
    case 10: return "b7th";
    default: return "maj7th";
  }
}

/** gridFingerprint: "bar:rootPc.qualitySymbol" cells joined - pure,
 *  cheap, staleness pin (D71). Rest cells and unknown-quality cells
 *  both serialize as "rest" (what the generator hears). */
export function gridFingerprint(grid: ChordGrid): string {
  return grid.bars
    .map(
      (region) =>
        `${region.bar}:` +
        region.slots
          .map((c) => (isSounding(c) ? `${c.rootPc}.${c.qualitySymbol}` : "rest"))
          .join(","),
    )
    .join(";");
}

/** Per-cell geometry (TD-043): cell i of a bar with S cells and T
 *  ticks owns [start + floor(i*T/S), start + floor((i+1)*T/S)) -
 *  tiles EXACTLY (no gaps/overlaps; the last cell absorbs rounding).
 *  beats = the D66 tiling budget B = floor(cellTicks / ppq). */
export interface CellGeometry {
  readonly startTick: number;
  readonly endTick: number;
  readonly beats: number;
}

export function cellGeometry(grid: ChordGrid, ppq: number): readonly (readonly CellGeometry[])[] {
  return grid.bars.map((region) => {
    const S = region.slots.length; // TD-043: PER BAR, never grid.slotsPerBar
    const T = region.endTick - region.startTick;
    if (S === 0 || ppq <= 0) {
      return region.slots.map(() => ({
        startTick: region.startTick,
        endTick: region.startTick,
        beats: 0,
      }));
    }
    return region.slots.map((_, i) => {
      const start = region.startTick + Math.floor((i * T) / S);
      const end = region.startTick + Math.floor(((i + 1) * T) / S);
      return { startTick: start, endTick: end, beats: Math.floor((end - start) / ppq) };
    });
  });
}

/**
 * SWING MAP (D70): relative-to-cell-start onset table. Global slot
 * index g over the cell (beat b = floor(g/gd), step s = g%gd);
 * pair = floor(s/2), within = s%2, pairLen = 2*beatTicks/gd;
 * onset(g) = b*beatTicks + pair*pairLen + within*round(swingRatio *
 * pairLen), rounded to an integer tick. rmap[B*gd] = cellTicks (the
 * tail absorbs rounding). swingRatio 0.5 is the exact straight
 * identity (pinned); monotone over the validator range [0.5, 0.75]
 * (property-tested).
 */
export function swingOnsets(
  cellBeats: number,
  gd: number,
  ppq: number,
  swingRatio: number,
  cellTicks: number,
): readonly number[] {
  const total = cellBeats * gd;
  const out: number[] = [];
  const beatTicks = ppq;
  const pairLen = (2 * beatTicks) / gd;
  const swingOffset = Math.round(swingRatio * pairLen);
  for (let g = 0; g < total; g++) {
    const b = Math.floor(g / gd);
    const s = g % gd;
    const pair = Math.floor(s / 2);
    const within = s % 2;
    out.push(Math.round(b * beatTicks + pair * pairLen + within * swingOffset));
  }
  out.push(cellTicks); // rmap[gd*B] = cellEnd (relative to cellStart)
  return out;
}

function validRequest(req: AccompanimentRequest): string | null {
  if (req.roles.length === 0) return "at least one role is required";
  if (new Set(req.roles).size !== req.roles.length) return "duplicate roles";
  for (const r of req.roles) if (!ROLES.includes(r)) return `unknown role ${String(r)}`;
  if (!Number.isInteger(req.density) || req.density < 0 || req.density > 5) {
    return "density must be an integer 0..5";
  }
  if (!Number.isInteger(req.seed) || req.seed < 0 || req.seed > 0xffffffff) {
    return "seed must be a uint32";
  }
  const t = req.transposeAccompaniment ?? 0;
  if (!Number.isInteger(t) || t < -24 || t > 24) return "transpose must be an integer -24..24";
  for (const r of ROLES) {
    const off = req.registerOffsets?.[r] ?? 0;
    if (!Number.isInteger(off) || off % 12 !== 0 || off < -24 || off > 24) {
      return "register offsets must be octave multiples of 12 within -24..24";
    }
  }
  return null;
}

function shiftedRegister(
  profile: StyleProfile,
  role: AccompRole,
  req: AccompanimentRequest,
): MidiRange | null {
  const base = profile.voicing.registers[role];
  const off = (req.registerOffsets?.[role] ?? 0) + (req.transposeAccompaniment ?? 0);
  const lo = base[0] + off;
  const hi = base[1] + off;
  if (lo < 0 || hi > 127) return null; // MIDI range violation
  return [lo, hi];
}

function unsupported(message: string): Outcome<never> {
  return { ok: false, error: { code: "unsupported", message } };
}

/**
 * PLAN: every rng draw happens here (chords rootless bools -> bass
 * approach picks), at FULL density. Never throws (D49 pattern).
 */
export function planAccompaniment(
  req: AccompanimentRequest,
  grid: ChordGrid,
  ppq: number,
  key: KeyCandidate | null,
): Outcome<AccompanimentPlan> {
  try {
    const problem = validRequest(req);
    if (problem !== null) return unsupported(problem);
    if (ppq <= 0 || !Number.isInteger(ppq)) return unsupported("ppq must be a positive integer");
    let profile: StyleProfile;
    try {
      profile = getStyleProfile(req.styleId);
    } catch {
      return unsupported(`style '${req.styleId}' is not shipped`);
    }
    const bassEntry = bassPattern(profile.rhythm.bassPattern);
    const chordEntry = chordPattern(profile.rhythm.chordPattern);
    const padEntry = chordPattern(PAD_PATTERN_ID);
    if (bassEntry === null || chordEntry === null || padEntry === null) {
      return unsupported("pattern library is missing an id the profile references");
    }
    const registers = {} as Record<AccompRole, MidiRange>;
    for (const role of ROLES) {
      const off = (req.registerOffsets?.[role] ?? 0) + (req.transposeAccompaniment ?? 0);
      const base = profile.voicing.registers[role];
      if (req.roles.includes(role)) {
        const reg = shiftedRegister(profile, role, req);
        if (reg === null) return unsupported("register offset leaves the MIDI range");
        registers[role] = reg;
      } else {
        registers[role] = [base[0] + off, base[1] + off];
      }
    }

    const cells = grid.bars.map((region) => region.slots);
    const cellBeats = cellGeometry(grid, ppq).map((bar) => bar.map((c) => c.beats));
    const rng = createRng(req.seed);
    const bassSelected = req.roles.includes("bass");

    // Pass 1: chords (rootless draws ONLY when the bass role covers
    // the root - D68 rule 5).
    const chordsResult = req.roles.includes("chords")
      ? voiceSequence({
          cells,
          profile,
          rng,
          allowRootless: bassSelected,
          register: registers.chords,
        })
      : null;
    // Pass 2: pad (independent sequential pass, pad register, never
    // rootless - zero draws).
    const padResult = req.roles.includes("pad")
      ? voiceSequence({
          cells,
          profile,
          rng,
          allowRootless: false,
          register: registers.pad,
        })
      : null;
    // Pass 3: bass (approach picks).
    const bassPitches: readonly (readonly (readonly BassHitPitch[])[])[] = bassSelected
      ? resolveBassPitches(bassEntry, cells, cellBeats, profile, key, rng, registers.bass)
      : [];

    const plan: AccompanimentPlan = {
      version: 1,
      grid,
      roles: [...req.roles],
      ppq,
      key,
      styleId: req.styleId,
      voicingStyle: profile.voicing.style,
      patternIds: {
        bass: bassEntry.id,
        chords: chordEntry.id,
        pad: padEntry.id,
      },
      swingRatio: profile.rhythm.swingRatio,
      gridDivisions: profile.rhythm.gridDivisions,
      density: req.density,
      seed: req.seed,
      registers,
      voicings: {
        chords: chordsResult ? chordsResult.voicings : [],
        pad: padResult ? padResult.voicings : [],
      },
      bassPitches,
      rootlessFlags: chordsResult ? chordsResult.rootlessFlags : [],
      quartalFallbackCount:
        (chordsResult ? chordsResult.quartalFallbackCount : 0) +
        (padResult ? padResult.quartalFallbackCount : 0),
      drawCount:
        (chordsResult ? chordsResult.drawCount : 0) +
        (padResult ? padResult.drawCount : 0) +
        countBassDraws(bassPitches),
    };
    return { ok: true, value: plan };
  } catch {
    return { ok: false, error: { code: "internal", message: "accompaniment plan failed" } };
  }
}

/** A bass hit that actually FIRED at the plan's density, with its
 *  recorded approach provenance (D74 #4 input). */
interface FiredApproach {
  readonly bar: number;
  readonly slot: number;
  readonly pitch: BassHitPitch;
}

/** Internal: realized notes + hit-level thinning facts + per-bar
 *  realized pitch sets + fired approach hits. */
interface RoleRealization {
  readonly notes: GeneratedNote[];
  readonly firedHits: number;
  readonly fullHits: number;
  readonly pitchesPerBar: Map<number, Set<number>>;
  readonly firedApproaches: FiredApproach[];
}

function realizeRole(
  plan: AccompanimentPlan,
  role: AccompRole,
  entry: PatternEntry,
): RoleRealization {
  const notes: GeneratedNote[] = [];
  const pitchesPerBar = new Map<number, Set<number>>();
  const firedApproaches: FiredApproach[] = [];
  const gd = Math.max(entry.divisions, plan.gridDivisions);
  const tiers = PATTERN_VELOCITY[role];
  let firedHits = 0;
  let fullHits = 0;
  const geo = cellGeometry(plan.grid, plan.ppq);
  for (let barIdx = 0; barIdx < plan.grid.bars.length; barIdx++) {
    const region = plan.grid.bars[barIdx];
    const cellsGeo = geo[barIdx];
    for (let i = 0; i < region.slots.length; i++) {
      const cell = region.slots[i];
      const g = cellsGeo[i];
      const hits = tiledHits(entry, g.beats);
      if (!isSounding(cell) || hits.length === 0) continue;
      // MED-1: the thinning DENOMINATOR counts SOUNDING cells only -
      // incrementing above the guard let rest cells inflate fullHits,
      // so a fully-fired density-5 pass over a rests grid falsely
      // claimed "thinned to 16/24 hit positions" (regression-pinned).
      fullHits += hits.length;
      let pitches: readonly BassHitPitch[] | null = null;
      let voices: readonly number[] | null = null;
      if (role === "bass") {
        const p = plan.bassPitches[barIdx]?.[i];
        if (p === undefined || p.length === 0) continue;
        pitches = p;
      } else {
        const pass = role === "chords" ? plan.voicings.chords : plan.voicings.pad;
        const v = pass[barIdx]?.[i];
        if (v === null || v === undefined || v.length === 0) continue;
        voices = v;
      }
      const cellTicks = g.endTick - g.startTick;
      const rmap = swingOnsets(g.beats, gd, plan.ppq, plan.swingRatio, cellTicks);
      const total = g.beats * gd;
      // Steps/spans are AUTHORED in the entry's divisions; the
      // realization grid is gd = max(divisions, gridDivisions), so
      // both scale by gd/divisions (integer: divisions in {2,4}).
      const scale = gd / entry.divisions;
      for (let h = 0; h < hits.length; h++) {
        const hit = hits[h];
        if (hit.rank > plan.density) continue; // D67: post-pitch thinning
        const slot = hit.beat * gd + hit.step * scale;
        const endIdx =
          hit.span === -1 ? total : Math.min(slot + hit.span * scale, total);
        const tick = g.startTick + rmap[slot];
        const dur = Math.max(1, rmap[endIdx] - rmap[slot]);
        const velocity = tiers[hit.accent];
        const barPitches = pitchesPerBar.get(barIdx) ?? new Set<number>();
        let emitted = 0;
        if (pitches !== null) {
          const p = pitches[h];
          if (p !== undefined) {
            notes.push({
              midi: p.midi,
              tick,
              durationTicks: dur,
              velocity,
              role,
              bar: region.bar,
              slot: i,
            });
            barPitches.add(p.midi);
            emitted = 1;
            if (p.approach === "chromatic" || p.approach === "stepwise") {
              firedApproaches.push({ bar: region.bar, slot: i, pitch: p });
            }
          }
        } else if (voices !== null) {
          const hitVoices =
            entry.toneMode === "cycle"
              ? [voices[Math.min(hit.voice ?? 0, voices.length - 1)]]
              : voices;
          for (const midi of hitVoices) {
            notes.push({
              midi,
              tick,
              durationTicks: dur,
              velocity,
              role,
              bar: region.bar,
              slot: i,
            });
            barPitches.add(midi);
            emitted++;
          }
        }
        if (emitted > 0) {
          pitchesPerBar.set(barIdx, barPitches);
          firedHits++;
        }
      }
    }
  }
  notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
  return { notes, firedHits, fullHits, pitchesPerBar, firedApproaches };
}

function hitsAtOrBelow(entry: PatternEntry, density: number): number {
  return entry.hits.filter((h) => h.rank <= density).length;
}

/**
 * REALIZE: pure arithmetic, ZERO rng, ZERO clock. Maps the full-
 * density plan onto (tick, midi, durationTicks, velocity) tuples,
 * rank-filters by density, and computes TRUTHFUL annotations (D74)
 * from the realized pitches only.
 */
export function realizePlan(plan: AccompanimentPlan): {
  generated: AccompanimentResult["generated"];
  annotations: readonly Annotation[];
} {
  const entries: Partial<Record<AccompRole, PatternEntry>> = {};
  const realizations: Partial<Record<AccompRole, RoleRealization>> = {};
  for (const role of plan.roles) {
    const entry =
      role === "bass"
        ? bassPattern(plan.patternIds.bass as BassPatternId)
        : chordPattern((role === "pad" ? plan.patternIds.pad : plan.patternIds.chords) as ChordPatternId);
    if (entry) entries[role] = entry;
  }
  const generated = { bass: [] as GeneratedNote[], chords: [] as GeneratedNote[], pad: [] as GeneratedNote[] };
  for (const role of ROLES) {
    const entry = entries[role];
    if (!entry || !plan.roles.includes(role)) continue;
    const r = realizeRole(plan, role, entry);
    realizations[role] = r;
    generated[role] = r.notes;
  }
  const annotations = buildAnnotations(plan, entries, realizations);
  return { generated, annotations };
}

function firstSoundingCell(region: BarRegions | undefined): ChordCell | null {
  if (region === undefined) return null;
  for (const c of region.slots) {
    if (isSounding(c)) return c;
  }
  return null;
}

function buildAnnotations(
  plan: AccompanimentPlan,
  entries: Partial<Record<AccompRole, PatternEntry>>,
  realizations: Partial<Record<AccompRole, RoleRealization>>,
): readonly Annotation[] {
  const out: Annotation[] = [];
  const bars = plan.grid.bars.length;
  const lastBar = Math.max(0, bars - 1);
  const ann = (
    id: string,
    target: Annotation["target"],
    label: string,
    text: string,
    conceptId: string | null,
  ): void => {
    out.push({ version: 1, id, target, label, text, conceptId, confidence: 1 });
  };

  // 6 (first, D71/D74): all-rest / zero-bar grid -> honest dead-end.
  const sounding = plan.grid.bars.some((r) => r.slots.some(isSounding));
  if (!sounding) {
    ann(
      "ann-acc-empty-0",
      { kind: "melody" },
      "No chords yet",
      "No chords to accompany yet - enter chords first.",
      null,
    );
    return out;
  }

  // 1. Per-role pattern line (target progression 0..last), one per
  //    selected role in bass/chords/pad order. The thinning fact is
  //    computed from the DATA (realized hit count vs full hit count),
  //    never assumed (D74).
  for (const role of ROLES) {
    const entry = entries[role];
    const r = realizations[role];
    if (!entry || !r) continue;
    const thinned = r.firedHits < r.fullHits;
    let text = `${entry.label} - ${bars} bars, density ${plan.density}`;
    if (thinned) {
      const anchorOnly = hitsAtOrBelow(entry, plan.density) === hitsAtOrBelow(entry, 0);
      text += anchorOnly
        ? "; thinned: anchor hits only (downbeats)"
        : `; thinned to ${r.firedHits}/${r.fullHits} hit positions`;
    }
    let conceptId: string | null = null;
    if (entry.id === "walking") {
      // WALKING HONESTY (D69/D74): the walking claim stands only when
      // EVERY sounding bar realized >= 3 distinct pitches.
      let soundingBars = 0;
      let allWalk = true;
      for (let barIdx = 0; barIdx < bars; barIdx++) {
        const pitches = r.pitchesPerBar.get(barIdx);
        if (!pitches || pitches.size === 0) continue;
        soundingBars++;
        if (pitches.size < 3) allWalk = false;
      }
      if (soundingBars > 0 && allWalk) {
        conceptId = "walking-bass";
      } else {
        text += " - not a full walking line at this density";
      }
    }
    ann(
      `ann-acc-pattern-${role}-0`,
      { kind: "progression", fromBar: 0, toBar: lastBar },
      `${role} pattern`,
      text,
      conceptId,
    );
  }

  // 2. Rootless voicing annotations (target voicing{bar}): ONLY when
  //    the flag is set AND the REALIZED pitches exclude the root AND
  //    the bass role is on (double-truth, D74).
  const chordsReal = realizations.chords;
  if (plan.roles.includes("bass") && chordsReal) {
    for (let bar = 0; bar < plan.rootlessFlags.length; bar++) {
      if (!plan.rootlessFlags[bar].some(Boolean)) continue;
      const cell = firstSoundingCell(plan.grid.bars[bar]);
      if (cell === null) continue;
      const realized = chordsReal.pitchesPerBar.get(bar);
      if (!realized || realized.size === 0) continue;
      const rootPc = mod12(cell.rootPc);
      const sorted = [...realized].sort((a, b) => a - b);
      const intervals = sorted.map((p) => mod12(p - rootPc)).filter((iv) => iv !== 0);
      if (intervals.length !== sorted.length) continue; // root IS heard - never claim rootless
      ann(
        `ann-acc-rootless-${bar}`,
        { kind: "voicing", bar },
        "Rootless voicing",
        `Rootless voicing on ${cell.name} (${intervals.map(intervalName).join(" + ")}) - bass covers the root.`,
        "voice-leading",
      );
    }
  }

  // 3. drop2 note (first applied bar): only when style is drop2 AND
  //    the permutation actually applied (>= 4 voices in a pass).
  if (plan.voicingStyle === "drop2") {
    let dropBar: number | null = null;
    for (const pass of [plan.voicings.chords, plan.voicings.pad]) {
      for (let bar = 0; bar < pass.length && dropBar === null; bar++) {
        for (const v of pass[bar]) {
          if (v !== null && v.length >= 4) {
            dropBar = bar;
            break;
          }
        }
      }
      if (dropBar !== null) break;
    }
    if (dropBar !== null) {
      ann(
        `ann-acc-drop2-${dropBar}`,
        { kind: "voicing", bar: dropBar },
        "Drop-2 voicing",
        "Voicings use drop-2 (second voice from the top moved down an octave).",
        "drop-2",
      );
    }
  }

  // 4. Walking approach annotations (target chord{bar of the NEXT
  //    sounding cell}): from the RECORDED kind of hits that ACTUALLY
  //    fired at this density - chromatic vs stepwise, never assumed.
  const bassReal = realizations.bass;
  if (bassReal) {
    for (const f of bassReal.firedApproaches) {
      if (f.pitch.approachTargetPc === null || f.pitch.approachTargetBar === null) continue;
      const kind = f.pitch.approach === "chromatic" ? "Chromatic" : "Stepwise";
      ann(
        `ann-acc-approach-${f.bar}-${f.slot}`,
        { kind: "chord", bar: f.pitch.approachTargetBar },
        "Approach note",
        `${kind} approach to ${pcName(f.pitch.approachTargetPc)} (bar ${f.pitch.approachTargetBar + 1}).`,
        "walking-bass",
      );
    }
  }

  // 5. Quartal fallback (D74 #5): the plan carries only the COUNT
  //    (voicing.ts never records WHICH cells fell back), so the honest
  //    disclosure is progression-level, never silent. No shipped
  //    profile is quartal today - the branch stays live for the first
  //    one that is (pin: accompany.test.ts MED-2, hand-built plan).
  if (plan.quartalFallbackCount > 0) {
    ann(
      "ann-acc-quartal-0",
      { kind: "progression", fromBar: 0, toBar: lastBar },
      "Quartal fallback",
      `Quartal stack unavailable on ${plan.quartalFallbackCount} bars - close voicing used.`,
      null,
    );
  }
  return out;
}

/**
 * GENERATE: plan + realize + meta. The whole S3 contract: same
 * (grid, request, seed) => byte-identical result (determinism matrix,
 * accompany.test.ts). Never throws (D49); empty roles -> "unsupported";
 * zero-bar grid -> ok with zero notes + honest annotation.
 */
export function generateAccompaniment(
  req: AccompanimentRequest,
  grid: ChordGrid,
  ppq: number,
  key: KeyCandidate | null,
): Outcome<AccompanimentResult> {
  try {
    const planned = planAccompaniment(req, grid, ppq, key);
    if (!planned.ok) return planned;
    const plan = planned.value;
    const { generated, annotations } = realizePlan(plan);
    let unknownQualityCount = 0;
    for (const region of grid.bars) {
      for (const cell of region.slots) {
        if (!cell.isRest && qualityIntervals(cell.qualitySymbol) === null) unknownQualityCount++;
      }
    }
    const rootlessCount = plan.rootlessFlags.flat().filter(Boolean).length;
    const endTick = grid.bars.length > 0 ? grid.bars[grid.bars.length - 1].endTick : 0;
    const meta: AccompanimentMeta = {
      version: 1,
      styleId: plan.styleId,
      density: plan.density,
      seed: plan.seed,
      roles: plan.roles,
      patternIds: plan.patternIds,
      voicingStyle: plan.voicingStyle,
      swingRatioApplied: plan.swingRatio,
      gridDivisions: plan.gridDivisions,
      registersUsed: plan.registers,
      transpose: req.transposeAccompaniment ?? 0,
      noteCounts: {
        bass: generated.bass.length,
        chords: generated.chords.length,
        pad: generated.pad.length,
      },
      rootlessCount,
      quartalFallbackCount: plan.quartalFallbackCount,
      unknownQualityCount,
      bars: grid.bars.length,
      endTick,
      gridFingerprint: gridFingerprint(grid),
    };
    return {
      ok: true,
      value: { version: 1, generated, meta, annotations },
    };
  } catch {
    return { ok: false, error: { code: "internal", message: "accompaniment generation failed" } };
  }
}

