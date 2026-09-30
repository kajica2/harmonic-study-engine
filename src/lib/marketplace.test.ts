/**
 * src/lib/marketplace.test.ts - PIN-001.
 *
 * The marketplace surface's pure logic: parseListing validation,
 * buildSlideshowLayers mapping, beatAtElapsed math, fetchListings
 * error handling with a mocked fetch, the wavBlobToMp3 wrapper
 * contract with a mocked lamejs, and the serverless
 * fetchListingsFromGithub / parseGithubListing pins. Pure logic -
 * runs in the node project (no DOM), so NO JSDOM_FILES change is
 * needed.
 *
 * Pinned laws:
 *   - parseListing accepts a well-formed listing and rejects payloads
 *     missing any of id / title / composer / audio_url.
 *   - buildSlideshowLayers derives 2-3 layers from key/tempo/form and
 *     always returns barsPerLayer = 4.
 *   - beatAtElapsed is floor(elapsedMs / 1000 * bpm / 60) at known
 *     BPMs, and returns 0 for non-finite / non-positive inputs.
 *   - fetchListings never throws: non-ok status, rejected fetch and
 *     malformed payloads all resolve to { ok: false, error }.
 *   - wavBlobToMp3 takes a WAV Blob and returns an MP3 Blob with the
 *     audio/mpeg MIME, driving lamejs Mp3Encoder with the parsed
 *     channel count / sample rate (lamejs is mocked - the encoder
 *     internals are not pinned, only the wrapper contract).
 *   - publishListing POSTs mp3 + midi + slug to /api/publish and
 *     never throws.
 *   - fetchListingsFromGithub GETs /api/listings, maps the serverless
 *     {slug, title, mp3_url, midi_url} shape into Listing, and never
 *     throws.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { Mp3Encoder } from "@breezystack/lamejs";
import {
  MARKETPLACE_SERVER,
  MARKETPLACE_SERVERLESS_BASE,
  fetchListings,
  fetchListingsFromGithub,
  parseListing,
  parseGithubListing,
  parseWavBuffer,
  wavSamplesToInt16,
  buildSlideshowLayers,
  beatAtElapsed,
  isActiveAudio,
  deriveSlug,
  midiDataUriToBlob,
  buildPublishFormData,
  publishListing,
  wavBlobToMp3,
  type Listing,
} from "./marketplace";

// lamejs is dynamically imported inside wavBlobToMp3; the mock keeps
// the encoder out of the node test env and lets the wrapper contract
// be pinned without exercising the real MP3 math.
vi.mock("@breezystack/lamejs", () => ({
  Mp3Encoder: vi.fn(),
}));

const Mp3EncoderMock = vi.mocked(Mp3Encoder);

const validListing: Listing = {
  id: "lst-1",
  title: "Stella by Starlight",
  composer: "Victor Young",
  key: "Bb",
  tempo: 120,
  form: "AABA",
  audio_url: "https://example.com/stella.wav",
  cover_url: "https://example.com/stella.jpg",
  status: "published",
  source_commit: "abc123",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/**
 * Build a real 16-bit PCM WAV Blob for the wavBlobToMp3 wrapper pins.
 * Mirrors the RIFF layout produced by src/lib/loopWav.ts encodeWav.
 */
