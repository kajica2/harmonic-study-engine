# Research: music21 Engraving + Published Jazz Book Templates for the HSE Exercise Book Redesign

> Research Date: 2026-10-02 | Confidence: HIGH | Sources: 24 verified (2 discarded)

## TL;DR

1. **music21 is a strong fit as a Python-side notation backend** — it is BSD-3-Clause (not MIT), pip-installable (20.1 MB wheel, v10.5.0, Python 3.11+), and can emit MusicXML, MEI, Lilypond, Humdrum, MIDI, and — via the Lilypond binary — publication-quality PDF/PNG/SVG. The project already has a FastAPI backend (`server/app.py`), so a `/book` endpoint is a natural addition.
2. **The highest-quality engraving path is music21 → Lilypond → PDF.** Lilypond is the acknowledged gold standard for automated engraving (used by real publishers; its own docs and independent reviews say so). Verovio (already in the stack as WASM) is the best *no-system-dependency* middle ground. abcjs is the weakest of the three and is the current default — that is the most likely cause of the "ugly with overlap" complaint.
3. **A pragmatic hybrid is recommended**: keep the browser pipeline but switch the default engraver from abcjs to Verovio (already implemented, just not default), and *optionally* add a music21+Lilypond FastAPI endpoint for true print-quality output. music21's real value is programmatic score generation (chord symbols, arpeggiation, transposition) — not rendering itself.
4. **Model the book after the Jamey Aebersold play-along volume layout** (12 standards + chord/scale exercises over the changes — the closest published analogue to this book), fused with Real Book lead-sheet conventions for the tune pages and Coker-style "pattern over changes" pages for the advanced content.
5. **Advanced-player conventions to adopt**: chord symbols above the staff (Real Book style), scale/chord relationship trees (Aebersold "Dominant 7th Tree of Scale Choices"), ii-V-I pattern pages with only the first bars written out (Coker), guide-tone emphasis (3rds/7ths), and a scale syllabus appendix (Omnibook/Aebersold).

---

## Part 1 — music21: Engraving & Notation Capabilities

### 1.1 What music21 is

