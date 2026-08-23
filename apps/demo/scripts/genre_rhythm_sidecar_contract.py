"""Fixed 48-value temporal rhythm sidecar for electronic boundary models."""

from __future__ import annotations

import os

os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/mmfr-numba-cache")

import librosa
import numpy as np


SAMPLE_RATE = 22050
HOP_LENGTH = 256
VECTOR_LENGTH = 48
TARGET_BPMS = np.asarray((60, 70, 85, 100, 120, 128, 140, 150, 160, 170, 180, 200))


def _finite(values):
    output = np.asarray(values, dtype=np.float64)
    output[~np.isfinite(output)] = 0.0
    return output


def _pulse_strength(tempogram, tempi, target):
    if tempogram.size == 0 or tempi.size == 0:
        return 0.0
    index = int(np.argmin(np.abs(tempi - float(target))))
    scale = max(1e-9, float(np.percentile(tempogram, 95)))
    return float(np.median(tempogram[index]) / scale)


def extract_rhythm_sidecar_array(y, sr=SAMPLE_RATE):
    y = librosa.util.normalize(np.asarray(y, dtype=np.float32))
    if y.size < sr:
        raise ValueError("audio too short for rhythm sidecar")
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)
    stft = np.abs(librosa.stft(y, hop_length=HOP_LENGTH)) ** 2
    frequencies = librosa.fft_frequencies(sr=sr, n_fft=(stft.shape[0] - 1) * 2)
    high = np.sum(stft[frequencies >= 4000], axis=0, keepdims=True)
    high_db = librosa.power_to_db(high, ref=np.max)
    high_onset = librosa.onset.onset_strength(S=high_db, sr=sr, hop_length=HOP_LENGTH)
    tempo = float(np.ravel(librosa.feature.tempo(
        onset_envelope=onset, sr=sr, hop_length=HOP_LENGTH,
    ))[0])
    peaks = librosa.onset.onset_detect(
        onset_envelope=onset, sr=sr, hop_length=HOP_LENGTH, units="frames",
    )
    gaps = np.diff(peaks).astype(float) if peaks.size > 1 else np.asarray([0.0])
    seconds = y.size / float(sr)
    tempogram = librosa.feature.tempogram(
        onset_envelope=onset, sr=sr, hop_length=HOP_LENGTH,
    )
    tempi = librosa.tempo_frequencies(
        tempogram.shape[0], sr=sr, hop_length=HOP_LENGTH,
    )
    pulses = np.asarray([_pulse_strength(tempogram, tempi, bpm) for bpm in TARGET_BPMS])
    beat_period = max(1.0, 60.0 * sr / (max(40.0, tempo) * HOP_LENGTH))
    phase = np.zeros(16, dtype=float)
    if peaks.size:
        bins = np.floor((np.mod(peaks, beat_period) / beat_period) * 16).astype(int) % 16
        for index, weight in zip(bins, onset[np.minimum(peaks, len(onset) - 1)]):
            phase[index] += float(weight)
    phase /= max(1e-9, float(np.sum(phase)))
    autocorr = librosa.autocorrelate(onset, max_size=min(len(onset), 512))
    autocorr = autocorr / max(1e-9, float(autocorr[0] if autocorr.size else 1.0))
    positive = autocorr[1:] if autocorr.size > 1 else np.zeros(1)
    features = [
        tempo / 220.0,
        float(np.mean(onset)), float(np.std(onset)),
        float(len(peaks) / max(1.0, seconds)),
        float(np.mean(gaps) / 128.0), float(np.std(gaps) / 128.0),
        float(np.mean(high_onset)), float(np.std(high_onset)),
        float(np.mean(high_onset) / max(1e-9, np.mean(onset))),
        _pulse_strength(tempogram, tempi, 170),
        _pulse_strength(tempogram, tempi, 140),
        _pulse_strength(tempogram, tempi, 85) / max(1e-9, _pulse_strength(tempogram, tempi, 170)),
    ]
    features.extend(pulses.tolist())
    features.extend(phase.tolist())
    features.extend((np.percentile(gaps, (10, 25, 50, 90)) / 128.0).tolist())
    features.extend([
        float(np.max(positive)), float(np.mean(positive)),
        float(np.std(positive)), float(np.argmax(positive) / max(1, len(positive))),
    ])
    output = _finite(features)
    if len(output) != VECTOR_LENGTH:
        raise ValueError(f"rhythm sidecar produced {len(output)} values, expected {VECTOR_LENGTH}")
    return output.astype(float).tolist()


def extract_rhythm_sidecar(audio_path, offset_seconds=0.0, duration=30.0):
    y, sr = librosa.load(
        str(audio_path), sr=SAMPLE_RATE, mono=True,
        offset=float(offset_seconds), duration=float(duration),
    )
    return extract_rhythm_sidecar_array(y, sr)
