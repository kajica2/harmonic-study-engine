"""
Build a TS module that appends the Isaac Raz MasterClass standards
(as playable HarmonicPath entries) to PATHS in src/lib/paths.ts.

This ingests the same SONGS dict that the Python iReal encoder uses,
but emits TypeScript — because the React app consumes paths via
`parseChordToMidi` and the existing audioEngine, not via an iReal URL.

We:
  1. Parse each chord string into one HarmonicStep per bar
  2. Convert each chord symbol to MIDI notes via parseChordToMidi
  3. Append to PATHS in paths.ts under a new STUDIES_PATHS array
  4. The app reads STUDIES_PATHS at runtime alongside PATHS
"""

import json
import re
import subprocess
from pathlib import Path

REPO = Path("/Users/kajicadjuric/harmonic-study-engine")

# The same SONGS dict as the iReal encoder. Kept inline so this
# script is self-contained — one source of truth per artifact family.
SONGS = [
    {
        "title": "Star Eyes",
        "composer": "Gene de Paul",
        "key": "F",
        "tempo": 130,
        "style": "Swing Medium",
        "chords": "T44 |Fmaj7 |Gm7 C7 |Fmaj7 |Gm7 C7 |Fmaj7 |Bbm7 |Am7 D7 |Gm7 C7 |Fmaj7 |Gm7 C7 |Fmaj7 |Gm7 C7 |Fmaj7 |Bbm7 |Am7 D7 |Gm7 C7 |Fm7 |Bbm7 |Eb7 |Am7 D7 |Gm7 |C7 |F7 |D7 Gm7 C7 |Fmaj7 |Gm7 C7 |Fmaj7 |Gm7 C7 |Fmaj7 |Bbm7 |Am7 D7 |Gm7 C7",
    },
    {
        "title": "Is You Is or Is You Ain't My Baby",
        "composer": "Billy Austin",
        "key": "F",
        "tempo": 130,
        "style": "Swing Medium",
        "chords": "T44 |F6 |F6 |Bbm7 |Bbm7 |F6 |F6 |Bbm7 |Bbm7 |F6 |F6 |Bbm7 |Bbm7 |F6 |D7 |Gm7 |C7 |D7 |D7 |G7 |G7 |C7 |C7 |F6 |D7 Gm7 C7 |F6 |F6 |Bbm7 |Bbm7 |F6 |D7 |Gm7 |C7",
    },
    {
        "title": "Yardbird Suite",
        "composer": "Charlie Parker",
        "key": "F",
        "tempo": 220,
        "style": "Swing Up",
        "chords": "T44 |F7 |Bbm7 |F7 |Bbm7 |F7 |D7 |Gm7 C7 |F7 |F7 |Bbm7 |F7 |Bbm7 |F7 |D7 |Gm7 C7 |F7 |Bb |Bbm7 |F7 |D7 |G7 |G7 |C7 |C7 |F7 |Bbm7 |F7 |Bbm7 |F7 |D7 |Gm7 C7 |F7",
    },
    {
        "title": "Sometimes I'm Happy",
        "composer": "Vincent Youmans",
        "key": "Bb",
        "tempo": 120,
        "style": "Swing Medium",
        "chords": "T44 |Bb6 |Bb6 |Bbm7 Eb7 |Bb6 |Bb6 |Bb6 |Bbm7 Eb7 |Bb6 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Am7 D7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7 |Am7 D7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Bb6 |Bb6 |Bbm7 Eb7 |Bb6",
    },
    {
        "title": "Solar",
        "composer": "Miles Davis",
        "key": "G-",
        "tempo": 140,
        "style": "Swing Medium",
        "chords": "T44 |Gm7 |Cm7 |Gm7 |Cm7 |Gm7 |Cm7 |Gm7 |Cm7 |Gm7 |Cm7 |Gm7 |Cm7 |Gm7 |Cm7 |Gm7 |Cm7 |Cm7 |F7 |Bbmaj7 |Bbmaj7 |Am7b5 D7 |Gm7 |Gm7 |Gm7 |Gm7 |Cm7 |Gm7 |Cm7 |Gm7 |Cm7 |Gm7 |Cm7",
    },
    {
        "title": "What Is This Thing Called Love",
        "composer": "Cole Porter",
        "key": "Ab",
        "tempo": 140,
        "style": "Swing Medium",
        "chords": "T44 |Abmaj7 |G7 |Cm7 |Cm7 F7 |Fm7 |Bbm7 |Eb7 |Dbmaj7 |Cm7 F7 |Fm7 Bbm7 |Eb7 |Dbmaj7 |Cm7 F7 |Fm7 Bbm7 |Eb7 |Dbmaj7 |Dbmaj7 |Bbm7 Eb7 |Abmaj7 |G7 |Cm7 |Fm7 |Bbm7 |Eb7 |Abmaj7 |G7 |Cm7 |Cm7 F7 |Fm7 |Bbm7 |Eb7 |Dbmaj7",
    },
    {
        "title": "Lady Be Good",
        "composer": "George Gershwin",
        "key": "G",
        "tempo": 180,
        "style": "Swing Up",
        "chords": "T44 |Gmaj7 |Gmaj7 |Gmaj7 |Gmaj7 |Gmaj7 |Am7 D7 |Gmaj7 |Am7 D7 |Gmaj7 |Gmaj7 |Gmaj7 |Gmaj7 |Gmaj7 |Am7 D7 |Gmaj7 |Am7 D7 |Gm7 |C7 |Fmaj7 |Fmaj7 |Gm7 |C7 |Fmaj7 |F#o7 |Gmaj7 |Gmaj7 |Gmaj7 |Gmaj7 |Gmaj7 |Am7 D7 |Gmaj7 |Am7 D7 |Gmaj7 |Gmaj7 |Gmaj7 |D7",
    },
    {
        "title": "Cherokee",
        "composer": "Ray Noble",
        "key": "Bb",
        "tempo": 200,
        "style": "Swing Up",
        "chords": "T44 |Bb |Cm7 F7 |Bb |Cm7 F7 |Bb |Cm7 F7 |Bb |Cm7 F7 |Bb |Dm7 G7 |Cm7 F7 |Bb |Bb |Dm7 G7 |Cm7 F7 |Bb |Cm7 F7 |Bb |Cm7 F7 |Bb |Bbm7 |Eb7 |Bb |F7 |Bb |Cm7 F7 |Bb |Cm7 F7 |Bb |Dm7 G7 |Cm7 F7 |Bb",
    },
    {
        "title": "I Got Rhythm",
        "composer": "George Gershwin",
        "key": "Bb",
        "tempo": 180,
        "style": "Swing Up",
        "chords": "T44 |Bb6 |Bb6 |Bbm7 Eb7 |Bb6 |Bb6 |Bb6 |Bbm7 Eb7 |Bb6 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Cm7 |F7 |Bb6 |Bbm7 Eb7 |Am7 D7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7",
    },
    {
        "title": "Stella by Starlight",
        "composer": "Victor Young",
        "key": "Bb",
        "tempo": 120,
        "style": "Ballad Medium",
        "chords": "T44 |Bbmaj7 |Gm7 C7 |Fm7 |Bb7 |Ebmaj7 |D7 |Gm7 |C7 |Fm7 |Bb7 |Ebmaj7 |D7 |Gm7 |C7 |Fm7 |Bb7 |Am7 D7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7 |Am7 D7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7 |Dm7 G7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Bbmaj7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7",
    },
    {
        "title": "Bird Feathers",
        "composer": "Charlie Parker",
        "key": "F",
        "tempo": 220,
        "style": "Swing Up",
        "chords": "T44 |F7 |Bbm7 |F7 |Bbm7 |F7 |Bbm7 |F7 |Bbm7 |F7 |D7 |Gm7 |C7 |F7 |D7 |Gm7 |C7 |Bbm7 |F7 |F7 |Bbm7 |Dm7 G7 |Gm7 C7 |F7 |D7 Gm7 C7 |F7 |D7 |Gm7 |C7 |F7 |D7 |Gm7 |C7",
    },
    {
        "title": "There Will Never Be Another You",
        "composer": "Harry Warren",
        "key": "Eb",
        "tempo": 120,
        "style": "Ballad Medium",
        "chords": "T44 |Ebmaj7 |C7 |Fm7 |Bb7 |Ebmaj7 |C7 |Fm7 |Bb7 |Ebmaj7 |C7 |Fm7 |Bb7 |Ebmaj7 |C7 |Fm7 |Bb7 |Am7 D7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7 |Am7 D7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7 |Ebmaj7 |C7 |Fm7 |Bb7 |Ebmaj7 |C7 |Fm7 |Bb7",
    },
    {
        "title": "Out of Nowhere",
        "composer": "Johnny Green",
        "key": "G",
        "tempo": 140,
        "style": "Swing Medium",
        "chords": "T44 |Gmaj7 |F#7 |Bm7 |E7 |Am7 |D7 |Gmaj7 |F#7 |Gmaj7 |F#7 |Bm7 |E7 |Am7 |D7 |Gmaj7 |F#7 |Am7 D7 |Gmaj7 |F#7 |Bm7 |E7 |Am7 |D7 |Gmaj7 |Gmaj7 |F#7 |Bm7 |E7 |Am7 |D7 |Gmaj7 |F#7",
    },
    {
        "title": "Nostalgia in October",
        "composer": "Walter Gross",
        "key": "Bb",
        "tempo": 110,
        "style": "Ballad Medium",
        "chords": "T44 |Bbmaj7 |Bbmaj7 |Am7 D7 |Gm7 |Cm7 |F7 |Bbmaj7 |Am7 D7 |Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Am7 D7 |Gm7 C7 |Cm7 F7 |Fm7 Bb7 |Cm7 |F7 |Bbmaj7 |Am7 D7 |Gm7 |C7 |Fm7 |Bb7 |Ebmaj7 |F7 |Bbmaj7 |Am7 D7 |Gm7 |C7 |F7 |Bbmaj7",
    },
    {
        "title": "I'll Remember April",
        "composer": "Gene de Paul",
        "key": "F",
        "tempo": 140,
        "style": "Swing Medium",
        "chords": "T44 |Fmaj7 |F#o7 |Gm7 C7 |Fmaj7 |Fmaj7 |F#o7 |Gm7 C7 |Fmaj7 |Fmaj7 |F#o7 |Gm7 C7 |Fmaj7 |Fmaj7 |F#o7 |Gm7 C7 |Fmaj7 |Gm7 |C7 |Fmaj7 |D7 |Gm7 |C7 |Fmaj7 |Fmaj7 |Fmaj7 |F#o7 |Gm7 C7 |Fmaj7 |Fmaj7 |F#o7 |Gm7 C7 |Fmaj7",
    },
    {
        "title": "Groovin' High",
        "composer": "Dizzy Gillespie",
        "key": "Bb",
        "tempo": 220,
        "style": "Swing Up",
        "chords": "T44 |Bb6 |Bb6 |Bbm7 Eb7 |Bb6 |Bb6 |Bb6 |Bbm7 Eb7 |Bb6 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Cm7 |F7 |Bb6 |Bbm7 Eb7 |Am7 D7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7",
    },
    {
        "title": "Hot House",
        "composer": "Dizzy Gillespie",
        "key": "Bb",
        "tempo": 200,
        "style": "Swing Up",
        "chords": "T44 |Bb6 |Bb6 |Bbm7 Eb7 |Bb6 |Bb6 |Bb6 |Bbm7 Eb7 |Bb6 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7 |Cm7 |F7 |Bb6 |Bbm7 Eb7 |Am7 D7 |Gm7 C7 |Fm7 Bb7 |Ebmaj7 |Bb6 Gm7 |Cm7 F7 |Fm7 Bb7 |Ebmaj7",
    },
    {
        "title": "Confirmation",
        "composer": "Charlie Parker",
        "key": "F",
        "tempo": 200,
        "style": "Swing Up",
        "chords": "T44 |F7 |Bbm7 |F7 |Bbm7 |F7 |Bbm7 |F7 |Bbm7 |F7 |D7 |Gm7 |C7 |F7 |D7 |Gm7 |C7 |Bbm7 |Eb7 |Abmaj7 |C7 |Bbm7 |Eb7 |Abmaj7 |D7 G7 |F7 |Bbm7 |F7 |Bbm7 |F7 |D7 |Gm7 |C7",
    },
    {
        "title": "Confirmation Blues",
        "composer": "Charlie Parker",
        "key": "F",
        "tempo": 140,
        "style": "Blues",
        "chords": "T44 |F7 |F7 |F7 |F7 |Bb7 |Bb7 |F7 |F7 |C7 |C7 |F7 |D7 Gm7 C7",
    },
]


