#!/bin/bash
# PreToolUse hook: Validate file access tool inputs in user containers
# Blocks path traversal, Claude config access, and system path access.
# Returns JSON deny decision or exits 0 silently.

# Read tool input from stdin
INPUT=$(cat)

# Extract the file path from JSON input (different tools use different field names)
FILE_PATH=$(echo "$INPUT" | jq -r '
  .input.file_path //
  .input.path //
  .input.pattern //
  empty
' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

deny() {
  echo "{\"decision\":\"deny\",\"reason\":\"$1\"}"
  exit 0
}

# --- Path traversal check ---
if echo "$FILE_PATH" | grep -qE '(^|/)\.\.(/|$)'; then
  deny "Path traversal ('..') is not allowed"
fi

# --- Claude config directory ---
if echo "$FILE_PATH" | grep -qE '(^|/)\.claude(/|$)|/home/node/\.claude(/|$)'; then
  deny "Access to Claude configuration directory is not allowed"
fi

# --- System paths ---
for sys_path in /etc/ /usr/ /var/ /proc/ /sys/ /dev/; do
  if echo "$FILE_PATH" | grep -qE "^${sys_path}"; then
    deny "Access to system path '${sys_path}' is not allowed"
  fi
done

# File access is allowed
exit 0
