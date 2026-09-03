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

62 tests as of this commit. Run `npm test -- --coverage` for an
HTML coverage report (defaults to `coverage/`).

**Not covered** (intentionally): React components in `src/components/`
and `src/App.tsx` — they're tightly coupled to the audio engine
singleton instances (rhythmEngine, audioEngine, backingEngine),
and the test ROI for mocking all that is low. UI bugs surface in
browser-browser tests; the unit tests cover the deterministic,
importable logic that the UI composes.

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

- `src/lib/useBassNotes.ts` — wraps the backing engine's bass MIDI
  stream; testable with a mocked backingEngine
- `src/lib/importRealBook.ts` and `src/lib/ireal.ts` — file-format
  parsers; high regression value
- `src/lib/recorder.ts` — needs the MediaRecorder mock; complex

## License

MIT