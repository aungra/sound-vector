#!/bin/bash
cd "$(dirname "$0")"
echo "MUSIC MEMORY FITTING ROOM"
echo "Checking YouTube cookie access..."
echo
node scripts/youtube-cookie-check.mjs
echo
echo "Press return to close."
read
