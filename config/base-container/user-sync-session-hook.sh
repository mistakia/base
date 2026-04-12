#!/bin/bash
# User container sync session hook
# Triggers server-side session import from inside user containers
# Called by Claude Code hooks: SessionStart, UserPromptSubmit, PostToolUse, SessionEnd

set -o pipefail

# Read JSON from stdin
INPUT=$(cat)

# Extract fields via jq
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# Extract session ID from transcript_path for throttle file naming
JSONL_SESSION_ID=""
if [ -n "$TRANSCRIPT_PATH" ]; then
  JSONL_SESSION_ID=$(basename "$TRANSCRIPT_PATH" .jsonl)
fi

# Build API URL
API_PROTO="${BASE_API_PROTO:-http}"
API_HOST="${BASE_API_HOST:-localhost}"
API_PORT="${BASE_API_PORT:-8080}"
API_BASE="${API_PROTO}://${API_HOST}:${API_PORT}"

# Throttle interval: 2s when THREAD_ID is set (web sessions), 30s otherwise
if [ -n "$THREAD_ID" ]; then
  THROTTLE_SECONDS=2
else
  THROTTLE_SECONDS=30
fi

# Throttle: For PostToolUse events, skip if last sync was within throttle interval
THROTTLE_FILE="/tmp/sync-throttle-${JSONL_SESSION_ID}"
if [ "$HOOK_EVENT" = "PostToolUse" ] && [ -f "$THROTTLE_FILE" ]; then
  LAST_SYNC=$(cat "$THROTTLE_FILE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_SYNC))
  if [ "$ELAPSED" -lt "$THROTTLE_SECONDS" ]; then
    exit 0
  fi
fi

# Update throttle timestamp
date +%s > "$THROTTLE_FILE" 2>/dev/null

# Build known_thread_id field for pre-created thread dedup
known_thread_id_field=""
if [ -n "$THREAD_ID" ]; then
  known_thread_id_field=",\"known_thread_id\": \"${THREAD_ID}\""
fi

PAYLOAD="{
  \"username\": \"${CONTAINER_USERNAME}\",
  \"transcript_path\": \"${TRANSCRIPT_PATH}\",
  \"hook_event_name\": \"${HOOK_EVENT}\",
  \"user_public_key\": \"${USER_PUBLIC_KEY}\"${known_thread_id_field}
}"

if [ "$HOOK_EVENT" = "SessionEnd" ]; then
  # SessionEnd: run synchronously to ensure import completes before process exits
  curl -sk -X POST "${API_BASE}/api/threads/sync-user-session" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --connect-timeout 5 --max-time 25 >/dev/null 2>&1

  # Clean up throttle temp file
  rm -f "$THROTTLE_FILE" 2>/dev/null
else
  # All other events (SessionStart, UserPromptSubmit, PostToolUse): run in background
  curl -sk -X POST "${API_BASE}/api/threads/sync-user-session" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --connect-timeout 5 --max-time 25 >/dev/null 2>&1 &
fi

exit 0