function makeWavBlob(
  opts: {
    channels?: number;
    sampleRate?: number;
    bits?: number;
    samples?: number[];
  } = {},
): Blob {
  const channels = opts.channels ?? 1;
  const sampleRate = opts.sampleRate ?? 44100;
  const bits = opts.bits ?? 16;
  const samples = opts.samples ?? [0, 1000, -1000, 500];
  const bytesPerSample = bits / 8;
  const dataSize = samples.length * channels * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  let o = 0;
  writeStr(o, "RIFF"); o += 4;
  view.setUint32(o, 36 + dataSize, true); o += 4;
  writeStr(o, "WAVE"); o += 4;
  writeStr(o, "fmt "); o += 4;
  view.setUint32(o, 16, true); o += 4;
  view.setUint16(o, 1, true); o += 2;
  view.setUint16(o, channels, true); o += 2;
  view.setUint32(o, sampleRate, true); o += 4;
  view.setUint32(o, sampleRate * channels * bytesPerSample, true); o += 4;
  view.setUint16(o, channels * bytesPerSample, true); o += 2;
  view.setUint16(o, bits, true); o += 2;
  writeStr(o, "data"); o += 4;
  view.setUint32(o, dataSize, true); o += 4;
  for (let i = 0; i < samples.length; i++) {
    for (let c = 0; c < channels; c++) {
      if (bits === 16) view.setInt16(o, samples[i], true);
      else view.setUint8(o, samples[i]);
      o += bytesPerSample;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  Mp3EncoderMock.mockReset();
});

describe("parseListing", () => {
  it("accepts a well-formed listing and preserves every field", () => {
    const parsed = parseListing(validListing);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(validListing);
  });

  it("rejects non-object payloads", () => {
    expect(parseListing(null)).toBeNull();
    expect(parseListing(undefined)).toBeNull();
    expect(parseListing("nope")).toBeNull();
    expect(parseListing(42)).toBeNull();
    expect(parseListing([])).toBeNull();
  });

  it("rejects payloads missing id / title / composer / audio_url", () => {
    const base = { ...validListing };
    expect(parseListing({ ...base, id: "" })).toBeNull();
    expect(parseListing({ ...base, title: "" })).toBeNull();
    expect(parseListing({ ...base, composer: "" })).toBeNull();
    expect(parseListing({ ...base, audio_url: "" })).toBeNull();
    const { id: _id, ...noId } = base;
    expect(parseListing(noId)).toBeNull();
    const { title: _title, ...noTitle } = base;
    expect(parseListing(noTitle)).toBeNull();
    const { composer: _composer, ...noComposer } = base;
    expect(parseListing(noComposer)).toBeNull();
    const { audio_url: _audioUrl, ...noAudio } = base;
    expect(parseListing(noAudio)).toBeNull();
  });

  it("rejects non-string required fields", () => {
    expect(parseListing({ ...validListing, title: 7 })).toBeNull();
    expect(parseListing({ ...validListing, composer: null })).toBeNull();
    expect(parseListing({ ...validListing, audio_url: ["x"] })).toBeNull();
  });

  it("coerces missing optional fields to null / defaults", () => {
    const sparse = {
      id: "lst-2",
      title: "Blue in Green",
      composer: "Miles Davis",
      audio_url: "https://example.com/big.wav",
    };
    const parsed = parseListing(sparse);
    expect(parsed).not.toBeNull();
    expect(parsed?.key).toBeNull();
    expect(parsed?.tempo).toBeNull();
    expect(parsed?.form).toBeNull();
    expect(parsed?.cover_url).toBeNull();
    expect(parsed?.status).toBe("published");
    expect(parsed?.source_commit).toBeNull();
    expect(parsed?.created_at).toBe("");
    expect(parsed?.updated_at).toBe("");
  });

  it("rejects a non-finite tempo instead of propagating NaN", () => {
    const parsed = parseListing({ ...validListing, tempo: NaN });
    expect(parsed).not.toBeNull();
    expect(parsed?.tempo).toBeNull();
  });
});

describe("buildSlideshowLayers", () => {
  it("derives 3 layers from key / tempo / form with barsPerLayer 4", () => {
    const { layers, barsPerLayer } = buildSlideshowLayers(validListing);
    expect(barsPerLayer).toBe(4);
    expect(layers).toHaveLength(3);
    expect(layers[0]).toEqual({ id: "key", title: "Key: Bb" });
    expect(layers[1]).toEqual({ id: "tempo", title: "Tempo: 120" });
    expect(layers[2]).toEqual({ id: "form", title: "Form: AABA" });
  });

  it("pads a single metadata layer with title / composer", () => {
    const { layers } = buildSlideshowLayers({
      ...validListing,
      key: null,
      tempo: null,
    });
    expect(layers).toHaveLength(2);
    expect(layers[0]).toEqual({ id: "form", title: "Form: AABA" });
    expect(layers[1]).toEqual({
      id: "title",
      title: "Stella by Starlight",
      subtitle: "Victor Young",
    });
  });

  it("falls back to title / composer when no metadata exists", () => {
    const { layers } = buildSlideshowLayers({
      ...validListing,
      key: null,
      tempo: null,
      form: null,
    });
    expect(layers).toHaveLength(2);
    expect(layers[0]).toEqual({ id: "title", title: "Stella by Starlight" });
    expect(layers[1]).toEqual({ id: "composer", title: "Victor Young" });
  });

  it("always returns at least 2 layers (slideshow crossfade partner)", () => {
    for (const listing of [
      validListing,
      { ...validListing, key: null },
      { ...validListing, key: null, tempo: null, form: null },
    ]) {
      const { layers } = buildSlideshowLayers(listing);
      expect(layers.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("beatAtElapsed", () => {
  it("bpm=120: one beat every 500ms", () => {
    expect(beatAtElapsed(0, 120)).toBe(0);
    expect(beatAtElapsed(499, 120)).toBe(0);
    expect(beatAtElapsed(500, 120)).toBe(1);
    expect(beatAtElapsed(1000, 120)).toBe(2);
    expect(beatAtElapsed(2500, 120)).toBe(5);
  });

  it("bpm=60: one beat every 1000ms", () => {
    expect(beatAtElapsed(999, 60)).toBe(0);
    expect(beatAtElapsed(1000, 60)).toBe(1);
    expect(beatAtElapsed(2000, 60)).toBe(2);
  });

  it("bpm=90: floors fractional beats", () => {
    // 1000ms at 90bpm = 1.5 beats -> floor 1
    expect(beatAtElapsed(1000, 90)).toBe(1);
    // 2000ms at 90bpm = 3.0 beats
    expect(beatAtElapsed(2000, 90)).toBe(3);
  });

  it("defensive: non-finite / non-positive inputs return 0", () => {
    expect(beatAtElapsed(NaN, 120)).toBe(0);
    expect(beatAtElapsed(1000, NaN)).toBe(0);
    expect(beatAtElapsed(1000, 0)).toBe(0);
    expect(beatAtElapsed(1000, -60)).toBe(0);
    expect(beatAtElapsed(-500, 120)).toBe(0);
  });
});

describe("isActiveAudio", () => {
  it("honors callbacks from the current audio element", () => {
    const audio = {} as HTMLAudioElement;
    expect(isActiveAudio(audio, audio)).toBe(true);
  });

  it("ignores callbacks from a superseded or stopped element", () => {
    const current = {} as HTMLAudioElement;
    const stale = {} as HTMLAudioElement;
    // A newer card superseded the element that just resolved.
    expect(isActiveAudio(current, stale)).toBe(false);
    // Stop cleared the ref before play() resolved.
    expect(isActiveAudio(null, stale)).toBe(false);
  });
});

describe("fetchListings", () => {
  it("returns parsed listings on a 200 array payload (filters invalid)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        validListing,
        { id: "bad", title: "", composer: "x", audio_url: "y" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchListings("http://127.0.0.1:8765");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].id).toBe("lst-1");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/marketplace/listings",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("strips a trailing slash from the base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    await fetchListings("http://127.0.0.1:8765/");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/marketplace/listings",
      expect.anything(),
    );
  });

  it("appends the status query param when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    await fetchListings("http://127.0.0.1:8765", { status: "published" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/marketplace/listings?status=published",
      expect.anything(),
    );
  });

  it("returns a typed failure on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    const result = await fetchListings("http://127.0.0.1:8765");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("503");
  });

  it("returns a typed failure when fetch rejects (offline)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    const result = await fetchListings("http://127.0.0.1:8765");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("fetch failed");
  });

  it("returns a typed failure on a non-array payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: true }) }),
    );
    const result = await fetchListings("http://127.0.0.1:8765");
    expect(result.ok).toBe(false);
  });

  it("never throws - a malformed JSON body is a typed failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("bad json");
        },
      }),
    );
    const result = await fetchListings("http://127.0.0.1:8765");
    expect(result.ok).toBe(false);
  });

  it("MARKETPLACE_SERVER falls back to the local backend default", () => {
    // The constant is read from import.meta.env at module load; in the
    // node test env VITE_DDSP_API is unset, so the default must hold.
    expect(MARKETPLACE_SERVER).toBe("http://127.0.0.1:8765");
  });

  it("MARKETPLACE_SERVERLESS_BASE is same-origin (empty string)", () => {
    expect(MARKETPLACE_SERVERLESS_BASE).toBe("");
  });
});

