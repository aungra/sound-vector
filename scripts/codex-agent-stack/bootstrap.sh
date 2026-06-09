#!/usr/bin/env bash
set -euo pipefail

TARGET_PROJECT="${1:-$PWD}"
SOURCE_DIR="${SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
DRY_RUN=0
RUN_INSTALL=0
INSTALL_ARGS=(--all --dry-run)

usage() {
  cat <<'EOF'
Usage: bootstrap.sh [target-project] [options]

Copies this codex-agent-stack package into another project.

Examples:
  bash scripts/codex-agent-stack/bootstrap.sh /path/to/project
  bash scripts/codex-agent-stack/bootstrap.sh /path/to/project --run-install
  SOURCE_DIR=/path/to/codex-agent-stack bash bootstrap.sh /path/to/project

Options:
  --dry-run       Print copy/install commands without changing files
  --run-install   Run install.sh after copying; defaults to --all --dry-run
  --              Pass the remaining arguments to install.sh when --run-install is set
  -h, --help      Show this help
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "$#" -gt 0 ] && [ "${1#-}" = "$1" ]; then
  TARGET_PROJECT="$1"
  shift
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --run-install)
      RUN_INSTALL=1
      shift
      ;;
    --)
      shift
      INSTALL_ARGS=("$@")
      break
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  if [ "$DRY_RUN" -eq 0 ]; then
    "$@"
  fi
}

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if [ ! -f "$SOURCE_DIR/install.sh" ]; then
  echo "install.sh not found in source directory: $SOURCE_DIR" >&2
  exit 1
fi

DEST_DIR="$TARGET_PROJECT/scripts/codex-agent-stack"

echo "Codex agent stack bootstrap"
echo "SOURCE_DIR=$SOURCE_DIR"
echo "TARGET_PROJECT=$TARGET_PROJECT"
echo "DEST_DIR=$DEST_DIR"

run mkdir -p "$TARGET_PROJECT/scripts"
if [ "$DRY_RUN" -eq 0 ] && [ -d "$DEST_DIR" ]; then
  echo "Destination already exists; files may be overwritten: $DEST_DIR"
fi
run cp -R "$SOURCE_DIR" "$TARGET_PROJECT/scripts/"

if [ "$RUN_INSTALL" -eq 1 ]; then
  run bash "$DEST_DIR/install.sh" "${INSTALL_ARGS[@]}"
fi

cat <<EOF

Done.

Next:
  cd "$TARGET_PROJECT"
  bash scripts/codex-agent-stack/install.sh --all --dry-run
  bash scripts/codex-agent-stack/install.sh --all
EOF
