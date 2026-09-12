/**
 * Phase 3 concept paths (Path LV–LXI).
 *
 * Seven long-form educational concept paths that demonstrate a specific
 * jazz-harmony device over 16–32 bars. Each path is authored as a
 * raw `HarmonicPath` (no persona coupling) so the runtime
 * `padPath()` loop can extend it to the minimum bar length, and the
 * `Persona.rules` fields declared on the path (e.g. `sliceAndRepeat`)
 * fire as if a persona had been bound.
 *
 * Voicings use standard root-position 7th-chord shapes (root, 3, 5,
 * 7) within a piano-friendly mid range (mostly C2–C5). MIDI numbers
 * follow the convention C4 = 60.
 */
import type { HarmonicPath } from "./paths";

/**
 * Path LV — The ii-V-I Walk.
 *
 * Nine ii-V-I cadences cycling through the circle of fifths from
 * C major back to Bb major. Demonstrates that the ii-V-I shape is
 * the same everywhere — only the key center changes.
 */
const ii_v_i_walk: HarmonicPath = {
  id: "ii_v_i_walk",
  title: "Path LV: The ii-V-I Walk",
  description:
    "Major and minor ii-V-I through every key center, with voice leading to a final I.",
  composer: "Piano exercise tradition",
  key: "C major → Bb major (cycle)",
  feel: "educational / walking",
  techniques: ["ii_v_i", "voice_leading"],
  steps: [
    // Bar 1 — C major (D Dorian / G Mixolydian / C Ionian)
    { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "ii of C — minor seventh on D." },
    { name: "G7", notes: [55, 59, 62, 65], descriptions: "V of C — dominant seventh on G." },
    { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "I of C — resolution." },
    { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "Hold the tonic." },
    // Bar 2 — F major
    { name: "Gm7", notes: [43, 46, 50, 53], descriptions: "ii of F." },
    { name: "C7", notes: [48, 52, 55, 58], descriptions: "V of F." },
    { name: "Fmaj7", notes: [41, 45, 48, 52], descriptions: "I of F." },
    { name: "Fmaj7", notes: [41, 45, 48, 52], descriptions: "Hold the tonic." },
    // Bar 3 — G major
    { name: "Am7", notes: [45, 48, 52, 55], descriptions: "ii of G." },
    { name: "D7", notes: [50, 54, 57, 60], descriptions: "V of G." },
    { name: "Gmaj7", notes: [43, 47, 50, 54], descriptions: "I of G." },
    { name: "Gmaj7", notes: [43, 47, 50, 54], descriptions: "Hold the tonic." },
    // Bar 4 — D major
    { name: "Em7", notes: [40, 43, 47, 50], descriptions: "ii of D." },
    { name: "A7", notes: [45, 49, 52, 57], descriptions: "V of D." },
    { name: "Dmaj7", notes: [50, 54, 57, 61], descriptions: "I of D." },
    { name: "Dmaj7", notes: [50, 54, 57, 61], descriptions: "Hold the tonic." },
    // Bar 5 — A major
    { name: "Bm7", notes: [47, 50, 54, 57], descriptions: "ii of A." },
    { name: "E7", notes: [52, 56, 59, 62], descriptions: "V of A." },
    { name: "Amaj7", notes: [45, 49, 52, 56], descriptions: "I of A." },
    { name: "Amaj7", notes: [45, 49, 52, 56], descriptions: "Hold the tonic." },
    // Bar 6 — E major
    { name: "F#m7", notes: [42, 46, 49, 54], descriptions: "ii of E." },
    { name: "B7", notes: [47, 51, 54, 59], descriptions: "V of E." },
    { name: "Emaj7", notes: [52, 56, 59, 63], descriptions: "I of E." },
    { name: "Emaj7", notes: [52, 56, 59, 63], descriptions: "Hold the tonic." },
    // Bar 7 — B major
    { name: "C#m7", notes: [49, 53, 56, 61], descriptions: "ii of B." },
    { name: "F#7", notes: [54, 58, 61, 65], descriptions: "V of B." },
    { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "I of B." },
    { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "Hold the tonic." },
    // Bar 8 — Eb major
    { name: "Fm7", notes: [41, 44, 48, 51], descriptions: "ii of Eb." },
    { name: "Bb7", notes: [46, 50, 53, 58], descriptions: "V of Eb." },
    { name: "Ebmaj7", notes: [51, 55, 58, 62], descriptions: "I of Eb." },
    { name: "Ebmaj7", notes: [51, 55, 58, 62], descriptions: "Hold the tonic." },
    // Bar 9 — Bb major (final)
    { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "ii of Bb — final cadence." },
    { name: "F7", notes: [53, 57, 60, 63], descriptions: "V of Bb." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "I of Bb — final resolution." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "Hold the final tonic." },
  ],
};

