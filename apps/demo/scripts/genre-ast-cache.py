"""Cache BSD-licensed AudioSet AST representations for an audio-only pilot.

Audio is decoded with ffmpeg and no track metadata is exposed to the model.
The cache contains only aggregate embeddings, tag logits, and window counts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

import numpy as np
import torch
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification


ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = ROOT / "genre-training" / "external-models.json"
SPLITS_PATH = ROOT / "genre-training" / "dataset-splits.json"
MODEL_ROOT = Path(os.environ.get(
    "MMFR_EXTERNAL_MODEL_ROOT",
    str(ROOT / "runtime-assets" / "models"),
))
CACHE_PATH = Path(os.environ.get(
    "MMFR_AST_CACHE_PATH",
    str(ROOT / "runtime-assets" / "cache" / "ast-audioset-30s-pilot-cache.json"),
))
REPORT_PATH = ROOT / "genre-training" / "ast-audioset-cache-report.json"
MODEL_ID = "mit-ast-audioset-bsd3"
EMBEDDING_SIZE = 768
TAG_SIZE = 527
PARENT_LABELS = {"電子音楽", "ワールドミュージック"}
GENRE_ALIASES = {
    "クラシック": "クラシック音楽", "バロック": "クラシック音楽",
    "ロマン派": "クラシック音楽", "近現代クラシック": "クラシック音楽",
    "マーチ": "クラシック音楽", "サンバ": "ラテン", "タンゴ": "ラテン",
    "ボサノヴァ": "ラテン", "フラメンコ": "ラテン", "ビッグバンド": "ジャズ",
    "フュージョン": "ジャズ", "ポップ": "J-POP", "バラード": "J-POP",
}


def load_json(path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text())


def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False))
    temporary.replace(path)


def source_key(row):
    source_type = row.get("sourceType") or ("itunes-preview" if row.get("previewUrl") else "youtube")
    value = row.get("sourceUrl") or row.get("previewUrl") or row.get("youtubeUrl") or row.get("url") or ""
    return f"{source_type}:{value}" if value else ""


def audio_path(row):
    for value in (row.get("filePath"), row.get("sourceUrl")):
        if value and Path(value).exists():
            return Path(value)
    return None


def target_for(row):
    if row.get("styleHint") == "city_pop":
        return "シティ・ポップ"
    return GENRE_ALIASES.get(row.get("genre"), row.get("genre"))


def source_name(row):
    return str(row.get("datasetName") or row.get("sourceType") or "unknown")


def take_source_round_robin(rows, limit, chosen_ids):
    grouped = {}
    for row in rows:
        if id(row) not in chosen_ids:
            grouped.setdefault(source_name(row), []).append(row)
    selected = []
    sources = sorted(grouped)
    cursor = 0
    while sources and len(selected) < limit:
        source = sources[cursor % len(sources)]
        bucket = grouped[source]
        row = bucket.pop(0)
        selected.append(row)
        chosen_ids.add(id(row))
        if not bucket:
            sources.remove(source)
            cursor %= max(1, len(sources))
        else:
            cursor += 1
    return selected


def balanced_candidates(rows, per_genre):
    grouped = {}
    for row in rows:
        target = target_for(row)
        if not target or (target not in PARENT_LABELS and row.get("trainingRole") == "macro-only"):
            continue
        grouped.setdefault(target, {"train": [], "validation": [], "test": [], "other": []})
        split = row.get("split") if row.get("split") in {"train", "validation", "test"} else "other"
        grouped[target][split].append(row)
    quotas = {
        "train": int(round(per_genre * 0.7)),
        "validation": int(round(per_genre * 0.15)),
    }
    quotas["test"] = per_genre - quotas["train"] - quotas["validation"]
    selected = []
    for by_split in grouped.values():
        chosen = []
        chosen_ids = set()
        for split in ("train", "validation", "test"):
            chosen.extend(take_source_round_robin(by_split[split], quotas[split], chosen_ids))
        if len(chosen) < per_genre:
            for split in ("train", "validation", "test", "other"):
                for row in by_split[split]:
                    if id(row) in chosen_ids:
                        continue
                    chosen.append(row)
                    chosen_ids.add(id(row))
                    if len(chosen) >= per_genre:
                        break
                if len(chosen) >= per_genre:
                    break
        selected.extend(chosen)
    return selected


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decode_pcm(path, sample_rate, duration):
    command = [
        os.environ.get("MMFR_FFMPEG_PATH", str(ROOT / ".tools" / "bin" / "ffmpeg")),
        "-v", "error", "-nostdin", "-i", str(path), "-t", str(duration),
        "-ac", "1", "-ar", str(sample_rate), "-f", "f32le", "pipe:1",
    ]
    completed = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    audio = np.frombuffer(completed.stdout, dtype="<f4").copy()
    if audio.size < sample_rate:
        raise ValueError("audio shorter than one second")
    audio[~np.isfinite(audio)] = 0.0
    return audio


def window_starts(audio_size, window_size, window_count):
    if audio_size <= window_size:
        return np.asarray([0], dtype=np.int64)
    return np.linspace(0, audio_size - window_size, num=max(1, window_count), dtype=np.int64)


def summarize(values):
    matrix = np.asarray(values, dtype=np.float32)
    result = np.concatenate([matrix.mean(axis=0), matrix.std(axis=0), matrix.max(axis=0)])
    result[~np.isfinite(result)] = 0.0
    return result.astype(float).tolist()


def normalize(vector):
    value = np.asarray(vector, dtype=np.float32).reshape(-1)
    value[~np.isfinite(value)] = 0.0
    return value / max(1e-12, float(np.linalg.norm(value)))


def embed_audio(model, processor, path, sample_rate, duration, window_seconds, windows):
    audio = decode_pcm(path, sample_rate, duration)
    window_size = int(sample_rate * window_seconds)
    embeddings = []
    tag_logits = []
    with torch.inference_mode():
        for start in window_starts(audio.size, window_size, windows):
            chunk = audio[start:start + window_size]
            inputs = processor(chunk, sampling_rate=sample_rate, return_tensors="pt")
            outputs = model(**inputs, output_hidden_states=True)
            hidden = outputs.hidden_states[-1]
            pooled = hidden[:, :2].mean(dim=1)[0].cpu().numpy()
            embeddings.append(normalize(pooled))
            tag_logits.append(outputs.logits[0].cpu().numpy().astype(np.float32))
    values = np.asarray(embeddings, dtype=np.float32)
    return {
        "embedding": normalize(values.mean(axis=0)).astype(float).tolist(),
        "moments": summarize(values),
        "tagMoments": summarize(tag_logits),
        "windows": len(values),
    }


def valid(record):
    return (
        isinstance(record, dict)
        and len(record.get("embedding", [])) == EMBEDDING_SIZE
        and len(record.get("moments", [])) == EMBEDDING_SIZE * 3
        and len(record.get("tagMoments", [])) == TAG_SIZE * 3
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=30)
    parser.add_argument("--window-seconds", type=float, default=10)
    parser.add_argument("--windows", type=int, default=3)
    parser.add_argument("--per-genre", type=int, default=10)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--checkpoint-every", type=int, default=2)
    parser.add_argument("--cache-path", type=Path, default=CACHE_PATH)
    parser.add_argument("--report-path", type=Path, default=REPORT_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.report_path.is_absolute():
        args.report_path = ROOT / args.report_path

    registry = load_json(REGISTRY_PATH, {"models": []})
    config = next((item for item in registry.get("models", []) if item.get("id") == MODEL_ID), None)
    if not config:
        raise RuntimeError(f"Missing {MODEL_ID} in external-models.json")
    model_path = MODEL_ROOT / config["modelPath"]
    weights_path = MODEL_ROOT / config["weightsPath"]
    actual_sha = sha256(weights_path)
    if config.get("sha256") and config["sha256"] != actual_sha:
        raise RuntimeError(f"SHA-256 mismatch for {weights_path}: {actual_sha}")

    rows = load_json(SPLITS_PATH, {"items": []}).get("items", [])
    candidates = balanced_candidates(rows, args.per_genre)
    cache = {
        key: value for key, value in load_json(args.cache_path, {}).items()
        if valid(value)
    }
    pending = [
        row for row in candidates
        if source_key(row)
        and source_key(row) not in cache
        and audio_path(row) is not None
    ]
    pending_total = len(pending)
    if args.limit:
        pending = pending[:args.limit]
    if args.dry_run:
        pending = []

    torch.set_num_threads(max(1, int(os.environ.get("MMFR_AST_TORCH_THREADS", "2"))))
    model = AutoModelForAudioClassification.from_pretrained(
        model_path, local_files_only=True,
    ).eval() if pending else None
    processor = AutoFeatureExtractor.from_pretrained(
        model_path, local_files_only=True,
    ) if pending else None

    errors = []
    completed = 0
    dirty = False
    sample_rate = int(config.get("sampleRate") or 16000)
    for index, row in enumerate(pending, start=1):
        key = source_key(row)
        try:
            cache[key] = embed_audio(
                model, processor, audio_path(row), sample_rate,
                args.duration, args.window_seconds, args.windows,
            )
            if not valid(cache[key]):
                raise ValueError("invalid AST cache record")
            completed += 1
            dirty = True
        except Exception as exc:
            errors.append({"key": key, "error": str(exc)})
        if dirty and (index % max(1, args.checkpoint_every) == 0 or index == len(pending)):
            save_json(args.cache_path, cache)
            dirty = False
            print(f"ast {index}/{len(pending)} cached={completed} errors={len(errors)}", flush=True)

    candidate_keys = {source_key(row) for row in candidates if source_key(row)}
    report = {
        "modelId": MODEL_ID,
        "modelPath": str(model_path),
        "weightsPath": str(weights_path),
        "sha256": actual_sha,
        "cachePath": str(args.cache_path),
        "durationSeconds": args.duration,
        "windowSeconds": args.window_seconds,
        "windowsPerTrack": args.windows,
        "perGenreLimit": args.per_genre,
        "selectedCandidateRows": len(candidates),
        "pendingRowsBeforeLimit": pending_total,
        "cachedCandidateRows": sum(key in cache for key in candidate_keys),
        "processedThisRun": completed,
        "embeddingSize": EMBEDDING_SIZE,
        "tagSize": TAG_SIZE,
        "errorCount": len(errors),
        "errors": errors[:100],
        "modelLicense": config.get("modelLicense"),
        "licenseStatus": config.get("licenseStatus"),
        "productionEligible": bool(config.get("productionEligible")),
        "metadataUsedForInference": False,
    }
    args.report_path.parent.mkdir(parents=True, exist_ok=True)
    args.report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
