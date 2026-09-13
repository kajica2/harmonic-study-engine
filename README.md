# Harmonic Study Engine

A practice engine for trumpet (and any instrument) that pairs curated
harmonic etudes with iReal-Pro-style backing tracks, scale practice,
and full export to MIDI / MusicXML / Score21 / MP4.

**Live:** [harmonic-study-engine.vercel.app](https://harmonic-study-engine.vercel.app)

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
- **Curated harmonic paths** — 8 built-in + 5 classical persona
  paths (Paths XXXIII–XXXVII) + 36-tune masterclass catalog
  (Star Eyes, Cherokee, Solar, Out of Nowhere, I'll Remember
  April, Blue Bossa, etc.) with composer + key + technique
  filters in the Path Catalog tab.
- **9 voicing modes** — Closed, Drop-2, Minimum Motion, Spread,
  Inversion, Quartal, Open Drop-3, Closed Dense, Melody-First.
  Drop-down replaces the old binary Closed/Open toggle.
- **Behavioral markers in the bar strip** — per-bar accent
  strip + Δ glyph for motif transformation (Brahms) and ≈ for
  frozen bass (Rachmaninov). Picks up automatically from the
  active path's note content.
- **Per-bar harmonic function glyphs** — Tonic (○T),
  Dominant (△D), Subdominant (□S), Predominant (◇P) next to
  each chord name. Shape + letter pairing so colorblind users
  still see the function (per `docs/TERMINOLOGY.md`).
- **Per-bar behavioral rules** — sequenceStepper (Tchaikovsky's
  path climbs by 2 semitones per bar), keyDrift (Mahler's path
  drifts from D minor toward C major across the bars),
  motifTracker (Brahms), bassIsolation (Miles).
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

## Surfaces

Three user-facing surfaces, all from one repo:

| URL | Purpose | Local entry |
|---|---|---|
| `/` (or `https://harmonic-study-engine.vercel.app`) | Main React 19 SPA — full practice engine with personas, scales, rhythm drill | `npm run dev:vite` (port 5173) |
| `/engine` (or `https://harmonic-study-engine.vercel.app/engine`) | Audio-reactive engine v2 (sainted-word-records) | `public/sainted-word-records.html` |
| `/rnn` (or `https://harmonic-study-engine.vercel.app/rnn`) | Magenta RNN-driven generator | `public/rnn.html` + `public/rnn-engine.bundle.js` |

The `/engine` and `/rnn` rewrites are configured in `vercel.json`.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system map
  (engine graph, file-by-file role table, wiring)
- [docs/DEVELOPING.md](docs/DEVELOPING.md) — contributor
  guide (how to add a persona / path / voicing)
- [docs/AUDIO.md](docs/AUDIO.md) — engine reference (voice
  design, ADSR curves, warmth math, MIDI semantics)
- [docs/TERMINOLOGY.md](docs/TERMINOLOGY.md) — HSE vocabulary
  glossary + UI glyph conventions
- [CHANGELOG.md](CHANGELOG.md) — per-sprint changes
- [LOOP-PROMPT.md](LOOP-PROMPT.md) — wiggum scratchpad

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
features above (personas, scales, rhythm drill, ride-along, masterclass
catalog, backing styles, MIDI/MusicXML/Score21/MP4 export) are
unaffected — they don't touch the DDSP stack.

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
npm run dev:backend    # http://127.0.0.1:8765 (uvicorn server.app:app)

# terminal 2
npm run dev:vite       # http://localhost:5173
```

`npm run dev:backend` shells out to `python -m uvicorn server.app:app`.
Invoking uvicorn directly (rather than `python -m server.app`) keeps
the ddsp-import warning from printing twice during startup.

`npm run build` produces `dist/`.

## Live deployment

Two hosts, one repo:

- **Frontend** — <https://harmonic-study-engine.vercel.app> on
  Vercel. Auto-deploys on every push to `main` via the GitHub
  integration; the build output is a plain Vite SPA, no serverless
  functions. Project settings in `vercel.json`-equivalent form
  (build command, output dir) are read from `package.json` and
  Vercel's auto-detected Vite preset.
- **Backend** — FastAPI on Render, native Python runtime (no Docker).
  Provisioned via `render.yaml` (Render Blueprint spec). Connect
  the repo at <https://dashboard.render.com> → New → Blueprint →
  point at this repo. The free tier sleeps after 15 min of
  inactivity (cold-start latency 30–60 s on the first request).

### Why the split

FastAPI doesn't fit Vercel's shape:

- `/recordings/upload` runs `ffmpeg` and can take 1–2 minutes per
  recording — far over Vercel's 10 s Hobby / 60 s Pro serverless
  timeout
- `/synthesize` and `/fx/reverb` use TensorFlow + Magenta/DDSP
  weights (~1.5 GB) — the cold-start cost would dominate every
  request
- Both endpoints need a persistent host (ffmpeg installed, scratch
  disk, a real process model)

Render's native Python runtime gives all three.

### Wiring them together

After Render gives the backend a `*.onrender.com` URL, point the
deployed Vercel frontend at it:

1. Vercel dashboard → Project → Settings → Environment Variables
2. Add `VITE_DDSP_API` = `https://harmonic-study-engine-api.onrender.com`
3. Trigger a redeploy (Vercel picks the new value at build time)

Locally, the default `VITE_DDSP_API=http://127.0.0.1:8765` is
correct — start the backend with `bash dev.sh` (or
`npm run dev:backend`) and load the deployed tab in the same
browser session. The toolbar's **API** status pill reflects the
state:

- ● live — backend reachable, DDSP installed
- ● degraded — backend reachable, DDSP not installed (`/synthesize`
  and `/fx/reverb` will 503). Default on Render — uncomment the
  `requirements-ddsp.txt` line in `render.yaml` to opt in
- ● offline — backend unreachable (the default state on the deployed
  tab until Render is set up)

### CORS

Render's `DDSP_CORS_ORIGINS` env var whitelists the Vercel
canonical domain plus `localhost:5173` for local dev. If you add
a custom domain to the Vercel project, add it to that env var on
the Render side and redeploy.

## Testing

Two test suites, run from the project root with `npm test` and
`npm run test:py`:

### Frontend (Vitest)

```bash
npm test             # run once
npm run test:watch   # watch mode
```

Coverage:

- `tests/smoke.test.ts` — vitest infrastructure + src import paths
- `tests/theory.test.ts` — note names, MIDI conversion, voice-leading
- `tests/paths.test.ts` — catalog invariants (every path has notes, unique ids)
- `tests/scoreExport.test.ts` — MusicXML 4.0 + Score21 output shapes
- `tests/midiExport.test.ts` — SMF header bytes + format
- `tests/useSessionStore.test.ts` — localStorage hydration + the
  legacy `beatType` migration map

307 tests passing as of this commit (278 frontend it() + 29 backend def test_).
Both counts verified by `npm test` and `npm run test:py` against the
repo today. New tests added for previously-untested lib files
(useBassNotes, importRealBook, ireal — the ones the older "What to
add next" section listed). Run `npm test -- --coverage` for an HTML
coverage report (defaults to `coverage/`).

**Not covered** (intentionally): React components in `src/components/`
beyond the few that use `@testing-library/react` (useBassNotes is
covered). The audio/score/visualization engines in `src/components/`
are tightly coupled to audio-engine singleton instances
(rhythmEngine, audioEngine, backingEngine), and the test ROI for
mocking all that is low. UI bugs surface in browser-browser tests;
the unit tests cover the deterministic, importable logic that the
UI composes.

### Backend (pytest)

```bash
npm run test:py      # wrapper that prefers .venv/bin/python
```

Requires `server/requirements-dev.txt` installed in the venv
(`pip install -r server/requirements-dev.txt`). The wrapper
falls back to `python3 -m pytest` if no venv exists, but
pytest-asyncio must be installed in that Python for tests to run.

Coverage (29 tests):

- `server/tests/test_app.py` — every API route registered
- `server/tests/test_health.py` — `/health` shape + status contract
- `server/tests/test_synthesize.py` — 503/400/422 contract paths
- `server/tests/test_fx_reverb.py` — multipart upload + 503/400
- `server/tests/test_recordings_upload.py` — ffmpeg fallback path
  + Content-Disposition + X-Transcoded headers
- `server/tests/test_cors.py` — DDSP_CORS_ORIGINS env var + defaults

**Not covered**: `server/synthesizer.py` and `server/fx.py` — these
require Magenta/DDSP installed to even import. The `/synthesize`
and `/fx/reverb` 503 paths are tested instead, which is what
production deploys actually hit without the DDSP stack.

### What to add next

If you tackle more coverage, the highest-leverage targets are:

- `src/lib/recorder.ts` — needs the MediaRecorder mock; complex
- `src/lib/scoreGenerator.ts` — the MusicXML/abcjs renderer; medium
  effort, high regression value
- `src/lib/backingEngine.ts` — the rhythm-section synth singleton;
  AudioContext-coupled, but pattern tables could be extracted into
  pure helpers and tested

## License

MIT
