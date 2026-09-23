/**
 * engine/compose/normalize.test.ts - PRD-001 Phase 4 Slice 1 (test plan 1).
 *
 * Hand-built MidiJsonLike DTO fixtures (no @tonejs/midi needed). Pins
 * the normalize contract: happy path, defaults + warnings, the
 * denominator resolution (real pass-through AND raw-code conversion),
 * sorting, out-of-range drops, velocity scaling, the noNotes /
 * percussion-only / unsupported / tooLarge error arms, and derived
 * endTick / durationSec.
 */

import { describe, it, expect } from "vitest";
import { normalizeMidiJson, MAX_NOTES } from "./normalize";
import type { MidiJsonLike } from "./types";

type NoteDto = { midi: number; ticks: number; durationTicks: number; velocity: number };
type TrackDto = Partial<{
  name: string;
  channel: number;
  instrument: { number: number };
  notes: NoteDto[];
  pitchBends: unknown[];
  endOfTrackTicks: number;
}>;

function note(midi: number, ticks: number, durationTicks = 240, velocity = 0.8): NoteDto {
  return { midi, ticks, durationTicks, velocity };
}

function track(over: TrackDto = {}): NonNullable<MidiJsonLike["tracks"][number]> {
  return {
    name: over.name ?? "",
    channel: over.channel ?? 0,
    instrument: over.instrument ?? { number: 0 },
    notes: over.notes ?? [],
    ...(over.pitchBends ? { pitchBends: over.pitchBends } : {}),
    ...(over.endOfTrackTicks !== undefined ? { endOfTrackTicks: over.endOfTrackTicks } : {}),
  };
}

function dto(over: {
  ppq?: number;
  format?: number;
  tempos?: { ticks: number; bpm: number }[];
  timeSignatures?: { ticks: number; timeSignature: number[] }[];
  keySignatures?: { ticks: number; key: string; scale: string }[];
  tracks?: MidiJsonLike["tracks"];
} = {}): MidiJsonLike {
  return {
    header: {
      ppq: over.ppq ?? 480,
      name: "",
      format: over.format ?? 1,
      tempos: over.tempos ?? [{ ticks: 0, bpm: 120 }],
      timeSignatures: over.timeSignatures ?? [{ ticks: 0, timeSignature: [4, 4] }],
      keySignatures: over.keySignatures ?? [],
    },
    tracks: over.tracks ?? [track({ notes: [note(60, 0), note(64, 240)] })],
  };
}

function okValue(j: MidiJsonLike) {
  const r = normalizeMidiJson(j, "t.mid");
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.value;
}

describe("normalizeMidiJson happy path", () => {
  it("2 tracks + tempo map + 6/8 + Db major key sig", () => {
    const p = okValue(
      dto({
        tempos: [{ ticks: 0, bpm: 120 }, { ticks: 1920, bpm: 100 }],
        timeSignatures: [{ ticks: 0, timeSignature: [6, 8] }],
        keySignatures: [{ ticks: 0, key: "Db", scale: "major" }],
        tracks: [
          track({ name: "Melody", notes: [note(72, 0), note(74, 240)] }),
          track({ name: "Bass", channel: 1, notes: [note(36, 0, 480)] }),
        ],
      }),
    );
    expect(p.format).toBe(1);
    expect(p.ppq).toBe(480);
    expect(p.tracks.length).toBe(2);
    expect(p.tempos.length).toBe(2);
    expect(p.timeSignatures[0]).toEqual({ tick: 0, numerator: 6, denominator: 8 });
    expect(p.keySignatures[0].tonicPc).toBe(1); // Db
    expect(p.keySignatures[0].mode).toBe("major");
    expect(p.tracks[0].name).toBe("Melody");
    expect(p.endTick).toBe(480);
    expect(p.durationSec).toBeGreaterThan(0);
  });

  it("notes are sorted ascending by tick", () => {
    const p = okValue(dto({ tracks: [track({ notes: [note(60, 480), note(62, 0), note(64, 240)] })] }));
    const ticks = p.tracks[0].notes.map((n) => n.tick);
    expect(ticks).toEqual([0, 240, 480]);
  });

  it("derives endTick (last noteOff) + durationSec via the tempo map", () => {
    const p = okValue(dto({ tracks: [track({ notes: [note(60, 0, 480)] })] }));
    expect(p.tracks[0].endTick).toBe(480);
    expect(p.endTick).toBe(480);
    expect(p.durationSec).toBeCloseTo(0.5, 6); // 480 ticks @120bpm ppq480
  });
});

