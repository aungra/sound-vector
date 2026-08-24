#!/usr/bin/env python3
"""Screen generic deep audio evidence against the fixed v109 source-heldout OOF.

The PANNs pilot cache predates the four-segment runtime cache and does not
cover every OOF row. Missing rows remain byte-for-byte at the v109 score. The
screen never reads metadata as an inference feature and never opens the sealed
YouTube holdout.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
EXPORT_PATH = Path(__file__).with_name("genre-unknown80-v108-track-pair-export.py")
PAIR_PATH = Path(__file__).with_name("genre-unknown80-v107-track-pair-screen.py")
SHARED_PATH = Path(__file__).with_name("genre-unknown80-v107-track-reranker-screen.py")
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "panns-cnn14-30s-pilot-cache.json"
)
DEFAULT_CLAP_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "clap-30s-cache.json"
)
DEFAULT_V109_REPORT = TRAINING / "unknown80-v109-track-pair-export.json"
DEFAULT_REPORT = TRAINING / "unknown80-v110-panns-pair-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v110-panns-pair-screen.md"
REPRESENTATION_VIEWS = {
    "panns": ("embedding-mean", "tag-mean", "joint-mean"),
    "clap": ("clap-embedding", "clap-moment-mean", "clap-joint-mean"),
}


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def iter_json_object(path, chunk_size=1024 * 1024):
    """Yield a top-level JSON object's entries without retaining the object."""
    decoder = json.JSONDecoder()
    with Path(path).open("r", encoding="utf-8") as handle:
        buffer = ""
        position = 0
        eof = False

        def refill():
            nonlocal buffer, position, eof
            if position:
                buffer = buffer[position:]
                position = 0
            chunk = handle.read(chunk_size)
            if chunk:
                buffer += chunk
            else:
                eof = True

        def skip_space():
            nonlocal position
            while True:
                while position < len(buffer) and buffer[position].isspace():
                    position += 1
                if position < len(buffer) or eof:
                    return
                refill()

        def decode():
            nonlocal position
            while True:
                skip_space()
                try:
                    value, end = decoder.raw_decode(buffer, position)
                    position = end
                    return value
                except json.JSONDecodeError:
                    if eof:
                        raise
                    refill()

        refill()
        skip_space()
        if position >= len(buffer) or buffer[position] != "{":
            raise ValueError(f"expected JSON object: {path}")
        position += 1
        while True:
            skip_space()
            if position < len(buffer) and buffer[position] == "}":
                return
            key = decode()
            skip_space()
            if position >= len(buffer) or buffer[position] != ":":
                raise ValueError(f"expected ':' after {key!r}")
            position += 1
            yield key, decode()
            skip_space()
            if position < len(buffer) and buffer[position] == ",":
                position += 1
                continue
            if position < len(buffer) and buffer[position] == "}":
                return
            if eof:
                raise ValueError(f"unterminated JSON object: {path}")


def representation_views(kind, record):
    if kind == "clap":
        embedding = record.get("embedding") if isinstance(record, dict) else None
        moments = record.get("moments") if isinstance(record, dict) else None
        if not isinstance(embedding, list) or len(embedding) != 512:
            return None
        if not isinstance(moments, list) or len(moments) != 1536:
            return None
        embedding = np.asarray(embedding, dtype=np.float32)
        moments = np.asarray(moments, dtype=np.float32).reshape(3, 512)
        if not np.all(np.isfinite(embedding)) or not np.all(np.isfinite(moments)):
            return None
        return {
            "clap-embedding": embedding,
            "clap-moment-mean": moments[0],
            "clap-joint-mean": np.concatenate([embedding, moments[0]]),
        }
    if kind != "panns":
        raise ValueError(f"unsupported representation: {kind}")
    embedding = record.get("embeddingMoments") if isinstance(record, dict) else None
    tags = record.get("tagMoments") if isinstance(record, dict) else None
    if not isinstance(embedding, list) or len(embedding) != 6144:
        return None
    if not isinstance(tags, list) or len(tags) != 1581:
        return None
    embedding = np.asarray(embedding, dtype=np.float32).reshape(3, 2048)
    tags = np.asarray(tags, dtype=np.float32).reshape(3, 527)
    if not np.all(np.isfinite(embedding)) or not np.all(np.isfinite(tags)):
        return None
    return {
        "embedding-mean": embedding[0],
        "tag-mean": tags[0],
        "joint-mean": np.concatenate([embedding[0], tags[0]]),
    }


