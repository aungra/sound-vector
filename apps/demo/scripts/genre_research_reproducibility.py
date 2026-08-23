"""Hash research code, inputs, and runtime so score reports are reproducible."""

from __future__ import annotations

import hashlib
import platform
import sys
from pathlib import Path

import numpy as np
import sklearn


SCHEMA_VERSION = "mmfr.genre-research-reproducibility.v1"


def sha256_file(path):
    path = Path(path).resolve()
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact(path, root=None):
    path = Path(path).resolve()
    stat = path.stat()
    display_path = str(path)
    if root is not None:
        try:
            display_path = str(path.relative_to(Path(root).resolve()))
        except ValueError:
            pass
    return {
        "path": display_path,
        "resolvedPath": str(path),
        "bytes": stat.st_size,
        "sha256": sha256_file(path),
    }


def build_reproducibility(
    script, *, dependencies=(), inputs=(), contract=None, root=None,
):
    return {
        "schemaVersion": SCHEMA_VERSION,
        "script": artifact(script, root),
        "dependencies": [artifact(path, root) for path in dependencies],
        "inputs": [artifact(path, root) for path in inputs],
        "runtime": {
            "python": platform.python_version(),
            "implementation": platform.python_implementation(),
            "executable": str(Path(sys.executable).resolve()),
            "numpy": np.__version__,
            "sklearn": sklearn.__version__,
            "platform": platform.platform(),
        },
        "contract": contract or {},
    }


def verify_reproducibility(record):
    mismatches = []
    for group in ("script", "dependencies", "inputs"):
        rows = [record[group]] if group == "script" else record.get(group, [])
        for row in rows:
            path = Path(row.get("resolvedPath") or row["path"])
            if not path.exists():
                mismatches.append({"path": str(path), "reason": "missing"})
                continue
            current = sha256_file(path)
            if current != row["sha256"]:
                mismatches.append({
                    "path": str(path),
                    "reason": "sha256-mismatch",
                    "expected": row["sha256"],
                    "actual": current,
                })
    return mismatches