describe("normalizeMidiJson defaults + warnings", () => {
  it("missing tempo -> default 120 + warning", () => {
    const p = okValue(dto({ tempos: [], tracks: [track({ notes: [note(60, 0)] })] }));
    expect(p.tempos).toEqual([{ tick: 0, bpm: 120 }]);
    expect(p.warnings.some((w) => /120 BPM/.test(w))).toBe(true);
  });

  it("missing time signature -> 4/4 + warning", () => {
    const p = okValue(dto({ timeSignatures: [], tracks: [track({ notes: [note(60, 0)] })] }));
    expect(p.timeSignatures).toEqual([{ tick: 0, numerator: 4, denominator: 4 }]);
    expect(p.warnings.some((w) => /4\/4/.test(w))).toBe(true);
  });

  it("first tempo not at tick 0 -> extended back to 0 (no warning)", () => {
    const p = okValue(dto({ tempos: [{ ticks: 960, bpm: 90 }], tracks: [track({ notes: [note(60, 0)] })] }));
    expect(p.tempos[0]).toEqual({ tick: 0, bpm: 90 });
  });
});

describe("normalizeMidiJson denominator resolution (the SMF-code trap)", () => {
  it("real denominator 8 (what @tonejs/midi emits) passes through", () => {
    const p = okValue(dto({ timeSignatures: [{ ticks: 0, timeSignature: [6, 8] }] }));
    expect(p.timeSignatures[0].denominator).toBe(8);
  });
  it("raw SMF code 3 (hand-built) converts to 8", () => {
    const p = okValue(dto({ timeSignatures: [{ ticks: 0, timeSignature: [6, 3] }] }));
    expect(p.timeSignatures[0].denominator).toBe(8);
  });
  it("nonsense denominator -> 4 + warning", () => {
    const p = okValue(dto({ timeSignatures: [{ ticks: 0, timeSignature: [4, 6] }] }));
    expect(p.timeSignatures[0].denominator).toBe(4);
    expect(p.warnings.some((w) => /denominator/.test(w))).toBe(true);
  });
});

describe("normalizeMidiJson note hygiene", () => {
  it("drops out-of-range midi + warns with the count", () => {
    const p = okValue(
      dto({ tracks: [track({ notes: [note(-1, 0), note(128, 240), note(60, 480)] })] }),
    );
    expect(p.tracks[0].notes.length).toBe(1);
    expect(p.tracks[0].notes[0].midi).toBe(60);
    expect(p.warnings.some((w) => /2 note\(s\)/.test(w))).toBe(true);
  });

  it("clamps durationTicks to >= 1", () => {
    const p = okValue(dto({ tracks: [track({ notes: [note(60, 0, 0), note(62, 240, -5)] })] }));
    expect(p.tracks[0].notes.every((n) => n.durationTicks >= 1)).toBe(true);
  });

  it("scales legacy velocity > 1 (0..127) by 1/127", () => {
    const p = okValue(dto({ tracks: [track({ notes: [note(60, 0, 240, 100)] })] }));
    expect(p.tracks[0].notes[0].velocity).toBeCloseTo(100 / 127, 6);
  });

  it("keeps normalized 0..1 velocity unchanged", () => {
    const p = okValue(dto({ tracks: [track({ notes: [note(60, 0, 240, 0.5)] })] }));
    expect(p.tracks[0].notes[0].velocity).toBeCloseTo(0.5, 6);
  });
});