/**
 * Path LVI — The Tritone Sub Walk.
 *
 * Same nine key centers as Path LV, but every V7 is replaced by its
 * tritone substitute (bII7). The root motion drops by a half step
 * instead of climbing by a fifth, which produces a chromatic bass
 * line that descends through the cycle.
 */
const tritone_sub_walk: HarmonicPath = {
  id: "tritone_sub_walk",
  title: "Path LVI: The Tritone Sub Walk",
  description:
    "Each ii-V-I uses the tritone substitution (bII7 instead of V7). The bass falls by half step instead of climbing by fifth.",
  composer: "Piano exercise tradition",
  key: "C major → Eb major (cycle)",
  feel: "educational / chromatic",
  techniques: ["tritone_substitution"],
  steps: [
    // Bar 1 — C major
    { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "ii of C." },
    { name: "Db7", notes: [49, 53, 56, 61], descriptions: "bII7 of C — tritone sub for G7." },
    { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "I of C." },
    { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "Hold." },
    // Bar 2 — F major
    { name: "Gm7", notes: [43, 46, 50, 53], descriptions: "ii of F." },
    { name: "Gb7", notes: [54, 58, 61, 65], descriptions: "bII7 of F — sub for C7." },
    { name: "Fmaj7", notes: [41, 45, 48, 52], descriptions: "I of F." },
    { name: "Fmaj7", notes: [41, 45, 48, 52], descriptions: "Hold." },
    // Bar 3 — G major
    { name: "Am7", notes: [45, 48, 52, 55], descriptions: "ii of G." },
    { name: "Ab7", notes: [44, 48, 51, 56], descriptions: "bII7 of G — sub for D7." },
    { name: "Gmaj7", notes: [43, 47, 50, 54], descriptions: "I of G." },
    { name: "Gmaj7", notes: [43, 47, 50, 54], descriptions: "Hold." },
    // Bar 4 — D major
    { name: "Em7", notes: [40, 43, 47, 50], descriptions: "ii of D." },
    { name: "Eb7", notes: [51, 55, 58, 63], descriptions: "bII7 of D — sub for A7." },
    { name: "Dmaj7", notes: [50, 54, 57, 61], descriptions: "I of D." },
    { name: "Dmaj7", notes: [50, 54, 57, 61], descriptions: "Hold." },
    // Bar 5 — A major
    { name: "Bm7", notes: [47, 50, 54, 57], descriptions: "ii of A." },
    { name: "Bb7", notes: [46, 50, 53, 58], descriptions: "bII7 of A — sub for E7." },
    { name: "Amaj7", notes: [45, 49, 52, 56], descriptions: "I of A." },
    { name: "Amaj7", notes: [45, 49, 52, 56], descriptions: "Hold." },
    // Bar 6 — E major
    { name: "F#m7", notes: [42, 46, 49, 54], descriptions: "ii of E." },
    { name: "F7", notes: [53, 57, 60, 63], descriptions: "bII7 of E — sub for B7." },
    { name: "Emaj7", notes: [52, 56, 59, 63], descriptions: "I of E." },
    { name: "Emaj7", notes: [52, 56, 59, 63], descriptions: "Hold." },
    // Bar 7 — B major
    { name: "C#m7", notes: [49, 53, 56, 61], descriptions: "ii of B." },
    { name: "C7", notes: [48, 52, 55, 58], descriptions: "bII7 of B — sub for F#7." },
    { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "I of B." },
    { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "Hold." },
    // Bar 8 — Eb major
    { name: "Fm7", notes: [41, 44, 48, 51], descriptions: "ii of Eb." },
    { name: "E7", notes: [52, 56, 59, 63], descriptions: "bII7 of Eb — sub for Bb7." },
    { name: "Ebmaj7", notes: [51, 55, 58, 62], descriptions: "I of Eb." },
    { name: "Ebmaj7", notes: [51, 55, 58, 62], descriptions: "Hold." },
  ],
};

