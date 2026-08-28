#!/usr/bin/env python3
"""Expose the production Node analysis server through a ZeroGPU Gradio Space."""

from __future__ import annotations

import atexit
import os
import shutil
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

import gradio as gr
import httpx
import spaces
import spaces.zero as spaces_zero
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response


APP_PATH = Path(__file__).resolve()
ROOT = next(
    (
        candidate
        for candidate in (APP_PATH.parent, *APP_PATH.parents)
        if (candidate / "apps" / "demo" / "scripts" / "audio-analysis-server.mjs").is_file()
    ),
    APP_PATH.parents[2],
)
DEPLOY = ROOT / "deploy" / "huggingface-audio-api"
RUNTIME_ASSETS = ROOT / "runtime-assets"
SERVER = ROOT / "apps" / "demo" / "scripts" / "audio-analysis-server.mjs"
BACKEND_PORT = 4194
BACKEND_ORIGIN = f"http://127.0.0.1:{BACKEND_PORT}"
PUBLIC_ORIGINS = {"https://aun-graphic.jp", "https://www.aun-graphic.jp"}
STATE_LOCK = threading.Lock()
STATE = {"stage": "space-starting", "ready": False, "error": ""}
BACKEND_PROCESS: subprocess.Popen | None = None


@spaces.GPU(duration=1)
def zero_gpu_startup_probe() -> str:
    """Declare ZeroGPU compatibility; production inference remains CPU-bound."""
    return "MUSICTee Sound Form API"


demo = gr.Interface(
    fn=zero_gpu_startup_probe,
    inputs=[],
    outputs=gr.Textbox(label="Service"),
    title="MUSICTee Sound Form API",
)
api = FastAPI()


def state_snapshot() -> dict[str, object]:
    with STATE_LOCK:
        return dict(STATE)


def update_state(**changes: object) -> None:
    with STATE_LOCK:
        STATE.update(changes)


def cors_headers(origin: str | None) -> dict[str, str]:
    if origin not in PUBLIC_ORIGINS:
        return {}
    return {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        "vary": "Origin",
    }


async def proxy_to_backend(request: Request) -> Response:
    state = state_snapshot()
    origin = request.headers.get("origin")
    if not state["ready"]:
        return JSONResponse(
            {
                "ok": False,
                "service": "MUSICTee Sound Form API",
                "stage": state["stage"],
                "error": state["error"],
                "retryAfterSeconds": 30,
            },
            status_code=503,
            headers=cors_headers(origin),
        )
    body = await request.body()
    headers = {
        key: value for key, value in request.headers.items()
        if key.lower() not in {"host", "content-length", "connection"}
    }
    async with httpx.AsyncClient(timeout=300) as client:
        upstream = await client.request(
            request.method,
            f"{BACKEND_ORIGIN}{request.url.path}",
            params=request.query_params,
            content=body,
            headers=headers,
        )
    response_headers = {
        key: value for key, value in upstream.headers.items()
        if key.lower() in {
            "content-type",
            "access-control-allow-origin",
            "access-control-allow-methods",
            "access-control-allow-headers",
            "vary",
        }
    }
    response_headers.update(cors_headers(origin))
    return Response(content=upstream.content, status_code=upstream.status_code, headers=response_headers)


@api.api_route("/health", methods=["GET", "OPTIONS"])
@api.api_route("/api/audio-analyze", methods=["POST", "OPTIONS"])
async def analysis_proxy(request: Request) -> Response:
    if request.method == "OPTIONS":
        return Response(status_code=204, headers=cors_headers(request.headers.get("origin")))
    return await proxy_to_backend(request)


app = gr.mount_gradio_app(api, demo, path="/")


def report_zero_gpu_startup() -> None:
    """Complete the ZeroGPU handshake when Uvicorn owns the app lifecycle."""
    startup = getattr(spaces_zero, "startup", None)
    if callable(startup):
        startup()


def runtime_environment() -> dict[str, str]:
    env = os.environ.copy()
    defaults = {
        "MMFR_AUDIO_HOST": "127.0.0.1",
        "MMFR_AUDIO_PORT": str(BACKEND_PORT),
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
        "MMFR_YTDLP_IMPERSONATE_TARGETS": "Chrome-133:Macos-15,Safari-18.4:Macos-15",
    }
    for key, value in defaults.items():
        env.setdefault(key, value)
    return env


def prepare_backend() -> None:
    global BACKEND_PROCESS
    node = shutil.which("node")
    if not node:
        update_state(stage="runtime-error", error="The Space image does not provide Node.js.")
        return
    try:
        env = runtime_environment()
        update_state(stage="downloading-runtime")
        subprocess.run([node, str(DEPLOY / "prepare-runtime-assets.mjs")], check=True, env=env)
        update_state(stage="verifying-runtime")
        subprocess.run(
            [node, str(DEPLOY / "verify-runtime-bundle.mjs"), str(RUNTIME_ASSETS)],
            check=True,
            env=env,
        )
        update_state(stage="starting-analysis-server")
        BACKEND_PROCESS = subprocess.Popen([node, str(SERVER)], env=env)
        for _attempt in range(180):
            if BACKEND_PROCESS.poll() is not None:
                raise RuntimeError(f"Analysis server exited with code {BACKEND_PROCESS.returncode}.")
            try:
                with urllib.request.urlopen(f"{BACKEND_ORIGIN}/health", timeout=2) as response:
                    if response.status == 200:
                        update_state(stage="ready", ready=True, error="")
                        BACKEND_PROCESS.wait()
                        update_state(
                            stage="runtime-error",
                            ready=False,
                            error=f"Analysis server exited with code {BACKEND_PROCESS.returncode}.",
                        )
                        return
            except OSError:
                time.sleep(1)
        raise RuntimeError("Analysis server did not become healthy within 180 seconds.")
    except Exception as error:
        update_state(stage="runtime-error", ready=False, error=str(error)[-500:])


def stop_backend() -> None:
    if BACKEND_PROCESS is not None and BACKEND_PROCESS.poll() is None:
        BACKEND_PROCESS.terminate()


def main() -> None:
    report_zero_gpu_startup()
    threading.Thread(target=prepare_backend, name="mmfr-runtime-prepare", daemon=True).start()
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=7860,
        log_level="info",
    )


if __name__ == "__main__":
    atexit.register(stop_backend)
    main()
