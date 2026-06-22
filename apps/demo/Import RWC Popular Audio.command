#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

DEFAULT_ROOT="/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/rwc/RWC-MDB-P-2001"
RWC_AUDIO_ROOT="${1:-${MMFR_RWC_AUDIO_ROOT:-$DEFAULT_ROOT}}"
SERVER_URL="${MMFR_AUDIO_HEALTH_URL:-http://127.0.0.1:4194/health}"
SERVER_LOG="$RWC_AUDIO_ROOT/audio-server-import.log"
MANIFEST_PATH="$PWD/genre-training/rwc-popular-cc-source-manifest.json"

echo "RWC Popular Music Database formal-audio import"
echo "Audio root: $RWC_AUDIO_ROOT"
echo "Manifest:   $MANIFEST_PATH"
echo

if [ ! -d "$RWC_AUDIO_ROOT" ]; then
  echo "RWC audio folder was not found."
  echo
  echo "Place the user-acquired RWC Popular Music Database audio outside this repo, for example:"
  echo "$DEFAULT_ROOT"
  echo
  echo "Or run this command with a folder path:"
  echo "apps/demo/Import RWC Popular Audio.command /Volumes/DRIVE/RWC-MDB-P-2001"
  echo
  echo "Press return to close."
  read -r _
  exit 1
fi

echo "Generating RWC manifest..."
npm --prefix apps/demo run rwc-popular-manifest -- "$RWC_AUDIO_ROOT"

echo
echo "Checking manifest audit..."
MMFR_CC_AUDIT_MANIFESTS="$MANIFEST_PATH" npm --prefix apps/demo run cc-manifest:audit

echo
echo "Checking audio server..."
HEALTH_JSON="$(curl -fsS "$SERVER_URL" 2>/dev/null || true)"
if ! printf '%s' "$HEALTH_JSON" | grep -q '"ffmpeg": true'; then
  echo "Audio server is not ready with ffmpeg. Restarting local server..."
  EXISTING_PID="$(lsof -nP -iTCP:4194 -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2}')"
  if [ -n "$EXISTING_PID" ]; then
    kill "$EXISTING_PID" 2>/dev/null || true
    sleep 1
  fi
  mkdir -p "$(dirname "$SERVER_LOG")"
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
MMFR_CC_IMPORT_DRY_RUN=1 npm --prefix apps/demo run rwc-popular-import

echo
echo "Starting formal feature import..."
npm --prefix apps/demo run rwc-popular-import

echo
echo "Rebuilding formal cached genre model and reports..."
npm --prefix apps/demo run genre-train:formal-cached
npm --prefix apps/demo run genre-split-audit
npm --prefix apps/demo run genre-diversity-audit
npm --prefix apps/demo run genre-goal-report
npm --prefix apps/demo run genre-improvement-plan

echo
echo "Done. Review:"
echo "genre-training/rwc-popular-cc-source-manifest.json"
echo "genre-training/cc-source-import-report.json"
echo "genre-training/goal-report.json"
echo "genre-training/genre-improvement-plan.md"
echo
echo "Press return to close."
read -r _
