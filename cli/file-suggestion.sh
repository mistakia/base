#!/bin/bash
# Custom file suggestion script for Claude Code
# Optimized for performance with configurable exclusions
# Uses ripgrep for fast file enumeration + fzf for fuzzy matching

set -euo pipefail

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
  '!pnpm-lock.yaml'

  # User-base standard exclusions
  '!.system/**'
  '!thread/**/raw-data/**'
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

# List directories (depth-limited for performance)
list_directories() {
  # List directories up to depth 3, applying similar exclusions
  # Focus on commonly-referenced directories
  find . -maxdepth 3 -type d \
    ! -path './.git/*' \
    ! -path './node_modules/*' \
    ! -path './.system/*' \
    ! -path './thread/*/raw-data' \
    ! -path './import-history/*' \
    ! -path './repository/archive/*' \
    ! -path './*-worktrees/*' \
    ! -path './.cache/*' \
    ! -name '.git' \
    2>/dev/null | sed 's|^\./||' | grep -v '^$'

  # Also list repository/active subdirs explicitly (symlinks, depth may miss them)
  if [[ -d "repository/active" ]]; then
    find -L repository/active -maxdepth 1 -type d 2>/dev/null | sed 's|^\./||'
  fi
}

# Main file search function
search_files() {
  local query="$1"
  local glob_args

  # Build exclusion arguments
  read -ra glob_args <<< "$(build_glob_args)"

  # Use ripgrep to enumerate files
  # --files: list files only
  # --follow: follow symlinks (important for repository/active)
  # --hidden: include hidden files (but .git excluded above)
  # --no-ignore-vcs: don't use .gitignore (we have explicit excludes)
  # Note: Using --no-ignore-vcs because some repos have overly broad .gitignore

  if command -v fzf >/dev/null 2>&1; then
    # Use fzf for fuzzy matching - much better results
    # Combine directories and files for matching, dedupe with awk
    {
      list_directories
      rg --files --follow --hidden "${glob_args[@]}" 2>/dev/null
    } | awk '!seen[$0]++' | fzf --filter "$query" 2>/dev/null | \
      head -20
  else
    # Fallback: simple grep-based filtering
    if [[ -n "$query" ]]; then
      {
        list_directories
        rg --files --follow --hidden "${glob_args[@]}" 2>/dev/null
      } | awk '!seen[$0]++' | grep -i "$query" 2>/dev/null | \
        head -20
    else
      {
        list_directories
        rg --files --follow --hidden "${glob_args[@]}" 2>/dev/null
      } | awk '!seen[$0]++' | head -20
    fi
  fi
}

# Run the search
search_files "$QUERY"
