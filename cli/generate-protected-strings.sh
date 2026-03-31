#!/bin/bash
# generate-protected-strings.sh
#
# Extracts known plaintext secrets from config files and writes them to the
# protected strings file used by check-protected-strings.sh.
#
# Run this manually (or via cron/service startup) to regenerate the file
# when secrets rotate or new sources are added.
#
# Usage:
#   cli/generate-protected-strings.sh                          # default output path
#   cli/generate-protected-strings.sh /path/to/output.txt      # custom output path
#
# The default output path matches what is configured in settings.local.json:
#   PROTECTED_STRINGS_FILE=$USER_BASE_DIRECTORY/config/protected-strings.txt

set -euo pipefail

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
USER_BASE_DIR="${USER_BASE_DIRECTORY:-$(cd "$BASE_DIR/../.." && pwd)}"
USER_CONFIG_DIR="$USER_BASE_DIR/config"

# Output path: argument > env > default
OUTPUT_FILE="${1:-${PROTECTED_STRINGS_FILE:-$USER_CONFIG_DIR/protected-strings.txt}}"

: > "$OUTPUT_FILE"

# --- Extract known plaintext secrets ---

# Discord webhook URL from discord-notify.sh
DISCORD_SCRIPT="$USER_BASE_DIR/cli/monitoring/discord-notify.sh"
if [ -f "$DISCORD_SCRIPT" ]; then
  grep -oE 'https://discord\.com/api/webhooks/[^ "]+' "$DISCORD_SCRIPT" 2>/dev/null | while read -r url; do
    echo "$url" >> "$OUTPUT_FILE"
    token=$(echo "$url" | grep -oE '/webhooks/[0-9]+/[A-Za-z0-9_-]+' | sed 's|/webhooks/[0-9]*/||')
    [ -n "$token" ] && [ "${#token}" -ge 8 ] && echo "$token" >> "$OUTPUT_FILE"
  done
fi

# FantasyPoints active tokens (plaintext JWTs)
FP_TOKENS="$USER_CONFIG_DIR/fantasypoints-tokens.json"
if [ -f "$FP_TOKENS" ]; then
  for field in accessToken refreshToken sessionToken; do
    val=$(jq -r ".$field // empty" "$FP_TOKENS" 2>/dev/null)
    [ -n "$val" ] && [ "${#val}" -ge 8 ] && echo "$val" >> "$OUTPUT_FILE"
  done
fi

# Unencrypted API keys from finance config
FINANCE_CONFIG="$BASE_DIR/../finance/config/config.json"
if [ -f "$FINANCE_CONFIG" ]; then
  for path in ".morningstar.search_api_key" ".morningstar.data_api_key"; do
    val=$(jq -r "$path // empty" "$FINANCE_CONFIG" 2>/dev/null)
    [ -n "$val" ] && [ "${#val}" -ge 8 ] && [[ "$val" != ENCRYPTED* ]] && echo "$val" >> "$OUTPUT_FILE"
  done
fi

# Firebase API key from fantasypoints-auth.sh
FP_AUTH="$USER_BASE_DIR/cli/nfl/fantasypoints-auth.sh"
if [ -f "$FP_AUTH" ]; then
  grep -oE 'AIza[A-Za-z0-9_-]{35}' "$FP_AUTH" 2>/dev/null >> "$OUTPUT_FILE" || true
fi

# User public key (identity fingerprint)
BASE_CONFIG="$BASE_DIR/config/config.json"
if [ -f "$BASE_CONFIG" ]; then
  val=$(jq -r '.user_public_key // empty' "$BASE_CONFIG" 2>/dev/null)
  [ -n "$val" ] && [ "${#val}" -ge 8 ] && echo "$val" >> "$OUTPUT_FILE"
fi

# --- Deduplicate ---
sort -u "$OUTPUT_FILE" | grep -v '^$' > "${OUTPUT_FILE}.tmp" 2>/dev/null || true
mv "${OUTPUT_FILE}.tmp" "$OUTPUT_FILE"

COUNT=$(wc -l < "$OUTPUT_FILE" | xargs)
echo "Generated $OUTPUT_FILE: $COUNT protected values"