def load_representation_items(kind, path, payload):
    views_for_kind = REPRESENTATION_VIEWS[kind]
    source_indexes = {str(key): index for index, key in enumerate(payload["sourceKeys"])}
    records = {}
    invalid = 0
    for key, record in iter_json_object(path):
        index = source_indexes.get(key)
        if index is None:
            continue
        views = representation_views(kind, record)
        if views is None:
            invalid += 1
            continue
        records[index] = views
    items_by_view = {view: [] for view in views_for_kind}
    for index, views in sorted(records.items()):
        for view in views_for_kind:
            items_by_view[view].append({
                "index": index,
                "sourceKey": str(payload["sourceKeys"][index]),
                "actual": str(payload["actual"][index]),
                "source": str(payload["sources"][index]),
                "trainingEligible": bool(payload["trainingEligible"][index]),
                "features": views[view],
            })
    return items_by_view, invalid


def reconstruct_v109(export, pair_module, shared, report_path):
    _source, black, payload, v107, held_sources, v107_metric = shared.build_v107()
    report = json.loads(report_path.read_text())
    labels = list(payload["labels"])
    output = np.asarray(v107, dtype=np.float64).copy()
    used = set()
    for pair_index, detail in enumerate(report.get("details", [])):
        if detail.get("decision") != "export":
            continue
        pair = tuple(detail["pair"].split(" / ", 1))
        view = detail["view"]
        items = shared.load_cached_items(argparse.Namespace(cache=export.DEFAULT_CACHE, view=view), payload, labels)
        for item in items:
            item["evaluationEligible"] = True
            item["baseScores"] = np.asarray(v107[item["index"]], dtype=np.float64)
            order = np.argsort(-item["baseScores"], kind="stable")
            item["top2Labels"] = (labels[int(order[0])], labels[int(order[1])])
        items.extend(export.load_overlay_items(export.DEFAULT_OVERLAY_CACHE, view, shared))
        records, _folds = export.crossfit_probabilities(
            items, pair, labels, held_sources, pair_module,
            3301001 + pair_index * 10000,
        )
        if not records:
            continue
        indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
        probabilities = np.asarray([record["probabilities"] for record in records])
        candidate, changed = pair_module.apply_pair(
            np.asarray(v107[indexes]), probabilities, pair, labels,
            detail["globalConfig"],
        )
        changed_indexes = set(int(value) for value in indexes[changed]) - used
        if changed_indexes:
            accepted = np.asarray(sorted(changed_indexes), dtype=np.int64)
            candidate_rows = {int(index): row for row, index in enumerate(indexes)}
            output[accepted] = candidate[[candidate_rows[int(index)] for index in accepted]]
            used.update(changed_indexes)
    observed = black.metric(payload["actual"], output, labels, payload["sources"])
    expected = report["candidate"]
    fields = ("top1Accuracy", "balancedTop1", "minimumSourceTop1", "top3Accuracy")
    if tuple(observed[field] for field in fields) != tuple(expected[field] for field in fields):
        raise RuntimeError(f"v109 reconstruction mismatch: {observed} != {expected}")
    return black, payload, output, held_sources, observed, v107_metric


