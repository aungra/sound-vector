import argparse
import hashlib
import importlib.util
import json
import os
import pickle
import subprocess
from pathlib import Path

os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/mmfr-numba-cache")

import librosa
import numpy as np
try:
    import essentia
    from essentia.standard import (
        MonoLoader, TensorflowPredict2D, TensorflowPredictEffnetDiscogs,
    )
    if os.environ.get("MMFR_ESSENTIA_QUIET", "1") == "1":
        essentia.log.infoActive = False
        essentia.log.warningActive = False
except ModuleNotFoundError:
    MonoLoader = TensorflowPredict2D = TensorflowPredictEffnetDiscogs = None

from genre_runtime_contract import (
    SEGMENT_COUNT as CONTRACT_SEGMENT_COUNT,
    SEGMENT_DURATION_SECONDS,
    SPECIALIST_FAMILIES,
    feature_contract,
    feature_contract_digest,
    validate_bundle_contract,
    validate_runtime_vectors,
)
from genre_runtime_models import (
    SEGMENT_ARBITRATOR_SCHEMA_VERSION,
    segment_arbitrator_features,
    segment_family_specialist_scores,
    segment_override_gate_features,
)
from genre_unknown80_rhythm_reranker import (
    load_bundle as load_unknown80_rhythm_bundle,
    rerank as apply_unknown80_rhythm_reranker,
)
from genre_unknown80_track_pair_reranker import (
    load_bundle as load_unknown80_track_pair_bundle,
    rerank as apply_unknown80_track_pair_reranker,
)
from genre_musicfm_runtime import (
    load_bundle as load_musicfm_bundle,
    rerank as apply_musicfm_reranker,
)
from genre_unknown65_runtime import (
    load_bundle as load_unknown65_bundle,
    merge_records as merge_unknown65_records,
    rerank as apply_unknown65_reranker,
)
from genre_librosa_contract import extract_librosa as extract_runtime_librosa


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MODEL_PATH = Path(os.environ.get(
    "MMFR_EMBEDDING_GENRE_MODEL_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/embedding-genre-model.pkl",
))
DISCOGS_CACHE = Path(os.environ.get(
    "MMFR_ESSENTIA_DISCOGS_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/essentia-discogs-feature-cache.json",
))
MTG_CACHE = Path(os.environ.get(
    "MMFR_ESSENTIA_MTG_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/essentia-mtg-jamendo-feature-cache.json",
))
LIBROSA_CACHE = Path(os.environ.get(
    "MMFR_LIBROSA_FEATURE_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/librosa-feature-cache.json",
))
JPOP_CALIBRATOR_PATH = Path(os.environ.get(
    "MMFR_JPOP_EVIDENCE_CALIBRATOR_PATH",
    str(ROOT / "genre-training" / "jpop-evidence-calibrator.json"),
))
EFFNET_MODEL_DIR = Path(os.environ.get(
    "MMFR_ESSENTIA_DISCOGS_MODEL_DIR",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/models/essentia-discogs-effnet",
))
MTG_MODEL_DIR = Path(os.environ.get(
    "MMFR_ESSENTIA_MTG_JAMENDO_MODEL_DIR",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/models/essentia-mtg-jamendo",
))
ESSENTIA_SR = 16000
LIBROSA_SR = 22050
DURATION = float(os.environ.get("MMFR_EMBEDDING_INFER_DURATION", str(SEGMENT_DURATION_SECONDS)))
SEGMENT_COUNT = max(1, min(5, int(os.environ.get("MMFR_EMBEDDING_SEGMENTS", str(CONTRACT_SEGMENT_COUNT)))))
INFER_SOURCES = tuple(
    value.strip()
    for value in os.environ.get("MMFR_EMBEDDING_INFER_SOURCES", "discogs,librosa").split(",")
    if value.strip() in {"discogs", "mtg", "librosa"}
)
DISCOGS_HEAD_ENABLED = os.environ.get("MMFR_ESSENTIA_DISCOGS_HEAD", "0") == "1"
SOURCE_VECTOR_LENGTHS = {"discogs": 5040, "mtg": 261, "librosa": 547}
DISCOGS_TAG_DIMENSIONS = 1200
FINE_MACRO_PRIOR_ALPHA_OVERRIDE = os.environ.get("MMFR_EMBEDDING_FINE_MACRO_PRIOR_ALPHA")
FINE_MACRO_PRIOR_FLOOR = float(os.environ.get("MMFR_EMBEDDING_FINE_MACRO_PRIOR_FLOOR", "0.000001"))
MACRO_SPECIALIST_ENGINE_PATH = Path(__file__).with_name("genre-embedding-macro-specialists.py")
MACRO_SPECIALIST_RUNTIME = None
UNKNOWN80_RHYTHM_MODEL_PATH = Path(os.environ.get(
    "MMFR_UNKNOWN80_RHYTHM_MODEL_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-rhythm-top3-pairwise-candidate.pkl",
))
UNKNOWN80_FUNK_ROCK_MODEL_PATH = Path(os.environ.get(
    "MMFR_UNKNOWN80_FUNK_ROCK_MODEL_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-fma-funk-rock-librosa-candidate.pkl",
))
UNKNOWN80_INDEPENDENT_PAIR_MODEL_PATH = Path(os.environ.get(
    "MMFR_UNKNOWN80_INDEPENDENT_PAIR_MODEL_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v107-candidate.pkl",
))
UNKNOWN80_TRACK_PAIR_MODEL_PATH = Path(os.environ.get(
    "MMFR_UNKNOWN80_TRACK_PAIR_MODEL_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-track-pair-v113-candidate.pkl",
))
UNKNOWN80_TRACK_PAIR_MANIFEST_PATH = Path(os.environ.get(
    "MMFR_UNKNOWN80_TRACK_PAIR_MANIFEST_PATH",
    str(ROOT / "genre-training" / "unknown80-v113-track-pair-model-manifest.json"),
))
UNKNOWN80_MUSICFM_MODEL_PATH = Path(os.environ.get(
    "MMFR_UNKNOWN80_MUSICFM_MODEL_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-musicfm-top3-v114-candidate.pkl",
))
UNKNOWN80_MUSICFM_MANIFEST_PATH = Path(os.environ.get(
    "MMFR_UNKNOWN80_MUSICFM_MANIFEST_PATH",
    str(ROOT / "genre-training" / "unknown80-v114-musicfm-model-manifest.json"),
))
MUSICFM_EXTRACTOR_PATH = Path(__file__).with_name("genre-musicfm-runtime-extract.py")
MUSICFM_PYTHON = os.environ.get("MMFR_MUSICFM_PYTHON", "/usr/bin/python3")
MUSICFM_PYTHONPATH = os.environ.get(
    "MMFR_MUSICFM_PYTHONPATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python/mulan-runtime:"
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python/musicfm-runtime",
)
ENABLE_UNKNOWN80_RHYTHM_RERANKER = (
    os.environ.get("MMFR_ENABLE_UNKNOWN80_RHYTHM_RERANKER", "1") == "1"
)
ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER = (
    os.environ.get("MMFR_ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER", "1") == "1"
)
ENABLE_UNKNOWN80_TRACK_PAIR_RERANKER = (
    os.environ.get("MMFR_ENABLE_UNKNOWN80_TRACK_PAIR_RERANKER", "1") == "1"
)
ENABLE_UNKNOWN80_MUSICFM_RERANKER = (
    os.environ.get("MMFR_ENABLE_UNKNOWN80_MUSICFM_RERANKER", "0") == "1"
)
UNKNOWN65_MODEL_PATH = Path(os.environ.get(
    "MMFR_UNKNOWN65_MODEL_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown65-first-milestone-v1.pkl",
))
UNKNOWN65_MANIFEST_PATH = Path(os.environ.get(
    "MMFR_UNKNOWN65_MANIFEST_PATH",
    str(ROOT / "genre-training/unknown65-production-model-manifest.json"),
))
UNKNOWN65_EXTRACTOR_PATH = Path(__file__).with_name("genre-unknown65-runtime-extract.py")
UNKNOWN65_PYTHON = os.environ.get(
    "MMFR_UNKNOWN65_PYTHON", "/Users/kahanishimoto/.headroom-codex/env/bin/python3",
)
UNKNOWN65_PYTHONPATH = os.environ.get(
    "MMFR_UNKNOWN65_PYTHONPATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python-unknown65-runtime:"
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python-clap:"
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python-audio-features",
)
ENABLE_UNKNOWN65_RERANKER = os.environ.get("MMFR_ENABLE_UNKNOWN65_RERANKER", "0") == "1"
UNKNOWN80_RHYTHM_BUNDLE = None
UNKNOWN80_FUNK_ROCK_BUNDLE = None
UNKNOWN80_INDEPENDENT_PAIR_BUNDLE = None
UNKNOWN80_TRACK_PAIR_BUNDLE = None
UNKNOWN80_MUSICFM_BUNDLE = None
UNKNOWN65_BUNDLE = None

FINE_LABEL_MACRO_MAP = {
    "アンビエント": "ambient",
    "ドローン": "ambient",
    "ノイズミュージック": "ambient",
    "電子音楽": "electronic",
    "テクノ": "electronic",
    "ハウス": "electronic",
    "ディープ・ハウス": "electronic",
    "トランス": "electronic",
    "ドラムンベース": "electronic",
    "ダブステップ": "electronic",
    "チップチューン": "electronic",
    "ヒップホップ": "black_music",
    "トラップ": "black_music",
    "レゲエ": "black_music",
    "ダブ": "black_music",
    "ブルース": "black_music",
    "ファンク": "black_music",
    "ソウルミュージック": "black_music",
    "ディスコ": "black_music",
    "ロック": "rock",
    "パンク": "rock",
    "ハードコア": "rock",
    "メタル": "rock",
    "ジャズ": "jazz",
    "シティ・ポップ": "pop",
    "J-POP": "pop",
    "アニメソング": "pop",
    "クラシック音楽": "classical",
    "オペラ": "classical",
    "フォーク": "world",
    "ラテン": "world",
    "ワールドミュージック": "world",
}


class ConstantClassifier:
    def __init__(self, label):
        self.classes_ = np.asarray([label], dtype=object)

    def predict_proba(self, values):
        return np.ones((len(values), 1), dtype=np.float64)


