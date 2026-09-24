/**
 * src/lib/composeUrl.test.ts - PRD-001 Phase 4 Slice 4 (D86, test
 * plan 9). Node-pure: serialize/parse round-trip across ALL 7 keys,
 * the defaults-delete (compact URL) arms, the 6000-char governor
 * (RK-S4-5: wipe compose keys, tooLarge flag, practice keys survive -
 * proven at the record level), malformed -> {session:null,
 * malformed:true}, and chart TEXT with newlines/percent-chars
 * surviving the URLSearchParams encoding.
 */

import { describe, it, expect } from "vitest";
import {
  COMPOSE_URL_KEYS,
  COMPOSE_URL_MAX,
  hasComposeParams,
  serializeComposeSession,
  parseComposeParams,
  composeUrlPresence,
  mergeComposeUrlWithPersisted,
} from "./composeUrl";
import { CHART_SESSION_FILE_NAME, type ComposeSession } from "../state/sessionStore";
import {
  EMPTY_OVERRIDES,
  MIXER_DEFAULTS,
  type AccompanimentRequest,
} from "../../engine/compose/types";

const REQUEST: AccompanimentRequest = {
  version: 1,
  styleId: "jazz",
  roles: ["bass", "chords"],
  density: 3,
  seed: 42,
};
const MIXER = {
  original: { level: 0.5, muted: false, solo: false },
  bass: { level: 1, muted: true, solo: false },
  chords: { level: 1, muted: false, solo: true },
  pad: { level: 0.8, muted: false, solo: false },
};

function toParams(rec: Record<string, string | null>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(rec)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  return p;
}

function midiSession(over: Partial<ComposeSession> = {}): ComposeSession {
  return {
    fileName: "song.mid",
    fileHash: "abc123def456",
    overrides: EMPTY_OVERRIDES,
    analyzeFull: false,
    request: null,
    chartText: null,
    mixer: null,
    ...over,
  };
}

describe("serialize (defaults DELETE their key)", () => {
  it("null session wipes every compose key", () => {
    const { record, tooLarge } = serializeComposeSession(null);
    expect(tooLarge).toBe(false);
    for (const k of COMPOSE_URL_KEYS) expect(record[k]).toBeNull();
  });

  it("a plain MIDI session writes ONLY cfile + chash (compact)", () => {
    const { record } = serializeComposeSession(midiSession());
    expect(record.cfile).toBe("song.mid");
    expect(record.chash).toBe("abc123def456");
    expect(record.cchart).toBeNull();
    expect(record.creq).toBeNull();
    expect(record.covr).toBeNull();
    expect(record.canf).toBeNull();
    expect(record.cmix).toBeNull();
  });

  it("MIDI session: chart identity fields never leak (cchart null)", () => {
    const { record } = serializeComposeSession(midiSession({ request: REQUEST, mixer: MIXER, analyzeFull: true }));
    expect(record.cchart).toBeNull();
    expect(JSON.parse(record.creq as string)).toEqual(REQUEST);
    expect(JSON.parse(record.cmix as string)).toEqual(MIXER);
    expect(record.canf).toBe("1");
  });

  it("chart session: cchart carries the TEXT and cfile/chash are DELETED (e2e leg 6 contract)", () => {
    const { record } = serializeComposeSession(
      midiSession({ fileName: CHART_SESSION_FILE_NAME, fileHash: null, chartText: "{key: Bb}\nBbmaj7 Gm7" }),
    );
    expect(record.cchart).toBe("{key: Bb}\nBbmaj7 Gm7");
    expect(record.cfile).toBeNull();
    expect(record.chash).toBeNull();
  });

  it("hash null (F9) -> chash deleted, cfile survives", () => {
    const { record } = serializeComposeSession(midiSession({ fileHash: null }));
    expect(record.cfile).toBe("song.mid");
    expect(record.chash).toBeNull();
  });

  it("overrides serialize ONLY when non-default (chordCells ride covr)", () => {
    const withCells = {
      ...EMPTY_OVERRIDES,
      chordCells: { "0:0": null },
      tempoBpm: 150,
    };
    const { record } = serializeComposeSession(midiSession({ overrides: withCells }));
    expect(record.covr).not.toBeNull();
    const parsed = parseComposeParams(toParams(record));
    expect(parsed.session?.overrides.tempoBpm).toBe(150);
    expect(parsed.session?.overrides.chordCells).toEqual({ "0:0": null });
  });
});