describe("deriveSlug", () => {
  it("lowercases and dashes spaces", () => {
    expect(deriveSlug("Autumn Leaves")).toBe("autumn-leaves");
  });

  it("collapses runs of non-alphanumeric characters into one dash", () => {
    expect(deriveSlug("Blue in Green (take 2)!")).toBe("blue-in-green-take-2");
  });

  it("trims leading and trailing dashes", () => {
    expect(deriveSlug("  --Stella by Starlight--  ")).toBe(
      "stella-by-starlight",
    );
  });

  it("falls back to untitled for empty or symbol-only titles", () => {
    expect(deriveSlug("")).toBe("untitled");
    expect(deriveSlug("   ")).toBe("untitled");
    expect(deriveSlug("!!!")).toBe("untitled");
  });
});

describe("midiDataUriToBlob", () => {
  it("decodes a base64 data URI into a Blob with the declared mime", () => {
    const blob = midiDataUriToBlob("data:audio/midi;base64,TVRoZAAAAA==");
    expect(blob.type).toBe("audio/midi");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("throws on a malformed data URI", () => {
    expect(() => midiDataUriToBlob("not-a-data-uri")).toThrow();
  });
});

describe("buildPublishFormData", () => {
  const mp3Blob = new Blob(["mp3"], { type: "audio/mpeg" });
  const midiBlob = new Blob(["midi"], { type: "audio/midi" });

  it("appends mp3, midi, slug and optional metadata", () => {
    const form = buildPublishFormData({
      mp3Blob,
      midiBlob,
      slug: "autumn-leaves",
      title: "Autumn Leaves",
      composer: "Joseph Kosma",
    });
    expect(form.get("slug")).toBe("autumn-leaves");
    expect(form.get("title")).toBe("Autumn Leaves");
    expect(form.get("composer")).toBe("Joseph Kosma");
    expect(form.get("mp3")).toBeInstanceOf(Blob);
    expect(form.get("midi")).toBeInstanceOf(Blob);
  });

  it("omits empty optional metadata", () => {
    const form = buildPublishFormData({
      mp3Blob,
      midiBlob,
      slug: "autumn-leaves",
    });
    expect(form.get("title")).toBeNull();
    expect(form.get("composer")).toBeNull();
  });
});

describe("wavBlobToMp3", () => {
  it("encodes a mono WAV to an MP3 blob with the audio/mpeg MIME", async () => {
    const encodeBuffer = vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]));
    const flush = vi.fn().mockReturnValue(new Uint8Array([4, 5]));
    class FakeEncoder {
      encodeBuffer = encodeBuffer;
      flush = flush;
    }
    Mp3EncoderMock.mockImplementation(FakeEncoder as unknown as typeof Mp3Encoder);

    const wav = makeWavBlob({ channels: 1, sampleRate: 44100 });
    const mp3 = await wavBlobToMp3(wav);

    expect(mp3.type).toBe("audio/mpeg");
    expect(mp3.size).toBeGreaterThan(0);
    expect(Mp3EncoderMock).toHaveBeenCalledWith(1, 44100, 192);
    expect(encodeBuffer).toHaveBeenCalled();
    expect(flush).toHaveBeenCalled();
  });

  it("passes stereo channels to the encoder", async () => {
    const encodeBuffer = vi.fn().mockReturnValue(new Uint8Array([9]));
    const flush = vi.fn().mockReturnValue(new Uint8Array([8]));
    class FakeEncoder {
      encodeBuffer = encodeBuffer;
      flush = flush;
    }
    Mp3EncoderMock.mockImplementation(FakeEncoder as unknown as typeof Mp3Encoder);

    const wav = makeWavBlob({ channels: 2, sampleRate: 22050 });
    await wavBlobToMp3(wav);

    expect(Mp3EncoderMock).toHaveBeenCalledWith(2, 22050, 192);
    expect(encodeBuffer).toHaveBeenCalledWith(
      expect.any(Int16Array),
      expect.any(Int16Array),
    );
  });

  it("throws on a malformed WAV (not a RIFF container)", async () => {
    const bad = new Blob(["not a wav file at all"], { type: "audio/wav" });
    await expect(wavBlobToMp3(bad)).rejects.toThrow();
  });

  it("throws on an empty data chunk", async () => {
    const empty = makeWavBlob({ samples: [] });
    await expect(wavBlobToMp3(empty)).rejects.toThrow(/no audio samples/);
  });
});