def load_json(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def safe_list(values):
    arr = np.asarray(values, dtype=np.float64)
    arr[~np.isfinite(arr)] = 0
    return arr.astype(float).tolist()


def normalize_scores(values):
    scores = np.asarray(values, dtype=np.float64)
    return scores / np.maximum(scores.sum(axis=-1, keepdims=True), 1e-12)


def stat_block(values):
    arr = np.asarray(values, dtype=np.float64)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    if arr.size == 0:
        return []
    return np.concatenate([
        np.nanmean(arr, axis=1),
        np.nanstd(arr, axis=1),
        np.nanmin(arr, axis=1),
        np.nanmax(arr, axis=1),
        np.nanpercentile(arr, 25, axis=1),
        np.nanpercentile(arr, 75, axis=1),
    ]).astype(float).tolist()


def safe_feature(fn, fallback):
    try:
        value = fn()
        if isinstance(value, tuple):
            value = value[0]
        return value
    except Exception:
        return fallback


def matrix_stats(matrix):
    arr = np.asarray(matrix, dtype=np.float64)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    return np.concatenate([
        arr.mean(axis=0),
        arr.std(axis=0),
        arr.max(axis=0),
    ]).astype(float).tolist()


class EssentiaExtractors:
    def __init__(self, sources=INFER_SOURCES):
        self.sources = set(sources)
        self.embedding_model = None
        self.discogs_model = None
        self.mtg_model = None
        self.embedding_cache = {}
        self.audio_cache = {}

    def ensure_embedding_model(self):
        if TensorflowPredictEffnetDiscogs is None:
            raise RuntimeError("Essentia is required for live embedding extraction")
        if self.embedding_model is None:
            self.embedding_model = TensorflowPredictEffnetDiscogs(
                graphFilename=str(EFFNET_MODEL_DIR / "discogs-effnet-bs64-1.pb"),
                output="PartitionedCall:1",
            )
        return self.embedding_model

    def ensure_discogs_model(self):
        if TensorflowPredict2D is None:
            raise RuntimeError("Essentia is required for live Discogs extraction")
        if self.discogs_model is None:
            self.discogs_model = TensorflowPredict2D(
                graphFilename=str(EFFNET_MODEL_DIR / "genre_discogs400-discogs-effnet-1.pb"),
                input="serving_default_model_Placeholder",
                output="PartitionedCall:0",
            )
        return self.discogs_model

    def ensure_mtg_model(self):
        if TensorflowPredict2D is None:
            raise RuntimeError("Essentia is required for live MTG extraction")
        if self.mtg_model is None:
            self.mtg_model = TensorflowPredict2D(
                graphFilename=str(MTG_MODEL_DIR / "mtg_jamendo_genre-discogs-effnet-1.pb"),
                input="model/Placeholder",
                output="model/Sigmoid",
            )
        return self.mtg_model

    def audio(self, audio_path):
        if MonoLoader is None:
            raise RuntimeError("Essentia is required for live audio loading")
        cache_key = str(audio_path)
        if cache_key not in self.audio_cache:
            self.audio_cache[cache_key] = MonoLoader(
                filename=str(audio_path), sampleRate=ESSENTIA_SR, resampleQuality=4,
            )()
        return self.audio_cache[cache_key]

    def release_audio(self, audio_path):
        """Release per-track PCM and embeddings while retaining loaded models."""
        cache_key = str(audio_path)
        self.audio_cache.pop(cache_key, None)
        stale = [key for key in self.embedding_cache if key[0] == cache_key]
        for key in stale:
            self.embedding_cache.pop(key, None)

    def embeddings(self, audio_path, offset_seconds=0.0, duration_seconds=None):
        duration = DURATION if duration_seconds is None else max(1.0, float(duration_seconds))
        cache_key = (
            str(audio_path), round(float(offset_seconds), 3), round(duration, 3),
        )
        if cache_key in self.embedding_cache:
            return self.embedding_cache[cache_key]
        audio = self.audio(audio_path)
        start_sample = max(0, int(float(offset_seconds) * ESSENTIA_SR))
        max_samples = int(ESSENTIA_SR * duration)
        segment = audio[start_sample:start_sample + max_samples]
        if len(segment) < ESSENTIA_SR:
            raise ValueError("audio segment too short for embedding inference")
        embeddings = self.ensure_embedding_model()(segment)
        self.embedding_cache[cache_key] = embeddings
        return embeddings

    def discogs(self, audio_path, offset_seconds=0.0, duration_seconds=None):
        embeddings = self.embeddings(audio_path, offset_seconds, duration_seconds)
        embedding_stats = matrix_stats(embeddings)
        if not DISCOGS_HEAD_ENABLED:
            # The TensorFlow 2D tag head intermittently segfaults on Apple
            # Silicon. Keep the trained vector contract while retaining the
            # stable EffNet representation; confidence is capped below.
            return safe_list([0.0] * 1200 + embedding_stats)
        predictions = self.ensure_discogs_model()(embeddings)
        return safe_list(matrix_stats(predictions) + embedding_stats)

    def mtg(self, audio_path, offset_seconds=0.0, duration_seconds=None):
        embeddings = self.embeddings(audio_path, offset_seconds, duration_seconds)
        predictions = self.ensure_mtg_model()(embeddings)
        return safe_list(matrix_stats(predictions))


def extract_librosa(audio_path, offset_seconds=0.0, duration_seconds=None):
    return extract_runtime_librosa(
        audio_path, offset_seconds=offset_seconds,
        duration=DURATION if duration_seconds is None else max(1.0, float(duration_seconds)),
    )


def extract_pop_audio_evidence(audio_path, offset_seconds=0.0):
    """Small, explainable accompaniment features used only by the J-POP reranker."""
    y, sr = librosa.load(
        str(audio_path), sr=LIBROSA_SR, mono=True, offset=float(offset_seconds), duration=DURATION,
    )
    if y.size < sr:
        return {"vocalBandScore": 0.0, "hookScore": 0.0, "brightnessScore": 0.0, "energyScore": 0.0, "tempo": 0.0}
    y = librosa.util.normalize(y)
    hop = 512
    power = np.abs(librosa.stft(y, hop_length=hop)) ** 2
    freqs = librosa.fft_frequencies(sr=sr)
    total = np.maximum(power.sum(axis=0), 1e-12)
    vocal_mask = (freqs >= 300) & (freqs <= 3400)
    vocal_band = np.mean(power[vocal_mask].sum(axis=0) / total)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    chroma = librosa.feature.chroma_stft(S=power, sr=sr)
    # Repeated chroma states plus an above-median refrain lift are a weak,
    # language-independent proxy for hook-oriented pop structure.
    frames = max(1, chroma.shape[1])
    early = chroma[:, : max(1, frames // 3)].mean(axis=1)
    late = chroma[:, max(0, frames - frames // 3):].mean(axis=1)
    repetition = float(np.clip(np.dot(early, late) / max(1e-12, np.linalg.norm(early) * np.linalg.norm(late)), 0, 1))
    lift = float(np.clip((np.percentile(rms, 85) - np.median(rms)) / max(1e-8, np.percentile(rms, 95)), 0, 1))
    centroid = librosa.feature.spectral_centroid(S=np.sqrt(power), sr=sr)[0]
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo = safe_feature(lambda: librosa.feature.tempo(onset_envelope=onset, sr=sr, hop_length=hop), np.asarray([0.0]))
    return {
        "vocalBandScore": round(float(np.clip(vocal_band / 0.52, 0, 1)), 4),
        "hookScore": round(float(np.clip(repetition * 0.62 + lift * 0.38, 0, 1)), 4),
        "brightnessScore": round(float(np.clip((np.mean(centroid) - 700) / 4200, 0, 1)), 4),
        "energyScore": round(float(np.clip(np.mean(rms) / max(1e-8, np.percentile(rms, 95)), 0, 1)), 4),
        "tempo": round(float(np.ravel(tempo)[0]), 2),
    }


def audio_segment_offsets(audio_path, segment_count=SEGMENT_COUNT):
    duration = safe_feature(lambda: float(librosa.get_duration(path=str(audio_path))), 0.0)
    available = max(0.0, duration - DURATION)
    if segment_count <= 1 or available < max(8.0, DURATION * 0.35):
        return [0.0]
    return [round(float(value), 3) for value in np.linspace(0.0, available, segment_count)]


def vectors_from_audio_segments(audio_path, segment_count=SEGMENT_COUNT):
    if not INFER_SOURCES:
        raise ValueError("MMFR_EMBEDDING_INFER_SOURCES did not select a supported source")
    extractors = EssentiaExtractors(INFER_SOURCES)
    segments = []
    for offset_seconds in audio_segment_offsets(audio_path, segment_count):
        vectors = {}
        if "discogs" in INFER_SOURCES:
            vectors["discogs"] = np.asarray(
                extractors.discogs(audio_path, offset_seconds), dtype=np.float32,
            )
        if "mtg" in INFER_SOURCES:
            vectors["mtg"] = np.asarray(
                extractors.mtg(audio_path, offset_seconds), dtype=np.float32,
            )
        if "librosa" in INFER_SOURCES:
            vectors["librosa"] = np.asarray(
                extract_librosa(audio_path, offset_seconds), dtype=np.float32,
            )
        for source, length in SOURCE_VECTOR_LENGTHS.items():
            if source not in vectors:
                vectors[source] = np.zeros(length, dtype=np.float32)
        vectors["effnet_tail"] = vectors["discogs"][DISCOGS_TAG_DIMENSIONS:].copy()
        errors = validate_runtime_vectors(vectors)
        if errors:
            raise ValueError("Runtime feature contract mismatch: " + "; ".join(errors))
        segments.append((offset_seconds, vectors))
    return segments


def vectors_from_audio(audio_path):
    return vectors_from_audio_segments(audio_path, 1)[0][1]


def vectors_from_audio_paths(audio_paths, offsets=None):
    """Extract one model vector per already planned track range."""
    if not INFER_SOURCES:
        raise ValueError("MMFR_EMBEDDING_INFER_SOURCES did not select a supported source")
    extractors = EssentiaExtractors(INFER_SOURCES)
    segments = []
    offsets = list(offsets or [])
    if offsets and len(offsets) != len(audio_paths):
        raise ValueError("segment audio and offset counts differ")
    for index, audio_path in enumerate(audio_paths):
        path = Path(audio_path)
        vectors = {}
        if "discogs" in INFER_SOURCES:
            vectors["discogs"] = np.asarray(
                extractors.discogs(path, 0.0), dtype=np.float32,
            )
        if "mtg" in INFER_SOURCES:
            vectors["mtg"] = np.asarray(
                extractors.mtg(path, 0.0), dtype=np.float32,
            )
        if "librosa" in INFER_SOURCES:
            vectors["librosa"] = np.asarray(
                extract_librosa(path, 0.0), dtype=np.float32,
            )
        for source, length in SOURCE_VECTOR_LENGTHS.items():
            if source not in vectors:
                vectors[source] = np.zeros(length, dtype=np.float32)
        vectors["effnet_tail"] = vectors["discogs"][
            DISCOGS_TAG_DIMENSIONS:
        ].copy()
        errors = validate_runtime_vectors(vectors)
        if errors:
            raise ValueError(
                "Runtime feature contract mismatch: " + "; ".join(errors)
            )
        segments.append((
            float(offsets[index]) if offsets else float(index), vectors
        ))
    return segments


def vectors_from_audio_ranges(audio_path, ranges, extractors=None):
    """Extract exact planned ranges without creating or retaining audio clips."""
    if not INFER_SOURCES:
        raise ValueError("MMFR_EMBEDDING_INFER_SOURCES did not select a supported source")
    extractors = extractors or EssentiaExtractors(INFER_SOURCES)
    segments = []
    for item in ranges:
        offset = max(0.0, float(item.get("startSeconds", 0.0)))
        duration = max(1.0, float(item.get("durationSeconds", DURATION)))
        vectors = {}
        if "discogs" in INFER_SOURCES:
            vectors["discogs"] = np.asarray(
                extractors.discogs(audio_path, offset, duration), dtype=np.float32,
            )
        if "mtg" in INFER_SOURCES:
            vectors["mtg"] = np.asarray(
                extractors.mtg(audio_path, offset, duration), dtype=np.float32,
            )
        if "librosa" in INFER_SOURCES:
            vectors["librosa"] = np.asarray(
                extract_librosa(audio_path, offset, duration), dtype=np.float32,
            )
        for source, length in SOURCE_VECTOR_LENGTHS.items():
            if source not in vectors:
                vectors[source] = np.zeros(length, dtype=np.float32)
        vectors["effnet_tail"] = vectors["discogs"][DISCOGS_TAG_DIMENSIONS:].copy()
        errors = validate_runtime_vectors(vectors)
        if errors:
            raise ValueError("Runtime feature contract mismatch: " + "; ".join(errors))
        segments.append((offset, duration, vectors))
    return segments


def vectors_from_cache_key(cache_key):
    caches = {
        "discogs": load_json(DISCOGS_CACHE),
        "mtg": load_json(MTG_CACHE),
        "librosa": load_json(LIBROSA_CACHE),
    }
    vectors = {}
    for name, cache in caches.items():
        value = cache.get(cache_key)
        if isinstance(value, list):
            vectors[name] = np.asarray(value, dtype=np.float32)
    if "discogs" not in vectors:
        raise ValueError(f"cache key not found in discogs cache: {cache_key}")
    vectors["effnet_tail"] = vectors["discogs"][DISCOGS_TAG_DIMENSIONS:].copy()
    return vectors


def matrix_for(vectors, feature_set):
    return np.asarray([np.concatenate([vectors[name] for name in feature_set])], dtype=np.float32)


def score_target_raw(target_bundle, vectors, apply_tag_ensemble=True):
    labels = target_bundle["labels"]
    total = np.zeros((1, len(labels)), dtype=np.float64)
    weight_total = 0.0
    for member in target_bundle["members"]:
        if any(name not in vectors for name in member["featureSet"]):
            continue
        if member.get("constantLabel"):
            scores = np.ones((1, 1), dtype=np.float64)
            member_labels = [member["constantLabel"]]
        else:
            values = matrix_for(vectors, member["featureSet"])
            indexes = member.get("featureIndexes")
            if indexes is not None:
                values = values[:, np.asarray(indexes, dtype=np.int64)]
            scores = member["pipeline"].predict_proba(values)
            pipeline = member["pipeline"]
            member_labels = list(
                pipeline.classes_ if hasattr(pipeline, "classes_") else pipeline[-1].classes_
            )
        label_index = {label: index for index, label in enumerate(labels)}
        aligned = np.zeros((1, len(labels)), dtype=np.float64)
        for source_index, label in enumerate(member_labels):
            target_index = label_index.get(label)
            if target_index is not None:
                aligned[:, target_index] = scores[:, source_index]
        weight = float(member["weight"])
        total += aligned * weight
        weight_total += weight
    if weight_total <= 0:
        available = ",".join(sorted(vectors)) or "none"
        required = sorted({name for member in target_bundle["members"] for name in member["featureSet"]})
        raise ValueError(f"No compatible model member for vectors={available}; model requires={','.join(required)}")
    total /= weight_total
    if apply_tag_ensemble:
        total = apply_tag_ensemble_if_available(
            target_bundle, vectors, labels, total[0],
        ).reshape(1, -1)
    temperature = max(1.0, float((target_bundle.get("calibration") or {}).get("temperature", 1.0)))
    if temperature > 1.0:
        total = np.power(np.maximum(total, 1e-12), 1.0 / temperature)
        total /= np.maximum(total.sum(axis=1, keepdims=True), 1e-12)
    return labels, total[0]


def tag_score_vector(vector, labels, tag_ensemble):
    source = tag_ensemble.get("source") or "mtg"
    classes = (
        tag_ensemble.get("discogsClasses")
        if source == "discogs" else tag_ensemble.get("mtgClasses")
    ) or []
    tag_map = tag_ensemble.get("tagMap") or {}
    if source not in vector or not classes or not tag_map:
        return None
    # Cached training vectors and live Essentia vectors are float32. Keeping
    # that dtype avoids a measurable train/serve normalization drift.
    source_vector = np.asarray(vector[source], dtype=np.float32)
    section = len(classes)
    tag_scores = {}
    for index, tag in enumerate(classes):
        mean = float(source_vector[index]) if index < source_vector.size else 0.0
        std = float(source_vector[index + section]) if index + section < source_vector.size else 0.0
        peak = float(source_vector[index + section * 2]) if index + section * 2 < source_vector.size else 0.0
        tag_scores[tag] = mean * 0.4 + std * 0.05 + peak * 0.55
    out = np.zeros(len(labels), dtype=np.float64)
    for index, label in enumerate(labels):
        tags = tag_map.get(label) or []
        values = [tag_scores.get(tag, 0.0) for tag in tags]
        out[index] = max(values) + np.mean(values) * 0.15 if values else 0.0
    # Match the training-side pretrained_tag_scores contract exactly. The
    # epsilon also keeps never-observed labels finite before pair-model scaling.
    out += 1e-9
    total = out.sum()
    return out / max(1e-12, total)


def apply_tag_ensemble_if_available(target_bundle, vectors, labels, base_scores):
    tag_ensemble = target_bundle.get("tagEnsemble") or {}
    if not tag_ensemble.get("enabled"):
        return np.asarray(base_scores, dtype=np.float64)
    tag_scores = tag_score_vector(vectors, labels, tag_ensemble)
    if tag_scores is None:
        return np.asarray(base_scores, dtype=np.float64)
    calibrator = tag_ensemble.get("calibratorPipeline")
    if calibrator is not None:
        calibrated = calibrator.predict_proba(np.asarray(tag_scores).reshape(1, -1))[0]
        tag_scores = normalize_scores(align_scores(
            list(tag_ensemble.get("calibratorLabels") or calibrator.classes_),
            calibrated,
            labels,
        ))
        if tag_ensemble.get("calibratorRequireFamilyAgreement"):
            base_label = labels[int(np.argmax(base_scores))]
            tag_label = labels[int(np.argmax(tag_scores))]
            family = lambda label: next((
                name for name, family_labels in SPECIALIST_FAMILIES.items()
                if label in family_labels
            ), "")
            if not family(tag_label) or family(tag_label) != family(base_label):
                return np.asarray(base_scores, dtype=np.float64)
        base_top_maximum = float(tag_ensemble.get("calibratorBaseTopMaximum", 0.0))
        if base_top_maximum and float(np.max(base_scores)) > base_top_maximum:
            return np.asarray(base_scores, dtype=np.float64)
    base_weight = float(tag_ensemble.get("baseWeight", 1.0))
    tag_weight = float(tag_ensemble.get("tagWeight", max(0.0, 1.0 - base_weight)))
    reliability_threshold = float(tag_ensemble.get("reliabilityThreshold", 0.0))
    if reliability_threshold:
        predicted = labels[int(np.argmax(tag_scores))]
        reliability = float((tag_ensemble.get("labelReliability") or {}).get(predicted, 0.0))
        if reliability < reliability_threshold:
            tag_weight = float(tag_ensemble.get("fallbackWeight", 0.0))
            if tag_ensemble.get("fallbackRequireFamilyAgreement"):
                base_label = labels[int(np.argmax(base_scores))]
                family = lambda label: next((
                    name for name, family_labels in SPECIALIST_FAMILIES.items()
                    if label in family_labels
                ), "")
                if not family(predicted) or family(predicted) != family(base_label):
                    tag_weight = 0.0
            if tag_weight <= 0.0:
                return np.asarray(base_scores, dtype=np.float64)
            base_weight = 1.0 - tag_weight
    mixed = np.asarray(base_scores, dtype=np.float64) * base_weight + tag_scores * tag_weight
    return mixed / max(1e-12, mixed.sum())


def apply_pair_rerankers(bundle, vectors, labels, base_scores):
    rerankers = bundle.get("pairRerankers") or []
    if not rerankers:
        return np.asarray(base_scores, dtype=np.float64)
    tag_ensemble = (bundle.get("fine") or {}).get("tagEnsemble") or {}
    destination = {label: index for index, label in enumerate(labels)}
    output = np.asarray(base_scores, dtype=np.float64).copy()
    cached_inputs = {}
    for reranker in rerankers:
        pair = list(reranker.get("labels") or [])
        weight = float(reranker.get("weight", 0.0))
        if len(pair) != 2 or weight <= 0.0 or any(label not in destination for label in pair):
            continue
        input_labels = list(reranker.get("inputLabels") or labels)
        cache_key = tuple(input_labels)
        if cache_key not in cached_inputs:
            cached_inputs[cache_key] = tag_score_vector(
                vectors, input_labels, tag_ensemble,
            )
        tag_scores = cached_inputs[cache_key]
        if tag_scores is None:
            continue
        model = reranker.get("model")
        if model is None:
            continue
        source = model.predict_proba(np.asarray(tag_scores).reshape(1, -1))[0]
        model_labels = list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)
        replacement = normalize_scores(align_scores(model_labels, source, pair))
        target = reranker.get("targetLabel")
        threshold = float(reranker.get("targetThreshold", 0.0))
        if target in pair and threshold > 0.0 and replacement[pair.index(target)] < threshold:
            continue
        allowed = set(reranker.get("allowedBaseLabels") or [])
        if allowed and labels[int(np.argmax(output))] not in allowed:
            continue
        indexes = np.asarray([destination[label] for label in pair], dtype=np.int64)
        pair_mass = float(np.sum(output[indexes]))
        current = normalize_scores(output[indexes])
        mixed = normalize_scores(current * (1.0 - weight) + replacement * weight)
        output[indexes] = mixed * pair_mass
    return normalize_scores(output)


def top3_stack_features(scores, evidence=None, evidence_keys=None):
    evidence = evidence or {}
    blocks = []
    for key in evidence_keys or ("scores",):
        values = scores if key == "scores" else evidence.get(key)
        if values is None:
            values = np.zeros_like(scores, dtype=np.float64)
        values = normalize_scores(np.asarray(values, dtype=np.float64).reshape(-1))
        blocks.extend((values, np.log(np.maximum(values, 1e-8))))
    return np.concatenate(blocks).reshape(1, -1)


def apply_top3_stacker(bundle, labels, base_scores, evidence=None):
    stacker = bundle.get("top3Stacker") or {}
    members = stacker.get("members") or []
    weight = float(stacker.get("weight", 0.0))
    top_k = int(stacker.get("topK", 3))
    if not members or weight <= 0.0 or top_k <= 0:
        return np.asarray(base_scores, dtype=np.float64)
    stack_labels = list(stacker.get("labels") or labels)
    stack_input = align_scores(labels, base_scores, stack_labels)
    evidence_keys = list(stacker.get("evidenceKeys") or ["scores"])
    aligned_evidence = {}
    for key in evidence_keys:
        if key == "scores":
            continue
        values = (evidence or {}).get(key)
        if values is not None:
            aligned_evidence[key] = align_scores(labels, values, stack_labels)
    features = top3_stack_features(stack_input, aligned_evidence, evidence_keys)
    calibrated = []
    for model in members:
        model_labels = list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)
        calibrated.append(align_scores(
            model_labels, model.predict_proba(features)[0], stack_labels,
        ))
    replacement = align_scores(
        stack_labels, normalize_scores(np.mean(calibrated, axis=0)), labels,
    )
    output = np.asarray(base_scores, dtype=np.float64).copy()
    indexes = np.argsort(output)[-min(top_k, len(output)):]
    mass = float(np.sum(output[indexes]))
    current = normalize_scores(output[indexes])
    local_replacement = normalize_scores(replacement[indexes])
    output[indexes] = normalize_scores(
        current * (1.0 - weight) + local_replacement * weight
    ) * mass
    output = normalize_scores(output)
    allowed_rows = stacker.get("allowedTransitions")
    if allowed_rows is not None:
        allowed = {
            (item.get("from"), item.get("to")) for item in allowed_rows
            if item.get("from") in labels and item.get("to") in labels
        }
        before = labels[int(np.argmax(base_scores))]
        after = labels[int(np.argmax(output))]
        if before != after and (before, after) not in allowed:
            return np.asarray(base_scores, dtype=np.float64)
    return output


def format_scores(labels, scores, limit=8):
    ranked = sorted(zip(labels, scores), key=lambda item: item[1], reverse=True)
    return [
        {"label": label, "score": round(float(score) * 100, 1)}
        for label, score in ranked[:limit]
    ]


def load_jpop_calibrator():
    return load_json(JPOP_CALIBRATOR_PATH) if JPOP_CALIBRATOR_PATH.exists() else {}


def normalized_calibrator_features(base_jpop, pop_macro, vocal_evidence, pop_audio):
    return {
        "baseJpopScore": float(base_jpop),
        "popMacroScore": float(pop_macro),
        "japaneseVocalLikelihood": float(vocal_evidence.get("japaneseVocalLikelihood", 0.0)),
        "vocalPresence": float(vocal_evidence.get("vocalPresence", 0.0)),
        "vocalBandScore": float(pop_audio.get("vocalBandScore", 0.0)),
        "hookScore": float(pop_audio.get("hookScore", 0.0)),
    }


def apply_jpop_evidence(fine_labels, fine_scores, macro_labels, macro_scores, vocal_evidence, pop_audio):
    """Apply a conservative local calibration to the J-POP probability only.

    The language signal is multiplicative with detected singing.  Japanese
    spoken audio, instrumental tracks, and unavailable models therefore do not
    gain a J-POP advantage.
    """
    details = {
        "available": bool(vocal_evidence.get("available")),
        "vocalPresence": round(float(vocal_evidence.get("vocalPresence", 0.0)), 4),
        "japaneseVocalLikelihood": round(float(vocal_evidence.get("japaneseVocalLikelihood", 0.0)), 4),
        "detectedLanguage": vocal_evidence.get("detectedLanguage", ""),
        "reason": vocal_evidence.get("reason", ""),
        "popAudio": pop_audio,
        "applied": False,
    }
    if "J-POP" not in fine_labels or not details["available"]:
        return fine_scores, details
    jpop_index = fine_labels.index("J-POP")
    macro_index = {label: index for index, label in enumerate(macro_labels)}
    features = normalized_calibrator_features(
        fine_scores[jpop_index],
        macro_scores[macro_index["pop"]] if "pop" in macro_index else 0.0,
        vocal_evidence,
        pop_audio,
    )
    # Do not infer regional-pop identity from accompaniment alone.
    if features["vocalPresence"] < 0.18 or features["japaneseVocalLikelihood"] < 0.18:
        details["features"] = {key: round(value, 4) for key, value in features.items()}
        return fine_scores, details
    calibrator = load_jpop_calibrator()
    keys = calibrator.get("featureKeys") or []
    weights = calibrator.get("weights") or []
    if keys != list(features) or len(weights) != len(keys):
        details["reason"] = "invalid-calibrator"
        return fine_scores, details
    mean = np.asarray(calibrator.get("mean") or [], dtype=np.float64)
    std = np.asarray(calibrator.get("std") or [], dtype=np.float64)
    if mean.size != len(keys) or std.size != len(keys):
        details["reason"] = "invalid-calibrator"
        return fine_scores, details
    values = np.asarray([features[key] for key in keys], dtype=np.float64)
    logits = float(calibrator.get("intercept", 0.0)) + float(np.dot((values - mean) / np.maximum(std, 1e-5), np.asarray(weights, dtype=np.float64)))
    calibrated = 1.0 / (1.0 + np.exp(-np.clip(logits, -12, 12)))
    # Keep the local evidence a reranker rather than a replacement classifier.
    adjusted = np.asarray(fine_scores, dtype=np.float64).copy()
    adjusted[jpop_index] = float(fine_scores[jpop_index]) * 0.42 + calibrated * 0.58
    adjusted /= max(1e-12, adjusted.sum())
    details.update({
        "applied": True,
        "features": {key: round(value, 4) for key, value in features.items()},
        "baseJpopScore": round(float(fine_scores[jpop_index]) * 100, 2),
        "calibratedJpopScore": round(float(adjusted[jpop_index]) * 100, 2),
        "calibrator": calibrator.get("method", ""),
    })
    return adjusted, details


def pop_style_from_evidence(jpop_details):
    if not jpop_details.get("applied"):
        return []
    features = jpop_details.get("features") or {}
    pop_audio = jpop_details.get("popAudio") or {}
    japanese = float(features.get("japaneseVocalLikelihood", 0.0))
    tempo = float(pop_audio.get("tempo", 0.0))
    city = japanese * (0.5 * float(features.get("hookScore", 0.0)) + 0.3 * float(features.get("vocalBandScore", 0.0)) + 0.2 * (1 - min(1.0, abs(tempo - 104) / 35)))
    anime = japanese * (0.48 * float(features.get("hookScore", 0.0)) + 0.28 * float(pop_audio.get("brightnessScore", 0.0)) + 0.24 * min(1.0, max(0.0, (tempo - 118) / 38)))
    candidates = [("city_pop", "シティ・ポップ", city), ("anime_song", "アニメソング", anime)]
    return [
        {"style": key, "label": label, "score": round(score * 100, 1)}
        for key, label, score in sorted(candidates, key=lambda row: row[2], reverse=True)
        if score >= 0.48
    ]


def model_fine_coverage(bundle):
    """Return only labels that have a fitted global or macro specialist head."""
    if bundle.get("version") == "embedding-genre-blend-v1":
        return model_fine_coverage(bundle.get("base") or {})
    if bundle.get("version") in {"embedding-genre-model-v1", "embedding-genre-model-v2"}:
        labels = list(bundle.get("fine", {}).get("labels") or [])
        return labels, []
    declared = list(bundle.get("fineLabels") or [])
    supported = set(bundle.get("globalFine", {}).get("labels") or [])
    for specialist in (bundle.get("specialists") or {}).values():
        supported.update(specialist.get("labels") or [])
    ordered_supported = [label for label in declared if label in supported]
    return ordered_supported, [label for label in declared if label not in supported]


def calibrated_confidence(top, runner_up, label_count):
    """Calibrate confidence against the uniform prior of a multi-class model.

    Raw probability falls as the number of genre labels grows.  Comparing the
    leading score with a uniform distribution and its runner-up keeps the
    review gate comparable between the legacy 15-class and 32-class models.
    """
    top = max(0.0, float(top))
    runner_up = max(0.0, float(runner_up))
    label_count = max(2, int(label_count or 2))
    uniform = 100.0 / label_count
    relative_evidence = np.log(max(1.0, top / uniform)) / np.log(label_count)
    separation = max(0.0, min(1.0, (top - runner_up) / max(top, uniform)))
    return round(float(np.clip(relative_evidence * 82.0 + separation * 18.0, 0.0, 100.0)), 1)


def selective_certainty(scores):
    """Match the certainty definition used by source-heldout risk selection."""
    ordered = np.sort(np.asarray(scores, dtype=np.float64))
    if ordered.size < 2:
        return float(ordered[-1]) if ordered.size else 0.0
    top = float(ordered[-1])
    runner_up = float(ordered[-2])
    return top * 0.72 + (top - runner_up) * 0.28


def score_target(target_bundle, vectors):
    labels, scores = score_target_raw(target_bundle, vectors)
    return format_scores(labels, scores)


def apply_macro_prior_to_fine(fine_labels, fine_scores, macro_labels, macro_scores, alpha):
    if alpha <= 0:
        return fine_scores
    macro_index = {label: index for index, label in enumerate(macro_labels)}
    adjusted = np.asarray(fine_scores, dtype=np.float64).copy()
    for index, label in enumerate(fine_labels):
        macro = FINE_LABEL_MACRO_MAP.get(label)
        if not macro or macro not in macro_index:
            continue
        prior = max(FINE_MACRO_PRIOR_FLOOR, float(macro_scores[macro_index[macro]]))
        adjusted[index] *= prior ** alpha
    total = adjusted.sum()
    return adjusted / max(1e-12, total)


def load_model(path):
    with Path(path).open("rb") as handle:
        bundle = pickle.load(handle)
    if bundle.get("version") == "embedding-genre-model-v2":
        errors = validate_bundle_contract(bundle)
        if DURATION != SEGMENT_DURATION_SECONDS:
            errors.append(f"segment duration override {DURATION} differs from contract {SEGMENT_DURATION_SECONDS}")
        if SEGMENT_COUNT != CONTRACT_SEGMENT_COUNT:
            errors.append(f"segment count override {SEGMENT_COUNT} differs from contract {CONTRACT_SEGMENT_COUNT}")
        if errors:
            raise ValueError("; ".join(errors))
    arbitrator = bundle.get("segmentArbitrator") or {}
    if arbitrator:
        if arbitrator.get("schemaVersion") != SEGMENT_ARBITRATOR_SCHEMA_VERSION:
            raise ValueError("segment arbitrator schema differs from live inference")
        if arbitrator.get("runtimeFeatureContractSha256") != feature_contract_digest():
            raise ValueError("segment arbitrator feature contract differs from live inference")
        if not arbitrator.get("labels") or arbitrator.get("pipeline") is None:
            raise ValueError("segment arbitrator is incomplete")
    return bundle


def maybe_apply_unknown80_rhythm(labels, scores, vector_segments):
    global UNKNOWN80_RHYTHM_BUNDLE, UNKNOWN80_FUNK_ROCK_BUNDLE
    global UNKNOWN80_INDEPENDENT_PAIR_BUNDLE
    output = np.asarray(scores, dtype=np.float64)
    has_librosa = bool(
        vector_segments and "librosa" in vector_segments[0][1]
    )
    if ENABLE_UNKNOWN80_RHYTHM_RERANKER and has_librosa \
            and UNKNOWN80_RHYTHM_MODEL_PATH.is_file():
        if UNKNOWN80_RHYTHM_BUNDLE is None:
            UNKNOWN80_RHYTHM_BUNDLE = load_unknown80_rhythm_bundle(
                UNKNOWN80_RHYTHM_MODEL_PATH,
            )
        output, details = apply_unknown80_rhythm_reranker(
            UNKNOWN80_RHYTHM_BUNDLE, labels, output,
            vector_segments[0][1]["librosa"],
        )
        if UNKNOWN80_FUNK_ROCK_MODEL_PATH.is_file():
            if UNKNOWN80_FUNK_ROCK_BUNDLE is None:
                UNKNOWN80_FUNK_ROCK_BUNDLE = load_unknown80_rhythm_bundle(
                    UNKNOWN80_FUNK_ROCK_MODEL_PATH,
                )
            output, extension_details = apply_unknown80_rhythm_reranker(
                UNKNOWN80_FUNK_ROCK_BUNDLE, labels, output,
                vector_segments[0][1]["librosa"],
            )
            extension_details.update({"enabled": True, "reason": "evaluated"})
        else:
            extension_details = {
                "enabled": True, "applied": False, "reason": "model-missing",
            }
        details["funkRockExtension"] = extension_details
        details.update({"enabled": True, "reason": "evaluated"})
    else:
        reason = (
            "disabled" if not ENABLE_UNKNOWN80_RHYTHM_RERANKER
            else "librosa-missing" if not has_librosa else "model-missing"
        )
        details = {"enabled": False, "applied": False, "reason": reason}

    if ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER and has_librosa \
            and UNKNOWN80_INDEPENDENT_PAIR_MODEL_PATH.is_file():
        if UNKNOWN80_INDEPENDENT_PAIR_BUNDLE is None:
            UNKNOWN80_INDEPENDENT_PAIR_BUNDLE = load_unknown80_rhythm_bundle(
                UNKNOWN80_INDEPENDENT_PAIR_MODEL_PATH,
            )
        output, independent_details = apply_unknown80_rhythm_reranker(
            UNKNOWN80_INDEPENDENT_PAIR_BUNDLE, labels, output,
            vector_segments[0][1]["librosa"],
        )
        independent_details.update({"enabled": True, "reason": "evaluated"})
    else:
        independent_reason = (
            "disabled" if not ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER
            else "librosa-missing" if not has_librosa else "model-missing"
        )
        independent_details = {
            "enabled": False, "applied": False,
            "reason": independent_reason,
        }
    details["independentPairExtension"] = independent_details
    details["enabled"] = bool(
        details.get("enabled") or independent_details.get("enabled")
    )
    return output, details


def maybe_apply_unknown80_track_pairs(labels, scores, vector_segments):
    global UNKNOWN80_TRACK_PAIR_BUNDLE
    if not ENABLE_UNKNOWN80_TRACK_PAIR_RERANKER:
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False, "reason": "disabled",
        }
    promotion = track_pair_promotion_status()
    if not promotion["promoted"]:
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False,
            "reason": promotion["reason"],
        }
    if not UNKNOWN80_TRACK_PAIR_MODEL_PATH.is_file():
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False, "reason": "model-missing",
        }
    if UNKNOWN80_TRACK_PAIR_BUNDLE is None:
        UNKNOWN80_TRACK_PAIR_BUNDLE = load_unknown80_track_pair_bundle(
            UNKNOWN80_TRACK_PAIR_MODEL_PATH,
        )
    return apply_unknown80_track_pair_reranker(
        UNKNOWN80_TRACK_PAIR_BUNDLE, labels, scores,
        [vectors for _offset, vectors in vector_segments],
    )


