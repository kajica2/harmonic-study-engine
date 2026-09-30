"""
FastAPI server that exposes DDSP synthesis via a REST API.
"""

import json
import os
import logging
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from . import marketplace

logger = logging.getLogger(__name__)

# DDSP is heavy and the upstream v3.7.0 tag is gone. Install
# server/requirements-ddsp.txt on top of the venv if you want
# offline render + reverb; the modules below are imported lazily
# and 503 if ddsp isn't available.
_DDSP_AVAILABLE = False
_DDSP_IMPORT_ERROR = None  # typed as Exception | None; annotation
# omitted because PEP 604 union syntax needs Python 3.10+, and the
# project supports 3.9. Use `is not None` to narrow before use.
_DDSP_WARNED = False
try:
    from .synthesizer import synthesize_progression
    from .fx import apply_reverb
    _DDSP_AVAILABLE = True
except Exception as e:
    _DDSP_IMPORT_ERROR = e
    synthesize_progression = None
    apply_reverb = None

# Log once at module import. Invoking the server with `python -m
# server.app` causes the body to run twice — once as `__main__`,
# once as `server.app` when uvicorn imports it for the ASGI loader
# — which spams the same warning line. The guard dedupes within a
# single module body run; the dev.sh / dev:backend scripts avoid the
# double-import by invoking uvicorn directly.
if not _DDSP_AVAILABLE and not _DDSP_WARNED:
    _DDSP_WARNED = True
    logger.warning("ddsp not available: %s", _DDSP_IMPORT_ERROR)

_DEFAULT_ORIGINS = [
    # Vite default (used by dev.sh and `npm run dev:vite`).
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # Legacy / npm run dev (dev.sh now defaults to 5173, but some users
    # override FRONTEND_PORT=3000).
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


def _resolve_origins() -> list[str]:
    """Read origins from DDSP_CORS_ORIGINS env var (comma-separated) or default."""
    raw = os.environ.get("DDSP_CORS_ORIGINS", "").strip()
    if not raw:
        return _DEFAULT_ORIGINS
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return parts or _DEFAULT_ORIGINS


app = FastAPI(title="DDSP Synthesis Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


class SynthesizeRequest(BaseModel):
    chord_notes: list[list[int]]
    chord_duration: float = 2.0


class HealthResponse(BaseModel):
    status: str
    ddsp_version: str


@app.get("/health", response_model=HealthResponse)
def health():
    if _DDSP_AVAILABLE:
        import ddsp
        return HealthResponse(status="ok", ddsp_version=ddsp.__version__)
    # No ddsp — degraded mode (HF free tier). App still works.
    return HealthResponse(status="degraded", ddsp_version="unavailable")


@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    """
    Generate audio from a chord progression using DDSP.

    Accepts a list of chords, each with MIDI note numbers.
    Returns a WAV audio file.
    """
    if not _DDSP_AVAILABLE or synthesize_progression is None:
        return Response(
            status_code=503,
            content="ddsp not available in this build. The /synthesize "
                    "endpoint requires a forked ddsp repo + paid CPU tier.",
            media_type="text/plain",
        )
    wav_bytes = synthesize_progression(
        req.chord_notes,
        chord_duration=req.chord_duration,
    )
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "inline; filename=ddsp_synthesis.wav",
            "Content-Length": str(len(wav_bytes)),
        },
    )


@app.post("/fx/reverb")
async def fx_reverb(
    audio: UploadFile = File(...),
    decay_sec: float = Form(2.5),
    brightness: float = Form(0.5),
    dry_wet: float = Form(0.6),
    seed: int = Form(0),
):
    """
    Apply DDSP's FFT-based reverb to an uploaded WAV.

    Audio: WAV (16-bit PCM, mono or stereo).
    Parameters sent as form fields.
    Returns: WAV (16-bit PCM, mono, original sample rate).
    """
    if not _DDSP_AVAILABLE or apply_reverb is None:
        return Response(
            status_code=503,
            content="ddsp not available in this build.",
            media_type="text/plain",
        )
    raw = await audio.read()
    if not raw:
        return Response(status_code=400, content="empty audio")
    out_wav = apply_reverb(
        raw,
        decay_sec=decay_sec,
        brightness=brightness,
        dry_wet=dry_wet,
        seed=seed,
    )
    return Response(
        content=out_wav,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "inline; filename=ddsp_reverb.wav",
            "Content-Length": str(len(out_wav)),
        },
    )


