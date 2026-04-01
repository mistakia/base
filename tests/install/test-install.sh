#!/usr/bin/env bash
#
# End-to-end install test for Base CLI.
# Runs inside a clean container (no Bun, no Node, no ripgrep).
#
# Phases:
#   1. Install binary via curl installer
#   2. First run / init
#   3. Post-init commands
#   4. Update
#   5. Install content
#   6. Uninstall / outdated
#
# Each assertion logs PASS/FAIL independently. Failures do not abort.
# Exit code 0 if all pass, 1 if any fail.

set -u

BASE_URL="${BASE_URL:-https://base.tint.space}"

# --- Assertion framework ---

PASS_COUNT=0
FAIL_COUNT=0
PHASE_START=0
PHASE_FAILURES=""

start_phase() {
  local name="$1"
  PHASE_START=$(date +%s)
  PHASE_FAILURES=""
  echo ""
  echo "=============================="
  echo "  Phase: $name"
  echo "=============================="
}

end_phase() {
  local name="$1"
  local elapsed=$(( $(date +%s) - PHASE_START ))
  if [ -z "$PHASE_FAILURES" ]; then
    echo "  -- $name completed (${elapsed}s) -- ALL PASSED"
  else
    echo "  -- $name completed (${elapsed}s) -- FAILURES:$PHASE_FAILURES"
  fi
}

assert() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  PASS: $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL: $description"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    PHASE_FAILURES="$PHASE_FAILURES $description;"
  fi
}

assert_file_exists() {
  local description="$1"
  local filepath="$2"
  if [ -e "$filepath" ]; then
    echo "  PASS: $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL: $description (not found: $filepath)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    PHASE_FAILURES="$PHASE_FAILURES $description;"
  fi
}

assert_file_executable() {
  local description="$1"
  local filepath="$2"
  if [ -x "$filepath" ]; then
    echo "  PASS: $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL: $description (not executable: $filepath)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    PHASE_FAILURES="$PHASE_FAILURES $description;"
  fi
}

assert_command_succeeds() {
  local description="$1"
  shift
  local output
  output=$("$@" 2>&1)
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "  PASS: $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL: $description (exit code: $rc)"
    echo "        output: $(echo "$output" | head -5)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    PHASE_FAILURES="$PHASE_FAILURES $description;"
  fi
}

assert_output_contains() {
  local description="$1"
  local expected="$2"
  shift 2
  local output
  output=$("$@" 2>&1)
  if echo "$output" | grep -q "$expected"; then
    echo "  PASS: $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL: $description (expected '$expected' in output)"
    echo "        output: $(echo "$output" | head -5)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    PHASE_FAILURES="$PHASE_FAILURES $description;"
  fi
}

assert_path_contains() {
  local description="$1"
  local dir="$2"
  if echo "$PATH" | tr ':' '\n' | grep -q "^${dir}$"; then
    echo "  PASS: $description"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL: $description ($dir not in PATH)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    PHASE_FAILURES="$PHASE_FAILURES $description;"
  fi
}

# --- Phase 1: Install binary ---

start_phase "Install Binary"

# Download and run the install script with SKIP_INIT to isolate binary installation
export SKIP_INIT=1
curl -fsSL "${BASE_URL}/install.sh" -o /tmp/install.sh
assert "install script downloaded" test -f /tmp/install.sh

bash /tmp/install.sh
INSTALL_RC=$?
assert "install script completed" test $INSTALL_RC -eq 0

# Verify installation artifacts
assert_file_exists "binary exists" "$HOME/.base/bin/base"
assert_file_executable "binary is executable" "$HOME/.base/bin/base"
assert_file_exists "version.json exists" "$HOME/.base/version.json"

# Add to PATH for remaining phases
export PATH="$HOME/.base/bin:$PATH"
assert_path_contains "PATH includes ~/.base/bin" "$HOME/.base/bin"

# Verify binary runs
assert_command_succeeds "base --version works" base --version

