#!/bin/bash
# PreToolUse hook: Validate Bash tool commands in user containers
# Blocks dangerous command patterns. Returns JSON deny decision or exits 0 silently.

# Read tool input from stdin
INPUT=$(cat)

# Extract the command string from JSON input
COMMAND=$(echo "$INPUT" | jq -r '.input.command // empty' 2>/dev/null)

if [ -z "$COMMAND" ]; then
  exit 0
fi

deny() {
  echo "{\"decision\":\"deny\",\"reason\":\"$1\"}"
  exit 0
}

# Normalize: collapse whitespace, lowercase for pattern matching
NORMALIZED=$(echo "$COMMAND" | tr '[:upper:]' '[:lower:]' | tr -s ' ')

# --- Network tools ---
for tool in curl wget nc ncat ssh scp sftp rsync telnet ftp socat; do
  if echo "$NORMALIZED" | grep -qE "(^|[;&|]\s*)${tool}(\s|$)"; then
    deny "Network tool '${tool}' is not allowed in user containers"
  fi
done

# --- Destructive commands ---
if echo "$NORMALIZED" | grep -qE '(^|[;&|]\s*)rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r'; then
  deny "Destructive command 'rm -rf' is not allowed"
fi
for cmd in chmod chown mkfs dd shred; do
  if echo "$NORMALIZED" | grep -qE "(^|[;&|]\s*)${cmd}(\s|$)"; then
    deny "Destructive command '${cmd}' is not allowed in user containers"
  fi
done

# --- Container/privilege escalation ---
for cmd in docker nsenter mount umount su sudo; do
  if echo "$NORMALIZED" | grep -qE "(^|[;&|]\s*)${cmd}(\s|$)"; then
    deny "Privilege escalation command '${cmd}' is not allowed in user containers"
  fi
done

# --- Claude config modification ---
if echo "$COMMAND" | grep -qE '(\.claude/settings\.json|\.claude/\.credentials\.json|\.claude/credentials)'; then
  deny "Modification of Claude configuration files is not allowed"
fi

# --- Package management ---
if [ "${ALLOW_PACKAGE_INSTALL:-}" != "true" ]; then
  if echo "$NORMALIZED" | grep -qE '(^|[;&|]\s*)(npm\s+install|pip\s+install|apt\s|apt-get\s|brew\s)'; then
    deny "Package installation is not allowed in user containers"
  fi
fi

# Command is allowed
exit 0