def track_pair_promotion_status():
    if not UNKNOWN80_TRACK_PAIR_MANIFEST_PATH.is_file():
        return {"promoted": False, "reason": "promotion-manifest-missing"}
    try:
        manifest = json.loads(UNKNOWN80_TRACK_PAIR_MANIFEST_PATH.read_text())
    except (OSError, ValueError):
        return {"promoted": False, "reason": "promotion-manifest-invalid"}
    if manifest.get("promotionState") != "promoted":
        return {"promoted": False, "reason": "model-not-promoted"}
    expected = str(manifest.get("modelSha256") or "")
    if not expected or not UNKNOWN80_TRACK_PAIR_MODEL_PATH.is_file():
        return {"promoted": False, "reason": "promoted-model-missing"}
    digest = hashlib.sha256(UNKNOWN80_TRACK_PAIR_MODEL_PATH.read_bytes()).hexdigest()
    if digest != expected:
        return {"promoted": False, "reason": "promoted-model-sha256-mismatch"}
    return {"promoted": True, "reason": "promoted", "modelSha256": digest}


def musicfm_promotion_status():
    if not UNKNOWN80_MUSICFM_MANIFEST_PATH.is_file():
        return {"promoted": False, "reason": "promotion-manifest-missing"}
    try:
        manifest = json.loads(UNKNOWN80_MUSICFM_MANIFEST_PATH.read_text())
    except (OSError, ValueError):
        return {"promoted": False, "reason": "promotion-manifest-invalid"}
    if manifest.get("promotionState") != "promoted":
        return {"promoted": False, "reason": "model-not-promoted"}
    expected = str(manifest.get("modelSha256") or "")
    if not expected or not UNKNOWN80_MUSICFM_MODEL_PATH.is_file():
        return {"promoted": False, "reason": "promoted-model-missing"}
    digest = hashlib.sha256(UNKNOWN80_MUSICFM_MODEL_PATH.read_bytes()).hexdigest()
    if digest != expected:
        return {"promoted": False, "reason": "promoted-model-sha256-mismatch"}
    return {"promoted": True, "reason": "promoted", "modelSha256": digest}


