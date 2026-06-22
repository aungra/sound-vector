#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

EXTERNAL_DIR="${MMFR_EXTERNAL_DATA_DIR:-/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data}"
MTG_DIR="$EXTERNAL_DIR/mtg-jamendo"
TOOLS_DIR="$MTG_DIR/mtg-jamendo-dataset-tools"
AUDIO_ROOT="$MTG_DIR/raw_30s/audio-low"

echo "MTG-Jamendo raw_30s/audio-low downloader"
echo
echo "Target:"
echo "$AUDIO_ROOT"
echo
echo "This dataset is large. The official README lists raw_30s/audio-low at about 156 GB."
echo "Audio will be stored outside the repository."
echo
echo "Type DOWNLOAD to continue, or press return to cancel:"
read -r CONFIRM

if [ "$CONFIRM" != "DOWNLOAD" ]; then
  echo "Cancelled."
  echo "Press return to close."
  read -r _ || true
  exit 0
fi

mkdir -p "$MTG_DIR"

if [ ! -d "$TOOLS_DIR/.git" ]; then
  git clone https://github.com/MTG/mtg-jamendo-dataset.git "$TOOLS_DIR"
fi

cd "$TOOLS_DIR"

python3 scripts/download/download.py \
  --dataset raw_30s \
  --type audio-low \
  --from mtg-fast \
  --unpack \
  --remove \
  "$MTG_DIR"

cd "$(dirname "$0")/../.."

npm --prefix apps/demo run mtg-audio-plan
npm --prefix apps/demo run cc-manifest:mtg-jamendo -- "$AUDIO_ROOT"

echo
echo "MTG-Jamendo audio download/preparation complete."
echo "Next commands:"
echo "npm --prefix apps/demo run cc-import"
echo "npm --prefix apps/demo run genre-train:cached"
echo "npm --prefix apps/demo run genre-goal-report"
echo "npm --prefix apps/demo run genre-improvement-plan"
echo
echo "Press return to close."
read -r _ || true