describe("parseWavBuffer / wavSamplesToInt16", () => {
  it("parses a mono 16-bit WAV layout", async () => {
    const wav = makeWavBlob({ channels: 1, sampleRate: 44100 });
    const buffer = await wav.arrayBuffer();
    const info = parseWavBuffer(buffer);
    expect(info.channels).toBe(1);
    expect(info.sampleRate).toBe(44100);
    expect(info.bitsPerSample).toBe(16);
    expect(info.audioFormat).toBe(1);
    expect(info.dataLength).toBeGreaterThan(0);
    const channels = wavSamplesToInt16(buffer, info);
    expect(channels).toHaveLength(1);
    expect(channels[0].length).toBeGreaterThan(0);
  });

  it("parses a stereo 16-bit WAV into two channels", async () => {
    const wav = makeWavBlob({ channels: 2, sampleRate: 22050 });
    const buffer = await wav.arrayBuffer();
    const info = parseWavBuffer(buffer);
    expect(info.channels).toBe(2);
    expect(info.sampleRate).toBe(22050);
    const channels = wavSamplesToInt16(buffer, info);
    expect(channels).toHaveLength(2);
    expect(channels[0].length).toBe(channels[1].length);
  });

  it("rejects a non-RIFF buffer", async () => {
    const buffer = new ArrayBuffer(64);
    expect(() => parseWavBuffer(buffer)).toThrow();
  });
});

