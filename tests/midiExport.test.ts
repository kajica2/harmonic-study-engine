/**
 * midiExport — single function `exportToMidiFile` returns a data URI
 * containing a Standard MIDI File. The function delegates to the
 * `midi-writer-js` library; our coverage is the contract that the
 * URI is well-formed and decodes to a valid SMF.
 */

import { describe, it, expect } from "vitest";
import { exportToMidiFile } from "../src/lib/midiExport";

describe("exportToMidiFile", () => {
  const TEST_PATH = {
    id: "test",
    title: "Test",
    description: "ii-V-I",
    steps: [
      { name: "Dm7", notes: [50, 53, 57, 60], descriptions: "" },
      { name: "G7", notes: [55, 59, 62, 65], descriptions: "" },
      { name: "Cmaj7", notes: [48, 52, 55, 59], descriptions: "" },
    ],
  };

  it("returns a base64 data URI", () => {
    const uri = exportToMidiFile(TEST_PATH);
    expect(uri).toMatch(/^data:audio\/midi;base64,/);
  });

  it("decodes to a non-empty byte buffer", () => {
    const uri = exportToMidiFile(TEST_PATH);
    const b64 = uri.replace(/^data:audio\/midi;base64,/, "");
    const bytes = Buffer.from(b64, "base64");
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("starts with the SMF 'MThd' header magic", () => {
    const uri = exportToMidiFile(TEST_PATH);
    const b64 = uri.replace(/^data:audio\/midi;base64,/, "");
    const bytes = Buffer.from(b64, "base64");
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("MThd");
  });

  it("encodes a single-track format-0 file", () => {
    // After the 8-byte MThd header (4 + 4), the next 4 bytes are
    // the header data length (always 6 for SMF), then format type
    // (0 = single-track), then number of tracks, then division.
    const uri = exportToMidiFile(TEST_PATH);
    const b64 = uri.replace(/^data:audio\/midi;base64,/, "");
    const bytes = Buffer.from(b64, "base64");
    // Header length at bytes 4-7 (big-endian uint32)
    const headerLen = bytes.readUInt32BE(4);
    expect(headerLen).toBe(6);
    // Format at bytes 8-9 (big-endian uint16)
    const format = bytes.readUInt16BE(8);
    expect(format).toBe(0);
    // Track count at bytes 10-11
    const trackCount = bytes.readUInt16BE(10);
    expect(trackCount).toBe(1);
  });

  it("includes an MTrk chunk for the track", () => {
    const uri = exportToMidiFile(TEST_PATH);
    const b64 = uri.replace(/^data:audio\/midi;base64,/, "");
    const bytes = Buffer.from(b64, "base64");
    // The MTrk magic starts at byte 14 (after the 14-byte MThd header)
    const trackMagic = bytes.subarray(14, 18).toString("ascii");
    expect(trackMagic).toBe("MTrk");
  });
});