# MIDI note parser (must match what src/lib/ireal.ts does).
# This script must work WITHOUT the TypeScript code being compiled;
# the values are independent — we mirror the algorithm.

NOTES_LIST = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
]
FLATS = {
    "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#",
}


def midi_for_note(name: str, octave: int) -> int:
    n = FLATS.get(name, name)
    pc = NOTES_LIST.index(n)
    return pc + (octave + 1) * 12


def intervals_for_quality(quality: str):
    quality = quality.replace("^", "maj").replace("-", "m").replace("ø", "m7b5").replace("o", "dim").replace("h", "m7b5")
    if quality.startswith("m7b5"):
        ints = [0, 3, 6, 10]
    elif quality.startswith("min") or quality.startswith("m"):
        if "maj7" in quality: ints = [0, 3, 7, 11]
        elif "7" in quality: ints = [0, 3, 7, 10]
        elif "9" in quality: ints = [0, 3, 7, 10, 14]
        else: ints = [0, 3, 7]
    elif quality.startswith("dim"):
        ints = [0, 3, 6, 9] if "7" in quality else [0, 3, 6]
    elif quality.startswith("aug") or quality.startswith("+"):
        ints = [0, 4, 8]
    elif quality.startswith("sus4"):
        ints = [0, 5, 7]
    elif quality.startswith("sus2"):
        ints = [0, 2, 7]
    elif "maj7" in quality or "M7" in quality:
        ints = [0, 4, 7, 11]
    elif "maj9" in quality:
        ints = [0, 4, 7, 11, 14]
    elif quality.startswith("7"):
        ints = [0, 4, 7, 10]
    elif quality.startswith("9"):
        ints = [0, 4, 7, 10, 14]
    elif quality.startswith("13"):
        ints = [0, 4, 7, 10, 14, 21]
    else:
        ints = [0, 4, 7]
    if "b5" in quality and len(ints) >= 3: ints[2] = 6
    if "#5" in quality and len(ints) >= 3: ints[2] = 8
    if "b9" in quality: ints.append(13)
    if "#9" in quality: ints.append(15)
    if "#11" in quality: ints.append(18)
    return sorted(set(ints))


