#!/bin/bash
cd "$(dirname "$0")"
echo "MUSIC MEMORY FITTING ROOM"
echo "Starting audio analysis server with YouTube cookie auto-detection..."
echo "Cookie order: ${MMFR_YTDLP_COOKIES_FROM_BROWSER:-chrome,safari,firefox}"
echo
node scripts/audio-analysis-server.mjs