def coverage(items, payload):
    available = {item["index"] for item in items}
    by_source = defaultdict(lambda: {"total": 0, "cached": 0})
    by_label = defaultdict(lambda: {"total": 0, "cached": 0})
    for index, (source, label) in enumerate(zip(payload["sources"], payload["actual"])):
        for bucket, key in ((by_source, str(source)), (by_label, str(label))):
            bucket[key]["total"] += 1
            bucket[key]["cached"] += int(index in available)
    for values in (*by_source.values(), *by_label.values()):
        values["coverage"] = round(values["cached"] / max(1, values["total"]) * 100, 1)
    return dict(sorted(by_source.items())), dict(sorted(by_label.items()))


def render(report):
    representation = report["dataset"].get("representation", "panns")
    base = report["baseline"]
    candidate = report["candidate"]
    lines = [
        f"# Unknown80 v110 {representation.upper()} pair screen", "",
        f"{representation.upper()} is used as audio-only evidence. Uncached OOF rows remain unchanged.", "",
        "| model | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
        f"| v109 | {base['top1Accuracy']:.2f}% | {base['balancedTop1']:.2f}% | {base['minimumSourceTop1']:.2f}% | {base['top3Accuracy']:.2f}% | - |",
        f"| {representation.upper()} candidate | {candidate['top1Accuracy']:.2f}% | {candidate['balancedTop1']:.2f}% | {candidate['minimumSourceTop1']:.2f}% | {candidate['top3Accuracy']:.2f}% | {candidate['improved']} / {candidate['harmed']} |",
        "", "| pair | view | routed | changed | accepted |",
        "|---|---|---:|---:|---|",
    ]
    for item in report["pairs"]:
        lines.append(
            f"| {item['pair']} | {item.get('selectedView') or '-'} | "
            f"{item['routedRows']} | {item['changedRows']} | "
            f"{'yes' if item['accepted'] else 'no'} |"
        )
    lines.extend(["", f"Decision: **{report['decision']}**"])
    return "\n".join(lines)