/**
 * Path LVII — The Giant Steps Cycle.
 *
 * Coltrane's defining harmonic device: a descending major-third cycle
 * (B → G → Eb) with each key lasting one bar. Voicings are
 * root-position maj7/7 shapes; the persona's `sliceAndRepeat` rule
 * loops each bar as a motif so the cycle can be practiced in tight
 * loops before committing to the full progression.
 */
const coltrane_changes_demo: HarmonicPath = {
  id: "coltrane_changes_demo",
  title: "Path LVII: The Giant Steps Cycle",
  description:
    "The B-G-Eb key cycle that defines Coltrane's harmonic language. Each bar shifts key center by a major third.",
  composer: "J. Coltrane",
  key: "B major (tonal center)",
  feel: "giant_steps / cycling",
  techniques: ["giant_steps_cycle"],
  sliceAndRepeat: true,
  steps: [
    // Bar 1 — B → G → Eb → B
    { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "B major — key center 1." },
    { name: "G7", notes: [43, 47, 50, 54], descriptions: "G dominant — pivot." },
    { name: "Ebmaj7", notes: [51, 55, 58, 62], descriptions: "Eb major — third below." },
    { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "Return to B." },
    // Bar 2 — D → Bb → F → D
    { name: "D7", notes: [50, 54, 57, 60], descriptions: "D dominant — second cycle." },
    { name: "Bb7", notes: [46, 50, 53, 58], descriptions: "Bb dominant — third below." },
    { name: "Fmaj7", notes: [41, 45, 48, 52], descriptions: "F major — third below." },
    { name: "D7", notes: [50, 54, 57, 60], descriptions: "Return to D." },
    // Bar 3 — G → Eb → B → G
    { name: "Gmaj7", notes: [43, 47, 50, 54], descriptions: "G major — third cycle." },
    { name: "Ebmaj7", notes: [51, 55, 58, 62], descriptions: "Eb major." },
    { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "B major — third above." },
    { name: "G7", notes: [43, 47, 50, 54], descriptions: "Return to G." },
    // Bar 4 — Eb → B → F → D (resolution sweep)
    { name: "Ebmaj7", notes: [51, 55, 58, 62], descriptions: "Eb major — resolution sweep start." },
    { name: "Bmaj7", notes: [47, 51, 54, 58], descriptions: "B major." },
    { name: "Fmaj7", notes: [41, 45, 48, 52], descriptions: "F major." },
    { name: "D7", notes: [50, 54, 57, 60], descriptions: "D dominant — open cadence." },
  ],
};

/**
 * Path LVIII — The Rhythm Changes.
 *
 * Gershwin's I Got Rhythm changes (A section), voiced with the
 * classic iii-vi-ii-V turnaround substitution in bars 5–8. Each
 * chord uses a proper root-position 7th voicing; the bridge-style
 * turnaround in bars 7-8 introduces a Dm7b5 → G7alt → Cm7 motion
 * borrowed from rhythm-changes comping practice.
 */
