FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 python3-pip \
  && pip3 install --no-cache-dir --break-system-packages yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ["apps/demo/MUSIC MEMORY FITTING ROOM.html", "/app/apps/demo/MUSIC MEMORY FITTING ROOM.html"]
COPY apps/demo/scripts/ /app/apps/demo/scripts/

RUN mkdir -p /app/genre-training \
  && curl --fail --show-error --location \
    https://aun-graphic.jp/sound-form/genre-training/genre-model.json \
    --output /app/genre-training/genre-model.json

ENV MMFR_AUDIO_HOST=0.0.0.0 \
    MMFR_AUDIO_PORT=7860 \
    MMFR_PUBLIC_MODE=1 \
    MMFR_ALLOWED_ORIGINS=https://aun-graphic.jp,https://www.aun-graphic.jp \
    MMFR_ANALYSIS_SECONDS=90 \
    MMFR_PUBLIC_MAX_CONCURRENT=1 \
    MMFR_PUBLIC_RATE_LIMIT=4 \
    MMFR_PUBLIC_RATE_WINDOW_MS=600000 \
    MMFR_EMBEDDING_GENRE_ENABLED=0 \
    MMFR_EMBEDDING_GENRE_LIVE_ENABLED=0 \
    MMFR_YTDLP_COOKIES_FROM_BROWSER=

EXPOSE 7860

CMD ["node", "apps/demo/scripts/audio-analysis-server.mjs"]
