/**
 * LeadSheet.test.tsx - regression pins for the BROKEN-IN-PROD ABC
 * download button.
 *
 * PROD BUG: downloadAbc scraped `abcRef.current.querySelector("textarea")`
 * but abcjs's renderAbc NEVER emits a textarea (it renders SVG; the
 * textarea-based EditArea is a separate opt-in class abcjs does not
 * instantiate here). The scrape always yielded "" and the button always
 * downloaded the fallback string "ABC source unavailable".
 *
 * FIX PINNED HERE: downloadAbc now feeds buildLeadSheetAbc(path, instrument)
 * - the same pure source renderLeadSheet hands to abcjs.renderAbc - into
 * downloadText. The download seam is stubbed via vi.mock of
 * "../lib/download" (hoisted above the component import per
 * PM-2026-009-002) so we can assert the EXACT string that would ship.
 *
 * Environment: jsdom, auto-covered by the components test-file glob
 * entry in vitest.config.ts JSDOM_FILES - do NOT add a per-file entry.
 * Real abcjs renders under jsdom (proven by sheetMusicExport.test.ts and
 * EtudeViews.test.tsx); no audio-engine singletons are touched by this
 * component's render path, so no further mocks are needed.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// Stub the download seam BEFORE the component import (vi.mock is hoisted
// above all imports by vitest; download.ts has exactly this one export).
vi.mock("../lib/download", () => ({
  downloadText: vi.fn(),
}));

import { downloadText } from "../lib/download";
import { LeadSheet } from "./LeadSheet";
import { buildLeadSheetAbc } from "../lib/leadSheet";
import type { HarmonicPath } from "../lib/paths";

// Minimal REAL props: LeadSheet takes { path } only (see LeadSheetProps).
// 2 steps = 1 bar of ABC. Fixture style mirrors sheetMusicExport.test.ts.
const PATH: HarmonicPath = {
  id: "test-ii-v-i",
  title: "Test ii-V-I",
  description: "Minimal fixture path for the LeadSheet download pins",
  steps: [
    { name: "Dm7", notes: [62, 65, 69, 72], descriptions: "ii7 in C" },
    { name: "G7", notes: [67, 71, 74, 77], descriptions: "V7 in C" },
  ],
};

// The exact string the broken textarea-scrape version downloaded.
const OLD_FALLBACK = "ABC source unavailable";

const downloadTextMock = vi.mocked(downloadText);

afterEach(() => {
  cleanup();
  downloadTextMock.mockClear();
});

/** Click the header "ABC" download button (title: "Download ABC source"). */
const clickAbcButton = () => {
  // Exact accessible-name match: "ABC" hits only the ABC button
  // ("MusicXML" and the "abcjs" engine chip are different names).
  fireEvent.click(screen.getByRole("button", { name: "ABC" }));
};

describe("LeadSheet ABC download (regression: textarea scrape always fell back)", () => {
  it("clicking the ABC button invokes downloadText exactly once", () => {
    render(<LeadSheet path={PATH} />);
    expect(downloadTextMock).not.toHaveBeenCalled();
    clickAbcButton();
    expect(downloadTextMock).toHaveBeenCalledTimes(1);
  });

  it("the download receives REAL ABC text - X: header, K: key, same string as buildLeadSheetAbc", () => {
    render(<LeadSheet path={PATH} />);
    clickAbcButton();
    expect(downloadTextMock).toHaveBeenCalledTimes(1);
    const [filename, content, mime] = downloadTextMock.mock.calls[0];
    // Filename keeps the file's existing convention: <path.id>_<instrument>.abc
    // The default instrument is F (horn players) since the print view ships F.
    expect(filename).toBe("test-ii-v-i_F.abc");
    expect(mime).toBe("text/plain");
    // THE regression pin: real ABC header lines from the builder. The old
    // scrape shipped "ABC source unavailable", which fails every line below.
    expect(content.startsWith("X:")).toBe(true);
    expect(content).toContain("K:");
    expect(content).toContain("T:Test ii-V-I (F)");
    expect(content).toContain("M:4/4");
    // Byte-identical to the pure source the renderer feeds abcjs.
    expect(content).toBe(buildLeadSheetAbc(PATH, "F"));
  });

  it("the downloaded text is NOT the old 'ABC source unavailable' fallback", () => {
    render(<LeadSheet path={PATH} />);
    clickAbcButton();
    const [, content] = downloadTextMock.mock.calls[0];
    expect(content).not.toBe(OLD_FALLBACK);
    expect(content).not.toContain(OLD_FALLBACK);
    // Sanity: real ABC is far longer than the 23-char fallback stub.
    expect(content.length).toBeGreaterThan(OLD_FALLBACK.length);
  });
});
