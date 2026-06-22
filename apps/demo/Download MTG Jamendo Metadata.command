#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

EXTERNAL_DIR="${MMFR_EXTERNAL_DATA_DIR:-/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data}"
MTG_DIR="$EXTERNAL_DIR/mtg-jamendo"
DATA_DIR="$MTG_DIR/data"

mkdir -p "$DATA_DIR"

echo "Downloading MTG-Jamendo metadata to:"
echo "$MTG_DIR"
echo

curl -L -C - -o "$DATA_DIR/autotagging_genre.tsv" \
  "https://raw.githubusercontent.com/MTG/mtg-jamendo-dataset/master/data/autotagging_genre.tsv"

curl -L -C - -o "$DATA_DIR/raw.meta.tsv" \
  "https://raw.githubusercontent.com/MTG/mtg-jamendo-dataset/master/data/raw.meta.tsv"

curl -L -C - -o "$MTG_DIR/audio_licenses.txt" \
  "https://raw.githubusercontent.com/MTG/mtg-jamendo-dataset/master/audio_licenses.txt"

echo
echo "Metadata download complete."
echo "Put MTG-Jamendo audio outside the repo, then run:"
echo "npm --prefix apps/demo run cc-manifest:mtg-jamendo -- /path/to/mtg-jamendo/audio-root"
echo
echo "Press return to close."
read -r _ || true
