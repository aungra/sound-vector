#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

RWC_DIR="${MMFR_RWC_DOWNLOAD_DIR:-/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/rwc}"
ZIP_PATH="$RWC_DIR/RWC-P.zip"
EXTRACT_DIR="$RWC_DIR/RWC-MDB-P-2001"

echo "RWC Popular Music Database download"
echo "ZIP: $ZIP_PATH"
echo "The downloader is resumable and stores partial chunks under:"
echo "$RWC_DIR/RWC-P.zip.parts"
echo

MMFR_RWC_DOWNLOAD_DIR="$RWC_DIR" \
MMFR_RWC_PARALLEL="${MMFR_RWC_PARALLEL:-8}" \
node apps/demo/scripts/download-rwc-popular.mjs

echo
echo "Unzipping to:"
echo "$EXTRACT_DIR"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"

echo
echo "Done. Next, double-click:"
echo "apps/demo/Import RWC Popular Audio.command"
echo
echo "Press return to close."
read -r _ || true
