/**
 * src/lib/marketplace.test.ts - PIN-001.
 *
 * The marketplace surface's pure logic: parseListing validation,
 * buildSlideshowLayers mapping, beatAtElapsed math, and fetchListings
 * error handling with a mocked fetch. Pure logic - runs in the node
 * project (no DOM), so NO JSDOM_FILES change is needed.
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
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MARKETPLACE_SERVER,
  fetchListings,
  parseListing,
  buildSlideshowLayers,
  beatAtElapsed,
  isActiveAudio,
  type Listing,
} from "./marketplace";

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

afterEach(() => {
  vi.unstubAllGlobals();
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
});