def extract_musicfm_record(audio_path):
    environment = os.environ.copy()
    environment.update({
        "PYTHONPATH": MUSICFM_PYTHONPATH,
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
    completed = subprocess.run(
        [MUSICFM_PYTHON, str(MUSICFM_EXTRACTOR_PATH), "--audio", str(audio_path)],
        check=True, capture_output=True, text=True, timeout=120,
        env=environment,
    )
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("MusicFM extractor returned no output")
    payload = json.loads(lines[-1])
    if not payload.get("ok") or not isinstance(payload.get("record"), dict):
        raise RuntimeError("MusicFM extractor returned an invalid payload")
    return payload


def maybe_apply_unknown80_musicfm(labels, scores, audio_path):
    global UNKNOWN80_MUSICFM_BUNDLE
    if not ENABLE_UNKNOWN80_MUSICFM_RERANKER:
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False, "reason": "disabled",
        }, None
    promotion = musicfm_promotion_status()
    if not promotion["promoted"]:
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False, "reason": promotion["reason"],
        }, None
    if audio_path is None or not Path(audio_path).is_file():
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False, "reason": "audio-missing",
        }, None
    try:
        if UNKNOWN80_MUSICFM_BUNDLE is None:
            UNKNOWN80_MUSICFM_BUNDLE = load_musicfm_bundle(
                UNKNOWN80_MUSICFM_MODEL_PATH,
            )
        extracted = extract_musicfm_record(audio_path)
        output, details = apply_musicfm_reranker(
            UNKNOWN80_MUSICFM_BUNDLE, labels, scores, extracted["record"],
        )
        details["runtimeFeatureContractSha256"] = extracted.get(
            "runtimeFeatureContractSha256", "",
        )
        return output, details, extracted["record"]
    except Exception as error:
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False,
            "reason": f"runtime-failed:{str(error)[-300:]}",
        }, None