def run(args):
    export = load_module(EXPORT_PATH, "v110_panns_export")
    pair_module = load_module(PAIR_PATH, "v110_panns_pair")
    shared = load_module(SHARED_PATH, "v110_panns_shared")
    black, payload, v109, held_sources, baseline, _v107_metric = reconstruct_v109(
        export, pair_module, shared, args.v109_report,
    )
    labels = list(payload["labels"])
    views = REPRESENTATION_VIEWS[args.representation]
    items_by_view, invalid = load_representation_items(
        args.representation, args.cache, payload,
    )
    source_coverage, label_coverage = coverage(items_by_view[views[0]], payload)
    by_pair = {pair: [] for pair in pair_module.PAIRS}
    for view_index, view in enumerate(views):
        items = items_by_view[view]
        for item in items:
            item["baseScores"] = np.asarray(v109[item["index"]], dtype=np.float64)
            order = np.argsort(-item["baseScores"], kind="stable")
            item["top2Labels"] = (labels[int(order[0])], labels[int(order[1])])
        for pair_index, pair in enumerate(pair_module.PAIRS):
            proposal = np.asarray(v109, dtype=np.float64).copy()
            changed_indexes = set()
            fold_details = []
            for fold_index, held_source in enumerate(held_sources):
                train = [
                    item for item in items
                    if item["source"] != held_source and item["trainingEligible"]
                ]
                validation = pair_module.routed_items(
                    [item for item in items if item["source"] == held_source], pair,
                )
                config, inner = pair_module.choose_inner_config(
                    train, pair, labels,
                    5101001 + view_index * 100000 + pair_index * 10000 + fold_index * 100,
                )
                model = pair_module.fit_pair(
                    train, pair,
                    5101501 + view_index * 100000 + pair_index * 10000 + fold_index * 100,
                )
                if model is None or not validation:
                    continue
                probabilities = pair_module.pair_probabilities(model, validation, pair)
                indexes = np.asarray([item["index"] for item in validation], dtype=np.int64)
                candidate, changed = pair_module.apply_pair(
                    v109[indexes], probabilities, pair, labels, config,
                )
                proposal[indexes] = candidate
                changed_indexes.update(int(value) for value in indexes[changed])
                fold_details.append({
                    "heldOutSource": str(held_source),
                    "trainingRows": len(pair_module.pair_training_items(train, pair)),
                    "routedRows": len(validation), "selectedConfig": config,
                    "innerSelection": inner, "changedRows": int(np.sum(changed)),
                })
            metric = black.compare_output(
                proposal, v109, payload["actual"], labels, payload["sources"],
            )
            passed = (
                metric["top1Accuracy"] > baseline["top1Accuracy"]
                and metric["balancedTop1"] >= baseline["balancedTop1"]
                and metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
                and metric["top3Accuracy"] >= baseline["top3Accuracy"]
                and metric["improved"] > metric["harmed"]
            )
            by_pair[pair].append({
                "view": view, "proposal": proposal, "changed": changed_indexes,
                "metric": metric, "passed": passed, "folds": fold_details,
            })
    output = np.asarray(v109, dtype=np.float64).copy()
    used = set()
    details = []
    for pair in pair_module.PAIRS:
        candidates = sorted(by_pair[pair], key=lambda item: (
            item["passed"], item["metric"]["top1Accuracy"],
            item["metric"]["balancedTop1"],
            item["metric"]["improved"] - item["metric"]["harmed"],
            item["metric"]["minimumSourceTop1"],
        ), reverse=True)
        selected = next((item for item in candidates if item["passed"]), None)
        accepted = (selected["changed"] - used) if selected else set()
        if accepted:
            indexes = np.asarray(sorted(accepted), dtype=np.int64)
            output[indexes] = selected["proposal"][indexes]
            used.update(accepted)
        details.append({
            "pair": pair_module.pair_name(pair),
            "selectedView": selected["view"] if selected else None,
            "routedRows": sum(fold["routedRows"] for fold in selected["folds"]) if selected else 0,
            "changedRows": len(accepted), "accepted": bool(accepted),
            "selectedMetric": selected["metric"] if selected else None,
            "views": [{
                "view": item["view"], "passed": item["passed"],
                "changedRows": len(item["changed"]), "metric": item["metric"],
            } for item in candidates],
        })
    candidate = black.compare_output(
        output, v109, payload["actual"], labels, payload["sources"],
    )
    top3_preserved = all(
        set(left) == set(right) for left, right in zip(
            np.argsort(-v109, axis=1)[:, :3], np.argsort(-output, axis=1)[:, :3],
        )
    )
    passed = (
        candidate["top1Accuracy"] > baseline["top1Accuracy"]
        and candidate["balancedTop1"] >= baseline["balancedTop1"]
        and candidate["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidate["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidate["improved"] >= candidate["harmed"]
        and top3_preserved
    )
    report = {
        "objective": f"Use generic {args.representation.upper()} audio evidence to rerank fixed v109 Top2 boundaries.",
        "policy": {
            "metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "configurationSelectedInInnerSourceFolds": True,
            "uncachedRowsChanged": False, "top3CandidateSetChanged": not top3_preserved,
            "productionModelUpdated": False,
        },
        "dataset": {
            "oofRows": len(payload["actual"]),
            "cachedRows": len(items_by_view[views[0]]), "invalidRows": invalid,
            "representation": args.representation,
            "views": list(views), "sourceCoverage": source_coverage,
            "labelCoverage": label_coverage,
        },
        "baseline": baseline, "candidate": candidate, "pairs": details,
        "decision": "continue-v110-production-gates" if passed else "reject-panns-candidate",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--representation", choices=tuple(REPRESENTATION_VIEWS), default="panns")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--v109-report", type=Path, default=DEFAULT_V109_REPORT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "dataset": {key: report["dataset"][key] for key in ("oofRows", "cachedRows", "invalidRows")},
        "baseline": report["baseline"], "candidate": report["candidate"],
        "accepted": [item for item in report["pairs"] if item["accepted"]],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