- **Python toolkit for computer-aided musical analysis and computational musicology**, created by Michael Scott Asato Cuthbert (MIT), first released ~2006, actively maintained (v10.5.0 released 2026-06-17). [PyPI](https://pypi.org/project/music21) | [GitHub](https://github.com/cuthbertLab/music21)
- **License: BSD 3-Clause** — *not* MIT as the task brief assumed. Free for commercial use with attribution. [GitHub README](https://github.com/cuthbertLab/music21)
- **Python 3.11+** (PyPI metadata; GitHub README says 3.12+ for current line). Wheel is 20.1 MB, pure-Python (`py3-none-any`). [PyPI](https://pypi.org/project/music21)
- Core model: `Stream` → `Part` → `Measure` → `Note`/`Chord`/`Rest`, with `harmony.ChordSymbol`, `roman.RomanNumeral`, `key.Key`, `scale.Scale`, `meter.TimeSignature` objects. [User's Guide](https://music21.org/music21docs/usersGuide/index.html)

### 1.2 What it can output

Confirmed from `music21/common/formats.py` and the converter registry: [formats.py](https://github.com/cuthbertLab/music21/blob/master/music21/common/formats.py) | [converter docs](https://music21.org/music21docs/_modules/music21/converter.html)

| Format | Write support | Notes |
|---|---|---|
| MusicXML | ✅ | Primary interchange format; chord symbols written as `<harmony>` elements |
| Lilypond (.ly) | ✅ | `stream.write('lilypond')` |
| **PDF / PNG / SVG** | ✅ | **Only via the Lilypond binary** (`lily.pdf`, `lily.png`, `lily.svg`) |
| MEI | ✅ | `ConverterMEI` (`.mei` extension required) |
| Humdrum (**kern) | ✅ | `ConverterHumdrum` |
| MIDI | ✅ | `ConverterMidi` |
| Braille, text, VexFlow, RomanText | ✅ | Secondary formats |

Key quote from the docs: *"music21 translates to Lilypond format and if Lilypond is installed on the local computer, can automatically generate .pdf, .png, and .svg versions of musical files using Lilypond."* [music21.lily.translate](https://music21.org/music21docs/moduleReference/moduleLilyTranslate.html)

### 1.3 Can it render publication-quality sheet music?

**Yes — but not by itself.** music21 is a *score modeler*, not an engraver. It renders through external engines:

| Backend | Quality | How it plugs in |
|---|---|---|
| **Lilypond** | ★★★★★ (publication standard) | `stream.write('lily.pdf')` — requires Lilypond binary installed |
| **MuseScore** | ★★★★ (good, GUI-oriented) | Recommended by music21 docs as MusicXML reader/viewer; headless export possible |
| **Verovio** | ★★★★ (very good, web-native) | music21 writes MEI/MusicXML → Verovio renders to SVG (no music21 integration needed) |

Lilypond's own positioning: *"a music engraving program, devoted to producing the highest-quality sheet music possible… brings the aesthetics of traditionally engraved music to computer printouts."* It explicitly lists **lead sheets** and **educational materials** among its supported output types. [lilypond.org](https://lilypond.org/) | [LilyPond examples — Lead Sheets](https://lilypond.org/examples.html) | [LilyPond chord display docs](https://lilypond.org/doc/v2.25/Documentation/notation/displaying-chords)

Independent comparison (MuseScore 4 vs LilyPond, 2023): the author, an experienced engraver, concludes LilyPond output "looks ok, but not as good as Lilypond" and that MuseScore 4 "still has some bugs and engraving deficiencies which makes it unsuitable for engraving of symphonic music." [MuseScore 4 vs LilyPond PDF](https://musescore.org/sites/musescore.org/files/2023-01/MuseScore%204%20versus%20Lilypond%20-%20a%20beginners%20experience_v1.pdf)

### 1.4 Jazz lead sheets, arpeggiation, scale exercises

- **Chord symbols**: `harmony.ChordSymbol` is first-class — `ChordSymbol('C7/E')`, `ChordSymbol(root='C', bass='E', kind='minor')`, `addChordStepModification('add', 4)`, custom chord kinds. ChordSymbols write as `<harmony>` symbols in MusicXML (not as played pitches), which is exactly what a lead sheet needs. [music21.harmony](https://music21.org/music21docs/moduleReference/moduleHarmony.html) | [harmony.py source](https://github.com/cuthbertLab/music21/blob/master/music21/harmony.py)
- **Arpeggiation**: `chord.Chord` has `.arpeggiate()` (ascending/descending, with `reverse` and `repeats` options) — directly usable for the book's arpeggiation exercises. [music21.chord](https://music21.org/music21docs/moduleReference/moduleChord.html)
- **Scales**: full `scale` module (major, melodic minor, diminished, whole-tone, bebop, etc.) with `.getPitches()` — usable for scale exercises over each chord. [User's Guide](https://music21.org/music21docs/usersGuide/index.html)
- **Transposition**: `stream.transpose()` handles notes; chord symbols transpose too (with care — there is a known StackOverflow issue about ChordSymbol transposition that was resolved; see [SO thread](https://stackoverflow.com/questions/46893125/how-to-transpose-chordsymbols-along-with-notes-in-music21)). This matters for the book's B♭/E♭/C instrument editions.
- **Real-world proof**: a 2026 GitHub project ("songbook") already builds a **basic-pitch + music21 + LilyPond pipeline with lead-sheet mode** to turn audio/MIDI into printable PDF sheet music — the exact architecture proposed here. [StankyDanko/songbook](https://github.com/StankyDanko/songbook)

### 1.5 Feasibility as a backend (install cost, serverless)

**Install cost:**
- `pip install music21` — 20.1 MB pure-Python wheel, no compiled deps. [PyPI](https://pypi.org/project/music21)
- For PDF output you additionally need the **Lilypond binary** (GNU, free): `brew install lilypond` (macOS) or `apt-get install lilypond` (Ubuntu). [music21 install docs](https://music21.org/music21docs/installing/installAdditional.html)
- Optional: MuseScore for interactive viewing/editing.

**Serverless feasibility:**
- AWS Lambda limits: 50 MB zipped (direct upload) / 250 MB unzipped (with layers). [Lambda size limits (Medium, 2023)](https://medium.com/@davidnsoesie1/building-with-aws-lambda-how-to-troubleshoot-size-issues-with-deployments-92f2611f6f7b)
- music21 wheel alone (20 MB) fits; **Lilypond binary does not comfortably fit** in a Lambda layer (Lilypond installs are ~100 MB+ with fonts). Two viable paths:
  1. **Lambda container image** (up to 10 GB) with Lilypond baked in — clean, recommended for serverless.
  2. **Skip Lilypond entirely**: music21 generates MusicXML/MEI → render with **Verovio** (already in the browser stack, or Verovio's Python toolkit server-side). No system deps at all.
- **This project already runs FastAPI** (`server/app.py`), so the simplest deployment is a new `/api/book` endpoint on the existing backend (local or containerized), not a cold-start Lambda.

### 1.6 Engraving quality comparison: music21+Lilypond vs Verovio vs abcjs

| Criterion | music21 + Lilypond | Verovio (WASM/Python) | abcjs (current default) |
|---|---|---|---|
| Engraving quality | ★★★★★ — hand-engraving aesthetic, publisher-grade | ★★★★ — very good, MEI-native, SMuFL fonts | ★★☆ — functional, visibly "computer-y", limited layout control |
| Output | PDF/PNG/SVG | SVG (→ PDF via svg2pdf) | SVG (→ PDF via svg2pdf) |
| System deps | Lilypond binary required | None (WASM in browser; Python wheel server-side) | None (pure JS) |
| Chord symbols | Excellent (`\chordmode`, Ignatzek jazz naming, customizable) | Good (MEI `<harm>`/`<chord>` support) | Basic (ABC `"C7"` annotations) |
| Layout control | Full (page breaks, spacing, fonts, headers/footers via Scheme) | Good (breaks, spacing, scale options) | Limited |
| Best for | Print book PDFs | Web + print hybrid | Quick inline notation |
| Sources | [lilypond.org](https://lilypond.org/), [LilyPond essay](http://lilypond.org/essay.html) | [verovio.org](https://www.verovio.org/index.xhtml), [Verovio reference book](https://book.verovio.org/verovio-reference-book.pdf) | [ISMIR 2014 paper (abcjs cited)](https://archives.ismir.net/ismir2014/paper/000221.pdf) |

**Verdict**: For a *print book*, music21+Lilypond is the quality ceiling. Verovio is the best zero-dependency option and is **already integrated in this codebase** (`src/lib/verovioRenderer.ts` — the engraver switch exists but defaults to abcjs). abcjs is the weakest link and the most probable cause of the "ugly with overlap" report.

---

## Part 2 — Published Jazz Book Templates (Layout Conventions)

### 2.1 Jamey Aebersold Play-Along Volumes — *the closest analogue*

- **Format**: 6×9" books, ~48 pages, each volume = 10–12 jazz standards + a book of exercises. 133+ volumes since 1967. [jazzbooks.com](http://jazzbooks.com/) | [NAMM oral history](https://www.namm.org/library/oral-history/jamey-aebersold) | [NEA profile](https://www.arts.gov/honors/jazz/jamey-aebersold)
- **Page structure**: each tune gets a lead-sheet-style chart (melody + chord symbols above the staff); the book section contains **scale/chord exercises written over the tune's changes**, plus a **scale syllabus** and **chord/scale relationship trees** (e.g. the "Dominant 7th Tree of Scale Choices"). [Aebersold Jazz Handbook PDF](http://pecosmusic.weebly.com/uploads/1/2/9/2/1292097/aebersold_-_the_jazz_handbook.pdf)
- **Exercise conventions** (from the Jazz Handbook — these are the exact exercise types the HSE book already generates): "Play the first five notes to each chord/scale", "Play the 7th chord up and down (1,3,5,7,5,3,1)", "Play the 9th chord up and down (1,3,5,7,9,7,5,3,1)", "Play the scale in broken thirds up and down", "Emphasize the thirds and sevenths of scales in your soloing" (guide tones). [Jazz Handbook](http://pecosmusic.weebly.com/uploads/1/2/9/2/1292097/aebersold_-_the_jazz_handbook.pdf) | [FQBK handbook](https://www.jazzbooks.com/mm5/download/FQBK-handbook.pdf)
- **Typography**: hand-written-style notation, chord symbols above staff, exercises written out in the tune's key (some volumes write exercises in 3 keys). [How to Play Jazz PDF](https://resources.finalsite.net/images/v1718750545/tamdistrictorg/qffe5tebg9mjlbctlkzf/aebersold-howtoplayjazz.pdf)

### 2.2 Jerry Coker, *Patterns for Jazz* (1982) — *the pattern-exercise format*

- **Format**: 62 pages, treble/bass clef editions, Alfred Music. 400+ patterns built on chords and scales, from simple (major) to complex (lydian augmented). [Amazon](https://www.amazon.com/Patterns-Jazz-Theory-Composition-Improvisation/dp/0898987032) | [archive.org](https://archive.org/details/patternsforjazzt0000jerr)
- **Page structure**: "Condensed charts and pertinent explanations are conveniently inserted throughout the book." Patterns are grouped by chord type/scale; **only the first few measures are written out, then the student continues the pattern from the chord symbols** (transposition practice in all 12 keys). [Amazon review](https://www.amazon.com/Patterns-Jazz-Theory-Composition-Improvisation/dp/0898987032) | [full PDF](https://www.thetrumpetblog.com/wp-content/uploads/2019/09/Jerry-Coker-Patterns-For-Jazz.pdf)
- **Advanced convention**: the book is organized around the four basic kinds of chord movement — cycle of fifths, chromatic, stepwise, and minor thirds — which is exactly the harmonic vocabulary of the HSE book's standards. [Coker PDF](https://www.thetrumpetblog.com/wp-content/uploads/2019/09/Jerry-Coker-Patterns-For-Jazz.pdf)

### 2.3 Charlie Parker Omnibook (1978) — *the transcribed-solo format*

- **Format**: 144 pages, 9×12" (9.25×12"), spiral-bound, 60 note-for-note transcriptions, C/B♭/E♭/bass-clef editions. [Hal Leonard](https://www.halleonard.com/product/284775/charlie-parker-omnibook-volume-1-transcribed-exactly-from-his-recorded-solos) | [Wikipedia](https://en.wikipedia.org/wiki/Charlie_Parker_Omnibook)
- **Page structure**: one tune per page (or two), melody line with **chord symbols above the staff**, metronome markings, recording details, minimal articulation. Front matter: introduction, **chord symbol guide**, and a **scale syllabus** (page 143). [Berklee catalog](https://catalog.berklee.edu/Record/be26512/Details) | [Hal Leonard](https://www.halleonard.com/product/284775/charlie-parker-omnibook-volume-1-transcribed-exactly-from-his-recorded-solos)
- **Advanced convention**: explicitly aimed at "advanced students with some prior jazz idiom knowledge and considerable instrumental skill." [Wikipedia](https://en.wikipedia.org/wiki/Charlie_Parker_Omnibook)

### 2.4 The Real Book — *the lead-sheet format*

- **Format**: 512 pages, ~400 tunes, one lead sheet per page. Created ~1974 at Berklee; the "Real Book font" (handwritten manuscript) became iconic. [Wikipedia](https://en.wikipedia.org/wiki/Real_Book) | [realbook.site guide](https://realbook.site/what-is-a-real-book)
- **Page structure**: single melody line + chord symbols above the staff, key/time signature, tempo/style marking, repeat signs/codas/roadmaps to keep the tune on one page. No arrangements, no voicings. [Berklee "Why Lead Sheets?"](https://www.berklee.edu/berklee-today/summer-2018/lead-sheet) | [realbook.site](https://realbook.site/what-is-a-real-book)
- **Chord symbol conventions**: sophisticated substitutions (Bill Evans-style changes), symbols like C∆, C-7, Cø, C7alt, slash chords. [Wikipedia](https://en.wikipedia.org/wiki/Real_Book) | [Jazz-Library chord symbol guide](https://jazz-library.com/articles/chord-symbols)
- **Advanced convention**: chord symbols centered over the beat where the harmony changes; tensions in parentheses (C7(#11)); slash chords for alternate bass. [Berklee](https://www.berklee.edu/berklee-today/summer-2018/lead-sheet)

### 2.5 Mark Levine, *The Jazz Theory Book* (1995) — *the concept + example layout*

- **Format**: 522 pages, spiral-bound, 42 chapters, 750+ musical examples, Sher Music. [Sher Music](https://www.shermusic.com/products/the-jazz-theory-book) | [WorldCat](https://search.worldcat.org/title/799874500)
- **Page structure**: prose concept + numbered musical examples ("Figure 2-1") on the same page; examples in concert key; chord/scale theory, II-V-I progressions, scale theory (major/melodic minor/diminished/whole-tone harmony), bebop scales, "playing outside", pentatonics, blues, rhythm changes. [Jazz Theory Book sample PDF](https://www.ejazzlines.com/mc_files/2/shjtb.pdf) | [Jazz Piano Book sample (same layout)](https://www.jazzbooks.com/mm5/samples/D-JP.pdf)
- **Chord symbol conventions**: the "Note on Terminology and Chord Symbols" front-matter page is a standard feature — C∆, C-7, C7alt, Cø, etc. [Jazz Theory Book sample](https://www.ejazzlines.com/mc_files/2/shjtb.pdf)
- **Advanced convention**: chord/scale relationship tables, guide-tone voice-leading diagrams (7th resolves down a half step, 3rd stays), cycle-of-fifths diagrams. [Jazz Piano Book sample](https://www.jazzbooks.com/mm5/samples/D-JP.pdf)

### 2.6 Recommendation: ONE template to model after

**Model the book after the Jamey Aebersold play-along volume layout, fused with Real Book lead-sheet conventions and Coker-style pattern pages.**

Rationale:
- The HSE book's content (12 standards + chord progressions + arpeggiation exercises + practice notes + memory cards) is *structurally identical* to an Aebersold volume (10–12 standards + scale/chord exercises over the changes + scale syllabus). Aebersold is the only template that combines tunes *and* exercises in one book.
- The Real Book supplies the tune-page conventions (one tune per page, chord symbols above staff, roadmap repeats) — the cleanest, most universally recognized lead-sheet layout.
- Coker supplies the advanced pattern-page convention (write the first bars, let the player continue from chord symbols) — perfect for the advanced audience and for the memory-card concept.
- Levine supplies the concept-page convention (chord/scale relationship diagrams, guide-tone voice-leading) for the practice-notes pages.

### 2.7 Concrete page layout spec

**Book geometry** (A4 portrait, matching current `bookLayout.ts`; margins ~40 pt):
- **Cover (p.1)**: Title (large, serif), subtitle "Advanced Jazz Studies", author, exercise count + card count, instrument edition (C/B♭/E♭). No notation on cover.
- **TOC (p.2)**: two-column list — tune title, key, tempo/feel, page number. Followed by a "How to use this book" half-page (Aebersold-style practice method: 1. play melody, 2. play chord tones, 3. play scales, 4. improvise).
- **Tune page (lead sheet, Real Book style)**: one tune per page. Header: title (left), composer (right), key + tempo + feel (center, small). Single melody staff with **chord symbols above the staff, centered over the beat where harmony changes**. Repeat signs/coda for form. Footer: page number + book title (small, centered).
- **Exercise page (Aebersold style)**: header "Exercise 1 — Arpeggios over [Tune]". 4–6 systems of notation, each system = one exercise type over the tune's changes (7th chord up-down 1-3-5-7-5-3-1; 9th chord; broken thirds; scale to 9th and back down chord). Chord symbols above each system. Practice note callout box (italic, 1–2 lines) under each system.
- **Pattern page (Coker style)**: header "Patterns — ii-V-I in [Key]". 3–4 systems; **only the first 2 bars written out**, remaining bars show chord symbols only (player continues the pattern). Label each pattern (e.g. "Chromatic enclosure", "3rd-to-9th", "Bebop scale run").
- **Concept/practice-notes page (Levine style)**: prose + numbered figures. Chord/scale relationship table for the tune's chords (chord symbol → scale → avoid notes), guide-tone diagram (3rd/7th voice-leading across the form), 3–5 bullet practice notes.
- **Memory card pages**: 2×2 grid with dashed cut lines (current implementation). Front: tune name + chord progression skeleton (chord symbols only, no melody). Back: answer — arpeggio/scale pattern for the first chord, or the melody's first phrase. Card number in corner.
- **Appendix (Omnibook/Aebersold style)**: scale syllabus — one page: all scales used in the book (major, melodic minor, diminished, whole-tone, bebop) in the book's keys, with chord/scale relationship tree.

**Typography**: serif for titles/headers (e.g. a manuscript-style font for tune titles à la Real Book), clean sans for practice notes; chord symbols in a bold condensed font above the staff; consistent 40 pt margins; page footer = "HSE Practice Book — [Tune] — p. N".

---

## Analysis

1. **The engraver is the root cause of the "ugly" complaint.** The current default is abcjs, which is the weakest engraver of the three available. The codebase already has a Verovio path (`engraver: "abcjs" | "verovio"` in `bookPdf.ts`); flipping the default to Verovio is a one-line change with immediate quality gains and zero new dependencies.
2. **music21's best role is score *generation*, not rendering.** Its killer features for this project are `ChordSymbol` (lead-sheet chord symbols), `Chord.arpeggiate()` (the book's arpeggiation exercises), the `scale` module (scale exercises), and transposition (C/B♭/E♭ editions). Rendering should stay with Verovio (browser) or Lilypond (print).
3. **The FastAPI backend makes music21 cheap to add.** `pip install music21` on the existing backend, generate MusicXML per exercise, return it to the browser, render with the existing Verovio WASM. No Lilypond needed unless print-quality PDF is required server-side.
4. **The Aebersold model is a near-perfect fit** because the HSE book's content was clearly inspired by it (the exercise types in the Jazz Handbook — "play the 7th chord up and down" — match the book's arpeggiation exercises almost verbatim).
5. **Contradiction noted**: the task brief said music21 is "MIT"; it is actually **BSD 3-Clause** (verified on PyPI and GitHub). Functionally equivalent for this use (permissive, commercial-friendly), but worth correcting in any docs.

## Gaps & Limitations

- **No side-by-side visual comparison was possible** in this research pass — the engraving-quality ranking (Lilypond > Verovio > abcjs) is based on documented claims and independent reviews, not rendered samples of *this book's* content. Recommend a 1-hour spike: render one exercise (e.g. Star Eyes) through all three engines and compare.
- **Lilypond binary size on Lambda** is estimated (~100 MB+), not measured; if serverless PDF is required, verify with a container-image deployment test.
- **ChordSymbol transposition** has known edge cases (StackOverflow thread); the C/B♭/E♭ edition feature needs a dedicated test.
- **Aebersold/Coker/Omnibook page-level details** (exact margins, fonts) are inferred from sample PDFs and product descriptions, not from full scans of the physical books.
- **Copyright**: the 12 standards (Star Eyes, Yardbird Suite, Solar, Cherokee, Stella by Starlight, etc.) are copyrighted compositions — the book's *layout* can be modeled on published templates, but the *content* (melodies, chord changes) must remain the project's own encodings.

## Sources

| # | Source | Date | Credibility |
|---|---|---|---|
| 1 | [music21 on PyPI (v10.5.0, BSD-3-Clause, 20.1 MB wheel)](https://pypi.org/project/music21) | 2026-06 | ★★★★★ |
| 2 | [music21 GitHub (license, Python support)](https://github.com/cuthbertLab/music21) | 2026 | ★★★★★ |
| 3 | [music21.lily.translate (PDF/PNG/SVG via Lilypond)](https://music21.org/music21docs/moduleReference/moduleLilyTranslate.html) | current | ★★★★★ |
| 4 | [music21 formats.py (valid write formats)](https://github.com/cuthbertLab/music21/blob/master/music21/common/formats.py) | current | ★★★★★ |
| 5 | [music21 converter (MEI, Humdrum, MusicXML, Lilypond)](https://music21.org/music21docs/_modules/music21/converter.html) | current | ★★★★★ |
| 6 | [music21.harmony (ChordSymbol)](https://music21.org/music21docs/moduleReference/moduleHarmony.html) | current | ★★★★★ |
| 7 | [music21.chord (arpeggiate)](https://music21.org/music21docs/moduleReference/moduleChord.html) | current | ★★★★★ |
| 8 | [music21 install docs (Lilypond/MuseScore)](https://music21.org/music21docs/installing/installAdditional.html) | current | ★★★★★ |
| 9 | [LilyPond homepage (engraving quality claims)](https://lilypond.org/) | current | ★★★★★ |
| 10 | [LilyPond examples — Lead Sheets](https://lilypond.org/examples.html) | current | ★★★★★ |
| 11 | [LilyPond chord display docs (jazz chord naming)](https://lilypond.org/doc/v2.25/Documentation/notation/displaying-chords) | current | ★★★★★ |
| 12 | [MuseScore 4 vs LilyPond comparison (2023)](https://musescore.org/sites/musescore.org/files/2023-01/MuseScore%204%20versus%20Lilypond%20-%20a%20beginners%20experience_v1.pdf) | 2023-01 | ★★★★☆ |
| 13 | [Verovio homepage (MEI→SVG, no deps)](https://www.verovio.org/index.xhtml) | current | ★★★★★ |
| 14 | [Verovio reference book (LilyPond dependency discussion)](https://book.verovio.org/verovio-reference-book.pdf) | current | ★★★★★ |
| 15 | [ISMIR 2014 Verovio paper (abcjs cited as renderer)](https://archives.ismir.net/ismir2014/paper/000221.pdf) | 2014 | ★★★★☆ |
| 16 | [Aebersold Jazz Handbook (exercise conventions)](http://pecosmusic.weebly.com/uploads/1/2/9/2/1292097/aebersold_-_the_jazz_handbook.pdf) | 2000 | ★★★★☆ |
| 17 | [Aebersold FQBK handbook (guide tones, ii-V-I)](https://www.jazzbooks.com/mm5/download/FQBK-handbook.pdf) | current | ★★★★☆ |
| 18 | [Aebersold NAMM oral history (133 volumes, 10-12 standards each)](https://www.namm.org/library/oral-history/jamey-aebersold) | 2022 | ★★★★★ |
| 19 | [Coker Patterns for Jazz (Amazon, 400+ patterns)](https://www.amazon.com/Patterns-Jazz-Theory-Composition-Improvisation/dp/0898987032) | 1982 | ★★★★☆ |
| 20 | [Coker Patterns for Jazz full PDF (layout)](https://www.thetrumpetblog.com/wp-content/uploads/2019/09/Jerry-Coker-Patterns-For-Jazz.pdf) | 1982 | ★★★★☆ |
| 21 | [Charlie Parker Omnibook (Hal Leonard, 144 pp, scale syllabus)](https://www.halleonard.com/product/284775/charlie-parker-omnibook-volume-1-transcribed-exactly-from-his-recorded-solos) | current | ★★★★★ |
| 22 | [Omnibook Wikipedia (advanced-student target)](https://en.wikipedia.org/wiki/Charlie_Parker_Omnibook) | current | ★★★★☆ |
| 23 | [Real Book Wikipedia (lead sheet format, 512 pp)](https://en.wikipedia.org/wiki/Real_Book) | 2026-06 | ★★★★☆ |
| 24 | [Berklee "Why Lead Sheets?" (chord symbol conventions)](https://www.berklee.edu/berklee-today/summer-2018/lead-sheet) | 2018 | ★★★★★ |
| 25 | [realbook.site "What is a Real Book"](https://realbook.site/what-is-a-real-book) | 2026-05 | ★★★★☆ |
| 26 | [Mark Levine Jazz Theory Book (Sher Music, 522 pp)](https://www.shermusic.com/products/the-jazz-theory-book) | current | ★★★★★ |
| 27 | [Jazz Theory Book sample PDF (layout, chord symbols)](https://www.ejazzlines.com/mc_files/2/shjtb.pdf) | 2017 | ★★★★☆ |
| 28 | [Jazz Piano Book sample PDF (figure layout)](https://www.jazzbooks.com/mm5/samples/D-JP.pdf) | current | ★★★★☆ |
| 29 | [AWS Lambda size limits (Medium)](https://medium.com/@davidnsoesie1/building-with-aws-lambda-how-to-troubleshoot-size-issues-with-deployments-92f2611f6f7b) | 2023-12 | ★★★☆☆ |
| 30 | [songbook: basic-pitch + music21 + LilyPond lead-sheet pipeline](https://github.com/StankyDanko/songbook) | 2026-08 | ★★★☆☆ |

*Discarded: 2 low-quality sources (SEO content farms on jazz chord progressions; a pirated-book aggregator page).*