def unknown65_promotion_status():
    if not UNKNOWN65_MANIFEST_PATH.is_file():
        return {"promoted": False, "reason": "promotion-manifest-missing"}
    try:
        manifest = json.loads(UNKNOWN65_MANIFEST_PATH.read_text())
    except (OSError, ValueError):
        return {"promoted": False, "reason": "promotion-manifest-invalid"}
    if manifest.get("promotionState") != "promoted":
        return {"promoted": False, "reason": "model-not-promoted"}
    expected = str(manifest.get("modelSha256") or "")
    if not expected or not UNKNOWN65_MODEL_PATH.is_file():
        return {"promoted": False, "reason": "promoted-model-missing"}
    digest = hashlib.sha256(UNKNOWN65_MODEL_PATH.read_bytes()).hexdigest()
    if digest != expected:
        return {"promoted": False, "reason": "promoted-model-sha256-mismatch"}
    return {"promoted": True, "reason": "promoted", "modelSha256": digest}


def extract_unknown65_records(audio_path):
    environment = os.environ.copy()
    environment.update({
        "PYTHONPATH": UNKNOWN65_PYTHONPATH,
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
    completed = subprocess.run(
        [UNKNOWN65_PYTHON, str(UNKNOWN65_EXTRACTOR_PATH), "--audio", str(audio_path)],
        check=True, capture_output=True, text=True, timeout=180,
        env=environment,
    )
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("unknown65 extractor returned no output")
    payload = json.loads(lines[-1])
    if not payload.get("ok") or not isinstance(payload.get("records"), dict):
        raise RuntimeError("unknown65 extractor returned an invalid payload")
    return payload


def maybe_apply_unknown65(labels, scores, audio_path, shared_records=None):
    global UNKNOWN65_BUNDLE
    if not ENABLE_UNKNOWN65_RERANKER:
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False, "reason": "disabled",
        }
    promotion = unknown65_promotion_status()
    if not promotion["promoted"]:
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False, "reason": promotion["reason"],
        }
    if audio_path is None or not Path(audio_path).is_file():
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False, "reason": "audio-missing",
        }
    try:
        if UNKNOWN65_BUNDLE is None:
            UNKNOWN65_BUNDLE = load_unknown65_bundle(UNKNOWN65_MODEL_PATH)
        extracted = extract_unknown65_records(audio_path)
        records = merge_unknown65_records(extracted["records"], shared_records)
        output, stages = apply_unknown65_reranker(
            UNKNOWN65_BUNDLE, labels, scores, records,
        )
        return output, {
            "enabled": True,
            "applied": any(stage.get("applied") for stage in stages),
            "reason": "evaluated", "stages": stages,
            "timings": extracted.get("timings") or {},
            "modelVersion": (
                UNKNOWN65_BUNDLE.get("modelVersion")
                or UNKNOWN65_BUNDLE.get("version", "")
            ),
            "runtimeFeatureContractSha256": extracted.get(
                "runtimeFeatureContractSha256", "",
            ),
        }
    except Exception as error:
        return np.asarray(scores, dtype=np.float64), {
            "enabled": False, "applied": False,
            "reason": f"runtime-failed:{str(error)[-300:]}",
        }