describe("governor (RK-S4-5: never silent truncation)", () => {
  it("payload past COMPOSE_URL_MAX -> tooLarge + EVERY compose key wiped", () => {
    const huge = {
      ...EMPTY_OVERRIDES,
      chordCells: Object.fromEntries(
        Array.from({ length: 400 }, (_, i) => [
          `${i}:0`,
          { rootPc: 0, qualitySymbol: "maj7", name: "Cmaj7", bassPc: null, confidence: 1, alternatives: [], isRest: false },
        ]),
      ),
    };
    const { record, tooLarge } = serializeComposeSession(midiSession({ overrides: huge }));
    expect(tooLarge).toBe(true);
    for (const k of COMPOSE_URL_KEYS) expect(record[k]).toBeNull();
  });

  it("a normal pasted chart (< 1KB) is far under the governor", () => {
    const chart = "{key: Bb}\n{tempo: 132}\n" + new Array(64).fill("Bbmaj7 Gm7 Ebmaj7 Ab7").join("\n");
    const { tooLarge } = serializeComposeSession(
      midiSession({ fileName: CHART_SESSION_FILE_NAME, fileHash: null, chartText: chart }),
    );
    expect(tooLarge).toBe(false);
  });
});

describe("parse + round-trip", () => {
  it("all 7 keys round-trip a full MIDI session", () => {
    const s = midiSession({
      overrides: { ...EMPTY_OVERRIDES, tempoBpm: 100 },
      analyzeFull: true,
      request: REQUEST,
      mixer: MIXER,
    });
    const parsed = parseComposeParams(toParams(serializeComposeSession(s).record));
    expect(parsed.malformed).toBe(false);
    expect(parsed.session).toEqual(s);
  });

  it("chart round-trip: newlines + percent chars survive the encoding", () => {
    const text = "{key: C}\n% C|%F G| 100%"; // '%' and '|' inside the TEXT
    const s = midiSession({ fileName: CHART_SESSION_FILE_NAME, fileHash: null, chartText: text });
    const params = toParams(serializeComposeSession(s).record);
    const parsed = parseComposeParams(new URLSearchParams(params.toString()));
    expect(parsed.malformed).toBe(false);
    expect(parsed.session?.chartText).toBe(text);
    expect(parsed.session?.fileName).toBe(CHART_SESSION_FILE_NAME);
  });

  it("no compose keys at all -> session null; the boot reader gates the warn on hasComposeParams (etudeUrl precedent)", () => {
    const out = parseComposeParams(new URLSearchParams("mode=etude"));
    expect(out.session).toBeNull();
    // malformed here means "no identity to restore" - App only WARNS
    // when hasComposeParams(params) is true, so a plain practice URL
    // never warns.
    expect(hasComposeParams(new URLSearchParams("mode=etude&transpose=2"))).toBe(false);
    expect(hasComposeParams(new URLSearchParams("cfile=x.mid"))).toBe(true);
    expect(hasComposeParams(new URLSearchParams("creq=bad"))).toBe(true);
  });

  it("creq/cmix/covr garbage -> malformed, session null (warn-and-drop arm)", () => {
    for (const [k, v] of [
      ["creq", "{not json"],
      ["creq", JSON.stringify({ version: 2, styleId: "jazz", roles: [], density: 1, seed: 1 })],
      ["cmix", JSON.stringify({ original: { level: 5, muted: false, solo: false } })],
      ["cmix", "banana"],
      ["covr", "[1,2,3]"],
      ["canf", "maybe"],
    ] as const) {
      const p = new URLSearchParams(`cfile=s.mid&${k}=${encodeURIComponent(v)}`);
      const out = parseComposeParams(p);
      expect(out.malformed, `${k}=${v}`).toBe(true);
      expect(out.session, `${k}=${v}`).toBeNull();
    }
  });

  it("cfile WITHOUT cchart + optional keys -> a file session with defaults at read", () => {
    const out = parseComposeParams(new URLSearchParams("cfile=keep.mid&chash=h1"));
    expect(out.malformed).toBe(false);
    expect(out.session).toEqual(midiSession({ fileName: "keep.mid", fileHash: "h1" }));
  });

  it("cchart BEATS a stale cfile (precedence: chart identity is the text)", () => {
    const out = parseComposeParams(new URLSearchParams("cchart=C%20F&cfile=old.mid"));
    expect(out.session?.chartText).toBe("C F");
    expect(out.session?.fileName).toBe(CHART_SESSION_FILE_NAME);
    expect(out.session?.fileHash).toBeNull();
  });

  it("serialize->parse is STABLE (URL round-trip determinism, two passes)", () => {
    const s = midiSession({ request: REQUEST, mixer: MIXER, chartText: null });
    const once = toParams(serializeComposeSession(s).record).toString();
    const twice = toParams(serializeComposeSession(parseComposeParams(new URLSearchParams(once)).session).record).toString();
    expect(twice).toBe(once);
  });
});

