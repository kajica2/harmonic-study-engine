/**
 * src/lib/exerciseCollection.test.ts - PIN-001 for the audio-collection
 * manifest. Pure string mapping - node env (no DOM), so NO JSDOM_FILES
 * change is needed.
 *
 * Pinned laws:
 *   - Every exercise maps to exactly one manifest entry.
 *   - wavUrl/midiUrl follow {baseUrl}/collection/{slug}.{ext}.
 *   - The slug reuses the marketplace deriveSlug law (lowercase,
 *     collapse non-alphanumerics to dashes, "untitled" fallback).
 *   - mp3Url is absent by default and present when includeMp3 is set.
 *   - musicXmlUrl is absent by default and present when includeMusicXml
 *     is set, following {baseUrl}/collection/{slug}.musicxml.
 *   - The base URL is used verbatim (no trailing-slash normalization).
 */

import { describe, it, expect } from "vitest";
import { buildCollectionManifest, type ExerciseAudio } from "./exerciseCollection";
import type { BookExercise } from "./bookGenerator";

const EXERCISES: BookExercise[] = [
  {
    id: "study-star-eyes",
    title: "Star Eyes",
    composer: "Gene de Paul",
    key: "F",
    tempo: 130,
    feel: "Swing Medium",
    bars: 32,
    chordNames: ["Fmaj7", "Gm7", "C7"],
    chordTones: [["F", "A", "C", "E"], ["G", "Bb", "D", "F"], ["C", "E", "G", "Bb"]],
    practiceNotes: ["Sing the melody first."],
    tags: ["standard"],
  },
  {
    id: "study-solar",
    title: "Solar",
    composer: "Miles Davis",
    key: "C-",
    tempo: 120,
    feel: "Latin",
    bars: 17,
    chordNames: ["Cm7", "F7"],
    chordTones: [["C", "Eb", "G", "Bb"], ["F", "A", "C", "Eb"]],
    practiceNotes: ["Hold guide tones."],
    tags: ["standard"],
  },
];

describe("buildCollectionManifest", () => {
  it("maps every exercise to exactly one entry", () => {
    const manifest = buildCollectionManifest(EXERCISES, "https://cdn.example.com");
    expect(manifest).toHaveLength(2);
    expect(manifest.map((e) => e.title)).toEqual(["Star Eyes", "Solar"]);
  });

  it("builds wav/midi URLs under the collection folder", () => {
    const manifest = buildCollectionManifest(EXERCISES, "https://cdn.example.com");
    expect(manifest[0].wavUrl).toBe("https://cdn.example.com/collection/star-eyes.wav");
    expect(manifest[0].midiUrl).toBe("https://cdn.example.com/collection/star-eyes.mid");
    expect(manifest[1].wavUrl).toBe("https://cdn.example.com/collection/solar.wav");
    expect(manifest[1].midiUrl).toBe("https://cdn.example.com/collection/solar.mid");
  });

  it("omits mp3Url by default", () => {
    const manifest = buildCollectionManifest(EXERCISES, "https://cdn.example.com");
    for (const entry of manifest) {
      expect(entry.mp3Url).toBeUndefined();
    }
  });

  it("adds mp3Url when includeMp3 is set", () => {
    const manifest = buildCollectionManifest(EXERCISES, "https://cdn.example.com", {
      includeMp3: true,
    });
    expect(manifest[0].mp3Url).toBe("https://cdn.example.com/collection/star-eyes.mp3");
    expect(manifest[1].mp3Url).toBe("https://cdn.example.com/collection/solar.mp3");
  });

  it("omits musicXmlUrl by default", () => {
    const manifest = buildCollectionManifest(EXERCISES, "https://cdn.example.com");
    for (const entry of manifest) {
      expect(entry.musicXmlUrl).toBeUndefined();
    }
  });

  it("adds musicXmlUrl when includeMusicXml is set", () => {
    const manifest = buildCollectionManifest(EXERCISES, "https://cdn.example.com", {
      includeMusicXml: true,
    });
    expect(manifest[0].musicXmlUrl).toBe(
      "https://cdn.example.com/collection/star-eyes.musicxml",
    );
    expect(manifest[1].musicXmlUrl).toBe(
      "https://cdn.example.com/collection/solar.musicxml",
    );
  });

  it("falls back to the untitled slug for symbol-only titles", () => {
    const weird: BookExercise = {
      ...EXERCISES[0],
      id: "study-weird",
      title: "!!!",
    };
    const manifest = buildCollectionManifest([weird], "https://cdn.example.com");
    expect(manifest[0].slug).toBe("untitled");
    expect(manifest[0].wavUrl).toBe("https://cdn.example.com/collection/untitled.wav");
  });

  it("uses the base URL verbatim (no trailing-slash normalization)", () => {
    const manifest = buildCollectionManifest(EXERCISES, "https://cdn.example.com/");
    expect(manifest[0].wavUrl).toBe("https://cdn.example.com//collection/star-eyes.wav");
  });

  it("returns an empty manifest for no exercises", () => {
    expect(buildCollectionManifest([], "https://cdn.example.com")).toEqual([]);
  });

  it("keeps the ExerciseAudio shape stable", () => {
    const manifest = buildCollectionManifest(EXERCISES, "https://cdn.example.com");
    const entry: ExerciseAudio = manifest[0];
    expect(Object.keys(entry).sort()).toEqual(["midiUrl", "slug", "title", "wavUrl"]);
  });
});