describe("parseGithubListing", () => {
  it("maps the serverless shape into a Listing", () => {
    const parsed = parseGithubListing({
      slug: "autumn-leaves",
      title: "Autumn Leaves",
      mp3_url: "https://raw.githubusercontent.com/kajica2/harmonic-study-engine/main/marketplace/autumn-leaves.mp3",
      midi_url: "https://raw.githubusercontent.com/kajica2/harmonic-study-engine/main/marketplace/autumn-leaves.mid",
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("autumn-leaves");
    expect(parsed?.title).toBe("Autumn Leaves");
    expect(parsed?.composer).toBe("harmonic-study-engine");
    expect(parsed?.audio_url).toContain("autumn-leaves.mp3");
    expect(parsed?.status).toBe("published");
  });

  it("rejects payloads missing slug / title / mp3_url / midi_url", () => {
    const base = {
      slug: "x",
      title: "X",
      mp3_url: "https://example.com/x.mp3",
      midi_url: "https://example.com/x.mid",
    };
    expect(parseGithubListing({ ...base, slug: "" })).toBeNull();
    expect(parseGithubListing({ ...base, title: "" })).toBeNull();
    expect(parseGithubListing({ ...base, mp3_url: "" })).toBeNull();
    expect(parseGithubListing({ ...base, midi_url: "" })).toBeNull();
    expect(parseGithubListing(null)).toBeNull();
    expect(parseGithubListing("nope")).toBeNull();
  });
});

describe("fetchListingsFromGithub", () => {
  it("GETs /api/listings and maps the serverless shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          slug: "autumn-leaves",
          title: "Autumn Leaves",
          mp3_url: "https://raw.githubusercontent.com/kajica2/harmonic-study-engine/main/marketplace/autumn-leaves.mp3",
          midi_url: "https://raw.githubusercontent.com/kajica2/harmonic-study-engine/main/marketplace/autumn-leaves.mid",
        },
        { slug: "bad", title: "", mp3_url: "x", midi_url: "y" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchListingsFromGithub("");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].id).toBe("autumn-leaves");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listings",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("strips a trailing slash from the base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    await fetchListingsFromGithub("https://example.com/");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/listings",
      expect.anything(),
    );
  });

  it("returns a typed failure on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 502 }),
    );
    const result = await fetchListingsFromGithub("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("502");
  });

  it("returns a typed failure when fetch rejects (offline)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    const result = await fetchListingsFromGithub("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("fetch failed");
  });

  it("returns a typed failure on a non-array payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: true }) }),
    );
    const result = await fetchListingsFromGithub("");
    expect(result.ok).toBe(false);
  });

  it("never throws - a malformed JSON body is a typed failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("bad json");
        },
      }),
    );
    const result = await fetchListingsFromGithub("");
    expect(result.ok).toBe(false);
  });
});

