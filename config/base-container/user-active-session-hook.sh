#!/bin/bash
# User container active session hook
# Reports session lifecycle events to Base API from inside user containers
# Called by Claude Code hooks: SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd
# Dual-targets local and production APIs (matching host hook pattern)

set -o pipefail

# Base API endpoints - local (configurable via env vars) and production
LOCAL_PROTO="${BASE_API_PROTO:-http}"
LOCAL_HOST="${BASE_API_HOST:-localhost}"
LOCAL_PORT="${BASE_API_PORT:-8080}"
LOCAL_API_URL="${LOCAL_PROTO}://${LOCAL_HOST}:${LOCAL_PORT}/api/active-sessions"
PROD_API_URL="${BASE_PROD_API_URL:-}"

# Helper function to send request to an endpoint (runs in background)
# Usage: send_request METHOD URL [DATA] [USE_API_KEY]
send_request() {
    local method="$1"
    local url="$2"
    local data="$3"
    local use_api_key="$4"

    local auth_args=()
    if [ "$use_api_key" = "true" ] && [ -n "$JOB_API_KEY" ]; then
        auth_args=(-H "Authorization: Bearer $JOB_API_KEY")
    fi

    if [ -n "$data" ]; then
        curl -sk -X "$method" "$url" \
            -H "Content-Type: application/json" \
            "${auth_args[@]}" \
            -d "$data" \
            --connect-timeout 5 --max-time 5 > /dev/null 2>&1 &
    else
        curl -sk -X "$method" "$url" \
            "${auth_args[@]}" \
            --connect-timeout 5 --max-time 5 > /dev/null 2>&1 &
    fi
}

# Synchronous variant used for SessionStart/SessionEnd on the local API.
# Foreground execution enforces POST-before-DELETE ordering at the source,
# preventing the race where a short-lived session's DELETE arrives ahead of
# its POST and produces an orphan session.
send_request_sync() {
    local method="$1"
    local url="$2"
    local data="$3"
    local use_api_key="$4"

    local auth_args=()
    if [ "$use_api_key" = "true" ] && [ -n "$JOB_API_KEY" ]; then
        auth_args=(-H "Authorization: Bearer $JOB_API_KEY")
    fi

    if [ -n "$data" ]; then
        curl -sk -X "$method" "$url" \
            -H "Content-Type: application/json" \
            "${auth_args[@]}" \
            -d "$data" \
            --connect-timeout 5 --max-time 5 > /dev/null 2>&1
    else
        curl -sk -X "$method" "$url" \
            "${auth_args[@]}" \
            --connect-timeout 5 --max-time 5 > /dev/null 2>&1
    fi
}

# Read JSON from stdin
INPUT=$(cat)

# Extract fields via jq
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
HOOK_SOURCE=$(echo "$INPUT" | jq -r '.source // empty')

# Extract jsonl_session_id from transcript_path filename
JSONL_SESSION_ID=""
if [ -n "$TRANSCRIPT_PATH" ]; then
  JSONL_SESSION_ID=$(basename "$TRANSCRIPT_PATH" .jsonl)
fi

# Build job_id JSON field (set by create-session-claude-cli when spawning via BullMQ)
job_id_field=""
if [ -n "$JOB_ID" ]; then
    job_id_field="\"job_id\": \"$JOB_ID\","
fi

# Build production API URL with session path
PROD_SESSION_URL=""
if [ -n "$PROD_API_URL" ]; then
    PROD_SESSION_URL="${PROD_API_URL}/api/active-sessions"
fi

case "$HOOK_EVENT" in
  SessionStart)
    payload="{
        \"session_id\": \"${SESSION_ID}\",
        \"jsonl_session_id\": \"${JSONL_SESSION_ID}\",
        ${job_id_field}
        \"hook_source\": \"${HOOK_SOURCE}\",
        \"working_directory\": \"${CWD}\",
        \"transcript_path\": \"${TRANSCRIPT_PATH}\"
    }"
    # Local API uses synchronous request to guarantee POST lands before any
    # subsequent SessionEnd DELETE for short-lived sessions.
    send_request_sync "POST" "$LOCAL_API_URL" "$payload"
    [ -n "$PROD_SESSION_URL" ] && send_request "POST" "$PROD_SESSION_URL" "$payload" "true"
    ;;
  UserPromptSubmit|PostToolUse)
    payload="{
        \"status\": \"active\",
        ${job_id_field}
        \"working_directory\": \"${CWD}\",
        \"transcript_path\": \"${TRANSCRIPT_PATH}\"
    }"
    send_request "PUT" "$LOCAL_API_URL/${SESSION_ID}" "$payload"
    [ -n "$PROD_SESSION_URL" ] && send_request "PUT" "$PROD_SESSION_URL/${SESSION_ID}" "$payload" "true"
    ;;
  Stop)
    payload="{
        \"status\": \"idle\",
        ${job_id_field}
        \"working_directory\": \"${CWD}\",
        \"transcript_path\": \"${TRANSCRIPT_PATH}\"
    }"
    send_request "PUT" "$LOCAL_API_URL/${SESSION_ID}" "$payload"
    [ -n "$PROD_SESSION_URL" ] && send_request "PUT" "$PROD_SESSION_URL/${SESSION_ID}" "$payload" "true"
    ;;
  SessionEnd)
    # Local API uses synchronous request so SessionEnd cannot return before
    # DELETE lands, ensuring the POST/DELETE ordering invariant at the source.
    send_request_sync "DELETE" "$LOCAL_API_URL/${SESSION_ID}"
    [ -n "$PROD_SESSION_URL" ] && send_request "DELETE" "$PROD_SESSION_URL/${SESSION_ID}" "" "true"
    ;;
esac

exit 0