const rhythm_changes_demo: HarmonicPath = {
  id: "rhythm_changes_demo",
  title: "Path LVIII: The Rhythm Changes",
  description:
    "I Got Rhythm chord changes with iii-vi-ii-V turnaround substitutions and altered-dominant bridge turnaround.",
  composer: "G. Gershwin (via jazz tradition)",
  key: "Bb major",
  feel: "swing / rhythm_changes",
  techniques: ["rhythm_changes", "substitutions"],
  steps: [
    // Bar 1 — Bbmaj7 / G7 / Cm7 / F7 (classic A opening)
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "I — opening tonic." },
    { name: "G7", notes: [43, 47, 50, 54], descriptions: "VI7 — backdoor dominant." },
    { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "ii — relative minor." },
    { name: "F7", notes: [53, 57, 60, 63], descriptions: "V7 — turnaround to Bb." },
    // Bar 2 — Dm7 / G7 / Cmaj7 / Cmaj7 (iii-vi-ii-V → V/V of Cmaj7)
    { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "iii — relative of Bb." },
    { name: "G7", notes: [43, 47, 50, 54], descriptions: "VI7 — secondary backdoor." },
    { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "III — relative major pivot." },
    { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "Hold III." },
    // Bar 3 — Cm7 / F7 / Bbmaj7 / Bbmaj7 (ii-V-I back to I)
    { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "ii — local." },
    { name: "F7", notes: [53, 57, 60, 63], descriptions: "V7 — dominant." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "I — return." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "Hold I." },
    // Bar 4 — Dm7 / G7 / Cm7 / F7 (iii-vi-ii-V into turnaround)
    { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "iii." },
    { name: "G7", notes: [43, 47, 50, 54], descriptions: "VI7." },
    { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "ii." },
    { name: "F7", notes: [53, 57, 60, 63], descriptions: "V7 — turnaround pivot." },
    // Bar 5 — Cmaj7 / Cmaj7 / Bbmaj7 / Bbmaj7 (III pedal → I)
    { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "III — sustained." },
    { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "III pedal." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "I — back to tonic." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "Hold." },
    // Bar 6 — Am7 / D7 / Gmaj7 / Gmaj7 (iii-vi-ii-V in G)
    { name: "Am7", notes: [45, 48, 52, 55], descriptions: "iii of G." },
    { name: "D7", notes: [50, 54, 57, 60], descriptions: "VI7 of G." },
    { name: "Gmaj7", notes: [43, 47, 50, 54], descriptions: "III — G major." },
    { name: "Gmaj7", notes: [43, 47, 50, 54], descriptions: "Hold III." },
    // Bar 7 — Cm7 / F7 / Bbmaj7 / Dm7b5 (turnaround → half-dim)
    { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "ii — pickup into bridge." },
    { name: "F7", notes: [53, 57, 60, 63], descriptions: "V7." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "I — bridge pickup." },
    { name: "Dm7b5", notes: [50, 53, 56, 60], descriptions: "ii° — half-diminished, V of G7alt." },
    // Bar 8 — G7alt / Cm7 / F7 / Bbmaj7 (alt turnaround → back to top)
    { name: "G7alt", notes: [43, 47, 50, 56], descriptions: "V7alt — b13 for tension." },
    { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "ii — reset." },
    { name: "F7", notes: [53, 57, 60, 63], descriptions: "V7 — final turnaround." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "I — back to top of form." },
  ],
};

/**
 * Path LIX — The Bebop Blues.
 *
 * First three bars of a Bb bebop blues, the form Charlie Parker
 * codified on "Now's the Time" and "Au Privave". `padPath()` will
 * cycle these 12 steps up to the minimum bar length so the form can
 * be practiced as a repeating 3-bar pattern.
 */
const bird_blues: HarmonicPath = {
  id: "bird_blues",
  title: "Path LIX: The Bebop Blues",
  description:
    "The first three bars of a Bb bebop blues in the Charlie Parker style. Cycled by padPath into the full 12-bar form.",
  composer: "Jazz tradition (Charlie Parker)",
  key: "Bb major (blues)",
  feel: "bebop / blues",
  techniques: ["bebop_chromaticism"],
  steps: [
    // Bar 1 — I / I / iv7 / IV7
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "I — tonic, bebop major 7." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "I — tonic hold." },
    { name: "Bbm7", notes: [46, 49, 53, 57], descriptions: "iv7 — minor iv with bebop color." },
    { name: "Eb7", notes: [51, 55, 58, 62], descriptions: "IV7 — subdominant dominant." },
    // Bar 2 — bVI / bVI / bvi7 / bII7
    { name: "Abmaj7", notes: [44, 48, 51, 55], descriptions: "bVI — subdominant minor region." },
    { name: "Abmaj7", notes: [44, 48, 51, 55], descriptions: "bVI — hold." },
    { name: "Abm7", notes: [44, 47, 51, 55], descriptions: "bvi7 — minor iv of bVI." },
    { name: "Db7", notes: [49, 53, 56, 61], descriptions: "bII7 — backdoor dominant." },
    // Bar 3 — V-of-V / V7 / IV7 / I (turnaround)
    { name: "Gm7", notes: [43, 46, 50, 53], descriptions: "ii of C7 — bebop chromatic pivot." },
    { name: "C7", notes: [48, 52, 55, 58], descriptions: "V7 — dominant of F." },
    { name: "F7", notes: [53, 57, 60, 63], descriptions: "IV7 — bebop turnaround dominant." },
    { name: "Bbmaj7", notes: [46, 50, 53, 57], descriptions: "I — back to head." },
  ],
};

