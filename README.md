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

## What works in this Space

- 12 masterclass personas (Wynton Marsalis, Coltrane, Bach, Eno, …)
  with persona-driven visual themes in the canvas
- 33-tune working catalog (Star Eyes, Cherokee, Solar, Out of
  Nowhere, I'll Remember April, …) with composer + key filters
- 11 backing styles: swing / bossa nova / funk / latin / ballad /
  clave 3-2 / clave 3-3 / African 4:4 / 4:3 / 3:4
- Per-style instrument mapping — bossa uses nylon guitar + fingered
  electric bass; funk uses slap bass + Rhodes (FluidR3 GM bank
  via the gleitz/midi-js-soundfonts CDN)
- Diatonic scale practice (auto mode picks from chord quality;
  manual mode lets you pin Ionian / Dorian / Mixolydian / etc.)
- 3-iteration rhythm drill (the masterclass "three subdivisions" exercise)
- Sub-range loop (shift+click two bars in the bar strip)
- Live score windowed to 4 bars with auto-scroll
- MediaRecorder + WebM → MP4 transcode (via ffmpeg in the image)
- Mobile-first: fixed bottom-sheet command bar, safe-area padding

## What's degraded

- **DDSP offline render** is **not** installed in this Space. The
  upstream `ddsp` v3.7.0 git tag was removed and the package is
  ~1.5 GB (TF + librosa) — too heavy for the HF free tier. The
  `/health` endpoint returns `status: "degraded"`,
  `/synthesize` and `/fx/reverb` return 503 with a clear error.
  Everything else in the app works without DDSP.
- To enable DDSP on HF: fork the `magenta/ddsp` repo (or use
  `ddsp-install-macos-arm64` to produce a local copy), then
  install via `pip install <fork-url>` in a paid CPU tier Space.

## Local development

```bash
# 1. install python deps (heavy: ddsp + tf 2.21)
source .venv/bin/activate
pip install -r server/requirements.txt

# 2. start the backend
python -m server.app    # -> http://127.0.0.1:8765

# 3. start the frontend
npm install
npm run dev             # -> http://localhost:3000
```

`npm run build` produces `dist/`; if you put `dist/` at
`server/static/`, the FastAPI server will serve the SPA at `/`
(no separate static host needed).

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
