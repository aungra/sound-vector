#!/bin/bash
cd "$(dirname "$0")/../.."
echo "MUSIC MEMORY FITTING ROOM"
echo "Install YouTube cookies.txt"
echo
echo "A file picker will open. Select an exported YouTube cookies.txt file."
echo "It will be copied to: genre-training/youtube-cookies.txt"
echo

COOKIE_FILE=$(osascript <<'APPLESCRIPT'
try
  set chosenFile to choose file with prompt "Select exported YouTube cookies.txt"
  POSIX path of chosenFile
on error
  return ""
end try
APPLESCRIPT
)

if [ -z "$COOKIE_FILE" ]; then
  echo "No file selected."
  echo
  echo "Press return to close."
  read
  exit 1
fi

mkdir -p genre-training
cp "$COOKIE_FILE" genre-training/youtube-cookies.txt
chmod 600 genre-training/youtube-cookies.txt

echo "Installed:"
ls -l genre-training/youtube-cookies.txt
echo
echo "Restart the audio server after installing cookies."
echo "Press return to close."
read