end_phase "Install Binary"

# --- Phase 2: First run / init ---

start_phase "First Run / Init"

assert_command_succeeds "base --help works" base --help
assert_output_contains "base --help lists commands" "Commands:" base --help

# Run init to set up user-base directory
export USER_BASE_DIRECTORY="$HOME/user-base"
assert_command_succeeds "base init succeeds" base init --user-base-directory "$USER_BASE_DIRECTORY" --force

# Verify directory structure
assert_file_exists "user-base directory created" "$USER_BASE_DIRECTORY"
assert_file_exists "task/ directory created" "$USER_BASE_DIRECTORY/task"
assert_file_exists "workflow/ directory created" "$USER_BASE_DIRECTORY/workflow"
assert_file_exists "config/ directory created" "$USER_BASE_DIRECTORY/config"
assert_file_exists "config.json created" "$USER_BASE_DIRECTORY/config/config.json"
assert_file_exists "identity/ directory created" "$USER_BASE_DIRECTORY/identity"
assert_file_exists ".gitignore created" "$USER_BASE_DIRECTORY/.gitignore"
assert_file_exists "CLAUDE.md created" "$USER_BASE_DIRECTORY/CLAUDE.md"

# Verify system content downloaded (compiled binary mode)
if [ -d "$HOME/.base/system/schema" ]; then
  assert_file_exists "system schema downloaded" "$HOME/.base/system/schema"
  echo "  INFO: System content present (compiled binary mode)"
else
  echo "  INFO: No system content directory (expected if running from source)"
fi

end_phase "First Run / Init"

# --- Phase 3: Post-init commands ---

start_phase "Post-Init Commands"

# Set required env vars
export SYSTEM_BASE_DIRECTORY="$HOME/.base"

assert_command_succeeds "base entity list works" base entity list
assert_command_succeeds "base search works" base search "test"

# Create a test entity
assert_command_succeeds "base entity create works" \
  base entity create "user:task/test-task.md" \
    --type task \
    --title "Test Task" \
    --description "Created by install test"

assert_file_exists "created entity file exists" "$USER_BASE_DIRECTORY/task/test-task.md"
assert_command_succeeds "base entity get works" base entity get "user:task/test-task.md"

end_phase "Post-Init Commands"

# --- Phase 4: Update ---

start_phase "Update"

# Check for updates (should succeed even if already latest)
assert_command_succeeds "base update --check works" base update --check || true
echo "  INFO: Update check completed (may report already up-to-date)"

# Run actual update
base update 2>&1 || true
assert_file_exists "binary still exists after update" "$HOME/.base/bin/base"
assert_command_succeeds "base --version works after update" base --version

end_phase "Update"

# --- Phase 5: Install content ---

start_phase "Install Content"

# Test base install command (if it exists)
if base install --help >/dev/null 2>&1; then
  echo "  INFO: base install command available"
  # Try listing installable content
  base install --list 2>&1 || true
  echo "  INFO: Install content listing attempted"
else
  echo "  SKIP: base install command not available"
fi

end_phase "Install Content"

# --- Phase 6: Uninstall / Outdated ---

start_phase "Uninstall / Outdated"

# Test outdated command (if it exists)
if base outdated --help >/dev/null 2>&1; then
  assert_command_succeeds "base outdated works" base outdated || true
else
  echo "  SKIP: base outdated command not yet implemented"
fi

# Test uninstall command (if it exists)
if base uninstall --help >/dev/null 2>&1; then
  assert_command_succeeds "base uninstall --dry-run works" base uninstall --dry-run --yes
else
  echo "  SKIP: base uninstall command not yet implemented"
fi

end_phase "Uninstall / Outdated"

# --- Summary ---

echo ""
echo "=============================="
echo "  Test Summary"
echo "=============================="
echo "  Passed: $PASS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo "  Total:  $((PASS_COUNT + FAIL_COUNT))"
echo "=============================="

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
else
  exit 0
fi
