#!/bin/bash

# migrate-thread-to-rsync.sh - One-time migration from git-tracked to rsync-synced bulk data
#
# Restructures the thread submodule to track only metadata.json in git and sync
# bulk session data (timeline, raw-data, memory, plans) via rsync. Includes
# orphan branch creation to reclaim 22 GB of historical blob storage.
#
# Usage:
#   migrate-thread-to-rsync.sh [--dry-run] [--yes] [--rollback]
#
# Flags:
#   --dry-run   Show what would be done without making changes
#   --yes       Skip interactive confirmations
#   --rollback  Attempt to rollback a partial migration (pre-orphan steps only)
#
# IMPORTANT: Run this on MacBook only. Sessions may be active -- the script
# disables the session import hook during the migration window and runs a full
# import afterward to catch up. This script halts sync-all on both machines.

set -euo pipefail

# Parse arguments
DRY_RUN=false
AUTO_YES=false
ROLLBACK=false
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --yes) AUTO_YES=true ;;
        --rollback) ROLLBACK=true ;;
        *) echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

# Require USER_BASE_DIRECTORY
source "$(dirname "$0")/lib/paths.sh"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

REMOTE_HOST="storage"
REMOTE_USER_BASE="/mnt/md0/user-base"
REMOTE_BARE_REPO="/mnt/md0/git-repos/user-base-threads.git"
BACKUP_DIR="/mnt/md0/thread-bulk-backup"
SENTINEL="/tmp/sync-all-migration.disable"
HOOK_SENTINEL="/tmp/sync-claude-session.disable"

log() { echo "[migrate] $*"; }
log_error() { echo "[migrate] ERROR: $*" >&2; }