/**
 * Path LX — The Modal Vamp.
 *
 * A two-chord vamp alternating between D Dorian (Dm7) and G
 * Mixolydian (G7). Demonstrates the modal-jazz approach: each chord
 * lasts a full bar, mode is implied by the static harmony rather than
 * by functional motion. `padPath()` cycles this 2-bar pattern to the
 * minimum length so the vamp can be practiced as a long drone.
 */
const modal_vamp_demo: HarmonicPath = {
  id: "modal_vamp_demo",
  title: "Path LX: The Modal Vamp",
  description:
    "Two-chord vamp alternating between D Dorian and G Mixolydian — the modal-jazz building block.",
  composer: "Modal jazz tradition (Miles Davis / Bill Evans)",
  key: "D Dorian / G Mixolydian",
  feel: "modal / vamp",
  techniques: ["modal", "vamp"],
  steps: [
    // Bar 1 — D Dorian (Dm7)
    { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "D Dorian — minor seventh over D." },
    { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "D Dorian — hold." },
    { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "D Dorian — hold." },
    { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "D Dorian — hold." },
    // Bar 2 — G Mixolydian (G7)
    { name: "G7", notes: [43, 47, 50, 54], descriptions: "G Mixolydian — dominant seventh over G." },
    { name: "G7", notes: [43, 47, 50, 54], descriptions: "G Mixolydian — hold." },
    { name: "G7", notes: [43, 47, 50, 54], descriptions: "G Mixolydian — hold." },
    { name: "G7", notes: [43, 47, 50, 54], descriptions: "G Mixolydian — hold." },
  ],
};

/**
 * Path LXI — The Backdoor ii-V.
 *
 * A minor-key cadence demonstrated two ways: standard ii-V-i in
 * bar 1, then backdoor bVII7 → i in bar 2. The bVII7 (Db7 in F
 * minor) functions identically to V7 (C7 would be diatonic; here
 * we use Eb7 for a parallel comparison) but borrows from the
 * parallel major — a classic minor-key color device.
 */
const backdoor_ii_v_demo: HarmonicPath = {
  id: "backdoor_ii_v_demo",
  title: "Path LXI: The Backdoor ii-V",
  description:
    "Minor cadences: standard ii-V-i first, then bVII7 → i (backdoor). Both bars resolve to F minor.",
  composer: "Jazz tradition",
  key: "F minor",
  feel: "educational / minor",
  techniques: ["backdoor_ii_v"],
  steps: [
    // Bar 1 — Cm7 / Eb7 / Fm7 / Fm7 (standard ii-V-i)
    { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "ii of F minor — natural minor seventh." },
    { name: "Eb7", notes: [51, 55, 58, 62], descriptions: "V7 of F minor — diatonic dominant (major-third on Eb)." },
    { name: "Fm7", notes: [41, 44, 48, 51], descriptions: "i of F minor — resolution." },
    { name: "Fm7", notes: [41, 44, 48, 51], descriptions: "i — hold tonic." },
    // Bar 2 — Cm7 / Db7 / Fm7 / Fm7 (backdoor bVII7 → i)
    { name: "Cm7", notes: [48, 51, 55, 58], descriptions: "ii — same minor seventh for comparison." },
    { name: "Db7", notes: [49, 53, 56, 61], descriptions: "bVII7 — backdoor dominant, borrowed from F major." },
    { name: "Fm7", notes: [41, 44, 48, 51], descriptions: "i — resolution via backdoor." },
    { name: "Fm7", notes: [41, 44, 48, 51], descriptions: "i — hold tonic." },
  ],
};

/**
 * All seven Phase 3 concept paths, in order.
 *
 * Spread into `RAW_PATHS` by `src/lib/paths.ts` so they go through
 * the same `padPath()` pass as the classical Phase 5 entries.
 */
export const CONCEPT_PATHS: HarmonicPath[] = [
  ii_v_i_walk,
  tritone_sub_walk,
  coltrane_changes_demo,
  rhythm_changes_demo,
  bird_blues,
  modal_vamp_demo,
  backdoor_ii_v_demo,
];