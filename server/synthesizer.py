"""
DDSP harmonic synthesizer for chord progression audio generation.

Takes chord progressions (MIDI notes per chord), generates audio
using DDSP's differentiable harmonic synthesizer, then mixes/stems
the result as a WAV buffer.
"""

import io
import struct
import numpy as np
import tensorflow as tf
from ddsp import synths

SAMPLE_RATE = 16000   # DDSP native sample rate
CHORD_DURATION = 2.0  # seconds per chord
NOTE_VOLUME = 0.25    # per-note amplitude scaling
HOP_SIZE = 256        # audio samples per control frame (DDSP default window)


def midi_to_freq(midi: int) -> float:
    """Convert MIDI note number to frequency in Hz."""
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def _envelope_control_frames(
    n_frames: int,
    attack: float = 0.1,
    decay: float = 0.15,
    sustain_level: float = 0.6,
    release: float = 0.3,
) -> np.ndarray:
    """ADSR envelope for control frames (shorter than audio samples)."""
    env = np.ones(n_frames, dtype=np.float32)
    a = max(1, int(attack * n_frames))
    d = max(1, int(decay * n_frames))
    r = max(1, int(release * n_frames))
    if a > 0:
        env[:a] = np.linspace(0.0, 1.0, a)
    if d > a:
        env[a:d] = np.linspace(1.0, sustain_level, d - a)
    if r > 0:
        env[-r:] = np.linspace(sustain_level, 0.0, r)
    return env


def _render_single_note(
    freq_hz: float,
    n_samples_audio: int,
    n_control_frames: int,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """
    Render one note using DDSP's harmonic synthesizer.

    Parameters
    ----------
    freq_hz : float
        Fundamental frequency.
    n_samples_audio : int
        Number of audio output samples.
    n_control_frames : int
        Number of control frames (must be << n_samples_audio).
    """
    synth = synths.Harmonic(
        n_samples=n_samples_audio,
        sample_rate=sample_rate,
        amp_resample_method="window",
    )

    n_harmonics = 60

    # Harmonic distribution: spectral roll-off
    harmonic_dist = np.zeros((1, n_control_frames, n_harmonics), dtype=np.float32)
    for h in range(n_harmonics):
        harmonic_dist[0, :, h] = np.exp(-h * 0.25) * (1.0 - h / n_harmonics)
    harmonic_dist /= harmonic_dist.sum(axis=-1, keepdims=True) + 1e-8

    # Amplitude envelope (per-frame)
    amps = _envelope_control_frames(
        n_control_frames, attack=0.08, release=0.4
    ).reshape(1, n_control_frames, 1)

    # Constant f0
    f0 = np.full((1, n_control_frames, 1), freq_hz, dtype=np.float32)

    audio = synth(
        tf.constant(amps),
        tf.constant(harmonic_dist),
        tf.constant(f0),
    )
    return audio.numpy()[0]  # mono array


def synthesize_progression(
    chord_notes: list[list[int]],
    chord_duration: float = CHORD_DURATION,
    sample_rate: int = SAMPLE_RATE,
) -> bytes:
    """
    Generate a WAV file (as bytes) from a list of chords.

    Parameters
    ----------
    chord_notes : list[list[int]]
        Each inner list is a chord's MIDI note numbers.
    chord_duration : float
        Seconds per chord.
    sample_rate : int
        Output sample rate.

    Returns
    -------
    bytes
        Complete WAV file content (16-bit mono).
    """
    n_samples_audio = int(chord_duration * sample_rate)

    # DDSP requires n_samples_audio to be divisible by n_control_frames.
    # Find the largest divisor ≤ 256 for a good control rate (~100-250 frames).
    n_control_frames = max(8, n_samples_audio // HOP_SIZE)
    while n_samples_audio % n_control_frames != 0 and n_control_frames > 1:
        n_control_frames -= 1

    total_samples = len(chord_notes) * n_samples_audio
    mix = np.zeros(total_samples, dtype=np.float64)

    for chord_idx, notes in enumerate(chord_notes):
        offset = chord_idx * n_samples_audio
        chord_mix = np.zeros(n_samples_audio, dtype=np.float64)

        for midi_note in notes:
            freq = midi_to_freq(midi_note)
            audio = _render_single_note(
                freq, n_samples_audio, n_control_frames, sample_rate
            )
            peak = np.max(np.abs(audio))
            if peak > 1e-6:
                audio = audio / peak * NOTE_VOLUME
            chord_mix += audio.astype(np.float64)

        # Soft limit to prevent clipping within a chord
        chord_peak = np.max(np.abs(chord_mix))
        if chord_peak > 1.0:
            chord_mix /= chord_peak * 1.05

        mix[offset:offset + n_samples_audio] = chord_mix

    # Master limit
    master_peak = np.max(np.abs(mix))
    if master_peak > 0.95:
        mix = mix / master_peak * 0.95

    mix_16 = (mix * 32767).astype(np.int16)
    return _wav_bytes(mix_16, sample_rate)


def _wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    """Package 16-bit mono PCM samples as a WAV byte string."""
    n_samples = len(samples)
    buf = io.BytesIO()

    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + n_samples * 2))
    buf.write(b"WAVE")

    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))
    buf.write(struct.pack("<H", 1))         # PCM
    buf.write(struct.pack("<H", 1))         # mono
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", sample_rate * 2))
    buf.write(struct.pack("<H", 2))         # block align
    buf.write(struct.pack("<H", 16))        # bits per sample

    buf.write(b"data")
    buf.write(struct.pack("<I", n_samples * 2))
    buf.write(samples.tobytes())

    return buf.getvalue()