describe("normalizeMidiJson error arms (Outcome, never throws)", () => {
  it("zero notes -> noNotes", () => {
    const r = normalizeMidiJson(dto({ tracks: [track({ notes: [] })] }), "t.mid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("noNotes");
  });

  it("all notes out-of-range -> noNotes", () => {
    const r = normalizeMidiJson(dto({ tracks: [track({ notes: [note(999, 0)] })] }), "t.mid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("noNotes");
  });

  it("ppq <= 0 -> unsupported", () => {
    const r = normalizeMidiJson(dto({ ppq: 0 }), "t.mid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("unsupported");
  });

  it("format > 2 -> unsupported", () => {
    const r = normalizeMidiJson(dto({ format: 3 }), "t.mid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("unsupported");
  });

  it("note count over the ceiling -> tooLarge", () => {
    const notes: NoteDto[] = [];
    for (let i = 0; i <= MAX_NOTES; i++) notes.push(note(60 + (i % 12), i));
    const r = normalizeMidiJson(dto({ tracks: [track({ notes })] }), "big.mid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("tooLarge");
  });

  it("non-object input -> parseFailed", () => {
    const r = normalizeMidiJson(null as unknown as MidiJsonLike, "t.mid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("parseFailed");
  });

  // Hostile hand-built DTOs (tester adversarial round): null / non-
  // object entries used to THROW inside the track loop (tr.notes /
  // n.midi deref). The guards must surface the typed parseFailed arm
  // with "malformed" in the message - never an exception.
  it("tracks:[null] -> parseFailed 'malformed', never throws", () => {
    const j = dto({ tracks: [null as unknown as MidiJsonLike["tracks"][number]] });
    let r: ReturnType<typeof normalizeMidiJson> | null = null;
    expect(() => {
      r = normalizeMidiJson(j, "t.mid");
    }).not.toThrow();
    expect(r!.ok).toBe(false);
    if (r && !r.ok) {
      expect(r.error.code).toBe("parseFailed");
      expect(r.error.message).toContain("malformed");
    }
  });

  it("notes:[null] -> parseFailed 'malformed', never throws", () => {
    const j = dto({
      tracks: [track({ notes: [null as unknown as NoteDto] })],
    });
    let r: ReturnType<typeof normalizeMidiJson> | null = null;
    expect(() => {
      r = normalizeMidiJson(j, "t.mid");
    }).not.toThrow();
    expect(r!.ok).toBe(false);
    if (r && !r.ok) {
      expect(r.error.code).toBe("parseFailed");
      expect(r.error.message).toContain("malformed");
    }
  });

  it("notes:['x'] (non-object entry) -> parseFailed 'malformed', never throws", () => {
    const j = dto({
      tracks: [track({ notes: ["x" as unknown as NoteDto] })],
    });
    let r: ReturnType<typeof normalizeMidiJson> | null = null;
    expect(() => {
      r = normalizeMidiJson(j, "t.mid");
    }).not.toThrow();
    expect(r!.ok).toBe(false);
    if (r && !r.ok) {
      expect(r.error.code).toBe("parseFailed");
      expect(r.error.message).toContain("malformed");
    }
  });

  it("header.track non-array + missing notes still degrades (no throw)", () => {
    const j = {
      header: { ppq: 480, name: "", format: 1, tempos: [], timeSignatures: [], keySignatures: [] },
      tracks: [{ name: "x", channel: 0, instrument: { number: 0 }, notes: undefined } as unknown as MidiJsonLike["tracks"][number]],
    } as MidiJsonLike;
    const r = normalizeMidiJson(j, "t.mid");
    expect(r.ok).toBe(false); // empty notes -> noNotes, the typed arm
    if (!r.ok) expect(r.error.code).toBe("noNotes");
  });
});

describe("normalizeMidiJson percussion + format 0", () => {
  it("percussion-only (channel 9, format 1) is NOT noNotes; isPercussion true", () => {
    const p = okValue(dto({ tracks: [track({ channel: 9, name: "Drums", notes: [note(36, 0), note(38, 240)] })] }));
    expect(p.tracks[0].isPercussion).toBe(true);
    expect(p.tracks[0].notes.length).toBe(2);
  });

  it("format 0 DOES trust channel 9 for percussion (F6 premise falsified)", () => {
    // @tonejs/midi's splitTracks() runs for EVERY format and groups by
    // (program, channel), so Track.channel is per-group accurate at
    // format 0 too: channel 9 is GM drums regardless of format.
    const p = okValue(dto({ format: 0, tracks: [track({ channel: 9, notes: [note(36, 0)] })] }));
    expect(p.tracks[0].isPercussion).toBe(true);
  });

  it("format 0 multi-track -> composite warning", () => {
    const p = okValue(dto({ format: 0, tracks: [track({ notes: [note(60, 0)] }), track({ notes: [note(48, 0)] })] }));
    expect(p.warnings.some((w) => /composite/.test(w))).toBe(true);
    // the warning must NOT claim channels were flattened (falsified F6)
    expect(p.warnings.some((w) => /channels flattened/.test(w))).toBe(false);
  });

  it("pitchBend presence flags the track (REQ-COMP-6 source)", () => {
    const p = okValue(dto({ tracks: [track({ notes: [note(60, 0)], pitchBends: [{ ticks: 0, value: 0 }] })] }));
    expect(p.tracks[0].usesPitchBend).toBe(true);
  });
});
