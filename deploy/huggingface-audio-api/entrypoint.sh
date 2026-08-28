#!/bin/sh
set -eu

node /app/deploy/huggingface-audio-api/prepare-runtime-assets.mjs
node /app/deploy/huggingface-audio-api/verify-runtime-bundle.mjs "${MMFR_RUNTIME_ASSET_ROOT:-/app/runtime-assets}"
exec node /app/apps/demo/scripts/audio-analysis-server.mjs
