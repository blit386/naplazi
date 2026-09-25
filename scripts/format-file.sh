#!/bin/sh

# Formats the one file an AI agent just edited. Shared by the Claude Code PostToolUse hook and the
# Cursor afterFileEdit hook: both pipe a JSON payload on stdin that names the file somewhere inside
# (Claude: tool_input.file_path, Cursor: file_path). Biome owns code and JSON, Prettier owns Markdown
# and YAML. Never fails the agent's edit - a formatter error just leaves the file as written.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

FILE_PATH="$(jq -r '
    [.. | objects | (.file_path // .filePath // .path)?]
    | map(select(type == "string" and . != ""))
    | first // empty
' 2>/dev/null)"

[ -n "$FILE_PATH" ] || exit 0

case "$FILE_PATH" in
/*) TARGET="$FILE_PATH" ;;
*) TARGET="$REPO_ROOT/$FILE_PATH" ;;
esac

[ -f "$TARGET" ] || exit 0
TARGET="$(realpath "$TARGET" 2>/dev/null)" || exit 0

# Only files inside this repo.
case "$TARGET" in
"$REPO_ROOT"/*) ;;
*) exit 0 ;;
esac

cd "$REPO_ROOT" || exit 0

case "$TARGET" in
*.ts | *.js | *.cjs | *.mjs | *.json | *.jsonc)
    pnpm exec biome check --write --no-errors-on-unmatched "$TARGET" >/dev/null 2>&1
    ;;
*.md | *.mdx | *.mdc | *.yml | *.yaml)
    pnpm exec prettier --write "$TARGET" >/dev/null 2>&1
    ;;
esac

exit 0