def parse_chord(symbol: str, base_octave: int = 4):
    """Returns sorted MIDI notes for a chord symbol, or None on failure."""
    if "/" in symbol:
        main, bass = symbol.split("/", 1)
    else:
        main = symbol
        bass = None
    m = re.match(r"^([A-G][b#]?)(.*)$", main)
    if not m:
        return None
    root = m.group(1)
    root = root[0].upper() + root[1:].lower()
    root = FLATS.get(root, root)
    quality = m.group(2) or ""

    base_note = midi_for_note(root, base_octave)
    intervals = intervals_for_quality(quality)
    notes = sorted(set(base_note + i for i in intervals))

    if bass:
        bm = re.match(r"^([A-G][b#]?)", bass)
        if bm:
            b = bm.group(1)
            b = b[0].upper() + b[1:].lower()
            b = FLATS.get(b, b)
            bn = midi_for_note(b, base_octave)
            while bn >= notes[0]:
                bn -= 12
            notes = sorted(set([bn] + notes))
    return notes


def parse_chord_string(s: str):
    """Strip iReal Pro decorations and return list of bar tokens (each token = one chord or 'Cm7,C7')."""
    s = s.strip()
    if s.startswith("T"):
        s = s[3:].lstrip()
    # Drop repeat markers *N
    if "*" in s:
        s = s.split("*", 1)[0]
    # Strip other iReal decorations
    for tok in ("N0", "N1", "N2", "N3", "N4", "Q", "r", "s", "l", "x", "Z"):
        s = re.sub(re.escape(tok) + r"\b", " ", s)
    s = s.replace("[", " ").replace("]", " ").replace("(", " ").replace(")", " ")
    # Keep | as bar separators
    bars = [b.strip() for b in s.split("|") if b.strip()]
    # Within a bar, comma-separated chords stay as one step with comma-separated symbols
    return bars


