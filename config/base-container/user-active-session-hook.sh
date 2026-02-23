#!/bin/bash
# User container active session hook
# Reports session lifecycle events to Base API from inside user containers
# Called by Claude Code hooks: SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd

set -o pipefail

# Read JSON from stdin
INPUT=$(cat)

# Extract fields via jq
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')

# Build API URL
API_PROTO="${BASE_API_PROTO:-http}"
API_HOST="${BASE_API_HOST:-localhost}"
API_PORT="${BASE_API_PORT:-8080}"
API_BASE="${API_PROTO}://${API_HOST}:${API_PORT}"

# Extract jsonl_session_id from transcript_path filename
JSONL_SESSION_ID=""
if [ -n "$TRANSCRIPT_PATH" ]; then
  JSONL_SESSION_ID=$(basename "$TRANSCRIPT_PATH" .jsonl)
fi

case "$HOOK_EVENT" in
  SessionStart)
    curl -s -X POST "${API_BASE}/api/active-sessions" \
      -H "Content-Type: application/json" \
      -d "{
        \"session_id\": \"${SESSION_ID}\",
        \"jsonl_session_id\": \"${JSONL_SESSION_ID}\",
        \"working_directory\": \"${CWD}\",
        \"transcript_path\": \"${TRANSCRIPT_PATH}\",
        \"job_id\": \"${JOB_ID}\"
      }" \
      --connect-timeout 5 --max-time 5 >/dev/null 2>&1 &
    ;;
  UserPromptSubmit|PostToolUse)
    curl -s -X PUT "${API_BASE}/api/active-sessions/${SESSION_ID}" \
      -H "Content-Type: application/json" \
      -d '{"status": "active"}' \
      --connect-timeout 5 --max-time 5 >/dev/null 2>&1 &
    ;;
  Stop)
    curl -s -X PUT "${API_BASE}/api/active-sessions/${SESSION_ID}" \
      -H "Content-Type: application/json" \
      -d '{"status": "idle"}' \
      --connect-timeout 5 --max-time 5 >/dev/null 2>&1 &
    ;;
  SessionEnd)
    curl -s -X DELETE "${API_BASE}/api/active-sessions/${SESSION_ID}" \
      --connect-timeout 5 --max-time 5 >/dev/null 2>&1 &
    ;;
esac

exit 0
