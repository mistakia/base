#!/bin/bash
# Custom file suggestion script for Claude Code
# Optimized for performance with configurable exclusions
# Uses ripgrep for fast file enumeration + fzf for fuzzy matching

set -u

# Parse JSON input to get query
QUERY=$(jq -r '.query // ""')

# Use project dir from env, fallback to pwd
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# cd into project dir so rg outputs relative paths
cd "$PROJECT_DIR" || exit 1

# Exclusion patterns - performance critical, avoid expensive patterns
# These are ripgrep glob patterns (! prefix means exclude)
EXCLUDES=(
  # Version control
  '!**/.git/**'

  # Dependencies
  '!**/node_modules/**'
  '!**/vendor/**'
  '!**/__pycache__/**'
  '!**/.venv/**'
  '!**/venv/**'

  # Build outputs
  '!**/dist/**'
  '!**/build/**'
  '!**/.next/**'
  '!**/target/**'

  # Lock files and logs
  '!*.lock'
  '!*.log'
  '!package-lock.json'
  '!yarn.lock'
  '!bun.lock'
  '!pnpm-lock.yaml'

  # User-base standard exclusions
  '!.system/**'
  '!thread/**'
  '!import-history/**'
  '!repository/archive/**'

  # Worktree patterns
  '!**/*-worktrees/**'
  '!**/worktrees/**'
  '!**/.worktrees/**'

  # Cache and temp
  '!**/.cache/**'
  '!**/tmp/**'
  '!**/.tmp/**'
  '!**/cache/**'
)

# Load additional exclusions from user-base config if available
EXTRA_EXCLUDES_FILE="${CLAUDE_PROJECT_DIR:-.}/.file-suggestion-excludes"
if [[ -f "$EXTRA_EXCLUDES_FILE" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    EXCLUDES+=("!$line")
  done < "$EXTRA_EXCLUDES_FILE"
fi

# Build glob arguments for ripgrep
build_glob_args() {
  local args=()
  for pattern in "${EXCLUDES[@]}"; do
    args+=("--glob" "$pattern")
  done
  echo "${args[@]}"
}

# List all searchable entries (files + directories) in a single rg pass
# Avoids the previous find-based directory listing which was slow due to
# traversing 5000+ thread UUID subdirectories without pruning
list_entries() {
  local glob_args
  read -ra glob_args <<< "$(build_glob_args)"

  # Single rg pass: output files, then derive unique directories via tee+sed
  # Using process substitution to extract dirs from the same file list
  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf $tmpdir" RETURN

  rg --files --follow --hidden "${glob_args[@]}" 2>/dev/null | \
    tee "$tmpdir/files" | sed 's|/[^/]*$||' | sort -u > "$tmpdir/dirs"

  # Output directories first (for directory completion), then files
  cat "$tmpdir/dirs"

  # Also list repository/active subdirs explicitly (top-level repos)
  if [[ -d "repository/active" ]]; then
    find -L repository/active -maxdepth 1 -type d 2>/dev/null | sed 's|^\./||'
  fi

  cat "$tmpdir/files"
}

# Main file search function
search_files() {
  local query="$1"

  # Disable pipefail for the search pipeline - fzf --filter returns exit 1
  # for fuzzy-only matches (no exact match), and head closing the pipe early
  # causes SIGPIPE. Non-zero exit codes cause Claude Code to ignore results.
  set +o pipefail

  if command -v fzf >/dev/null 2>&1; then
    # Use fzf for fuzzy matching - much better results
    # list_entries provides dirs + files in a single rg pass, dedupe with awk
    list_entries | awk '!seen[$0]++' | fzf --filter "$query" 2>/dev/null | \
      head -20
  else
    # Fallback: simple grep-based filtering
    if [[ -n "$query" ]]; then
      list_entries | awk '!seen[$0]++' | grep -i "$query" 2>/dev/null | \
        head -20
    else
      list_entries | awk '!seen[$0]++' | head -20
    fi
  fi
}

# Run the search - always exit 0 so Claude Code accepts the results
search_files "$QUERY"
exit 0
