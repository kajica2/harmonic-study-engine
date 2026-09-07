import { describe, it, expect } from "vitest";
import {
  parseRealBookMarkdown,
  importRealBookMarkdown,
} from "../src/lib/importRealBook";

/**
 * importRealBook — Markdown importer for the WCJA masterclass
 * tune catalog format.
 *
 * Test surface:
 *   - parseRealBookMarkdown: returns ParsedTune[] (title + metadata
 *     + chart). Side-effect-free.
 *   - importRealBookMarkdown: end-to-end; runs each chart through
 *     importIRealText and returns HarmonicPath[].
 */

describe("parseRealBookMarkdown", () => {
  it("extracts one tune with metadata from a single section", () => {
    const md = `## 1. Star Eyes *(MC 1, MC 2)*

**Key: F  •  Form: AABA  •  Composers: DePaul, Ray**

\`\`\`
 A1  | Cmaj7 | Dm7 G7 | Cmaj7 | Cmaj7 |
     | Cmaj7 | Dm7 G7 | Cmaj7 | Cmaj7 |
\`\`\`
`;
    const tunes = parseRealBookMarkdown(md);
    expect(tunes.length).toBe(1);
    expect(tunes[0].title).toBe("Star Eyes");
    expect(tunes[0].classRefs).toBe("MC 1, MC 2");
    expect(tunes[0].key).toBe("F");
    expect(tunes[0].form).toBe("AABA");
    expect(tunes[0].composers).toBe("DePaul, Ray");
    // chart text has the section labels stripped
    expect(tunes[0].chart).not.toMatch(/^A1/);
    expect(tunes[0].chart).toMatch(/Cmaj7/);
  });

  it("splits multiple sections into multiple tunes", () => {
    const md = `## 1. Star Eyes

\`\`\`
| Cmaj7 | Dm7 G7 |
\`\`\`

## 2. Cherokee

\`\`\`
| Cmaj7 | Dm7 G7 |
\`\`\`
`;
    const tunes = parseRealBookMarkdown(md);
    expect(tunes.length).toBe(2);
    expect(tunes[0].title).toBe("Star Eyes");
    expect(tunes[1].title).toBe("Cherokee");
  });

  it("falls back to a single tune when there are no H2 sections", () => {
    const md = `Just some prose.

\`\`\`
| Cmaj7 | Dm7 G7 |
\`\`\`
`;
    const tunes = parseRealBookMarkdown(md);
    expect(tunes.length).toBe(1);
    expect(tunes[0].title).toBe("Real Book import");
  });

  it("returns [] when there are no code blocks at all", () => {
    const md = `# Just a heading\n\nNo chart here.`;
    expect(parseRealBookMarkdown(md)).toEqual([]);
  });

  it("normalizes CRLF to LF so Windows-pasted MD parses", () => {
    const md = "## 1. Star Eyes\r\n\r\n```\r\n| Cmaj7 |\r\n```\r\n";
    const tunes = parseRealBookMarkdown(md);
    expect(tunes.length).toBe(1);
    expect(tunes[0].chart).toMatch(/Cmaj7/);
  });

  it("skips sections that have no chart code block", () => {
    const md = `## 1. No Chart

Just prose here, no code.

## 2. With Chart

\`\`\`
| Cmaj7 |
\`\`\`
`;
    const tunes = parseRealBookMarkdown(md);
    expect(tunes.length).toBe(1);
    expect(tunes[0].title).toBe("With Chart");
  });
});

describe("importRealBookMarkdown", () => {
  it("emits one HarmonicPath per chart with non-empty steps", () => {
    const md = `## 1. Star Eyes

\`\`\`
| Cmaj7 | Dm7 G7 |
\`\`\`
`;
    const paths = importRealBookMarkdown(md);
    expect(paths.length).toBe(1);
    expect(paths[0].title).toBe("Star Eyes");
    expect(paths[0].steps.length).toBeGreaterThan(0);
    // description has "Real Book chart" because no metadata
    expect(paths[0].description).toBe("Real Book chart");
  });

  it("builds description from composer + form + key + classRefs", () => {
    const md = `## 1. Star Eyes *(MC 1)*

**Key: F  •  Form: AABA  •  Composers: DePaul**

\`\`\`
| Cmaj7 |
\`\`\`
`;
    const paths = importRealBookMarkdown(md);
    expect(paths[0].description).toContain("DePaul");
    expect(paths[0].description).toContain("AABA");
    expect(paths[0].description).toContain("Key F");
    expect(paths[0].description).toContain("(MC 1)");
  });

  it("uses a slug id prefixed with 'realbook-' so re-imports overwrite", () => {
    const md = `## 1. Star Eyes!

\`\`\`
| Cmaj7 |
\`\`\`
`;
    const paths = importRealBookMarkdown(md);
    expect(paths[0].id).toMatch(/^realbook-star-eyes/);
  });

  it("truncates long titles at 40 chars in the slug", () => {
    const md = `## 1. ${"A".repeat(80)}

\`\`\`
| Cmaj7 |
\`\`\`
`;
    const paths = importRealBookMarkdown(md);
    const slug = paths[0].id.replace("realbook-", "");
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it("skips sections whose chart parses to zero steps", () => {
    const md = `## 1. Empty Chart

\`\`\`
|  |
\`\`\`

## 2. Real Chart

\`\`\`
| Cmaj7 |
\`\`\`
`;
    const paths = importRealBookMarkdown(md);
    expect(paths.length).toBe(1);
    expect(paths[0].title).toBe("Real Chart");
  });
});
