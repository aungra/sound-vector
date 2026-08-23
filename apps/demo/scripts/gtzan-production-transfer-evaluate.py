#!/usr/bin/env python3
"""Evaluate the production audio model on evaluation-only GTZAN tracks.

The audio is never admitted to training. Predictions are checkpointed outside
the repository so a long native-model run can resume after interruption.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
DEFAULT_MANIFEST = TRAINING / "gtzan-filtered-evaluation-manifest.json"
DEFAULT_INFER = Path(
    "/Users/kahanishimoto/Documents/MUSICTee/apps/demo/scripts/genre-embedding-infer.py"
)
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/embedding-genre-model.pkl"
)
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/gtzan/"
    "production-transfer-predictions-v2.jsonl"
)
DEFAULT_REPORT = TRAINING / "gtzan-production-transfer-evaluation.json"


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path):
    return json.loads(Path(path).read_text())


def load_inference(path):
    path = Path(path).resolve()
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location("gtzan_production_inference", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    try:
        import essentia
        essentia.log.infoActive = False
        essentia.log.warningActive = False
    except Exception:
        pass
    return module


def validate_evaluation_rows(payload):
    if payload.get("role") != "source-heldout-evaluation-only":
        raise ValueError("GTZAN manifest must be source-heldout evaluation only")
    rows = payload.get("items", [])
    for row in rows:
        if (
            row.get("trainingEligible")
            or row.get("productionEligible")
            or not row.get("evaluationEligible")
        ):
            raise ValueError(f"non-evaluation row found: {row.get('trackId')}")
    return rows


def read_checkpoint(path):
    output = {}
    if not Path(path).exists():
        return output
    for line in Path(path).read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        output[row["trackId"]] = row
    return output


def append_checkpoint(path, row):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as handle:
        handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def score_vectors(inference, bundle, vectors, pop_audio=None):
    scored = inference.score_bundle(bundle, vectors)
    _alpha, macro_labels, macro_scores, fine_labels, fine_scores = scored
    segment_scores = [np.asarray(fine_scores, dtype=np.float64)]
    adjusted, arbitrator = inference.apply_segment_arbitrator(
        bundle, fine_labels, segment_scores, [vectors],
    )
    baseline_top = inference.format_scores(fine_labels, adjusted, 5)
    adjusted, rhythm = inference.maybe_apply_unknown80_rhythm(
        fine_labels, adjusted, [(0.0, vectors)],
    )
    adjusted, jpop = inference.apply_jpop_evidence(
        fine_labels,
        adjusted,
        macro_labels,
        macro_scores,
        {},
        pop_audio or {},
    )
    return {
        "baselineTop": baseline_top,
        "top": inference.format_scores(fine_labels, adjusted, 5),
        "macro": inference.format_scores(macro_labels, macro_scores, 4),
        "arbitrator": arbitrator,
        "rhythmReranker": rhythm,
        "jpopEvidence": jpop,
    }


def extract_vectors(inference, extractors, audio_path):
    discogs = np.asarray(extractors.discogs(audio_path, 0.0), dtype=np.float32)
    librosa = np.asarray(inference.extract_librosa(audio_path, 0.0), dtype=np.float32)
    vectors = {
        "discogs": discogs,
        "librosa": librosa,
        "mtg": np.zeros(inference.SOURCE_VECTOR_LENGTHS["mtg"], dtype=np.float32),
        "effnet_tail": discogs[inference.DISCOGS_TAG_DIMENSIONS:].copy(),
    }
    errors = inference.validate_runtime_vectors(vectors)
    if errors:
        raise ValueError("Runtime feature contract mismatch: " + "; ".join(errors))
    return vectors


def metrics(rows, ranking_key="top"):
    by_label = defaultdict(lambda: Counter(total=0, top1=0, top3=0))
    confusion = Counter()
    correct = 0
    top3 = 0
    for row in rows:
        actual = row["actual"]
        ranking = [item["label"] for item in row.get(ranking_key, [])]
        predicted = ranking[0] if ranking else ""
        by_label[actual]["total"] += 1
        confusion[(actual, predicted)] += 1
        if predicted == actual:
            correct += 1
            by_label[actual]["top1"] += 1
        if actual in ranking[:3]:
            top3 += 1
            by_label[actual]["top3"] += 1
    total = len(rows)
    details = {
        label: {
            **dict(counts),
            "top1Accuracy": round(counts["top1"] / counts["total"] * 100, 2),
            "top3Accuracy": round(counts["top3"] / counts["total"] * 100, 2),
        }
        for label, counts in sorted(by_label.items())
    }
    return {
        "total": total,
        "top1Accuracy": round(correct / total * 100, 2) if total else 0.0,
        "top3Accuracy": round(top3 / total * 100, 2) if total else 0.0,
        "balancedTop1": round(np.mean([
            value["top1Accuracy"] for value in details.values()
        ]), 2) if details else 0.0,
        "byLabel": details,
        "topConfusions": [
            {"actual": actual, "predicted": predicted, "count": count}
            for (actual, predicted), count in confusion.most_common(20)
            if actual != predicted
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--infer-script", type=Path, default=DEFAULT_INFER)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--genre", action="append", default=[])
    args = parser.parse_args()

    payload = load_json(args.manifest)
    rows = validate_evaluation_rows(payload)
    if args.genre:
        rows = [row for row in rows if row.get("genre") in set(args.genre)]
    completed = read_checkpoint(args.checkpoint)
    pending = [row for row in rows if row["trackId"] not in completed]
    if args.limit > 0:
        pending = pending[:args.limit]

    os.environ.setdefault("MMFR_EMBEDDING_INFER_SOURCES", "discogs,librosa")
    os.environ.setdefault("MMFR_ESSENTIA_DISCOGS_HEAD", "1")
    inference = load_inference(args.infer_script)
    bundle = inference.load_model(args.model)
    extractors = inference.EssentiaExtractors(("discogs", "librosa"))

    failures = []
    for index, row in enumerate(pending, 1):
        try:
            audio_path = Path(row["filePath"])
            vectors = extract_vectors(inference, extractors, audio_path)
            prediction = score_vectors(
                inference,
                bundle,
                vectors,
                # No Japanese-vocal evidence is collected for this non-J-POP
                # transfer cohort, so the J-POP calibrator cannot consume the
                # accompaniment proxy and extracting it would only duplicate IO.
                {},
            )
            result = {
                "trackId": row["trackId"],
                "actual": row["genre"],
                **prediction,
            }
            append_checkpoint(args.checkpoint, result)
            completed[row["trackId"]] = result
            print(
                f"[{index}/{len(pending)}] {row['trackId']} "
                f"{row['genre']} -> {result['top'][0]['label']}",
                flush=True,
            )
        except Exception as error:
            failures.append({"trackId": row.get("trackId"), "error": str(error)})
            print(f"FAILED {row.get('trackId')}: {error}", file=sys.stderr, flush=True)
        finally:
            extractors.audio_cache.clear()
            extractors.embedding_cache.clear()

    evaluated = [completed[row["trackId"]] for row in rows if row["trackId"] in completed]
    reranker_changes = [
        row for row in evaluated
        if row.get("baselineTop", [{}])[0].get("label")
        != row.get("top", [{}])[0].get("label")
    ]
    reranker_improved = sum(
        row["top"][0]["label"] == row["actual"]
        and row["baselineTop"][0]["label"] != row["actual"]
        for row in reranker_changes
    )
    reranker_harmed = sum(
        row["top"][0]["label"] != row["actual"]
        and row["baselineTop"][0]["label"] == row["actual"]
        for row in reranker_changes
    )
    report = {
        "objective": "Production-model transfer to an unseen, evaluation-only GTZAN source.",
        "evaluationOnly": True,
        "trainingRowsAdded": 0,
        "requested": len(rows),
        "evaluated": len(evaluated),
        "remaining": len(rows) - len(evaluated),
        "failures": failures,
        "baselineMetrics": metrics(evaluated, "baselineTop"),
        "rerankedMetrics": metrics(evaluated, "top"),
        "rerankerImpact": {
            "changedTop1": len(reranker_changes),
            "improved": reranker_improved,
            "harmed": reranker_harmed,
            "netCorrect": reranker_improved - reranker_harmed,
            "promotionEligible": reranker_harmed <= reranker_improved,
        },
        "reproducibility": {
            "manifestSha256": sha256_file(args.manifest),
            "inferenceScriptSha256": sha256_file(args.infer_script),
            "modelSha256": sha256_file(args.model),
            "runtimeFeatureContractSha256": bundle.get("runtimeFeatureContractSha256"),
            "modelVersion": bundle.get("modelVersion"),
            "discogsTagHeadEnabled": bool(inference.DISCOGS_HEAD_ENABLED),
        },
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
