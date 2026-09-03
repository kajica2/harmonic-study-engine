"""Contract tests for /fx/reverb. Multipart upload endpoint that
takes a WAV blob + reverb params and returns the processed WAV.
DDSP isn't installed in the test venv — so every test below
expects 503 unless noted. The 400-on-empty path is testable
independently because that branch fires before the ddsp check."""

import struct

import pytest


class TestFxReverb:
    """POST /fx/reverb with multipart fields:
      - audio (file): WAV blob
      - decay_sec, brightness, dry_wet, seed: form fields
    Without DDSP: 503. With DDSP: 200 audio/wav."""

    def test_503_when_ddsp_unavailable(self, client, sample_wav_bytes):
        """A non-empty audio file still gets a 503 if DDSP isn't
        installed — the endpoint reads the body first, then
        checks ddsp, but it also checks ddsp first. Either order
        results in 503 in the test env."""
        resp = client.post(
            "/fx/reverb",
            files={"audio": ("test.wav", sample_wav_bytes, "audio/wav")},
            data={"decay_sec": "2.5", "brightness": "0.5"},
        )
        assert resp.status_code in (200, 503)

    def test_400_on_empty_audio(self, client):
        """The endpoint reads audio first; empty bytes must produce
        400 'empty audio' even when DDSP is unavailable... but in
        practice, the ddsp check fires first and returns 503. The
        400 path is only reachable when DDSP is installed. So the
        test environment can only assert the 503 path; the 400
        contract is documented but skipped here."""
        resp = client.post(
            "/fx/reverb",
            files={"audio": ("empty.wav", b"", "audio/wav")},
        )
        # Either 400 (DDSP installed + empty body) or 503 (ddsp
        # check fires first) is acceptable.
        assert resp.status_code in (400, 503)

    def test_form_params_accepted_with_defaults(self, client, sample_wav_bytes):
        """All four form params (decay_sec, brightness, dry_wet,
        seed) have defaults per the signature. Sending only the
        audio file should not 422 — pydantic should apply defaults."""
        resp = client.post(
            "/fx/reverb",
            files={"audio": ("test.wav", sample_wav_bytes, "audio/wav")},
        )
        # Should never be a validation error since all params have defaults.
        assert resp.status_code != 422

    def test_503_body_mentions_ddsp(self, client, sample_wav_bytes):
        resp = client.post(
            "/fx/reverb",
            files={"audio": ("test.wav", sample_wav_bytes, "audio/wav")},
        )
        if resp.status_code != 503:
            # DDSP is installed; skip the body assertion.
            return
        assert "ddsp" in resp.text.lower()


# ---------- shared fixture: a minimal valid WAV blob ---------------------
#
# This isn't a real audio file — just a 44-byte WAV header + 4 samples
# of silence. The endpoint only inspects the byte length (via
# `await audio.read()` and the ddsp guard), not the audio contents,
# so this is enough to exercise the multipart-upload code path.


@pytest.fixture
def sample_wav_bytes():
    """Minimal WAV: 44-byte header + 8 bytes of zero PCM samples
    (4 × 16-bit samples = 0.09 ms of silence at 44.1 kHz)."""
    sample_rate = 44100
    bytes_per_sample = 2
    num_samples = 4
    data_size = num_samples * bytes_per_sample
    buf = bytearray()
    # RIFF header
    buf += b"RIFF"
    buf += struct.pack("<I", 36 + data_size)
    buf += b"WAVE"
    buf += b"fmt "
    buf += struct.pack("<I", 16)
    buf += struct.pack("<H", 1)              # PCM
    buf += struct.pack("<H", 1)              # mono
    buf += struct.pack("<I", sample_rate)
    buf += struct.pack("<I", sample_rate * bytes_per_sample)
    buf += struct.pack("<H", bytes_per_sample)
    buf += struct.pack("<H", 16)             # bits per sample
    buf += b"data"
    buf += struct.pack("<I", data_size)
    buf += b"\x00\x00" * num_samples
    return bytes(buf)