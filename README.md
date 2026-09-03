# Harmonic Study Engine

A practice engine for trumpet (and any instrument) that pairs curated
harmonic etudes with iReal-Pro-style backing tracks, scale practice,
and full export to MIDI / MusicXML / Score21 / MP4.

## Features

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
- MediaRecorder → WebM (and → MP4 if ffmpeg is installed locally)
- Mobile-first: fixed bottom-sheet command bar, safe-area padding

## Local development

The repo's `dev.sh` creates a `.venv`, installs the lean core backend
deps (FastAPI only — no DDSP/TF), and boots both processes:

```bash
npm install            # first time only
bash dev.sh            # or: npm run dev
```

This opens `http://localhost:5173` (Vite) and `http://127.0.0.1:8765`
(FastAPI). Both ports are gated on health checks before the browser
opens, so you'll only see the page once everything is up. (Vite's
default port — 5173 — is whitelisted in the backend CORS config; set
`FRONTEND_PORT` to override if it's busy.)

### What works without DDSP

Everything except `/synthesize` and `/fx/reverb`. `/health` returns
`{"status":"degraded","ddsp_version":"unavailable"}`; the two
heavy endpoints return 503 with a clear error message. All of the
following are unaffected:

- 33-tune catalog with composer + key filters
- 11 backing styles (swing, bossa, funk, latin, ballad, clave 3-2/3-3,
  African 4:4/4:3/3:4) with per-style instrument mapping
- Diatonic scale practice (auto / manual)
- 3-iteration rhythm drill
- Sub-range loop, live score window, mobile command bar
- MediaRecorder → MP4 transcode (via system ffmpeg if installed;
  falls back to WebM if ffmpeg is missing)
- MIDI / MusicXML / Score21 / etude export
- Masterclass personas (Wynton, Coltrane, Bach, Eno, …)

### Optional: enable the DDSP render + reverb path

```bash
source .venv/bin/activate
pip install -r server/requirements-ddsp.txt
# restart bash dev.sh — /health will now return "ok"
```

This pulls TensorFlow CPU + Magenta/DDSP (~1.5 GB). Skip it unless
you need offline chord-progression rendering or FFT reverb on a
recorded take.

### Running backend and frontend separately

```bash
# terminal 1
npm run dev:backend    # http://127.0.0.1:8765

# terminal 2
npm run dev:vite       # http://localhost:5173
```

`npm run build` produces `dist/`.

## License

MIT