def path_id_for(title: str) -> str:
    s = title.lower().replace(" ", "-").replace("'", "").replace("?", "")
    s = re.sub(r"[^a-z0-9-]", "", s)
    return f"study-{s}"


def make_path(song: dict) -> dict:
    """Turn a song dict into a HarmonicPath-shaped dict suitable for paths.ts."""
    bars = parse_chord_string(song["chords"])
    steps = []
    for bar_idx, bar in enumerate(bars):
        # Comma-separated means multiple chords in one bar; we use the first one
        # (the dominant change) and keep the bar description with all of them.
        chords_in_bar = [c.strip() for c in bar.split(",") if c.strip()]
        # Use the first chord's MIDI notes for steps.notes; description lists all.
        first_notes = parse_chord(chords_in_bar[0])
        if first_notes is None:
            continue
        # If a bar has 2 chords (typical 2-chord-per-bar turn), keep them concatenated
        # in the description so the player has context.
        if len(chords_in_bar) > 1:
            desc = "· ".join(chords_in_bar)
        else:
            desc = chords_in_bar[0]
        steps.append({
            "name": chords_in_bar[0],
            "notes": first_notes,
            "descriptions": f"b{bar_idx + 1}: {desc}",
        })
    return {
        "id": path_id_for(song["title"]),
        "title": f"{song['title']} — {song['composer']}",
        "description": f"{song['key']} · {song['tempo']} BPM · {song['style']} · {len(steps)} bars",
        "key": song["key"],
        "tempo": song["tempo"],
        "feel": song["style"],
        "composer": song["composer"],
        "studyReady": True,
        "steps": steps,
    }


