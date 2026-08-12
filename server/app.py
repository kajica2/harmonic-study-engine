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


def main():
    uvicorn.run("server.app:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    main()