// ---------------------------------------------------------------------------
// HIGH-001 (S4 fix round): the FIELD-WISE boot merge. The debounced
// writer dies on reload, so a fast reload's URL can carry a STALE
// compose payload while localStorage holds the fresher one - the old
// wholesale URL-wins clobbered it (S3 e2e leg-3 flake: seed 43
// persisted, 42 restored). These pins are the STRUCTURAL fix (the
// pagehide flush in App.tsx is the complement, e2e-pinned).
// ---------------------------------------------------------------------------

describe("HIGH-001 field-wise boot merge (identity-gated)", () => {
  /** The EXACT flake shape: a URL written BEFORE the request changed
   *  (cfile present, creq NEVER carried) + a persisted session whose
   *  request is fresher. The persisted request MUST survive the merge. */
  it("URL with cfile but NO creq + persisted session WITH request -> request survives the boot merge", () => {
    const persisted = midiSession({ request: REQUEST }); // seed 43 home
    const persistedFresh = { ...persisted, request: { ...REQUEST, seed: 43 } };
    const params = new URLSearchParams("cfile=song.mid&chash=abc123def456"); // NO creq
    const parsed = parseComposeParams(params);
    expect(parsed.session).not.toBeNull();
    const merged = mergeComposeUrlWithPersisted(
      parsed.session as ComposeSession,
      composeUrlPresence(params),
      persistedFresh,
    );
    expect(merged.request?.seed).toBe(43); // PERSISTED wins (URL silent)
    expect(merged.fileName).toBe("song.mid");
  });

  it("URL keys it DOES carry win (present creq overrides persisted)", () => {
    const persisted = midiSession({ request: { ...REQUEST, seed: 43 } });
    const params = new URLSearchParams(
      `cfile=song.mid&chash=abc123def456&creq=${encodeURIComponent(JSON.stringify(REQUEST))}`,
    ); // creq seed 42
    const merged = mergeComposeUrlWithPersisted(
      parseComposeParams(params).session as ComposeSession,
      composeUrlPresence(params),
      persisted,
    );
    expect(merged.request?.seed).toBe(42); // URL carried it -> URL wins
  });

  it("absent covr/canf/cmix fall back to persisted (mixer + overrides survive)", () => {
    const persisted = midiSession({
      overrides: { ...EMPTY_OVERRIDES, tempoBpm: 150 },
      analyzeFull: true,
      mixer: MIXER,
    });
    const params = new URLSearchParams("cfile=song.mid&chash=abc123def456");
    const merged = mergeComposeUrlWithPersisted(
      parseComposeParams(params).session as ComposeSession,
      composeUrlPresence(params),
      persisted,
    );
    expect(merged.overrides.tempoBpm).toBe(150);
    expect(merged.analyzeFull).toBe(true);
    expect(merged.mixer).toEqual(MIXER);
  });

  it("IDENTITY GATE: different cfile+chash -> URL wins WHOLESALE (persisted fields dropped)", () => {
    const persisted = midiSession({ fileName: "other.mid", fileHash: "zzz", request: REQUEST });
    const params = new URLSearchParams("cfile=song.mid&chash=abc123def456");
    const merged = mergeComposeUrlWithPersisted(
      parseComposeParams(params).session as ComposeSession,
      composeUrlPresence(params),
      persisted,
    );
    // Wholesale: the parsed URL session verbatim (request null, no persisted leak).
    expect(merged.request).toBeNull();
    expect(merged.fileName).toBe("song.mid");
  });

  it("IDENTITY GATE: empty storage (persisted null) -> wholesale URL", () => {
    const params = new URLSearchParams("cfile=song.mid&chash=abc123def456");
    const parsed = parseComposeParams(params).session as ComposeSession;
    expect(mergeComposeUrlWithPersisted(parsed, composeUrlPresence(params), null)).toBe(parsed);
  });

  it("both-chart identity -> merge (URL chart text wins, persisted mixer/request survive)", () => {
    const persisted = midiSession({
      fileName: CHART_SESSION_FILE_NAME,
      fileHash: null,
      chartText: "OLD CHART",
      request: REQUEST,
      mixer: MIXER,
    });
    const params = new URLSearchParams(`cchart=${encodeURIComponent("C F G Am")}`);
    const merged = mergeComposeUrlWithPersisted(
      parseComposeParams(params).session as ComposeSession,
      composeUrlPresence(params),
      persisted,
    );
    expect(merged.chartText).toBe("C F G Am"); // URL carried it
    expect(merged.request?.seed).toBe(42); // persisted survived (no creq)
    expect(merged.mixer).toEqual(MIXER); // persisted survived (no cmix)
  });

  it("chart URL vs file persisted (identity mismatch) -> wholesale", () => {
    const persisted = midiSession({ request: REQUEST }); // a FILE session
    const params = new URLSearchParams("cchart=C%20F");
    const merged = mergeComposeUrlWithPersisted(
      parseComposeParams(params).session as ComposeSession,
      composeUrlPresence(params),
      persisted,
    );
    expect(merged.request).toBeNull(); // wholesale: persisted request dropped
    expect(merged.chartText).toBe("C F");
  });
});

