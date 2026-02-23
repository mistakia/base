#!/bin/bash

# deploy-hooks.sh - Deploy post-receive hooks to storage server bare repos
#                   and post-commit hooks to local working copies
#
# Usage:
#   deploy-hooks.sh [--dry-run] [--post-receive] [--post-commit]
#
# Options:
#   --dry-run       Show what would be done without making changes
#   --post-receive  Deploy only post-receive hooks (storage server)
#   --post-commit   Deploy only post-commit hooks (local machine)
#   (default)       Deploy both
#
# Configuration:
#   Reads deployment targets from $USER_BASE_DIRECTORY/config/deploy-hooks.conf

set -e

source "$(dirname "$0")/lib/paths.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

DRY_RUN=false
DEPLOY_POST_RECEIVE=false
DEPLOY_POST_COMMIT=false

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --post-receive) DEPLOY_POST_RECEIVE=true ;;
        --post-commit) DEPLOY_POST_COMMIT=true ;;
    esac
done

# If neither specified, deploy both
if [ "$DEPLOY_POST_RECEIVE" = false ] && [ "$DEPLOY_POST_COMMIT" = false ]; then
    DEPLOY_POST_RECEIVE=true
    DEPLOY_POST_COMMIT=true
fi

# Load user-specific deployment configuration
DEPLOY_HOOKS_CONF="$USER_BASE_DIRECTORY/config/deploy-hooks.conf"
if [ ! -f "$DEPLOY_HOOKS_CONF" ]; then
    echo "Error: Deploy hooks config not found: $DEPLOY_HOOKS_CONF" >&2
    echo "Create this file with REMOTE_HOST, BARE_REPO_DIR, REMOTE_USER_BASE," >&2
    echo "MACBOOK_USER_BASE, POST_RECEIVE_HOOKS, and POST_COMMIT_SUBMODULES." >&2
    exit 1
fi
source "$DEPLOY_HOOKS_CONF"

# Post-commit hook content (same for all repos)
generate_post_commit_hook() {
    cat << HOOK
#!/bin/bash
# Post-commit hook: trigger sync-all.sh in background
# Installed by deploy-hooks.sh
nohup "\$USER_BASE_DIRECTORY/repository/active/base/cli/sync-all.sh" &>/dev/null &
HOOK
}

# --- Post-receive hooks (storage server) ---

if [ "$DEPLOY_POST_RECEIVE" = true ]; then
    echo "=== Deploying post-receive hooks to storage server ==="

    for entry in "${POST_RECEIVE_HOOKS[@]}"; do
        bare_repo="${entry%%:*}"
        pull_script="${entry#*:}"

        hook_path="$BARE_REPO_DIR/$bare_repo/hooks/post-receive"

        # Generate hook content
        hook_content="#!/bin/bash

# Post-receive hook for $bare_repo
# Deployed by deploy-hooks.sh - do not edit manually
#
# Updates local working copy and triggers MacBook sync

USER_BASE_DIRECTORY=$REMOTE_USER_BASE
CLI_DIR=\"\$USER_BASE_DIRECTORY/repository/active/base/cli\"

# Update local working copy (backgrounded so hook returns quickly)
USER_BASE_DIRECTORY=\"\$USER_BASE_DIRECTORY\" \\
    \"\$CLI_DIR/$pull_script\" &

# Trigger MacBook sync (backgrounded, tolerates failure)
ssh -o ConnectTimeout=5 -o BatchMode=yes macbook \\
    'USER_BASE_DIRECTORY=$MACBOOK_USER_BASE $MACBOOK_USER_BASE/repository/active/base/cli/sync-all.sh' \\
    &>/dev/null &
"

        if [ "$DRY_RUN" = true ]; then
            echo "[dry-run] Would deploy post-receive hook to $hook_path"
            echo "  Pull command: $pull_script"
        else
            echo "Deploying post-receive hook to $bare_repo..."
            echo "$hook_content" | ssh "$REMOTE_HOST" "cat > '$hook_path' && chmod +x '$hook_path'"
            echo "  Deployed: $hook_path"
        fi
    done
fi

# --- Post-commit hooks (local machine) ---

if [ "$DEPLOY_POST_COMMIT" = true ]; then
    echo "=== Deploying post-commit hooks to local working copies ==="

    # Parent repo post-commit hook
    parent_hook_dir="$USER_BASE_DIRECTORY/.git/hooks"
    parent_hook_path="$parent_hook_dir/post-commit"

    if [ "$DRY_RUN" = true ]; then
        echo "[dry-run] Would deploy post-commit hook to $parent_hook_path"
    else
        mkdir -p "$parent_hook_dir"
        generate_post_commit_hook > "$parent_hook_path"
        chmod +x "$parent_hook_path"
        echo "Deployed: $parent_hook_path"
    fi

    # Submodule post-commit hooks
    for submodule_path in "${POST_COMMIT_SUBMODULES[@]}"; do
        full_path="$USER_BASE_DIRECTORY/$submodule_path"

        if [ ! -d "$full_path/.git" ] && [ ! -f "$full_path/.git" ]; then
            echo "Skipping $submodule_path (not initialized)"
            continue
        fi

        # Resolve the actual git dir for the submodule
        git_dir=$(git -C "$full_path" rev-parse --git-dir 2>/dev/null)

        # For submodules, hooks dir may be inside .git/modules/
        hook_dir="$git_dir/hooks"
        if [[ "$git_dir" != /* ]]; then
            hook_dir="$full_path/$git_dir/hooks"
        fi
        hook_path="$hook_dir/post-commit"

        if [ "$DRY_RUN" = true ]; then
            echo "[dry-run] Would deploy post-commit hook to $hook_path"
        else
            mkdir -p "$hook_dir"
            generate_post_commit_hook > "$hook_path"
            chmod +x "$hook_path"
            echo "Deployed: $hook_path"
        fi
    done
fi

echo "Done."
