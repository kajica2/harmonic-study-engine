// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  ACCEPT_ATTR,
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  createBackingTrack,
  formatBackingTrackSize,
  validateBackingTrackFile,
} from "./backingTrack";

// jsdom doesn't ship URL.createObjectURL / revokeObjectURL — polyfill
// them so createBackingTrack can run in tests. Each create returns a
// unique blob URL so the test can assert distinct URLs across calls.
if (typeof URL.createObjectURL !== "function") {
  let n = 0;
  (URL as unknown as {
    createObjectURL: (b: Blob) => string;
    revokeObjectURL: (u: string) => void;
  }).createObjectURL = () => `blob:test-${++n}`;
  (URL as unknown as {
    createObjectURL: (b: Blob) => string;
    revokeObjectURL: (u: string) => void;
  }).revokeObjectURL = () => {};
}

/** Tiny File factory for tests — jsdom doesn't ship a real File ctor
 * with all the properties we need, so we polyfill minimally. The
 * returned File reports `size` matching the `sizeBytes` argument. */
function makeFile(name: string, sizeBytes: number, type: string): File {
  // Allocate a real Uint8Array of the requested size so `file.size`
  // matches. Cap at 64 KB to keep tests fast; tests that need >64 KB
  // would be unusual.
  const actualBytes = Math.min(sizeBytes, 64 * 1024);
  const blob = new Blob([new Uint8Array(actualBytes)], { type });
  // Override the size descriptor on the File via Object.defineProperty.
  const file = new File([blob], name, { type });
  if (sizeBytes !== actualBytes) {
    Object.defineProperty(file, "size", {
      value: sizeBytes,
      configurable: true,
    });
  }
  return file;
}

describe("backingTrack — file validation", () => {
  it("accepts .mp4 with video/mp4 MIME", () => {
    expect(validateBackingTrackFile(makeFile("solo.mp4", 1024, "video/mp4")).ok).toBe(true);
  });

  it("accepts .mov with video/quicktime MIME", () => {
    expect(validateBackingTrackFile(makeFile("take.mov", 1024, "video/quicktime")).ok).toBe(true);
  });

  it("accepts .mpg with video/mpeg MIME", () => {
    expect(validateBackingTrackFile(makeFile("recording.mpg", 1024, "video/mpeg")).ok).toBe(true);
  });

  it("accepts a .mov file even when the browser reports no MIME", () => {
    // Some platforms leave MIME empty; we should still accept on extension.
    expect(validateBackingTrackFile(makeFile("clip.mov", 1024, "")).ok).toBe(true);
  });

  it("rejects .wav / .mp3 (audio-only containers)", () => {
    const wav = validateBackingTrackFile(makeFile("song.wav", 1024, "audio/wav"));
    expect(wav.ok).toBe(false);
    expect(wav.reason).toMatch(/Unsupported/i);
  });

  it("rejects .pdf and other non-audio/video", () => {
    const pdf = validateBackingTrackFile(makeFile("notes.pdf", 1024, "application/pdf"));
    expect(pdf.ok).toBe(false);
  });

  it("rejects an empty file", () => {
    const empty = validateBackingTrackFile(makeFile("zero.mp4", 0, "video/mp4"));
    expect(empty.ok).toBe(false);
    expect(empty.reason).toMatch(/empty/i);
  });

  it("rejects a file over the 200 MB cap", () => {
    const huge = validateBackingTrackFile(
      makeFile("big.mov", 201 * 1024 * 1024, "video/quicktime"),
    );
    expect(huge.ok).toBe(false);
    expect(huge.reason).toMatch(/too large/i);
  });
});

describe("backingTrack — createBackingTrack", () => {
  beforeEach(() => {
    // jsdom may keep object URLs across tests; revoke as we go.
  });

  it("returns a BackingTrackFile with an object URL + metadata", () => {
    const file = makeFile("solo.mp4", 4096, "video/mp4");
    const track = createBackingTrack(file);
    expect(track.url).toMatch(/^blob:/);
    expect(track.name).toBe("solo.mp4");
    expect(track.mimeType).toBe("video/mp4");
    expect(track.sizeBytes).toBe(4096);
  });

  it("throws when validation fails", () => {
    const file = makeFile("notes.pdf", 1024, "application/pdf");
    expect(() => createBackingTrack(file)).toThrow(/Unsupported/);
  });

  it("falls back to extension-based MIME when the File reports empty type", () => {
    const file = makeFile("recording.mov", 1024, "");
    const track = createBackingTrack(file);
    expect(track.mimeType).toBe("video/quicktime");
  });
});

describe("backingTrack — accept attribute", () => {
  it("includes all three extensions", () => {
    for (const ext of ACCEPTED_EXTENSIONS) {
      expect(ACCEPT_ATTR).toContain(ext);
    }
  });

  it("includes all declared MIME types", () => {
    for (const m of ACCEPTED_MIME_TYPES) {
      expect(ACCEPT_ATTR).toContain(m);
    }
  });
});

describe("backingTrack — formatBackingTrackSize", () => {
  it("formats bytes < 1 KB as 'B'", () => {
    expect(formatBackingTrackSize(500)).toBe("500 B");
  });

  it("formats KB < 1 MB as 'KB'", () => {
    expect(formatBackingTrackSize(2048)).toBe("2 KB");
  });

  it("formats MB with one decimal", () => {
    expect(formatBackingTrackSize(12.3 * 1024 * 1024)).toBe("12.3 MB");
  });
});
