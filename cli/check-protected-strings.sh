#!/bin/bash
# check-protected-strings.sh
#
# Prevents leakage of protected environment variable values through AI/agent
# tool calls. Scans tool inputs and responses for the literal values of
# specified environment variables.
#
# Designed to run as a PreToolUse or PostToolUse hook in AI/agent harnesses
# (e.g., Claude Code CLI sessions) to detect and block prompt injection
# attacks that attempt to exfiltrate secrets.
#
# Configuration (environment variables):
#   PROTECTED_ENV_VARS     - Comma-separated list of env var names whose values
#                            should never appear in tool I/O
#                            (e.g., "CONFIG_ENCRYPTION_KEY,DB_PASSWORD")
#   PROTECTED_STRINGS_FILE - Path to a file with additional protected strings,
#                            one per line. Lines starting with # are ignored.
#   MIN_PROTECTED_LENGTH   - Minimum character length for a value to be checked
#                            (default: 8). Shorter values cause false positives.
#
# Hook compatibility (Claude Code):
#   PreToolUse  - Blocks the tool call when a protected value is found in input
#   PostToolUse - Alerts Claude when a protected value appears in tool response
#
# Generic harness usage:
#   Pipe JSON with tool_input/tool_response fields to stdin.
#   Exit 0 with JSON on stdout = match found (decision included).
#   Exit 0 with no output = no match, allow.
#   Exit 2 + stderr = script error.

set -euo pipefail

MIN_LENGTH="${MIN_PROTECTED_LENGTH:-8}"

# --- Collect protected values ---

declare -a PROTECTED_VALUES=()
declare -a PROTECTED_LABELS=()

# From environment variable names
if [ -n "${PROTECTED_ENV_VARS:-}" ]; then
  IFS=',' read -ra VAR_NAMES <<< "$PROTECTED_ENV_VARS"
  for var_name in "${VAR_NAMES[@]}"; do
    var_name="$(echo "$var_name" | xargs)"
    var_value="${!var_name:-}"
    if [ -n "$var_value" ] && [ "${#var_value}" -ge "$MIN_LENGTH" ]; then
      PROTECTED_VALUES+=("$var_value")
      PROTECTED_LABELS+=("env:$var_name")
    fi
  done
fi

# From protected strings file
if [ -n "${PROTECTED_STRINGS_FILE:-}" ] && [ -f "$PROTECTED_STRINGS_FILE" ]; then
  line_num=0
  while IFS= read -r line || [ -n "$line" ]; do
    line_num=$((line_num + 1))
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [ "${#line}" -ge "$MIN_LENGTH" ]; then
      PROTECTED_VALUES+=("$line")
      PROTECTED_LABELS+=("file:line${line_num}")
    fi
  done < "$PROTECTED_STRINGS_FILE"
fi

# Nothing to protect
if [ "${#PROTECTED_VALUES[@]}" -eq 0 ]; then
  exit 0
fi

# --- Read hook input ---

INPUT="$(cat)"

HOOK_EVENT="$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty')"
TOOL_INPUT_STR="$(printf '%s' "$INPUT" | jq -r '.tool_input // {} | tostring')"
TOOL_RESPONSE_STR="$(printf '%s' "$INPUT" | jq -r '.tool_response // {} | tostring')"

# --- Scan for protected values ---

emit_pretooluse_deny() {
  local reason="$1"
  printf '%s' "$INPUT" | jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
}

emit_posttooluse_block() {
  local reason="$1"
  printf '%s' "$INPUT" | jq -n --arg reason "$reason" '{
    decision: "block",
    reason: $reason
  }'
}

for i in "${!PROTECTED_VALUES[@]}"; do
  value="${PROTECTED_VALUES[$i]}"
  label="${PROTECTED_LABELS[$i]}"

  # Check tool input
  if printf '%s' "$TOOL_INPUT_STR" | grep -qF -- "$value"; then
    case "$HOOK_EVENT" in
      PreToolUse)
        emit_pretooluse_deny "Blocked: tool input contains protected value ($label). Possible secret exfiltration attempt."
        ;;
      *)
        emit_posttooluse_block "Protected value detected ($label) in tool input. Do not repeat, log, or transmit this value."
        ;;
    esac
    exit 0
  fi

  # Check tool response
  if [ -n "$TOOL_RESPONSE_STR" ] && [ "$TOOL_RESPONSE_STR" != "{}" ]; then
    if printf '%s' "$TOOL_RESPONSE_STR" | grep -qF -- "$value"; then
      case "$HOOK_EVENT" in
        PostToolUse)
          emit_posttooluse_block "Protected value detected ($label) in tool response. Do not repeat, log, or transmit this value."
          ;;
        PreToolUse)
          emit_pretooluse_deny "Blocked: tool response contains protected value ($label)."
          ;;
        *)
          emit_posttooluse_block "Protected value detected ($label) in tool response."
          ;;
      esac
      exit 0
    fi
  fi
done

# No matches - allow
exit 0
