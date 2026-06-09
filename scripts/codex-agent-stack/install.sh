#!/usr/bin/env bash
set -euo pipefail

STACK_HOME="${STACK_HOME:-$HOME/.codex-agent-stack}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
INSTALL_HEADROOM=0
INSTALL_HERMES=0
INSTALL_SKILLS=0
INSTALL_GITHUB_MCP=0
INSTALL_PLAYWRIGHT=0
INSTALL_BROWSER=1
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: install.sh [--all] [options]

Installs a reusable Codex agent stack for the current machine:
  1. chopratejas/headroom
  2. NousResearch/hermes-agent
  3. openai/skills
  4. github/github-mcp-server
  5. microsoft/playwright

Options:
  --all              Install every component (default when no component is selected)
  --headroom         Install Headroom into ~/.codex-agent-stack/headroom-env
  --hermes           Install Hermes Agent into ~/.hermes
  --skills           Install selected openai/skills into ~/.codex/skills
  --github-mcp       Register GitHub MCP in Codex config
  --playwright       Install Playwright CLI with npm
  --skip-browser     Skip Playwright Chromium browser download
  --dry-run          Print commands without running them
  -h, --help         Show this help

Environment:
  STACK_HOME         Install root for stack-managed tools (default: ~/.codex-agent-stack)
  CODEX_HOME         Codex home directory (default: ~/.codex)
  GITHUB_PAT_TOKEN   Optional token used by GitHub MCP at runtime; not written by this script
EOF
}

select_all() {
  INSTALL_HEADROOM=1
  INSTALL_HERMES=1
  INSTALL_SKILLS=1
  INSTALL_GITHUB_MCP=1
  INSTALL_PLAYWRIGHT=1
}

if [ "$#" -eq 0 ]; then
  select_all
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --all) select_all ;;
    --headroom) INSTALL_HEADROOM=1 ;;
    --hermes) INSTALL_HERMES=1 ;;
    --skills) INSTALL_SKILLS=1 ;;
    --github-mcp) INSTALL_GITHUB_MCP=1 ;;
    --playwright) INSTALL_PLAYWRIGHT=1 ;;
    --skip-browser) INSTALL_BROWSER=0 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  if [ "$DRY_RUN" -eq 0 ]; then
    "$@"
  fi
}

have() {
  command -v "$1" >/dev/null 2>&1
}

need_cmd() {
  if ! have "$1"; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

detect_codex() {
  if have codex; then
    command -v codex
    return
  fi
  if [ -x "/Applications/Codex.app/Contents/Resources/codex" ]; then
    printf '%s\n' "/Applications/Codex.app/Contents/Resources/codex"
    return
  fi
  echo "codex"
}

detect_npm() {
  if have npm; then
    command -v npm
    return
  fi
  if [ -x "$HOME/.hermes/node/bin/npm" ]; then
    printf '%s\n' "$HOME/.hermes/node/bin/npm"
    return
  fi
  echo "npm"
}

install_headroom() {
  need_cmd python3
  run mkdir -p "$STACK_HOME"
  if [ ! -d "$STACK_HOME/headroom-env" ]; then
    run python3 -m venv "$STACK_HOME/headroom-env"
  fi
  run "$STACK_HOME/headroom-env/bin/python" -m pip install --upgrade pip
  run "$STACK_HOME/headroom-env/bin/python" -m pip install --upgrade "headroom-ai[all]"
  run mkdir -p "$STACK_HOME/bin"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "+ write $STACK_HOME/bin/codex-headroom"
    echo "+ chmod +x $STACK_HOME/bin/codex-headroom"
    return
  fi
  cat >"$STACK_HOME/bin/codex-headroom" <<EOF
#!/usr/bin/env bash
set -euo pipefail
"$STACK_HOME/headroom-env/bin/headroom" wrap codex "\$@"
status=\$?
"$STACK_HOME/headroom-env/bin/headroom" unwrap codex --no-stop-proxy >/dev/null 2>&1 || true
exit "\$status"
EOF
  chmod +x "$STACK_HOME/bin/codex-headroom"
}

install_hermes() {
  need_cmd curl
  tmp_installer="${TMPDIR:-/tmp}/hermes-install.sh"
  run curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh -o "$tmp_installer"
  run bash "$tmp_installer" --skip-setup --skip-browser --non-interactive
}

install_skills() {
  installer="$CODEX_HOME/skills/.system/skill-installer/scripts/install-skill-from-github.py"
  if [ ! -f "$installer" ]; then
    echo "Codex skill installer not found at $installer" >&2
    echo "Install or update Codex first, then rerun --skills." >&2
    exit 1
  fi
  for skill in \
    playwright \
    playwright-interactive \
    screenshot \
    gh-fix-ci \
    gh-address-comments \
    security-best-practices
  do
    if [ -d "$CODEX_HOME/skills/$skill" ]; then
      echo "Skill already installed: $skill"
      continue
    fi
    run python3 "$installer" \
      --repo openai/skills \
      --path "skills/.curated/$skill"
  done
}

install_github_mcp() {
  codex_bin="$(detect_codex)"
  if [ "$DRY_RUN" -eq 0 ] && "$codex_bin" mcp get github >/dev/null 2>&1; then
    echo "GitHub MCP already registered: github"
    return
  fi
  run "$codex_bin" mcp add github \
    --url https://api.githubcopilot.com/mcp/ \
    --bearer-token-env-var GITHUB_PAT_TOKEN
}

install_playwright() {
  npm_bin="$(detect_npm)"
  run "$npm_bin" install -g @playwright/test playwright
  if [ "$INSTALL_BROWSER" -eq 1 ]; then
    if have playwright; then
      playwright_bin="$(command -v playwright)"
    else
      playwright_bin="$(dirname "$npm_bin")/playwright"
    fi
    run "$playwright_bin" install chromium
  fi
}

echo "Codex agent stack installer"
echo "STACK_HOME=$STACK_HOME"
echo "CODEX_HOME=$CODEX_HOME"

[ "$INSTALL_HEADROOM" -eq 1 ] && install_headroom
[ "$INSTALL_HERMES" -eq 1 ] && install_hermes
[ "$INSTALL_SKILLS" -eq 1 ] && install_skills
[ "$INSTALL_GITHUB_MCP" -eq 1 ] && install_github_mcp
[ "$INSTALL_PLAYWRIGHT" -eq 1 ] && install_playwright

cat <<EOF

Done.

Recommended PATH additions:
  export PATH="\$HOME/.local/bin:\$HOME/.hermes/node/bin:\$HOME/.codex-agent-stack/bin:\$PATH"

GitHub MCP runtime auth:
  export GITHUB_PAT_TOKEN="ghp_xxx"

Restart Codex after installing skills or MCP servers.
EOF
