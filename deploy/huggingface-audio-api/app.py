#!/usr/bin/env python3
"""Boot the production Node analysis server inside a Gradio Space."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import spaces


ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "deploy" / "huggingface-audio-api"
RUNTIME_ASSETS = ROOT / "runtime-assets"
SERVER = ROOT / "apps" / "demo" / "scripts" / "audio-analysis-server.mjs"


@spaces.GPU(duration=1)
def zero_gpu_startup_probe() -> bool:
    """Declare ZeroGPU compatibility; production inference remains CPU-bound."""
    return True


def runtime_environment() -> dict[str, str]:
    env = os.environ.copy()
    defaults = {
        "MMFR_AUDIO_HOST": "0.0.0.0",
        "MMFR_AUDIO_PORT": env.get("PORT", "7860"),
        "MMFR_RUNTIME_ASSET_ROOT": str(RUNTIME_ASSETS),
        "MMFR_PUBLIC_MODE": "1",
        "MMFR_ALLOWED_ORIGINS": "https://aun-graphic.jp,https://www.aun-graphic.jp",
        "MMFR_ANALYSIS_SECONDS": "120",
        "MMFR_GENRE_INFERENCE_REVISION": "unknown80-track-pair-v113-candidate",
        "MMFR_PUBLIC_MAX_CONCURRENT": "1",
        "MMFR_PUBLIC_RATE_LIMIT": "4",
        "MMFR_PUBLIC_RATE_WINDOW_MS": "600000",
        "MMFR_EMBEDDING_GENRE_ENABLED": "1",
        "MMFR_EMBEDDING_GENRE_LIVE_ENABLED": "1",
        "MMFR_EMBEDDING_PYTHON": shutil.which("python3") or "/usr/bin/python3",
        "MMFR_EMBEDDING_GENRE_MODEL_PATH": str(
            RUNTIME_ASSETS / "classifiers" / "embedding-genre-model.pkl"
        ),
        "MMFR_JAPANESE_VOCAL_MODEL_PATH": str(
            RUNTIME_ASSETS / "models" / "faster-whisper-large-v3-turbo"
        ),
        "MMFR_MODEL_ROOT": str(RUNTIME_ASSETS / "models"),
        "MMFR_UNKNOWN65_MODEL_PATH": str(
            RUNTIME_ASSETS / "classifiers" / "unknown65-exhibition-safe-v1.pkl"
        ),
        "MMFR_UNKNOWN80_TRACK_PAIR_MODEL_PATH": str(
            RUNTIME_ASSETS / "classifiers" / "unknown80-track-pair-v113-candidate.pkl"
        ),
        "MMFR_UNKNOWN80_MUSICFM_MODEL_PATH": str(
            RUNTIME_ASSETS / "classifiers" / "unknown80-musicfm-top3-v114-candidate.pkl"
        ),
        "MMFR_UNKNOWN65_PYTHON": shutil.which("python3") or "/usr/bin/python3",
        "MMFR_MUSICFM_PYTHON": shutil.which("python3") or "/usr/bin/python3",
        "MMFR_MUSICFM_MODEL_PATH": str(
            RUNTIME_ASSETS / "models" / "musicfm-inference-msd"
        ),
        "MMFR_TORCH_HOME": str(RUNTIME_ASSETS / "models" / "torch"),
        "MMFR_ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER": "0",
        "MMFR_ENABLE_UNKNOWN80_MUSICFM_RERANKER": "1",
        "MMFR_ENABLE_UNKNOWN65_RERANKER": "1",
        "MMFR_LOCAL_GENRE_MODEL_PATH": str(
            RUNTIME_ASSETS / "classifiers" / "local-genre-model.json"
        ),
        "MMFR_YTDLP_COOKIES_FROM_BROWSER": "",
    }
    for key, value in defaults.items():
        env.setdefault(key, value)
    return env


def main() -> None:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("The Space image does not provide Node.js.")
    env = runtime_environment()
    subprocess.run(
        [node, str(DEPLOY / "prepare-runtime-assets.mjs")],
        check=True,
        env=env,
    )
    subprocess.run(
        [node, str(DEPLOY / "verify-runtime-bundle.mjs"), str(RUNTIME_ASSETS)],
        check=True,
        env=env,
    )
    os.execvpe(node, [node, str(SERVER)], env)


if __name__ == "__main__":
    main()