// ---------------------------------------------------------------------------
// TESTER F-2 (S4 fix round): the governor-wipe SCOPE. The tooLarge
// path may only ever touch COMPOSE_URL_KEYS - a wipe that reached a
// practice/etude key (e.g. 'mode') would silently kill the practice
// session on an oversized compose payload. These pins make that
// mutation fatal.
// ---------------------------------------------------------------------------

describe("governor-wipe SCOPE (TESTER F-2: never touch non-compose keys)", () => {
  const hugeOverrides = {
    ...EMPTY_OVERRIDES,
    chordCells: Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [
        `${i}:0`,
        { rootPc: 0, qualitySymbol: "maj7", name: "Cmaj7", bassPc: null, confidence: 1, alternatives: [], isRest: false },
      ]),
    ),
  };

  it("the wiped record's key set is EXACTLY COMPOSE_URL_KEYS (a wipe touching 'mode' dies here)", () => {
    const tooBig = serializeComposeSession(midiSession({ overrides: hugeOverrides }));
    expect(tooBig.tooLarge).toBe(true);
    expect(Object.keys(tooBig.record).sort()).toEqual([...COMPOSE_URL_KEYS].sort());
    const nullRec = serializeComposeSession(null);
    expect(Object.keys(nullRec.record).sort()).toEqual([...COMPOSE_URL_KEYS].sort());
  });

  it("writer-merge simulation: applying the wiped record to a practice URL leaves mode/transpose/etude keys INTACT", () => {
    const { record } = serializeComposeSession(midiSession({ overrides: hugeOverrides }));
    const params = new URLSearchParams("mode=practice&transpose=2&path=7");
    // This is EXACTLY App's writer loop (delete on null, set otherwise).
    for (const [k, v] of Object.entries(record)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    expect(params.get("mode")).toBe("practice"); // SURVIVES
    expect(params.get("transpose")).toBe("2"); // SURVIVES
    expect(params.get("path")).toBe("7"); // SURVIVES
    for (const k of COMPOSE_URL_KEYS) expect(params.has(k)).toBe(false); // compose keys wiped
  });
});
