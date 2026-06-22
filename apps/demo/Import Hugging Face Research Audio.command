#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "MUSICTee research-audio import"
echo
echo "Before running this command, open and accept the dataset terms:"
echo "  jaCappella:  https://huggingface.co/datasets/jaCappella/jaCappella"
echo "  IdolSongsJp: https://huggingface.co/datasets/imprt/idol-songs-jp"
echo

if [ -z "${HF_TOKEN:-}" ]; then
  if [ -f "$HOME/.cache/huggingface/token" ]; then
    export HF_TOKEN="$(cat "$HOME/.cache/huggingface/token")"
  else
    read -r -s -p "Paste Hugging Face access token: " HF_TOKEN
    echo
    export HF_TOKEN
  fi
fi

echo
echo "Downloading jaCappella mixture WAV files to the external cache..."
npm --prefix apps/demo run jacappella-download

echo
echo "Downloading IdolSongsJp master WAV files to the external cache..."
MMFR_IDOLSONGSJP_DOWNLOAD=1 npm --prefix apps/demo run idolsongsjp-manifest

echo
echo "Starting local audio analysis server..."
MMFR_AUDIO_PORT=4195 \
FFMPEG_PATH="$PWD/.tools/bin/ffmpeg" \
YT_DLP_PATH="$PWD/.tools/bin/yt-dlp-local" \
npm --prefix apps/demo run audio-server &
SERVER_PID=$!
trap 'kill "$SERVER_PID" >/dev/null 2>&1 || true' EXIT

for i in $(seq 1 30); do
  if curl -sS "http://127.0.0.1:4195/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo
echo "Importing jaCappella features only..."
MMFR_AUDIO_ENDPOINT="http://127.0.0.1:4195/api/audio-analyze" \
MMFR_CC_MANIFEST_PATH="$PWD/genre-training/jacappella-source-manifest.json" \
MMFR_CC_WEAK_ONLY=0 \
MMFR_CC_LIMIT_PER_GENRE=140 \
npm --prefix apps/demo run cc-import

echo
echo "Importing IdolSongsJp features only..."
MMFR_AUDIO_ENDPOINT="http://127.0.0.1:4195/api/audio-analyze" \
MMFR_CC_MANIFEST_PATH="$PWD/genre-training/idolsongsjp-source-manifest.json" \
MMFR_CC_WEAK_ONLY=0 \
MMFR_CC_LIMIT_PER_GENRE=140 \
npm --prefix apps/demo run cc-import

echo
echo "Retraining formal cached genre model..."
MMFR_AUDIO_ENDPOINT="http://127.0.0.1:4195/api/audio-analyze" \
npm --prefix apps/demo run genre-train:formal-cached

echo
echo "Writing goal report..."
npm --prefix apps/demo run genre-goal-report

echo
echo "Done."