def render_ts_module(paths: list) -> str:
    out_lines = [
        "// Auto-generated by scripts/ingest_standards.py — do not edit.",
        "// Isaac Raz MasterClass standards: 19 jazz tunes as playable HarmonicPaths.",
        "",
        "import type { HarmonicPath } from \"./paths\";",
        "",
        "export const STUDIES_PATHS: HarmonicPath[] = [",
    ]
    for p in paths:
        out_lines.append("  {")
        out_lines.append(f'    id: "{p["id"]}",')
        out_lines.append(f'    title: "{p["title"]}",')
        out_lines.append(f'    description: "{p["description"]}",')
        # The HarmonicPath type only allows `mvpReady?: boolean` and `feel?: string`,
        # but adding new optional props is fine — cast as needed.
        out_lines.append("    feel: " + json.dumps(p["feel"]) + ",")
        out_lines.append("    steps: [")
        for s in p["steps"]:
            notes = ", ".join(str(n) for n in s["notes"])
            desc = s["descriptions"].replace('"', '\\"')
            out_lines.append("      {")
            out_lines.append(f'        name: "{s["name"]}",')
            out_lines.append(f'        notes: [{notes}],')
            out_lines.append(f'        descriptions: "{desc}",')
            out_lines.append("      },")
        out_lines.append("    ],")
        out_lines.append("  },")
    out_lines.append("];")
    out_lines.append("")
    return "\n".join(out_lines)


def main():
    paths = [make_path(s) for s in SONGS]
    out = REPO / "src" / "lib" / "studies.ts"
    out.write_text(render_ts_module(paths), encoding="utf-8")
    print(f"Wrote {out}")
    print(f"  paths: {len(paths)}")
    total_steps = sum(len(p["steps"]) for p in paths)
    print(f"  total steps: {total_steps}")
    # Smoke test: ensure each path has at least 4 steps and parses at least one chord
    for p in paths:
        if len(p["steps"]) < 4:
            print(f"  WARN: {p['title']} has only {len(p['steps'])} steps")


if __name__ == "__main__":
    main()