---
title: Git Operations
type: text
description: >-
  Reference for git patterns used by the system covering thread worktrees, entity version control,
  multi-machine sync, submodule management, and the git utility library
created_at: '2026-03-02T06:36:49.629Z'
entity_id: 8631f10b-77c4-4a11-8a83-6c96cbcd8286
base_uri: sys:system/text/git-operations.md
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/cross-machine-sessions.md]]
  - relates_to [[sys:system/text/execution-threads.md]]
updated_at: '2026-03-02T06:36:49.629Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Git Operations

Git is fundamental infrastructure for the Base system. All data is stored as markdown files in git repositories, thread execution uses isolated worktrees, and multi-machine sync relies on git push/pull workflows.

## Thread Worktree Lifecycle

Thread execution uses isolated git worktrees to prevent concurrent work from interfering with the main working tree.

### Creation

`create_thread_branch()` sets up isolation:

1. Create branch `thread/{thread_id}` in both system and user repositories (without checkout)
2. Create worktree for system repo in `/tmp/git-worktrees/thread-{id}-{timestamp}-{rand}`
3. Create matching worktree for user repo on same branch name
4. Return paths: `{ system, user }`

### Execution

- Thread operates in isolated worktrees, committing to the `thread/{id}` branch
- System and user worktrees are independent but synchronized via main branches
- Timeline records all actions immutably

### Cleanup

`archive_thread()` handles teardown:

1. Update thread state to `archived` with optional reason
2. Add state-change timeline entry
3. Remove system worktree: `git worktree remove --force`
4. Remove user worktree: `git worktree remove --force`
5. Branches remain in repo for historical reference (not deleted)

## Entity Version Control

All entity operations (create, update, delete) are backed by git commits.

### Atomic File Operations

`write_file_to_git()`:

1. Verify target branch exists
2. Create ephemeral worktree
3. Write file content
4. Stage and commit
5. Remove worktree (in finally block)

`delete_file_from_git()`:

1. Verify branch exists
2. Create worktree
3. `git rm` the file
4. Commit and remove worktree

Ephemeral worktrees are created and destroyed for each operation, preventing resource leaks and ensuring branch isolation.

## Multi-Machine Sync

### Submodule Architecture

`thread/` and `import-history/` are managed as independent git submodules with bare repos on the storage server. Configuration:

- `ignore = dirty`: Prevents slow `git status` from scanning submodule contents
- `active = false`: Archive submodules do not initialize on other machines

### Dual-Machine Workflow

**Primary Machine**:

- Commits to thread and import-history submodules independently
- Periodically runs `update-submodule-pointers.sh` to snapshot current HEAD in parent repo

**Secondary Machine**:

- Receives push via post-receive hook
- Hook stashes local changes, resets to remote, restores stash
- Preserves uncommitted work from active sessions

### Conflict Prevention

- Primary machine is authoritative for committed history
- Secondary machine prioritizes local session data (stash/unstash pattern)
- No force pushes; standard merge/rebase flow
- Submodules synced via explicit pointer updates in parent repo

## Merge Workflow

The merge-worktree workflow handles feature branch merges:

1. Update main branch from remote
2. Sync submodules first (commit, rebase, push each modified submodule)
3. Rebase feature branch from worktree
4. Merge into main with `--no-ff`
5. Push merged changes
6. Clean up worktree and delete feature branch

Critical rule: submodule commits must be pushed before the parent repo references them.

## Git Utility Library

The `libs-server/git/` module provides comprehensive git operations:

### Branch Operations

- `create_branch()`, `checkout_branch()`, `merge_branch()`
- `delete_branch()`, `push_branch()`
- `branch_exists()` with local and remote checking

### Worktree Operations

- `create_worktree()`: Create in `/tmp/git-worktrees/` or reuse existing
- `remove_worktree()`: Safe removal (skips if main working tree)

### File Operations

- `read_file_from_ref()`: Read file at any git ref via `git show`
- `list_files()`: List files via `git ls-tree` with regex filtering
- `apply_patch()` / `generate_patch()`: Unified diff operations
- `get_file_git_sha()`: Get SHA hash for a file

### Commit Operations

- `add_files()`, `commit_changes()`: Stage and commit with optional author
- `unstage_files()`, `discard_changes()`: Undo staging or working tree changes

### Sync Operations

- `pull()`: Pull with auto-stash, conflict detection, and stash restore
- `fetch_remote()`: Fetch without merge

### Status Operations

- `get_status()`: Branch, ahead/behind counts, staged/unstaged/untracked files, conflicts
- `get_multi_repo_status()`: Parallel status for multiple repos

### Conflict Resolution

- `get_conflicts()`, `get_conflict_versions()`: Detect and inspect conflicts
- `resolve_conflict()`: Resolve via strategy or merged content
- `is_merging()`, `abort_merge()`: Merge state management

### Search

- `search_repository()`: `git grep` with quoting
- `get_commits_with_diffs()`: Search commit history with diffs

### Status Cache

In-memory cache for repository status with:

- Concurrency-limited initialization (5 parallel repos)
- File watcher integration for invalidation
- Cold-start protection with promise queue

## Key Modules

| Module                                         | Purpose                                      |
| ---------------------------------------------- | -------------------------------------------- |
| `libs-server/git/index.mjs`                    | Public API exporting all git operations      |
| `libs-server/git/branch.mjs`                   | Branch create, checkout, merge, delete, push |
| `libs-server/git/worktree.mjs`                 | Worktree create and remove                   |
| `libs-server/git/files.mjs`                    | File read, write, delete via git             |
| `libs-server/git/status.mjs`                   | Repository status and multi-repo status      |
| `libs-server/git/conflicts.mjs`                | Conflict detection and resolution            |
| `libs-server/git/search.mjs`                   | Repository content search                    |
| `libs-server/git/cache.mjs`                    | Status cache with file watcher integration   |
| `libs-server/git/git-files.mjs`                | High-level atomic file I/O with commits      |
| `libs-server/threads/create-thread-branch.mjs` | Thread worktree setup                        |
| `libs-server/threads/archive-thread.mjs`       | Thread worktree teardown                     |
