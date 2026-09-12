---
title: Harmonic Study Engine
emoji: 🎺
colorFrom: yellow
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Trumpet practice engine for jazz etudes
---

# Harmonic Study Engine

A practice engine for trumpet (and any instrument) that pairs curated
harmonic etudes with iReal-Pro-style backing tracks, scale practice,
and full export to MIDI / MusicXML / Score21 / MP4.

## What works

- **17 synesthesia personas** — 12 jazz/electronic (Kandinsky,
  Coltrane, Bach, Debussy, Eno, Glass, Monk, Miles, Chet Baker,
  Dizzy, Freddie Hubbard, Wayne Shorter) + 5 classical
  (Scriabin, Rachmaninov, Brahms, Tchaikovsky, Mahler). Each
  persona sets the visual theme, instrument voicing, tempo,
  default path, and (where historically documented) the
  synesthesia color map. Badges in the UI distinguish
  "documented" synesthesia (Kandinsky, Scriabin) from
  "interpretive" coloring (everyone else).
- **Curated harmonic paths** — 8 built-in + 5 classical (Paths
  XXXIII–XXXVII) + 33-tune masterclass catalog (Star Eyes,
  Cherokee, Solar, Out of Nowhere, I'll Remember April) with
  composer + key filters.
- **9 voicing modes** — Closed, Drop-2, Minimum Motion, Spread,
  Inversion, Quartal, Open Drop-3, Closed Dense, Melody-First.
  Drop-down replaces the old binary Closed/Open toggle.
- **Behavioral markers in the bar strip** — per-bar accent
  strip + Δ glyph for motif transformation (Brahms) and ≈ for
  frozen bass (Rachmaninov). Picks up automatically from the
  active path's note content.
- **Per-bar behavioral rules** — sequenceStepper (Tchaikovsky's
  path climbs by 2 semitones per bar) and keyDrift (Mahler's
  path drifts from D minor toward C major across the bars).
- **11 backing styles**: swing / bossa nova / funk / latin /
  ballad / clave 3-2 / clave 3-3 / African 4:4 / 4:3 / 3:4.
  Per-style instrument mapping — bossa uses nylon guitar +
  fingered electric bass; funk uses slap bass + Rhodes
  (FluidR3 GM bank via the gleitz/midi-js-soundfonts CDN).
- **Per-track mute toggles** + highpass EQ on bass bus to
  remove DC offset.
- **Diatonic scale practice** (auto mode picks from chord
  quality; manual mode lets you pin Ionian / Dorian /
  Mixolydian / etc.).
- **3-iteration rhythm drill** (the masterclass "three
  subdivisions" exercise).
- **Sub-range loop** (shift+click two bars in the bar strip).
- **Live score** windowed to 4 bars with auto-scroll — abcjs
  T: header now carries the path title (was previously
  empty).
- **MediaRecorder + WebM → MP4 transcode** (via ffmpeg in the
  image).
- **MIDI input listener** — `src/lib/midiIn.ts` wraps Web MIDI
  access, dispatches `midin` CustomEvent on `window`. New
  IN picker chip in the header next to the OUT chip.
- **Mobile-first**: fixed bottom-sheet command bar,
  safe-area padding.
- **Audio quality**: warm soft-knee saturation on the melody
  bus (WaveShaper, k=2.5, 4x oversample), per-note velocity
  scaling (bass softer, top louder; arpeggiator accents every
  4th step), FluidR3 soundfont caching across persona swaps.

## What's degraded

- **DDSP offline render on HF Spaces**: the HF free tier
  can't host the ~1.5 GB `ddsp` package. The Dockerfile omits
  it; `/synthesize` returns 503 on the Space. Everything else
  works without DDSP.
- **To enable DDSP locally** (it does work — verified ddsp
  3.5.1 imports cleanly with `python -m server.app`): fork
  `magenta/ddsp` or use `ddsp-install-macos-arm64`, then
  `pip install -r server/requirements.txt` in your local
  venv. The backend at `:8765` will report `status: ok`.

## Local development

```bash
# 1. install python deps (heavy: ddsp + tf 2.21)
source .venv/bin/activate
pip install -r server/requirements.txt

# 2. start the backend
python -m server.app    # -> http://127.0.0.1:8765

# 3. start the frontend (port 3000 is taken by the Hermes
# WhatsApp bridge on this machine — pick another port)
npx vite --port=5174 --host=127.0.0.1 --strictPort
# -> http://127.0.0.1:5174
```

`bash dev.sh` automates all of this with one command — but
**it kills any process bound to :3000** to free the port. On
this machine that's the Hermes WhatsApp bridge. Run dev.sh
manually instead, as above, if you share :3000.

`npm run build` produces `dist/`; if you put `dist/` at
`server/static/`, the FastAPI server will serve the SPA at `/`
(no separate static host needed).

## Testing

```bash
npm test              # 93 unit + component tests across 5 files
npm run lint         # tsc --noEmit
npm run build        # vite build (no test code in bundle)
```

CI runs all three on every push and PR via
`.github/workflows/ci.yml`.

## Deploy to your own HF Space

1. Create a new Space (Docker, port 7860).
2. Push this repo. The `Dockerfile` at the repo root is the
   build entry point. The multi-stage build compiles the Vite
   frontend, installs the Python deps (minus ddsp), copies
   `dist/` into `/app/server/static/`, and runs uvicorn on
   port 7860 — which is exactly what HF Spaces expects.
3. Wait ~6 min for the build. The Space will be live at
   `https://huggingface.co/spaces/<you>/harmonic-study-engine`.

## License

MIT