def model_validation_payload(bundle):
    contract = bundle.get("runtimeFeatureContract") or {}
    expected_digest = feature_contract_digest(feature_contract(
        bool(contract.get("discogsTagHeadRequired"))
    ))
    independent_reranker = {
        "enabled": ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER,
        "path": str(UNKNOWN80_INDEPENDENT_PAIR_MODEL_PATH),
        "available": UNKNOWN80_INDEPENDENT_PAIR_MODEL_PATH.is_file(),
        "modelVersion": "",
    }
    if independent_reranker["enabled"] and independent_reranker["available"]:
        reranker_bundle = load_unknown80_rhythm_bundle(
            UNKNOWN80_INDEPENDENT_PAIR_MODEL_PATH,
        )
        independent_reranker["modelVersion"] = (
            reranker_bundle.get("modelVersion")
            or reranker_bundle.get("version", "")
        )
    track_pair_reranker = {
        "enabled": ENABLE_UNKNOWN80_TRACK_PAIR_RERANKER,
        "path": str(UNKNOWN80_TRACK_PAIR_MODEL_PATH),
        "available": UNKNOWN80_TRACK_PAIR_MODEL_PATH.is_file(),
        "modelVersion": "",
        "runtimeFeatureContractSha256": "",
        "promotion": track_pair_promotion_status(),
    }
    if (
        track_pair_reranker["enabled"]
        and track_pair_reranker["available"]
        and track_pair_reranker["promotion"]["promoted"]
    ):
        track_bundle = load_unknown80_track_pair_bundle(
            UNKNOWN80_TRACK_PAIR_MODEL_PATH,
        )
        track_pair_reranker["modelVersion"] = track_bundle.get("version", "")
        track_pair_reranker["runtimeFeatureContractSha256"] = track_bundle.get(
            "runtimeFeatureContractSha256", "",
        )
    musicfm_reranker = {
        "enabled": ENABLE_UNKNOWN80_MUSICFM_RERANKER,
        "path": str(UNKNOWN80_MUSICFM_MODEL_PATH),
        "available": UNKNOWN80_MUSICFM_MODEL_PATH.is_file(),
        "modelVersion": "",
        "runtimeFeatureContractSha256": "",
        "promotion": musicfm_promotion_status(),
    }
    if (
        musicfm_reranker["enabled"]
        and musicfm_reranker["available"]
        and musicfm_reranker["promotion"]["promoted"]
    ):
        musicfm_bundle = load_musicfm_bundle(UNKNOWN80_MUSICFM_MODEL_PATH)
        musicfm_reranker["modelVersion"] = musicfm_bundle.get("version", "")
        musicfm_reranker["runtimeFeatureContractSha256"] = musicfm_bundle.get(
            "runtimeFeatureContractSha256", "",
        )
    unknown65_reranker = {
        "enabled": ENABLE_UNKNOWN65_RERANKER,
        "path": str(UNKNOWN65_MODEL_PATH),
        "available": UNKNOWN65_MODEL_PATH.is_file(),
        "pythonAvailable": Path(UNKNOWN65_PYTHON).is_file(),
        "modelVersion": "", "runtimeFeatureContractSha256": "",
        "promotion": unknown65_promotion_status(),
    }
    if (
        unknown65_reranker["enabled"] and unknown65_reranker["available"]
        and unknown65_reranker["promotion"]["promoted"]
    ):
        unknown65_bundle = load_unknown65_bundle(UNKNOWN65_MODEL_PATH)
        unknown65_reranker["modelVersion"] = (
            unknown65_bundle.get("modelVersion")
            or unknown65_bundle.get("version", "")
        )
        unknown65_reranker["runtimeFeatureContractSha256"] = unknown65_bundle.get(
            "runtimeFeatureContractSha256", "",
        )
    return {
        "ok": True,
        "modelVersion": bundle.get("modelVersion") or bundle.get("version", ""),
        "runtimeFeatureContractSha256": bundle.get("runtimeFeatureContractSha256"),
        "expectedRuntimeFeatureContractSha256": expected_digest,
        "discogsTagHeadRequired": bool(contract.get("discogsTagHeadRequired")),
        "independentReranker": independent_reranker,
        "trackPairReranker": track_pair_reranker,
        "musicFmReranker": musicfm_reranker,
        "unknown65Reranker": unknown65_reranker,
    }