describe("publishListing", () => {
  const mp3Blob = new Blob(["mp3"], { type: "audio/mpeg" });
  const midiBlob = new Blob(["midi"], { type: "audio/midi" });

  it("POSTs mp3 + midi + slug to /api/publish on a 200 publish", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ published: true, slug: "autumn-leaves" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishListing("https://example.com", {
      mp3Blob,
      midiBlob,
      slug: "autumn-leaves",
      title: "Autumn Leaves",
      composer: "Joseph Kosma",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.listing).toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/publish",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    const [, init] = fetchMock.mock.calls[0];
    const form = init.body as FormData;
    expect(form.get("slug")).toBe("autumn-leaves");
    expect(form.get("title")).toBe("Autumn Leaves");
    expect(form.get("composer")).toBe("Joseph Kosma");
    expect(form.get("mp3")).toBeInstanceOf(Blob);
    expect(form.get("midi")).toBeInstanceOf(Blob);
  });

  it("uses the same-origin base when given an empty string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ published: true, slug: "x" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await publishListing("", { mp3Blob, midiBlob, slug: "x" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/publish",
      expect.anything(),
    );
  });

  it("returns a typed failure with the serverless error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: "slug must match ^[a-z0-9-]+$" }),
      }),
    );
    const result = await publishListing("https://example.com", {
      mp3Blob,
      midiBlob,
      slug: "Bad Slug!",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("slug must match");
  });

  it("returns a typed failure with the detail field when present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: "GITHUB_TOKEN not configured" }),
      }),
    );
    const result = await publishListing("https://example.com", {
      mp3Blob,
      midiBlob,
      slug: "autumn-leaves",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("GITHUB_TOKEN");
  });

  it("returns a typed failure when fetch rejects (offline)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    const result = await publishListing("https://example.com", {
      mp3Blob,
      midiBlob,
      slug: "autumn-leaves",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("fetch failed");
  });

  it("returns a typed failure when published is not true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ published: false }),
      }),
    );
    const result = await publishListing("https://example.com", {
      mp3Blob,
      midiBlob,
      slug: "autumn-leaves",
    });
    expect(result.ok).toBe(false);
  });

  it("never throws - a malformed JSON body is a typed failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("bad json");
        },
      }),
    );
    const result = await publishListing("https://example.com", {
      mp3Blob,
      midiBlob,
      slug: "autumn-leaves",
    });
    expect(result.ok).toBe(false);
  });
});