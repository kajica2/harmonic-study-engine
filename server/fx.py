"""
DDSP FX pipeline — applies DDSP's differentiable reverb to audio.

Input:  WAV bytes (PCM 16-bit mono, any reasonable sample rate)
Output: WAV bytes (same sample rate as input, with reverb tail)

DDSP's `FilteredNoiseReverb` is differentiable (built on
`core.fft_convolve`). We use it as a pure effect processor —
generating an IR from the supplied parameters, then convolving
the audio with it via the same DSP machinery DDSP uses
internally for learned reverb.

The 16 kHz native rate is used internally; audio is resampled
in and back out.
"""

import io
import struct
import numpy as np
import tensorflow as tf
from ddsp import core


def _read_wav(data: bytes) -> tuple[np.ndarray, int]:
    """Read 16-bit mono PCM WAV bytes → (float32 samples in [-1, 1], sample_rate)."""
    assert data[:4] == b"RIFF" and data[8:12] == b"WAVE", "not a WAV"
    sample_rate = struct.unpack("<I", data[24:28])[0]
    bits = struct.unpack("<H", data[34:36])[0]
    channels = struct.unpack("<H", data[22:24])[0]
    assert bits == 16, f"expected 16-bit, got {bits}"
    assert channels in (1, 2), f"expected mono/stereo, got {channels}"
    data_size = struct.unpack("<I", data[40:44])[0]
    n_samples = data_size // (bits // 8) // channels
    raw = np.frombuffer(data[44 : 44 + n_samples * channels * 2], dtype=np.int16)
    samples = raw.reshape(n_samples, channels).astype(np.float32) / 32767.0
    if channels > 1:
        samples = samples.mean(axis=1)
    # Ensure 1D for downstream code (mono case shape=(N,1) needs squeeze)
    samples = samples.reshape(-1)
    return samples, sample_rate


def _write_wav(samples: np.ndarray, sample_rate: int) -> bytes:
    """Write float32 mono audio as 16-bit WAV bytes."""
    n = len(samples)
    peak = float(np.max(np.abs(samples)))
    if peak > 0.95:
        samples = (samples / peak * 0.95).astype(np.float32)
    pcm = (samples * 32767).astype(np.int16)
    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + n * 2))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<H", 1))         # PCM
    buf.write(struct.pack("<H", 1))         # mono
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", sample_rate * 2))
    buf.write(struct.pack("<H", 2))
    buf.write(struct.pack("<H", 16))
    buf.write(b"data")
    buf.write(struct.pack("<I", n * 2))
    buf.write(pcm.tobytes())
    return buf.getvalue()


def _linear_resample(samples: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    if sr_in == sr_out:
        return samples.astype(np.float32, copy=False)
    duration = len(samples) / sr_in
    n_out = int(round(duration * sr_out))
    x_old = np.arange(len(samples), dtype=np.float64)
    x_new = np.linspace(0, len(samples) - 1, n_out).astype(np.float64)
    src_flat = samples.astype(np.float64).ravel()
    return np.interp(x_new, x_old, src_flat).astype(np.float32)


def _build_ir(
    reverb_length: int,
    decay_sec: float,
    brightness: float,
    seed: int = 0,
) -> np.ndarray:
    """
    Generate a reverb impulse response (length = reverb_length).

    noise * exp-decay envelope, then optionally high-pass for "brightness" 0..1.
    Brightness=1 → open / wide-band; brightness=0 → darker / warmer.
    """
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(reverb_length).astype(np.float32)
    # exponential decay over `decay_sec`
    t = np.arange(reverb_length, dtype=np.float32) / 16000.0
    decay = np.exp(-t / max(decay_sec, 0.05)).astype(np.float32)
    ir = noise * decay
    # light tilt EQ (one-pole) — invert cutoff with brightness target
    # (here we keep it simple: brightness adjusts overall spectral balance
    # by emphasizing high frequencies for "bright" tails.)
    if brightness > 0:
        # add a highpass-projected version by differencing
        hp = np.empty_like(ir)
        hp[0] = ir[0]
        prev = ir[0]
        for i in range(1, reverb_length):
            cur = ir[i]
            hp[i] = (cur - prev) * 0.25 + hp[i - 1] * 0.5
            prev = cur
        ir = (1 - brightness * 0.3) * ir + brightness * hp
    # normalise peak
    pk = float(np.max(np.abs(ir)))
    if pk > 1e-6:
        ir = ir / pk
    return ir


def apply_reverb(
    wav_bytes: bytes,
    decay_sec: float = 2.5,
    brightness: float = 0.5,
    dry_wet: float = 0.6,
    seed: int = 0,
) -> bytes:
    """
    Apply DDSP's FFT-based convolution reverb to audio.

    Parameters
    ----------
    wav_bytes : bytes
        16-bit PCM WAV input (mono or stereo).
    decay_sec : float
        Reverb tail length in seconds.
    brightness : float
        0..1 — spectral tilt (0 = warm/dark, 1 = bright).
    dry_wet : float
        0..1 — proportion of wet signal in output (1.0 = full wet).
    seed : int
        RNG seed so the same audio produces a deterministic IR.

    Returns
    -------
    bytes
        16-bit PCM WAV output at the original sample rate.
    """
    samples, sr_in = _read_wav(wav_bytes)

    sr_ddsp = 16000
    samples_ddsp = _linear_resample(samples, sr_in, sr_ddsp)

    # Build an impulse response and convolve with audio via DDSP's
    # differentiable FFT convolver (same code path DDSP uses for its
    # trainable reverb, but without the noise-synth wrapper).
    ir_length = max(4096, sr_ddsp * 3)  # up to 3 s
    ir = _build_ir(
        reverb_length=ir_length,
        decay_sec=decay_sec,
        brightness=brightness,
        seed=seed,
    )

    # Ensure the audio is at least as long as the IR for the FFT conv
    if len(samples_ddsp) < ir_length:
        pad = np.zeros(ir_length - len(samples_ddsp), dtype=np.float32)
        samples_ddsp = np.concatenate([samples_ddsp, pad])

    audio = samples_ddsp[np.newaxis, :].astype(np.float32)        # [1, N]
    ir_t = ir[np.newaxis, np.newaxis, :]                          # [1, 1, N] 

    wet = core.fft_convolve(
        tf.constant(audio),
        tf.constant(ir_t),
        padding="same",
        delay_compensation=ir_length // 2,
    ).numpy()[0]

    mixed = ((1.0 - dry_wet) * audio[0] + dry_wet * wet).astype(np.float32)
    peak = float(np.max(np.abs(mixed)))
    if peak > 0.95:
        mixed = (mixed / peak * 0.95).astype(np.float32)

    mixed_out_sr = _linear_resample(mixed, sr_ddsp, sr_in)
    return _write_wav(mixed_out_sr, sr_in)