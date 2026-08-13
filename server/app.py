"""
FastAPI server that exposes DDSP synthesis via a REST API.
"""

import os
import struct
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import uvicorn

from .synthesizer import synthesize_progression
from .fx import apply_reverb

_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
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


class ChordStep(BaseModel):
    name: str = ""
    notes: list[int]


class SynthesizeRequest(BaseModel):
    chord_notes: list[list[int]]
    chord_duration: float = 2.0


class HealthResponse(BaseModel):
    status: str
    ddsp_version: str


@app.get("/health", response_model=HealthResponse)
def health():
    import ddsp
    return HealthResponse(status="ok", ddsp_version=ddsp.__version__)


@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    """
    Generate audio from a chord progression using DDSP.

    Accepts a list of chords, each with MIDI note numbers.
    Returns a WAV audio file.
    """
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
        # without ffmpeg installed (e.g. the ffmpeg-free Docker
        # build). Most production deploys will have ffmpeg.
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


def main():
    uvicorn.run("server.app:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    main()