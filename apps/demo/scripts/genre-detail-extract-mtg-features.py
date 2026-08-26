import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CACHE_ROOT = Path(os.environ.get(
    "MMFR_GENRE_CACHE_DIR",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training",
))
MANIFEST_PATH = Path(os.environ.get(
    "MMFR_DETAIL_FEATURE_MANIFEST",
    str(CACHE_ROOT / "detail-genre-ccmixter-source-manifest.json"),
))
FEATURE_PATH = Path(os.environ.get(
    "MMFR_MTG_FEATURE_CACHE",
    str(CACHE_ROOT / "essentia-mtg-jamendo-feature-cache.json"),
))
MODEL_ROOT = Path(os.environ.get(
    "MMFR_ESSENTIA_MODEL_ROOT",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/models",
))
REPORT_PATH = Path(os.environ.get(
    "MMFR_DETAIL_FEATURE_REPORT",
    str(ROOT / "genre-training/detail-genre-ccmixter-feature-report.json"),
))
SR = 16000
DURATION = float(os.environ.get("MMFR_ESSENTIA_DURATION", "45"))


def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False))
    temporary.replace(path)


def stats(matrix, np):
    values = np.asarray(matrix, dtype=np.float64)
    if values.ndim == 1:
        values = values.reshape(1, -1)
    return np.concatenate([values.mean(axis=0), values.std(axis=0), values.max(axis=0)]).astype(float).tolist()


def main():
    import numpy as np
    import essentia
    from essentia.standard import MonoLoader, TensorflowPredict2D, TensorflowPredictEffnetDiscogs

    essentia.log.warningActive = False
    essentia.log.infoActive = False
    items = json.loads(MANIFEST_PATH.read_text()).get("items", [])
    cache = json.loads(FEATURE_PATH.read_text()) if FEATURE_PATH.exists() else {}
    pending = [item for item in items if f"cc-dataset:{item['filePath']}" not in cache]
    embedding = TensorflowPredictEffnetDiscogs(
        graphFilename=str(MODEL_ROOT / "essentia-discogs-effnet/discogs-effnet-bs64-1.pb"),
        output="PartitionedCall:1",
    )
    classifier = TensorflowPredict2D(
        graphFilename=str(MODEL_ROOT / "essentia-mtg-jamendo/mtg_jamendo_genre-discogs-effnet-1.pb"),
        input="model/Placeholder",
        output="model/Sigmoid",
    )
    failures = []
    for index, item in enumerate(pending, start=1):
        key = f"cc-dataset:{item['filePath']}"
        print(f"detail feature {index}/{len(pending)} {item['trackId']}", flush=True)
        try:
            audio = MonoLoader(filename=item["filePath"], sampleRate=SR, resampleQuality=4)()
            audio = audio[: int(SR * DURATION)]
            vector = stats(classifier(embedding(audio)), np)
            cache[key] = [0.0 if not np.isfinite(value) else float(value) for value in vector]
        except Exception as error:
            failures.append({"trackId": item.get("trackId"), "error": str(error)})
        save_json(FEATURE_PATH, cache)
    available = [item for item in items if isinstance(cache.get(f"cc-dataset:{item['filePath']}"), list)]
    report = {
        "schemaVersion": 1,
        "manifestPath": str(MANIFEST_PATH),
        "featureCachePath": str(FEATURE_PATH),
        "contract": "45s mono 16kHz Discogs-EffNet -> MTG-Jamendo genre sigmoid mean/std/max",
        "manifestRows": len(items),
        "pendingBeforeRun": len(pending),
        "rowsWithFeatures": len(available),
        "featureDimensions": len(cache[f"cc-dataset:{available[0]['filePath']}"]) if available else 0,
        "failures": failures,
        "promotionPolicy": "Feature availability only; model promotion still requires source-heldout ablation.",
    }
    save_json(REPORT_PATH, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
