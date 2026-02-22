// Main git operations index module
import branch_operations from './branch-operations.mjs'
import worktree_operations from './worktree-operations.mjs'
import file_operations from './file-operations.mjs'
import search_operations from './search-operations.mjs'
import commit_operations from './commit-operations.mjs'
import repository_operations from './repository-operations.mjs'
import git_files from './git-files/index.mjs'
import status_operations from './status.mjs'
import sync_operations from './sync.mjs'
import conflict_operations from './conflicts.mjs'
import { find_git_root } from './find-git-root.mjs'
import { get_file_status, get_file_diff_stats } from './file-status.mjs'
import {
  get_repo_statistics,
  get_commit_log,
  get_single_commit
} from './repo-statistics.mjs'

// Export all operations
export const {
  get_current_branch,
  branch_exists,
  create_branch,
  checkout_branch,
  merge_branch,
  delete_branch,
  push_branch
} = branch_operations

export const { create_worktree, remove_worktree } = worktree_operations

export const {
  apply_patch,
  generate_patch,
  read_file_from_ref,
  list_files,
  list_files_recursive,
  delete_file,
  get_file_git_sha
} = file_operations

export const {
  get_diff,
  search_repository,
  get_commits_with_diffs,
  get_merge_commit_info
} = search_operations

export const { add_files, commit_changes, unstage_files, discard_changes } =
  commit_operations

export const { get_repo_info, git_init, list_submodules } =
  repository_operations

export const { write_file_to_git, delete_file_from_git } = git_files

export const { get_status, get_multi_repo_status } = status_operations

export const { pull, fetch_remote } = sync_operations

export const {
  get_conflicts,
  get_conflict_versions,
  resolve_conflict,
  abort_merge,
  is_merging,
  get_current_branch_name,
  get_merge_head_branch_name
} = conflict_operations

export const { get_working_tree_diff, get_file_content_for_diff } =
  search_operations

export { find_git_root }

export { get_file_status, get_file_diff_stats }

export { get_repo_statistics, get_commit_log, get_single_commit }

// Export default as a single object with all operations
export default {
  // Branch operations
  get_current_branch,
  branch_exists,
  create_branch,
  checkout_branch,
  merge_branch,
  delete_branch,
  push_branch,

  // Worktree operations
  create_worktree,
  remove_worktree,

  // File operations
  apply_patch,
  generate_patch,
  read_file_from_ref,
  list_files,
  delete_file,
  get_file_git_sha,

  // Git files operations
  write_file_to_git,
  delete_file_from_git,

  // Search operations
  get_diff,
  search_repository,
  get_commits_with_diffs,
  get_working_tree_diff,
  get_file_content_for_diff,

  // Commit operations
  add_files,
  commit_changes,
  unstage_files,
  discard_changes,

  // Core operations
  get_repo_info,
  git_init,
  list_submodules,

  // Status operations
  get_status,
  get_multi_repo_status,

  // Sync operations
  pull,
  fetch_remote,

  // Conflict operations
  get_conflicts,
  get_conflict_versions,
  resolve_conflict,
  abort_merge,
  is_merging,
  get_current_branch_name,
  get_merge_head_branch_name,

  // Find git root
  find_git_root,

  // File status
  get_file_status,
  get_file_diff_stats,

  // Repository statistics
  get_repo_statistics,
  get_commit_log,
  get_single_commit
}
