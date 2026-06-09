# Codex Agent Stack

Portable setup for the five agent-support repositories used in this workspace:

1. `chopratejas/headroom`
2. `NousResearch/hermes-agent`
3. `openai/skills`
4. `github/github-mcp-server`
5. `microsoft/playwright`

The package is intentionally global/user-level. It does not add Node, Python, or
MCP files to each project unless you choose to copy this folder there.

## Install Everything

First copy this package into the target project:

```bash
bash /Users/kahanishimoto/Documents/AUNgraphic_WEB/scripts/codex-agent-stack/bootstrap.sh /path/to/project
```

Then run from the target project:

```bash
bash scripts/codex-agent-stack/install.sh --all
```

You can also copy and dry-run in one step:

```bash
bash /Users/kahanishimoto/Documents/AUNgraphic_WEB/scripts/codex-agent-stack/bootstrap.sh /path/to/project --run-install
```

The default install command used by `--run-install` is safe:

```bash
bash scripts/codex-agent-stack/install.sh --all --dry-run
```

To pass custom install arguments:

```bash
bash /Users/kahanishimoto/Documents/AUNgraphic_WEB/scripts/codex-agent-stack/bootstrap.sh /path/to/project --run-install -- --skills --github-mcp
```

## Install Selected Parts

```bash
bash scripts/codex-agent-stack/install.sh --skills --github-mcp
bash scripts/codex-agent-stack/install.sh --playwright
bash scripts/codex-agent-stack/install.sh --headroom
bash scripts/codex-agent-stack/install.sh --hermes
```

Preview without changing anything:

```bash
bash scripts/codex-agent-stack/install.sh --all --dry-run
```

Skip Playwright browser downloads when you only want the CLI:

```bash
bash scripts/codex-agent-stack/install.sh --playwright --skip-browser
```

## What Each Part Adds

### Headroom

Installs `headroom-ai[all]` into:

```txt
~/.codex-agent-stack/headroom-env
```

Adds a helper:

```txt
~/.codex-agent-stack/bin/codex-headroom
```

Use it when you want a Codex session wrapped through Headroom:

```bash
codex-headroom
```

### Hermes Agent

Runs the official Hermes installer from:

```txt
https://raw.githubusercontent.com/NousResearch/hermes-agent/main/install.sh
```

Expected command after install:

```bash
hermes doctor
```

### openai/skills

Installs selected Codex skills into:

```txt
~/.codex/skills
```

Included skills:

- `playwright`
- `playwright-interactive`
- `screenshot`
- `gh-fix-ci`
- `gh-address-comments`
- `security-best-practices`

Restart Codex after installing skills.

### GitHub MCP Server

Registers the remote GitHub MCP endpoint in Codex:

```txt
https://api.githubcopilot.com/mcp/
```

The installer does not write tokens. Set this at runtime:

```bash
export GITHUB_PAT_TOKEN="ghp_xxx"
```

Then verify:

```bash
codex mcp list
```

### Playwright

Installs:

```bash
npm install -g @playwright/test playwright
playwright install chromium
```

Verify:

```bash
playwright --version
playwright screenshot file://$PWD/index.html /tmp/playwright-check.png
```

## Recommended Shell PATH

Add this to `~/.zshrc` if needed:

```bash
export PATH="$HOME/.local/bin:$HOME/.hermes/node/bin:$HOME/.codex-agent-stack/bin:$PATH"
```

## Security Notes

- Do not commit `GITHUB_PAT_TOKEN`.
- Do not put GitHub tokens into this repository.
- GitHub MCP is registered with an environment variable name only.
- Playwright browser binaries live in the user cache, not in the project.
- This package is for development automation only; it does not deploy, commit,
  push, merge, or create PRs.
