#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

EXTERNAL_DIR="${MMFR_EXTERNAL_DATA_DIR:-/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data}"
FMA_DIR="$EXTERNAL_DIR/fma"
ZIP_PATH="$FMA_DIR/fma_small.zip"
URL="https://os.unil.cloud.switch.ch/fma/fma_small.zip"
EXPECTED_SHA1="ade154f733639d52e35e32f5593efe5be76c6d70"

mkdir -p "$FMA_DIR"

echo "Downloading FMA small to:"
echo "$ZIP_PATH"
echo
echo "This is about 7.2 GiB. It can be stopped and resumed."
echo

curl -L -C - -o "$ZIP_PATH" "$URL"

echo
echo "Verifying SHA1..."
ACTUAL_SHA1="$(shasum -a 1 "$ZIP_PATH" | awk '{print $1}')"
if [ "$ACTUAL_SHA1" != "$EXPECTED_SHA1" ]; then
  echo "SHA1 mismatch."
  echo "Expected: $EXPECTED_SHA1"
  echo "Actual:   $ACTUAL_SHA1"
  exit 1
fi

echo "OK: FMA small zip verified."
echo
echo "Next step:"
echo "unzip \"$ZIP_PATH\" -d \"$FMA_DIR\""
echo
echo "Press return to close."
read -r _