@app.post("/recordings/upload")
async def recordings_upload(
    audio: UploadFile = File(...),
    duration_sec: float = Form(0.0),
):
    """
    Accept a browser-recorded WebM (VP8/Opus) blob from
    MediaRecorder and transcode to MP4 (H.264 + AAC) via ffmpeg.

    The browser produces WebM because MediaRecorder's
    `video/mp4` support is inconsistent across browsers; this
    endpoint normalises every take to a single MP4 that plays
    on every device and uploads to every social platform.

    Audio: any browser-emitted MediaRecorder blob
            (typically `video/webm;codecs=vp8,opus`).
    duration_sec: optional client-supplied elapsed seconds
            (recorded before the stop event); used for the
            filename only.
    Returns: MP4 (H.264 video + AAC audio, faststart for
            streaming) on success, or the original WebM blob
            if ffmpeg isn't available.
    """
    import shutil
    import subprocess
    import tempfile
    import uuid

    raw = await audio.read()
    if not raw:
        return Response(status_code=400, content="empty recording")

    if not shutil.which("ffmpeg"):
        # Fall back to the original WebM; the client can re-encode
        # if needed. This is the path used when the server runs
        # without ffmpeg installed. Most installs will have it.
        return Response(
            content=raw,
            media_type=audio.content_type or "video/webm",
            headers={
                "Content-Disposition": f'inline; filename="recording-{uuid.uuid4().hex}.webm"',
                "Content-Length": str(len(raw)),
                "X-Transcoded": "false",
            },
        )

    with tempfile.TemporaryDirectory() as td:
        in_path = os.path.join(td, "in.webm")
        out_path = os.path.join(td, "out.mp4")
        with open(in_path, "wb") as f:
            f.write(raw)
        # ffmpeg args: copy video stream (no re-encode), transcode
        # audio to AAC (Opus → AAC for Apple/Safari support),
        # faststart for progressive download. -y overwrites.
        # Errors on stderr are non-fatal — ffmpeg still produces
        # output even when the input has minor metadata issues.
        cmd = [
            "ffmpeg",
            "-y",
            "-i", in_path,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "22",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            out_path,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            return Response(
                status_code=500,
                content=f"ffmpeg failed: {e.stderr.decode('utf-8', errors='ignore')[-500:]}",
            )
        with open(out_path, "rb") as f:
            mp4_bytes = f.read()

    label = f"recording-{uuid.uuid4().hex[:8]}-{int(duration_sec)}s"
    return Response(
        content=mp4_bytes,
        media_type="video/mp4",
        headers={
            "Content-Disposition": f'inline; filename="{label}.mp4"',
            "Content-Length": str(len(mp4_bytes)),
            "X-Transcoded": "true",
        },
    )


# --- Marketplace (server/marketplace.py) -----------------------------


@app.post("/marketplace/listings", response_model=marketplace.MarketplaceListing, status_code=201)
def create_marketplace_listing(payload: marketplace.MarketplaceListing):
    """Create a marketplace listing. 409 if (title, composer) already exists."""
    data = payload.model_dump(exclude={"id", "created_at", "updated_at"})
    listing = marketplace.MarketplaceListing(**data)
    try:
        return marketplace.create_listing(listing)
    except marketplace.DuplicateListingError:
        raise HTTPException(
            status_code=409,
            detail="a listing with this title and composer already exists",
        )


@app.put("/marketplace/listings/{listing_id}", response_model=marketplace.MarketplaceListing)
def update_marketplace_listing(listing_id: str, payload: marketplace.MarketplaceListing):
    """Replace a listing. 404 if missing, 409 if the new (title, composer) collides."""
    data = payload.model_dump(exclude={"id", "created_at", "updated_at"})
    listing = marketplace.MarketplaceListing(**data)
    try:
        updated = marketplace.update_listing(listing_id, listing)
    except marketplace.DuplicateListingError:
        raise HTTPException(
            status_code=409,
            detail="another listing already uses this title and composer",
        )
    if updated is None:
        raise HTTPException(status_code=404, detail="listing not found")
    return updated


@app.get("/marketplace/listings", response_model=list[marketplace.MarketplaceListing])
def list_marketplace_listings(status: str = "published"):
    """List listings, newest first. Filter with ?status= (default published)."""
    return marketplace.list_listings(status=status)


@app.get("/marketplace/listings/{listing_id}", response_model=marketplace.MarketplaceListing)
def get_marketplace_listing(listing_id: str):
    """Fetch a single listing by id."""
    listing = marketplace.get_listing(listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="listing not found")
    return listing


@app.post("/marketplace/sync")
def sync_marketplace_from_github():
    """Pull the marketplace catalog from the GitHub repo tree and upsert.

    The repo tree is the source of truth: marketplace/<slug>.mp3 +
    marketplace/<slug>.mid pairs become published listings with raw
    download URLs. Returns {"created": n, "updated": n, "skipped": n,
    "errors": [...]}. Raises 502 if the GitHub tree cannot be fetched.
    """
    try:
        return marketplace.sync_from_github_repo()
    except marketplace.SyncError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


def _is_wav_upload(audio: UploadFile, raw: bytes) -> bool:
    """True when the upload looks like a WAV file.

    Accepts a WAV content-type OR the RIFF/WAVE magic bytes, so a
    browser that sends application/octet-stream still passes when the
    payload is a real WAV.
    """
    content_type = (audio.content_type or "").lower()
    if "wav" in content_type or content_type in ("audio/wave", "audio/x-wav"):
        return True
    return len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WAVE"


@app.post("/marketplace/publish")
async def publish_marketplace_listing(
    audio: UploadFile = File(...),
    midi: UploadFile = File(...),
    slug: str = Form(...),
    title: str = Form(""),
    composer: str = Form(""),
):
    """Publish the current path to the marketplace.

    Accepts a WAV render + MIDI file, encodes the WAV to MP3 via
    ffmpeg, commits marketplace/<slug>.mp3 + marketplace/<slug>.mid to
    the HSE GitHub repo (update-if-exists), then syncs the catalog so
    the listing appears immediately. The GitHub token stays server-side
    (GITHUB_TOKEN env) and is never exposed to the client.

    Returns {"published": True, "slug": slug, "listing": {...}}.
    """
    if not marketplace.SLUG_RE.match(slug):
        raise HTTPException(status_code=422, detail="slug must match ^[a-z0-9-]+$")
    wav_bytes = await audio.read()
    if not wav_bytes:
        raise HTTPException(status_code=422, detail="audio is empty")
    if not _is_wav_upload(audio, wav_bytes):
        raise HTTPException(status_code=422, detail="audio must be a WAV file")
    midi_bytes = await midi.read()
    if not midi_bytes:
        raise HTTPException(status_code=422, detail="midi is required")
    try:
        return marketplace.publish_listing(
            slug,
            wav_bytes,
            midi_bytes,
            title=title or None,
            composer=composer or None,
        )
    except marketplace.PublishError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@app.post("/webhooks/github")
async def github_webhook(request: Request):
    """Ingest a GitHub push event for marketplace listings.

    Verifies X-Hub-Signature-256 (HMAC-SHA256) against
    MARKETPLACE_WEBHOOK_SECRET, gates on MARKETPLACE_WEBHOOK_BRANCH,
    and for marketplace: commits triggers a full repo-tree sync
    (sync_from_github_repo). The repo tree is the source of truth, so
    the webhook no longer parses per-commit listing fields.

    Precedence is 503 -> 401 -> 400: the secret check (503) runs
    before any payload-size rejection so an unconfigured server never
    masks its misconfiguration with a 400. The Content-Length fast-path
    below rejects oversized bodies without buffering them; the body
    length is re-checked inside handle_github_push for requests that
    omit or lie about Content-Length.
    """
    if not marketplace.webhook_secret_configured():
        raise HTTPException(status_code=503, detail="webhook secret not configured")
    content_length = request.headers.get("Content-Length")
    if content_length is not None:
        try:
            if int(content_length) > marketplace.MAX_WEBHOOK_BODY_BYTES:
                raise HTTPException(status_code=400, detail="payload exceeds 1 MB limit")
        except ValueError:
            pass  # malformed header; the body-length check covers it
    raw_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    # Lenient ref extraction; strict JSON validation happens inside
    # handle_github_push after signature verification so the 503/401/400
    # precedence matches the spec.
    ref = None
    try:
        parsed = json.loads(raw_body.decode("utf-8"))
        if isinstance(parsed, dict):
            ref = parsed.get("ref")
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass
    try:
        return marketplace.handle_github_push(raw_body, signature, ref)
    except marketplace.WebhookError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


# Run with: python -m uvicorn server.app:app --host 127.0.0.1 --port 8765
# Avoid `python -m server.app` — that double-imports the module body
# (once as __main__, once as server.app) and spams the ddsp warning.