#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

EXTERNAL_DIR="${MMFR_EXTERNAL_DATA_DIR:-/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data}"
FMA_DIR="$EXTERNAL_DIR/fma"
ZIP_PATH="$FMA_DIR/fma_small.zip"
AUDIO_ROOT="$FMA_DIR/fma_small"
TRACKS_CSV="$FMA_DIR/fma_metadata/tracks.csv"
EXPECTED_SHA1="ade154f733639d52e35e32f5593efe5be76c6d70"
SERVER_URL="${MMFR_AUDIO_HEALTH_URL:-http://127.0.0.1:4194/health}"
SERVER_LOG="$FMA_DIR/audio-server-import.log"

echo "FMA Small formal-audio import"
echo "ZIP:        $ZIP_PATH"
echo "Audio root: $AUDIO_ROOT"
echo "Tracks CSV: $TRACKS_CSV"
echo

if [ ! -f "$ZIP_PATH" ]; then
  echo "Missing ZIP. Download it first:"
  echo "apps/demo/Download FMA Small.command"
  exit 1
fi

echo "Verifying ZIP SHA1..."
ACTUAL_SHA1="$(shasum -a 1 "$ZIP_PATH" | awk '{print $1}')"
if [ "$ACTUAL_SHA1" != "$EXPECTED_SHA1" ]; then
  echo "SHA1 mismatch."
  echo "Expected: $EXPECTED_SHA1"
  echo "Actual:   $ACTUAL_SHA1"
  echo
  echo "The ZIP is probably still incomplete. Re-run:"
  echo "apps/demo/Download FMA Small.command"
  exit 1
fi

if [ ! -d "$AUDIO_ROOT" ]; then
  echo "Unzipping FMA Small to external drive..."
  unzip "$ZIP_PATH" -d "$FMA_DIR"
fi

if [ ! -f "$TRACKS_CSV" ]; then
  echo "Missing FMA metadata CSV:"
  echo "$TRACKS_CSV"
  echo "Expected fma_metadata to already exist under the external cache."
  exit 1
fi

echo "Checking audio server..."
HEALTH_JSON="$(curl -fsS "$SERVER_URL" 2>/dev/null || true)"
if ! printf '%s' "$HEALTH_JSON" | grep -q '"ffmpeg": true'; then
  echo "Audio server is not ready with ffmpeg. Restarting local server..."
  EXISTING_PID="$(lsof -nP -iTCP:4194 -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2}')"
  if [ -n "$EXISTING_PID" ]; then
    kill "$EXISTING_PID" 2>/dev/null || true
    sleep 1
  fi
  FFMPEG_PATH="$PWD/.tools/bin/ffmpeg" \
  YT_DLP_PATH="$PWD/.tools/bin/yt-dlp-local" \
  npm --prefix apps/demo run audio-server >"$SERVER_LOG" 2>&1 &
  SERVER_PID="$!"
  for _ in $(seq 1 20); do
    sleep 1
    HEALTH_JSON="$(curl -fsS "$SERVER_URL" 2>/dev/null || true)"
    if printf '%s' "$HEALTH_JSON" | grep -q '"ffmpeg": true'; then
      break
    fi
  done
  if ! printf '%s' "$HEALTH_JSON" | grep -q '"ffmpeg": true'; then
    echo "Audio server failed to start with ffmpeg."
    echo "Log: $SERVER_LOG"
    kill "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
fi
echo "Audio server ready."

echo
echo "Dry-run import check..."
MMFR_CC_IMPORT_DRY_RUN=1 \
MMFR_CC_IMPORT_LIMIT_TOTAL="${MMFR_CC_IMPORT_LIMIT_TOTAL:-30}" \
MMFR_CC_MANIFEST_PATH="$TRACKS_CSV" \
MMFR_CC_AUDIO_ROOT="$AUDIO_ROOT" \
npm --prefix apps/demo run cc-import:fma

echo
echo "Starting formal feature import..."
MMFR_CC_MANIFEST_PATH="$TRACKS_CSV" \
MMFR_CC_AUDIO_ROOT="$AUDIO_ROOT" \
npm --prefix apps/demo run cc-import:fma

echo
echo "Rebuilding genre model and reports..."
npm --prefix apps/demo run cc-manifest:audit
npm --prefix apps/demo run genre-train:cached
npm --prefix apps/demo run genre-split-audit
npm --prefix apps/demo run genre-diversity-audit
npm --prefix apps/demo run genre-goal-report
npm --prefix apps/demo run genre-improvement-plan

echo
echo "Done. Review:"
echo "genre-training/goal-report.json"
echo "genre-training/genre-improvement-plan.md"
echo
echo "Press return to close."
read -r _
