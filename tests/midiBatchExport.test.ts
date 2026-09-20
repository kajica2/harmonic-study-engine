/**
 * midiBatchExport — pure batch planner and ZIP packer. Verifies the
 * contract: one entry per (path × variation), slug-safe filenames,
 * collision disambiguation, and a real ZIP archive in the output Blob.
 *
 * Runs in the node env (no JSDOM needed). `downloadBatchZip` lives in
 * the same file but isn't exercised here — it touches the DOM and
 * ImportExportModal calls it directly.
 */

import { describe, it, expect } from "vitest";
import {
  BatchItem,
  planBatchExport,
  zipBatchExport,
} from "../src/lib/midiBatchExport";
import { HarmonicPath } from "../src/lib/paths";

function pathWithTitle(title: string, notes: number[]): HarmonicPath {
  return {
    id: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    description: "test",
    steps: [
      { name: "Cmaj7", notes, descriptions: "" },
      { name: "G7", notes, descriptions: "" },
      { name: "Cmaj7", notes, descriptions: "" },
    ],
  };
}

describe("planBatchExport", () => {
  it("returns one entry per (path × variation)", () => {
    const p = pathWithTitle("Test A", [60, 64, 67]);
    const items: BatchItem[] = [{ path: p, variations: [{ kind: "asWritten" }] }];
    expect(planBatchExport(items).length).toBe(1);
  });

  it("returns N × M entries for N paths and M variations", () => {
    const p1 = pathWithTitle("Test One", [60, 64, 67]);
    const p2 = pathWithTitle("Test Two", [62, 65, 69]);
    const items: BatchItem[] = [
      {
        path: p1,
        variations: [
          { kind: "asWritten" },
          { kind: "transpose", semitones: 5 },
          { kind: "splitTracks" },
        ],
      },
      {
        path: p2,
        variations: [
          { kind: "asWritten" },
          { kind: "transpose", semitones: 5 },
          { kind: "splitTracks" },
        ],
      },
    ];
    expect(planBatchExport(items).length).toBe(6);
  });

  it("filenames are lowercase, underscore-separated, end in .mid", () => {
    const p = pathWithTitle("Star Eyes", [60, 64, 67]);
    const out = planBatchExport([{ path: p, variations: [{ kind: "asWritten" }] }]);
    expect(out[0]?.filename).toMatch(/^[a-z0-9_]+\.mid$/);
    // The slug strips non-alnum → no spaces, no punctuation, all lower.
    expect(out[0]?.filename).not.toMatch(/[A-Z ]/);
    expect(out[0]?.filename.endsWith(".mid")).toBe(true);
  });

  it("disambiguates filename collisions with -2, -3, … suffixes", () => {
    // Two paths with identical titles collide by design.
    const p1 = pathWithTitle("Same Title", [60, 64, 67]);
    const p2 = pathWithTitle("Same Title", [62, 65, 69]);
    const items: BatchItem[] = [
      { path: p1, variations: [{ kind: "asWritten" }] },
      { path: p1, variations: [{ kind: "asWritten" }] },
      { path: p2, variations: [{ kind: "asWritten" }] },
    ];
    const out = planBatchExport(items);
    const filenames = out.map((r) => r.filename);
    // All unique — no silent overwrite inside the ZIP.
    expect(new Set(filenames).size).toBe(filenames.length);
    // The second and third entries must carry the suffix.
    expect(filenames[0]).toBe("same_title__as_written.mid");
    expect(filenames[1]).toBe("same_title__as_written-2.mid");
    expect(filenames[2]).toBe("same_title__as_written-3.mid");
  });
});

describe("zipBatchExport", () => {
  it("empty input → Blob backed by a valid (empty) ZIP archive", async () => {
    const blob = await zipBatchExport([]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/zip");
    // An empty archive still has a ZIP end-of-central-dir record
    // (22 bytes minimum) so the bytes are non-zero.
    expect(blob.size).toBeGreaterThan(0);
  });

  it("returns a non-empty ZIP Blob starting with the PK\\x03\\x04 magic", async () => {
    const p = pathWithTitle("Pack Test", [60, 64, 67]);
    const out = planBatchExport([
      { path: p, variations: [{ kind: "asWritten" }, { kind: "transpose", semitones: 3 }] },
    ]);
    const blob = await zipBatchExport(out);
    expect(blob.size).toBeGreaterThan(0);
    // Read the first 4 bytes — PK\x03\x04 = 0x50 0x4B 0x03 0x04.
    const buf = Buffer.from(await blob.arrayBuffer());
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
    // The Blob should contain at least as many bytes as the sum of
    // its entries — we don't pin exact counts because fflate's
    // deflate level can vary, but we verify it's not suspiciously tiny.
    expect(buf.length).toBeGreaterThan(50);
  });
});