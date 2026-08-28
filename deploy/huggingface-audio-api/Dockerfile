FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg libsndfile1 python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ["apps/demo/MUSIC MEMORY FITTING ROOM.html", "/app/apps/demo/MUSIC MEMORY FITTING ROOM.html"]
COPY apps/demo/scripts/ /app/apps/demo/scripts/
COPY genre-training/ /app/genre-training/
COPY deploy/huggingface-audio-api/ /app/deploy/huggingface-audio-api/

RUN pip3 install --no-cache-dir --break-system-packages \
    -r /app/deploy/huggingface-audio-api/requirements.txt \
  && pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp

RUN mkdir -p /app/runtime-assets

ENV MMFR_AUDIO_HOST=0.0.0.0 \
    MMFR_AUDIO_PORT=7860 \
    MMFR_RUNTIME_ASSET_ROOT=/app/runtime-assets \
    MMFR_PUBLIC_MODE=1 \
    MMFR_ALLOWED_ORIGINS=https://aun-graphic.jp,https://www.aun-graphic.jp \
    MMFR_ANALYSIS_SECONDS=120 \
    MMFR_PUBLIC_MAX_CONCURRENT=1 \
    MMFR_PUBLIC_RATE_LIMIT=4 \
    MMFR_PUBLIC_RATE_WINDOW_MS=600000 \
    MMFR_EMBEDDING_GENRE_ENABLED=1 \
    MMFR_EMBEDDING_GENRE_LIVE_ENABLED=1 \
    MMFR_EMBEDDING_PYTHON=/usr/bin/python3 \
    MMFR_EMBEDDING_GENRE_MODEL_PATH=/app/runtime-assets/classifiers/embedding-genre-model.pkl \
    MMFR_JAPANESE_VOCAL_MODEL_PATH=/app/runtime-assets/models/faster-whisper-large-v3-turbo \
    MMFR_MODEL_ROOT=/app/runtime-assets/models \
    MMFR_UNKNOWN65_MODEL_PATH=/app/runtime-assets/classifiers/unknown65-exhibition-safe-v1.pkl \
    MMFR_UNKNOWN80_TRACK_PAIR_MODEL_PATH=/app/runtime-assets/classifiers/unknown80-track-pair-v113-candidate.pkl \
    MMFR_UNKNOWN80_MUSICFM_MODEL_PATH=/app/runtime-assets/classifiers/unknown80-musicfm-top3-v114-candidate.pkl \
    MMFR_UNKNOWN65_PYTHON=/usr/bin/python3 \
    MMFR_MUSICFM_PYTHON=/usr/bin/python3 \
    MMFR_MUSICFM_MODEL_PATH=/app/runtime-assets/models/musicfm-inference-msd \
    MMFR_TORCH_HOME=/app/runtime-assets/models/torch \
    MMFR_ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER=0 \
    MMFR_ENABLE_UNKNOWN80_MUSICFM_RERANKER=1 \
    MMFR_ENABLE_UNKNOWN65_RERANKER=1 \
    MMFR_YTDLP_COOKIES_FROM_BROWSER=

EXPOSE 7860

ENTRYPOINT ["/app/deploy/huggingface-audio-api/entrypoint.sh"]
