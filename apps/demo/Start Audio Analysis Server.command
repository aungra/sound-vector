#!/bin/bash
cd "$(dirname "$0")"
echo "MUSIC MEMORY FITTING ROOM"
echo "Starting audio analysis server..."
echo
node scripts/audio-analysis-server.mjs
