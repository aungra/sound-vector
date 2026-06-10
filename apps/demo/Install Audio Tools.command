#!/bin/bash
set -e

cd "$(dirname "$0")"

TOOLS_DIR=".tools/bin"
TMP_DIR=".tools/tmp"
mkdir -p "$TOOLS_DIR" "$TMP_DIR"

echo "MUSIC MEMORY FITTING ROOM"
echo "Installing local audio analysis tools..."
echo "No administrator password is required."
echo

echo "1/2 Downloading yt-dlp..."
if [ -x "$HOME/.local/bin/python3.11" ]; then
  PYTHON="$HOME/.local/bin/python3.11"
else
  PYTHON="python3"
fi
"$PYTHON" -m pip install --target .tools/python --upgrade yt-dlp
cat > "$TOOLS_DIR/yt-dlp-local" <<'EOF'
#!/bin/bash
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -x "$HOME/.local/bin/python3.11" ]; then
  PYTHON="$HOME/.local/bin/python3.11"
else
  PYTHON="python3"
fi
PYTHONPATH="$ROOT_DIR/.tools/python" exec "$PYTHON" -m yt_dlp "$@"
EOF
chmod +x "$TOOLS_DIR/yt-dlp-local"

echo
echo "2/2 Downloading ffmpeg..."
curl -L --fail --progress-bar \
  "https://evermeet.cx/ffmpeg/getrelease/zip" \
  -o "$TMP_DIR/ffmpeg.zip"
unzip -o "$TMP_DIR/ffmpeg.zip" -d "$TOOLS_DIR"
chmod +x "$TOOLS_DIR/ffmpeg"

echo
echo "Installed:"
"$TOOLS_DIR/yt-dlp-local" --version
"$TOOLS_DIR/ffmpeg" -version | head -n 1

echo
echo "Done. Restart this file next:"
echo "Start Audio Analysis Server.command"
echo
read -p "Press return to close."
