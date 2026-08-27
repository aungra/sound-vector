"""Shared 547-value librosa feature contract for training and inference."""

from __future__ import annotations

import os

os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/mmfr-numba-cache")

import librosa
import numpy as np

from genre_runtime_contract import SEGMENT_DURATION_SECONDS


SAMPLE_RATE = 22050
VECTOR_LENGTH = 547


def safe_list(values):
    output = np.asarray(values, dtype=np.float64)
    output[~np.isfinite(output)] = 0.0
    return output.astype(float).tolist()


def stat_block(values):
    values = np.asarray(values, dtype=np.float64)
    if values.ndim == 1:
        values = values.reshape(1, -1)
    if values.size == 0:
        return []
    return np.concatenate([
        np.nanmean(values, axis=1),
        np.nanstd(values, axis=1),
        np.nanmin(values, axis=1),
        np.nanmax(values, axis=1),
        np.nanpercentile(values, 25, axis=1),
        np.nanpercentile(values, 75, axis=1),
    ]).astype(float).tolist()


def safe_feature(fn, fallback):
    try:
        value = fn()
        if isinstance(value, tuple):
            value = value[0]
        return value
    except Exception:
        return fallback


def extract_librosa(
    audio_path, offset_seconds=0.0, duration=SEGMENT_DURATION_SECONDS,
):
    duration = float(duration)
    y, sr = librosa.load(
        str(audio_path), sr=SAMPLE_RATE, mono=True,
        offset=float(offset_seconds), duration=duration,
    )
    if y.size < sr:
        raise ValueError("audio too short for embedding inference")
    # Container frame rounding commonly yields 29.97s for a nominal 30s
    # segment. The trained cache normalized onset counts by the nominal whole
    # second, so preserve that contract instead of introducing codec jitter.
    analyzed_seconds = max(1.0, float(round(float(y.size) / float(sr))))
    y = librosa.util.normalize(y)
    hop = 512
    stft_power = np.abs(librosa.stft(y, hop_length=hop)) ** 2
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo = safe_feature(
        lambda: librosa.feature.tempo(
            onset_envelope=onset_env, sr=sr, hop_length=hop
        ),
        np.asarray([0.0]),
    )
    mfcc = safe_feature(
        lambda: librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20, hop_length=hop),
        np.zeros((20, 1)),
    )
    delta = safe_feature(lambda: librosa.feature.delta(mfcc), np.zeros_like(mfcc))
    chroma = safe_feature(
        lambda: librosa.feature.chroma_stft(S=stft_power, sr=sr, tuning=0),
        np.zeros((12, 1)),
    )
    contrast = safe_feature(
        lambda: librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop),
        np.zeros((7, 1)),
    )
    centroid = safe_feature(
        lambda: librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop),
        np.zeros((1, 1)),
    )
    bandwidth = safe_feature(
        lambda: librosa.feature.spectral_bandwidth(y=y, sr=sr, hop_length=hop),
        np.zeros((1, 1)),
    )
    rolloff85 = safe_feature(
        lambda: librosa.feature.spectral_rolloff(
            y=y, sr=sr, hop_length=hop, roll_percent=0.85
        ),
        np.zeros((1, 1)),
    )
    rolloff95 = safe_feature(
        lambda: librosa.feature.spectral_rolloff(
            y=y, sr=sr, hop_length=hop, roll_percent=0.95
        ),
        np.zeros((1, 1)),
    )
    flatness = safe_feature(
        lambda: librosa.feature.spectral_flatness(y=y, hop_length=hop),
        np.zeros((1, 1)),
    )
    zcr = safe_feature(
        lambda: librosa.feature.zero_crossing_rate(y, hop_length=hop),
        np.zeros((1, 1)),
    )
    rms = safe_feature(
        lambda: librosa.feature.rms(y=y, hop_length=hop),
        np.zeros((1, 1)),
    )
    tempogram = safe_feature(
        lambda: librosa.feature.tempogram(
            onset_envelope=onset_env, sr=sr, hop_length=hop
        ),
        np.zeros((384, 1)),
    )
    tempogram_small = (
        tempogram[::16, :] if tempogram.ndim == 2 else np.zeros((24, 1))
    )
    onset_peaks = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=sr, hop_length=hop, units="frames"
    )
    onset_gaps = (
        np.diff(onset_peaks) if onset_peaks.size > 1 else np.asarray([0.0])
    )
    y_abs = np.abs(y)
    crest = float(np.max(y_abs) / max(1e-9, np.sqrt(np.mean(y * y))))
    features = [
        float(np.ravel(tempo)[0]) / 220.0,
        float(np.mean(onset_env)),
        float(np.std(onset_env)),
        float(len(onset_peaks) / analyzed_seconds),
        float(np.mean(onset_gaps) / 64.0),
        float(np.std(onset_gaps) / 64.0),
        crest / 20.0,
    ]
    for block in (
        mfcc, delta, chroma, contrast, centroid, bandwidth, rolloff85,
        rolloff95, flatness, zcr, rms, tempogram_small,
    ):
        features.extend(stat_block(block))
    output = safe_list(features)
    if len(output) != VECTOR_LENGTH:
        raise ValueError(
            f"librosa contract produced {len(output)} values, expected {VECTOR_LENGTH}"
        )
    return output
