#!/bin/sh
TOKEN_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/oauth-token"
if [ ! -f "$TOKEN_FILE" ]; then
  printf 'claude-oauth-helper: oauth-token not found at %s -- run cli/deploy-claude-oauth-token.sh on macbook\n' "$TOKEN_FILE" >&2
  exit 1
fi
exec cat "$TOKEN_FILE"
