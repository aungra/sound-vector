#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

EXTERNAL_DIR="${1:-${MMFR_GENRE_CACHE_EXTERNAL_DIR:-/Volumes/20251005_12TBskyhawk/MUSICTee-cache}}"

echo "Moving genre cache to:"
echo "$EXTERNAL_DIR"
echo

npm run genre-cache:externalize -- "$EXTERNAL_DIR"

echo
echo "Done. Future genre training will read genre-training/cache-paths.local.json automatically."
echo "Press return to close."
read -r _