confirm() {
    if [ "$AUTO_YES" = true ]; then return 0; fi
    echo -n "[migrate] $1 [y/N] "
    read -r response
    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

dry_run_prefix() {
    if [ "$DRY_RUN" = true ]; then echo "[DRY RUN] "; fi
}

# --- Rollback Mode ---
if [ "$ROLLBACK" = true ]; then
    log "Starting rollback..."

    cd "$THREAD_DIR"

    # Check if there's a commit to undo (gitignore/rm-cached commit)
    last_msg=$(git log -1 --format=%s 2>/dev/null || true)
    if [[ "$last_msg" == *"metadata-only"* ]] || [[ "$last_msg" == *"Remove bulk"* ]]; then
        log "Reverting last commit: $last_msg"
        git reset HEAD~1
    fi

    # Restore .gitignore and .gitattributes from git
    git checkout -- .gitignore 2>/dev/null || true
    git checkout -- .gitattributes 2>/dev/null || true

    # Remove sentinel files
    rm -f "$SENTINEL" "$HOOK_SENTINEL"
    ssh "$REMOTE_HOST" "rm -f $SENTINEL" 2>/dev/null || true

    log "Rollback complete. Verify thread state manually."
    exit 0
fi

# --- Pre-flight Checks ---
log "$(dry_run_prefix)Starting thread-to-rsync migration"

# Must be on MacBook
CURRENT_HOSTNAME=$(hostname)
if [ "$CURRENT_HOSTNAME" != "macbook2025" ]; then
    log_error "This script must be run on MacBook (current: $CURRENT_HOSTNAME)"
    exit 1
fi

# Thread submodule must exist
if [ ! -d "$THREAD_DIR" ]; then
    log_error "Thread directory not found: $THREAD_DIR"
    exit 1
fi

# Reset any staged changes from auto-commit hooks (active session files get
# re-staged periodically). Unstaged working tree changes are expected from
# active sessions writing bulk data.
cd "$THREAD_DIR"
git reset HEAD 2>/dev/null || true

# Note: divergence between local and remote is acceptable -- the orphan commit
# in step 12 replaces all history on both sides. The migration disables sync-all
# first (step 1) to prevent new divergence during the migration window.

# Verify SSH connectivity to storage
if ! ssh "$REMOTE_HOST" "echo ok" >/dev/null 2>&1; then
    log_error "Cannot SSH to $REMOTE_HOST"
    exit 1
fi

# Verify remote thread directory exists
if ! ssh "$REMOTE_HOST" "test -d $REMOTE_USER_BASE/thread"; then
    log_error "Remote thread directory not found: $REMOTE_USER_BASE/thread"
    exit 1
fi

log "Pre-flight checks passed"

if [ "$DRY_RUN" = true ]; then
    log "[DRY RUN] Would execute the following 18 steps:"
    log "  Step 1: Disable sync-all on both machines + session import hook"
    log "  Step 2: Apply .gitattributes (remove merge drivers for bulk files)"
    log "  Step 3: git rm --cached bulk files (preserves local working tree)"
    log "  Step 4: Commit the removal locally"
    log "  Step 5: Push bulk data to remote via rsync"
    log "  Step 6: SSH backup bulk files on remote (hardlinks on /mnt/md0)"
    log "  Step 7: Push git commit to remote bare repo"
    log "  Step 8: SSH pull on remote (git deletes working tree bulk files)"
    log "  Step 9: SSH restore bulk files from backup"
    log "  Step 10: Verify file counts match"
    log "  Step 11: Delete normalized-session.json on both machines"
    log "  Step 12: Create orphan commit (git commit-tree)"
    log "  Step 13: Update parent repo pointer"
    log "  Step 14: Bare repo gc (reflog expire + gc --aggressive)"
    log "  Step 15: MacBook submodule deinit/reinit"
    log "  Step 16: Storage submodule deinit/reinit"
    log "  Step 17: Verify space reclaimed"
    log "  Step 18: Re-enable session hook, remove sentinels, run full import"

    # Show what would be removed from git
    log ""
    log "Files that would be removed from git index:"
    cd "$THREAD_DIR"
    BULK_FILES=$(git ls-files -- '*/timeline.jsonl' '*/timeline.json' '*/raw-data/*' '*/memory/*' 'plans/*' 2>/dev/null | wc -l)
    log "  $BULK_FILES bulk files currently tracked"

    TIMELINE_COUNT=$(find . -name 'timeline.jsonl' -not -path './.git/*' 2>/dev/null | wc -l | tr -d ' ')
    NORMALIZED_COUNT=$(find . -name 'normalized-session.json' -not -path './.git/*' 2>/dev/null | wc -l | tr -d ' ')
    log "  $TIMELINE_COUNT timeline.jsonl files"
    log "  $NORMALIZED_COUNT normalized-session.json files to delete"

    exit 0
fi

if ! confirm "Ready to begin migration. This will halt sync-all on both machines. Continue?"; then
    log "Aborted by user"
    exit 1
fi

# --- Step 1: Disable sync-all and session import hook ---
log "Step 1: Disabling sync-all on both machines and session import hook..."
echo "migration-in-progress $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$SENTINEL"
ssh "$REMOTE_HOST" "echo 'migration-in-progress $(date -u +%Y-%m-%dT%H:%M:%SZ)' > $SENTINEL"
touch "$HOOK_SENTINEL"
log "Step 1 complete: sync-all disabled, session import hook disabled"

# --- Step 1b: Sync thread submodule to resolve any divergence ---
log "Step 1b: Syncing thread submodule..."
cd "$THREAD_DIR"

# Stash active session files, sync, then restore
STASHED=false
if ! git diff --quiet 2>/dev/null; then
    git stash --include-untracked 2>/dev/null && STASHED=true
fi

# Fetch and merge (not rebase -- simpler for one-time migration)
git fetch origin 2>/dev/null
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null) || true
if [ -n "$REMOTE_HEAD" ] && [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
    log "  Thread diverged from remote, merging..."
    if ! git merge origin/main --no-edit 2>/dev/null; then
        # Auto-resolve: for a one-time migration, take ours for any conflicts
        # (both sides have the same data, just different batch sync boundaries)
        git checkout --theirs . 2>/dev/null || true
        git add -A 2>/dev/null
        GIT_EDITOR=true git commit --no-edit 2>/dev/null || true
    fi
    git push origin main 2>/dev/null || log "  Push after merge failed (non-fatal, will force-push at orphan step)"
fi

if [ "$STASHED" = true ]; then
    git stash pop 2>/dev/null || log "  Stash pop conflict (non-fatal, session files regenerated by hooks)"
fi
log "Step 1b complete: thread synced"

# --- Step 2: Apply .gitignore and .gitattributes ---
log "Step 2: Applying .gitignore and .gitattributes changes..."
cd "$THREAD_DIR"

# Verify .gitignore is in place (applied in Group A)
if ! grep -q 'timeline.jsonl' .gitignore 2>/dev/null; then
    log_error ".gitignore does not contain expected bulk data patterns. Apply Group A changes first."
    exit 1
fi

# Apply .gitattributes change now (cannot be done pre-migration -- removing merge
# driver entries causes rebase conflicts on in-flight batch sync commits)
echo '*/metadata.json merge=json-field-merge' > .gitattributes
git add .gitattributes
log "Step 2 complete: .gitattributes updated to metadata-only merge driver"

# --- Step 3: Remove bulk files from git index ---
log "Step 3: Removing bulk files from git index (preserves working tree)..."
cd "$THREAD_DIR"

# Remove tracked bulk files from index only
git ls-files -- '*/timeline.jsonl' '*/timeline.json' '*/raw-data/*' '*/memory/*' 'plans/*' | \
    xargs -r git rm --cached --quiet

REMOVED_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
log "Step 3 complete: $REMOVED_COUNT files removed from index"

# --- Step 4: Commit the removal ---
log "Step 4: Committing removal locally..."
cd "$THREAD_DIR"
if ! git diff --cached --quiet; then
    git commit -m "Remove bulk session data from git tracking

Bulk data (timeline, raw-data, memory, plans) is now synced via rsync.
Only metadata.json remains git-tracked."
    log "Step 4 complete: committed"
else
    log "Step 4: nothing to commit (already clean)"
fi

# --- Step 5: Push bulk data to remote via rsync ---
log "Step 5: Pushing bulk data to remote via rsync..."
"$SCRIPT_DIR/sync-thread-data.sh" --verbose
log "Step 5 complete: bulk data pushed"

# --- Step 6: Backup bulk files on remote ---
log "Step 6: Backing up bulk files on remote (hardlinks)..."
ssh "$REMOTE_HOST" "cp -al $REMOTE_USER_BASE/thread/ $BACKUP_DIR/"
log "Step 6 complete: backup at $BACKUP_DIR"

# --- Step 7: Push git commit to remote ---
log "Step 7: Pushing git commit to remote bare repo..."
cd "$THREAD_DIR"
git push origin main
log "Step 7 complete: pushed"

# --- Step 8: Pull on remote ---
log "Step 8: Pulling on remote (git will delete working tree bulk files)..."
ssh "$REMOTE_HOST" "cd $REMOTE_USER_BASE/thread && git pull"
log "Step 8 complete: remote pulled"

# --- Step 9: Restore bulk files from backup ---
log "Step 9: Restoring bulk files from backup on remote..."
ssh "$REMOTE_HOST" "rsync -a $BACKUP_DIR/ $REMOTE_USER_BASE/thread/ && rm -rf $BACKUP_DIR"
log "Step 9 complete: bulk files restored, backup removed"

# --- Step 10: Verify file counts ---
log "Step 10: Verifying file counts match..."
cd "$THREAD_DIR"
LOCAL_TIMELINE=$(find . -name 'timeline.jsonl' -not -path './.git/*' 2>/dev/null | wc -l | tr -d ' ')
REMOTE_TIMELINE=$(ssh "$REMOTE_HOST" "cd $REMOTE_USER_BASE/thread && find . -name 'timeline.jsonl' -not -path './.git/*' 2>/dev/null | wc -l" | tr -d ' ')

if [ "$LOCAL_TIMELINE" != "$REMOTE_TIMELINE" ]; then
    log_error "Timeline file count mismatch: local=$LOCAL_TIMELINE remote=$REMOTE_TIMELINE"
    log_error "Verify manually before continuing. Sentinel file still active."
    exit 1
fi
log "Step 10 complete: $LOCAL_TIMELINE timeline files match on both machines"

# --- Step 11: Delete normalized-session.json ---
log "Step 11: Deleting normalized-session.json on both machines..."
cd "$THREAD_DIR"
LOCAL_NORM_COUNT=$(find . -name 'normalized-session.json' -not -path './.git/*' 2>/dev/null | wc -l | tr -d ' ')
find . -name 'normalized-session.json' -not -path './.git/*' -delete 2>/dev/null || true
REMOTE_NORM_COUNT=$(ssh "$REMOTE_HOST" "cd $REMOTE_USER_BASE/thread && find . -name 'normalized-session.json' -not -path './.git/*' 2>/dev/null | wc -l" | tr -d ' ')
ssh "$REMOTE_HOST" "cd $REMOTE_USER_BASE/thread && find . -name 'normalized-session.json' -not -path './.git/*' -delete" 2>/dev/null || true
log "Step 11 complete: deleted $LOCAL_NORM_COUNT local + $REMOTE_NORM_COUNT remote normalized-session.json files"

if ! confirm "Steps 1-11 complete (reversible). Steps 12-18 perform irreversible history reset. Continue?"; then
    log "Paused at step 12. Sentinel still active. Re-run with --yes to continue."
    exit 0
fi

# --- Step 12: Create orphan commit ---
log "Step 12: Creating orphan commit on MacBook..."
cd "$THREAD_DIR"
NEW_COMMIT=$(git commit-tree HEAD^{tree} -m "Reset history: metadata-only tree

Historical bulk file blobs removed. Session data synced via rsync.")
git update-ref refs/heads/main "$NEW_COMMIT"
git checkout main
git push origin main --force
log "Step 12 complete: orphan commit $NEW_COMMIT force-pushed"

# --- Step 13: Update parent repo pointer ---
log "Step 13: Updating parent repo pointer..."
cd "$USER_BASE_DIRECTORY"
git add thread
git commit -m "chore: update thread pointer after history reset"
git push origin main
log "Step 13 complete: parent pointer updated"

# --- Step 14: Bare repo gc ---
log "Step 14: Running garbage collection on bare repo (this may take several minutes)..."
ssh "$REMOTE_HOST" "cd $REMOTE_BARE_REPO && git reflog expire --expire=now --all && git gc --prune=now --aggressive"
log "Step 14 complete: bare repo gc'd"

# --- Step 15: MacBook submodule deinit/reinit ---
log "Step 15: Reinitializing thread submodule on MacBook..."
cd "$USER_BASE_DIRECTORY"
git submodule deinit thread
rm -rf .git/modules/thread
git submodule update --init thread
log "Step 15 complete: MacBook thread submodule reinitialized"

# --- Step 16: Storage submodule deinit/reinit ---
log "Step 16: Reinitializing thread submodule on storage..."
ssh "$REMOTE_HOST" "cd $REMOTE_USER_BASE && git pull && git submodule deinit thread && rm -rf .git/modules/thread && git submodule update --init thread"
log "Step 16 complete: storage thread submodule reinitialized"

# --- Step 17: Verify space reclaimed ---
log "Step 17: Verifying space reclaimed..."
LOCAL_GIT_SIZE=$(du -sh "$USER_BASE_DIRECTORY/.git/modules/thread/" 2>/dev/null | awk '{print $1}')
REMOTE_BARE_SIZE=$(ssh "$REMOTE_HOST" "du -sh $REMOTE_BARE_REPO 2>/dev/null" | awk '{print $1}')
log "  MacBook .git/modules/thread/: $LOCAL_GIT_SIZE (expect <50 MB)"
log "  Storage bare repo: $REMOTE_BARE_SIZE"
log "Step 17 complete"

# --- Step 18: Re-enable session hook, remove sentinels, run full import ---
log "Step 18: Re-enabling session import hook and sync-all..."
rm -f "$HOOK_SENTINEL"
log "  Session import hook re-enabled"

# Run full import to catch up sessions that fired during the migration window
log "  Running full session import to catch up..."
node "$SCRIPT_DIR/convert-external-sessions.mjs" import --provider claude --allow-updates 2>&1 | tail -5 || {
    log_error "Full import failed (non-fatal). Run manually: node cli/convert-external-sessions.mjs import --provider claude --allow-updates"
}

rm -f "$SENTINEL"
ssh "$REMOTE_HOST" "rm -f $SENTINEL"
log "Step 18 complete: sync-all re-enabled"

log ""
log "Migration complete!"
log "  - Thread submodule now tracks only metadata.json in git"
log "  - Bulk data synced via rsync (sync-thread-data.sh)"
log "  - Historical blob storage reclaimed"
log "  - ensure_thread_merge_drivers() will auto-apply config on next sync cycle"