def load_macro_specialist_runtime():
    global MACRO_SPECIALIST_RUNTIME
    if MACRO_SPECIALIST_RUNTIME is not None:
        return MACRO_SPECIALIST_RUNTIME
    spec = importlib.util.spec_from_file_location("genre_macro_specialists_for_inference", MACRO_SPECIALIST_ENGINE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    MACRO_SPECIALIST_RUNTIME = (module, module.load_benchmark_module())
    return MACRO_SPECIALIST_RUNTIME


def score_macro_specialist_bundle(bundle, vectors):
    engine, benchmark = load_macro_specialist_runtime()
    rows = [{"vectors": vectors}]
    macro_bundle = bundle["macro"]
    macro_labels = macro_bundle["labels"]
    macro_scores = engine.selected_model_scores(
        macro_bundle["config"],
        macro_bundle["model"],
        rows,
        macro_labels,
        "macroGenre",
        benchmark,
    )

    global_bundle = bundle["globalFine"]
    fine_labels = bundle["fineLabels"]
    global_scores = engine.expand_scores(
        engine.selected_model_scores(
            global_bundle["config"],
            global_bundle["model"],
            rows,
            global_bundle["labels"],
            "genre",
            benchmark,
        ),
        global_bundle["labels"],
        fine_labels,
    )
    gate = bundle["gate"]
    specialist_scores = engine.specialist_scores(
        rows,
        macro_labels,
        macro_scores,
        bundle["specialists"],
        gate["alpha"],
        gate["floor"],
    )
    fine_tags = engine.pretrained_tag_sources(benchmark, rows, fine_labels, "genre")
    macro_specialist_weights = gate.get("macroSpecialistWeights") or {}
    if macro_specialist_weights:
        fine_scores = engine.blended_fine_scores_with_macro_weights(
            global_scores,
            specialist_scores,
            fine_tags[gate["tagSource"]],
            macro_scores,
            macro_labels,
            gate["specialistWeight"],
            macro_specialist_weights,
            gate["tagWeight"],
        )
    else:
        fine_scores = engine.blended_fine_scores(
            global_scores,
            specialist_scores,
            fine_tags[gate["tagSource"]],
            gate["specialistWeight"],
            gate["tagWeight"],
        )
    fine_scores = engine.apply_selected_pair_corrections(
        fine_scores,
        rows,
        bundle.get("pairCorrections", []),
    )
    return macro_labels, macro_scores[0], fine_labels, fine_scores[0]


def apply_v1_hierarchy(bundle, vectors, macro_labels, macro_scores, fine_labels, fine_scores):
    hierarchy = bundle.get("hierarchy") or {}
    weight = float(hierarchy.get("weight", 0.0))
    specialists = hierarchy.get("specialists") or {}
    if weight <= 0 or not specialists:
        return np.asarray(fine_scores, dtype=np.float64)
    destination = {label: index for index, label in enumerate(fine_labels)}
    macro_index = {label: index for index, label in enumerate(macro_labels)}
    hierarchical = np.zeros(len(fine_labels), dtype=np.float64)
    for group, specialist in specialists.items():
        gate_macros = specialist.get("macroLabels") or [group]
        available_macros = [macro for macro in gate_macros if macro in macro_index]
        if not available_macros:
            continue
        local_labels, local_scores = score_target_raw(specialist, vectors)
        gate = float(sum(macro_scores[macro_index[macro]] for macro in available_macros))
        for label, score in zip(local_labels, local_scores):
            if label in destination:
                hierarchical[destination[label]] = float(score) * gate
    hierarchical = normalize_scores(hierarchical)
    return normalize_scores(
        np.asarray(fine_scores, dtype=np.float64) * (1.0 - weight)
        + hierarchical * weight
    )


def apply_temperature(scores, calibration):
    temperature = max(1.0, float((calibration or {}).get("temperature", 1.0)))
    if temperature <= 1.0:
        return normalize_scores(scores)
    return normalize_scores(np.power(np.maximum(scores, 1e-12), 1.0 / temperature))


def align_scores(source_labels, source_scores, destination_labels):
    source_index = {label: index for index, label in enumerate(source_labels)}
    return np.asarray([
        float(source_scores[source_index[label]]) if label in source_index else 0.0
        for label in destination_labels
    ], dtype=np.float64)


def blend_model_scores(base_labels, base_scores, candidate_labels, candidate_scores, config):
    """Apply a conservative challenger only when it has target-genre evidence."""
    base = normalize_scores(np.asarray(base_scores, dtype=np.float64))
    candidate = normalize_scores(align_scores(
        candidate_labels, candidate_scores, base_labels,
    ))
    target_genres = set(config.get("targetGenres") or [])
    if not target_genres:
        return base, 0.0, {"reason": "no-target-genres"}

    candidate_order = np.argsort(-candidate)
    candidate_top_index = int(candidate_order[0])
    candidate_runner_up = float(candidate[candidate_order[1]]) if len(candidate_order) > 1 else 0.0
    candidate_top_label = base_labels[candidate_top_index]
    candidate_top_score = float(candidate[candidate_top_index])
    base_same_score = float(base[candidate_top_index])
    ratio = candidate_top_score / max(1e-9, base_same_score)
    margin = candidate_top_score - candidate_runner_up
    scope = str(config.get("scope") or "candidate-top-target")
    base_top_label = base_labels[int(np.argmax(base))]
    weights_by_base_top = config.get("weightsByBaseTop") or {}
    if base_top_label in weights_by_base_top:
        weight = float(np.clip(float(weights_by_base_top[base_top_label]), 0.0, 1.0))
        mixed = normalize_scores(base * (1.0 - weight) + candidate * weight)
        return mixed, weight, {
            "reason": "base-top-label-weight",
            "baseTop": base_top_label,
            "candidateTop": candidate_top_label,
            "candidateTopScore": round(candidate_top_score, 6),
            "candidateMargin": round(margin, 6),
            "candidateToBaseRatio": round(ratio, 6),
        }
    in_scope = candidate_top_label in target_genres
    if scope == "either-top-target":
        in_scope = in_scope or base_top_label in target_genres
    passes = (
        in_scope
        and candidate_top_score >= float(config.get("candidateTargetThreshold", 0.0))
        and ratio >= float(config.get("candidateToBaseRatio", 0.0))
        and margin >= float(config.get("candidateMargin", 0.0))
    )
    weight = float(config.get("targetWeight", 0.0)) if passes else float(config.get("defaultWeight", 0.0))
    weight = float(np.clip(weight, 0.0, 1.0))
    mixed = normalize_scores(base * (1.0 - weight) + candidate * weight)
    return mixed, weight, {
        "reason": "target-gate-passed" if passes else "target-gate-closed",
        "baseTop": base_top_label,
        "candidateTop": candidate_top_label,
        "candidateTopScore": round(candidate_top_score, 6),
        "candidateMargin": round(margin, 6),
        "candidateToBaseRatio": round(ratio, 6),
    }


def score_bundle(bundle, vectors):
    if bundle.get("version") == "embedding-genre-blend-v1":
        base = score_bundle(bundle["base"], vectors)
        candidate = score_bundle(bundle["candidate"], vectors)
        base_alpha, base_macro_labels, base_macro_scores, base_fine_labels, base_fine_scores = base
        _, candidate_macro_labels, candidate_macro_scores, candidate_fine_labels, candidate_fine_scores = candidate
        fine_scores, applied_weight, _details = blend_model_scores(
            base_fine_labels,
            base_fine_scores,
            candidate_fine_labels,
            candidate_fine_scores,
            bundle.get("blend") or {},
        )
        macro_weight = applied_weight * float((bundle.get("blend") or {}).get("macroWeightScale", 0.0))
        aligned_candidate_macro = align_scores(
            candidate_macro_labels, candidate_macro_scores, base_macro_labels,
        )
        macro_scores = normalize_scores(
            np.asarray(base_macro_scores, dtype=np.float64) * (1.0 - macro_weight)
            + aligned_candidate_macro * macro_weight
        )
        return base_alpha, base_macro_labels, macro_scores, base_fine_labels, fine_scores
    if bundle.get("version") == "embedding-macro-specialists-v2":
        macro_labels, macro_scores, fine_labels, fine_scores = score_macro_specialist_bundle(bundle, vectors)
        return 0.0, macro_labels, macro_scores, fine_labels, fine_scores
    selected_alpha = float((bundle.get("fine", {}).get("macroPrior") or {}).get("alpha", 0.0))
    macro_prior_alpha = (
        float(FINE_MACRO_PRIOR_ALPHA_OVERRIDE)
        if FINE_MACRO_PRIOR_ALPHA_OVERRIDE is not None
        else selected_alpha
    )
    macro_labels, macro_scores = score_target_raw(bundle["macro"], vectors)
    fine_labels, fine_scores = score_target_raw(
        bundle["fine"], vectors, apply_tag_ensemble=False,
    )
    global_fine_scores = np.asarray(fine_scores, dtype=np.float64).copy()
    fine_scores = apply_v1_hierarchy(
        bundle, vectors, macro_labels, macro_scores, fine_labels, fine_scores,
    )
    fine_scores = apply_macro_prior_to_fine(
        fine_labels, fine_scores, macro_labels, macro_scores, macro_prior_alpha,
    )
    hierarchy_fine_scores = np.asarray(fine_scores, dtype=np.float64).copy()
    tag_evidence = tag_score_vector(
        vectors, fine_labels, bundle["fine"].get("tagEnsemble") or {},
    )
    if tag_evidence is None:
        tag_evidence = np.zeros_like(fine_scores, dtype=np.float64)
    fine_scores = apply_tag_ensemble_if_available(
        bundle["fine"], vectors, fine_labels, fine_scores,
    )
    fine_scores = apply_pair_rerankers(bundle, vectors, fine_labels, fine_scores)
    fine_scores = apply_top3_stacker(bundle, fine_labels, fine_scores, {
        "global": global_fine_scores,
        "hierarchy": hierarchy_fine_scores,
        "tag": tag_evidence,
    })
    fine_scores = apply_temperature(fine_scores, bundle.get("fineCalibration"))
    return macro_prior_alpha, macro_labels, macro_scores, fine_labels, fine_scores


def aggregate_pop_audio(items):
    if not items:
        return {}
    keys = sorted({key for item in items for key in item})
    return {
        key: round(float(np.mean([float(item.get(key, 0.0)) for item in items])), 4)
        for key in keys
    }


def segment_analysis(offsets, fine_labels, fine_scores, aggregate_scores):
    top_indexes = [int(np.argmax(scores)) for scores in fine_scores]
    aggregate_top = int(np.argmax(aggregate_scores))
    agreement = float(np.mean([index == aggregate_top for index in top_indexes]))
    drift = float(np.mean([
        np.sum(np.abs(scores - aggregate_scores)) * 0.5
        for scores in fine_scores
    ]))
    stability = float(np.clip(agreement * 0.65 + (1.0 - drift) * 0.35, 0.0, 1.0))
    return {
        "segmentCount": len(offsets),
        "offsetSeconds": offsets,
        "topLabels": [fine_labels[index] for index in top_indexes],
        "agreement": round(agreement, 4),
        "distributionDrift": round(drift, 4),
        "stability": round(stability, 4),
    }


def apply_segment_arbitrator(bundle, fine_labels, segment_scores, segment_vectors=None):
    mean_scores = normalize_scores(np.mean(segment_scores, axis=0, keepdims=True))[0]
    arbitrator = bundle.get("segmentArbitrator") or {}
    minimum_segments = int(arbitrator.get("minimumSegments", 2))
    if not arbitrator or len(segment_scores) < minimum_segments:
        return mean_scores, {
            "applied": False,
            "reason": "not-configured" if not arbitrator else "insufficient-segments",
            "blendWeight": 0.0,
        }
    pipeline = arbitrator["pipeline"]
    labels = list(arbitrator["labels"])
    feature_mode = arbitrator.get("featureMode", "scoreMoments")
    features = segment_arbitrator_features(segment_scores).reshape(1, -1)
    if feature_mode == "rawSegments":
        if not segment_vectors or len(segment_vectors) != len(segment_scores):
            return mean_scores, {
                "applied": False, "reason": "missing-raw-segment-vectors",
                "blendWeight": 0.0,
            }
        raw_segments = np.asarray([
            np.concatenate([
                np.asarray(vectors["effnet_tail"], dtype=np.float64),
                np.asarray(vectors["librosa"], dtype=np.float64),
            ])
            for vectors in segment_vectors
        ], dtype=np.float64)
        raw_scores = pipeline.predict_proba(raw_segments)
        candidate_scores = normalize_scores(align_scores(
            labels, np.mean(raw_scores, axis=0), fine_labels,
        ))
    else:
        scores = pipeline.predict_proba(features)[0]
        candidate_scores = align_scores(labels, scores, fine_labels)
    if feature_mode != "rawSegments" and arbitrator.get("scoreSource") == "familySpecialist":
        candidate_scores = segment_family_specialist_scores(
            mean_scores, features,
            arbitrator.get("familySpecialists") or {}, fine_labels,
        )[0]
    base_maximum = float(arbitrator.get("baseMaximum", 1.0))
    advantage = float(arbitrator.get("arbitratorAdvantage", -1.0))
    base_confidence = float(np.max(mean_scores))
    arbitrator_confidence = float(np.max(candidate_scores))
    override_probability = None
    override_model = arbitrator.get("overrideGate")
    if override_model is not None and "overrideMinimum" in arbitrator:
        override_features = segment_override_gate_features(
            mean_scores, candidate_scores, features,
        )
        override_probability = float(override_model.predict_proba(override_features)[0, 1])
        route = (
            base_confidence <= base_maximum
            and override_probability >= float(arbitrator["overrideMinimum"])
        )
    elif feature_mode == "rawSegments":
        base_order = np.sort(mean_scores)
        candidate_order = np.sort(candidate_scores)
        base_margin = float(base_order[-1] - base_order[-2])
        candidate_margin = float(candidate_order[-1] - candidate_order[-2])
        route = (
            base_confidence <= base_maximum
            and candidate_margin - base_margin >= float(
                arbitrator.get("marginAdvantage", 0.0)
            )
        )
    else:
        route = (
            base_confidence <= base_maximum
            and arbitrator_confidence - base_confidence >= advantage
        )
    if not route:
        return mean_scores, {
            "applied": False,
            "reason": "confidence-gate",
            "blendWeight": 0.0,
            "baseConfidence": round(base_confidence, 4),
            "arbitratorConfidence": round(arbitrator_confidence, 4),
            "overrideProbability": (
                round(override_probability, 4) if override_probability is not None else None
            ),
        }
    weight = float(np.clip(arbitrator.get("blendWeight", 0.25), 0.0, 0.5))
    # Two segments contain less structural evidence than all three, so apply
    # only half the learned correction in that case.
    coverage = min(1.0, len(segment_scores) / 3.0)
    effective_weight = weight * coverage
    blended = normalize_scores(
        mean_scores * (1.0 - effective_weight) + candidate_scores * effective_weight
    )
    return blended, {
        "applied": True,
        "schemaVersion": arbitrator.get("schemaVersion"),
        "blendWeight": round(effective_weight, 4),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", default=str(DEFAULT_MODEL_PATH))
    parser.add_argument("--audio")
    parser.add_argument("--segment-audio", action="append", default=[])
    parser.add_argument("--segment-offset", action="append", type=float, default=[])
    parser.add_argument("--cache-key")
    parser.add_argument("--japanese-vocal-evidence", default="{}")
    parser.add_argument("--validate-model", action="store_true")
    args = parser.parse_args()
    if (
        not args.audio and not args.segment_audio
        and not args.cache_key and not args.validate_model
    ):
        raise SystemExit("Provide --audio or --cache-key")
    bundle = load_model(args.model_path)
    if args.validate_model:
        print(json.dumps(model_validation_payload(bundle), ensure_ascii=False), flush=True)
        return
    vocal_evidence = json.loads(args.japanese_vocal_evidence or "{}")
    musicfm_audio_path = None
    if args.cache_key:
        vector_segments = [(0.0, vectors_from_cache_key(args.cache_key))]
        pop_audio = {}
    elif args.segment_audio:
        audio_paths = [Path(value) for value in args.segment_audio]
        musicfm_audio_path = audio_paths[0] if audio_paths else None
        vector_segments = vectors_from_audio_paths(
            audio_paths, offsets=args.segment_offset
        )
        pop_audio = aggregate_pop_audio([
            extract_pop_audio_evidence(path, 0.0) for path in audio_paths
        ])
    else:
        audio_path = Path(args.audio)
        musicfm_audio_path = audio_path
        vector_segments = vectors_from_audio_segments(audio_path)
        pop_audio = aggregate_pop_audio([
            extract_pop_audio_evidence(audio_path, offset_seconds)
            for offset_seconds, _vectors in vector_segments
        ])
    scored_segments = [score_bundle(bundle, vectors) for _offset, vectors in vector_segments]
    macro_prior_alpha = scored_segments[0][0]
    macro_labels = scored_segments[0][1]
    fine_labels = scored_segments[0][3]
    macro_scores = normalize_scores(np.mean([item[2] for item in scored_segments], axis=0, keepdims=True))[0]
    segment_fine_scores = [np.asarray(item[4], dtype=np.float64) for item in scored_segments]
    adjusted_fine_scores, arbitrator_details = apply_segment_arbitrator(
        bundle, fine_labels, segment_fine_scores,
        [vectors for _offset, vectors in vector_segments],
    )
    adjusted_fine_scores, rhythm_reranker_details = maybe_apply_unknown80_rhythm(
        fine_labels, adjusted_fine_scores, vector_segments,
    )
    adjusted_fine_scores, track_pair_details = maybe_apply_unknown80_track_pairs(
        fine_labels, adjusted_fine_scores, vector_segments,
    )
    adjusted_fine_scores, musicfm_details, musicfm_record = maybe_apply_unknown80_musicfm(
        fine_labels, adjusted_fine_scores, musicfm_audio_path,
    )
    adjusted_fine_scores, unknown65_details = maybe_apply_unknown65(
        fine_labels, adjusted_fine_scores, musicfm_audio_path,
        {"musicfm": musicfm_record} if musicfm_record else None,
    )
    segment_details = segment_analysis(
        [offset for offset, _vectors in vector_segments],
        fine_labels,
        segment_fine_scores,
        adjusted_fine_scores,
    )
    segment_details["arbitrator"] = arbitrator_details
    adjusted_fine_scores, jpop_evidence = apply_jpop_evidence(
        fine_labels, adjusted_fine_scores, macro_labels, macro_scores, vocal_evidence, pop_audio,
    )
    macro = format_scores(macro_labels, macro_scores, 4)
    fine = format_scores(fine_labels, adjusted_fine_scores, 5)
    raw_confidence = fine[0]["score"] if fine else 0.0
    margin = (fine[0]["score"] - fine[1]["score"]) if len(fine) > 1 else raw_confidence
    supported_fine_labels, unsupported_fine_labels = model_fine_coverage(bundle)
    confidence = calibrated_confidence(raw_confidence, fine[1]["score"] if len(fine) > 1 else 0.0, len(supported_fine_labels))
    if segment_details["segmentCount"] > 1:
        confidence = round(confidence * (0.65 + 0.35 * segment_details["stability"]), 1)
    degraded_sources = []
    runtime_contract = bundle.get("runtimeFeatureContract") or {}
    discogs_head_required = runtime_contract.get("discogsTagHeadRequired", True)
    mtg_head_required = runtime_contract.get("mtgHeadRequired", True)
    if args.audio and discogs_head_required and not DISCOGS_HEAD_ENABLED:
        degraded_sources.append("discogs-tags")
    if args.audio and mtg_head_required and "mtg" not in INFER_SOURCES:
        degraded_sources.append("mtg-tags")
    if degraded_sources:
        confidence = min(confidence, 68.0)
    selective_risk = bundle.get("selectiveRisk") or {}
    selective_point = selective_risk.get("operatingPoint") or {}
    predicted_label = fine[0]["label"] if fine else ""
    label_point = (selective_risk.get("labelOperatingPoints") or {}).get(predicted_label) or {}
    selected_risk_point = label_point or selective_point
    selective_threshold = float(selected_risk_point.get("threshold", 0.0))
    certainty = selective_certainty(adjusted_fine_scores)
    risk_configured = bool(selective_risk)
    arbitrator_risk_calibrated = (
        not arbitrator_details.get("applied")
        or bool((bundle.get("segmentArbitrator") or {}).get("selectiveRiskCalibrated"))
    )
    reliable_prediction = (
        arbitrator_risk_calibrated
        and (
            (not risk_configured)
            or (bool(selected_risk_point) and selective_threshold > 0.0 and certainty >= selective_threshold)
        )
    )
    expected_segments = int((bundle.get("runtimeFeatureContract") or {}).get("segmentCount", SEGMENT_COUNT))
    segment_coverage = min(1.0, segment_details["segmentCount"] / max(1, expected_segments))
    source_coverage = len([name for name in ("discogs", "librosa") if name in INFER_SOURCES]) / 2.0
    evidence_coverage = round(float(segment_coverage * source_coverage), 4)
    payload = {
        "ok": True,
        "source": "embedding-genre-model",
        "method": bundle.get("method", ""),
        "modelVersion": bundle.get("modelVersion") or bundle.get("version", ""),
        "runtimeFeatureContractSha256": bundle.get("runtimeFeatureContractSha256"),
        "modelPath": str(args.model_path),
        "macroPriorAlpha": macro_prior_alpha,
        "macro": macro[:4],
        "top": fine[:5],
        "japaneseVocalEvidence": jpop_evidence,
        "popStyle": pop_style_from_evidence(jpop_evidence),
        "inferredGenre": fine[0]["label"] if fine else "",
        "confidence": confidence,
        "rawConfidence": raw_confidence,
        "margin": round(margin, 1),
        "selectiveCertainty": round(certainty, 4),
        "selectiveRisk": {
            "targetAccuracy": selective_risk.get("targetAccuracy"),
            "estimatedAccuracy": selected_risk_point.get("accuracy"),
            "estimatedCoverage": selected_risk_point.get("coverage"),
            "threshold": selective_threshold or None,
            "thresholdScope": "predicted-label" if label_point else "pooled",
            "accepted": reliable_prediction,
            "segmentArbitratorCalibrated": arbitrator_risk_calibrated,
        },
        "supportedFineLabels": supported_fine_labels,
        "unsupportedFineLabels": unsupported_fine_labels,
        "inferenceSources": list(INFER_SOURCES),
        "degradedSources": degraded_sources,
        "segmentAnalysis": segment_details,
        "unknown80RhythmReranker": rhythm_reranker_details,
        "unknown80TrackPairReranker": track_pair_details,
        "unknown80MusicFmReranker": musicfm_details,
        "unknown65Reranker": unknown65_details,
        "evidenceCoverage": evidence_coverage,
        "needsReview": bool(degraded_sources) or evidence_coverage < 1.0 or not reliable_prediction or confidence < 45 or margin < 3 or (
            segment_details["segmentCount"] > 1 and segment_details["stability"] < 0.55
        ) or (
            bool(jpop_evidence.get("available"))
            and fine[0]["label"] == "J-POP"
            and float(jpop_evidence.get("japaneseVocalLikelihood", 0.0)) < 0.45
        ),
    }
    print(json.dumps(payload, ensure_ascii=False), flush=True)
    # Essentia TensorFlow may crash while native graph objects are destroyed
    # after a successful prediction. The child process owns no persistent
    # state, so bypassing native teardown is safer and preserves JSON output.
    if args.audio:
        os._exit(0)


if __name__ == "__main__":
    main()
