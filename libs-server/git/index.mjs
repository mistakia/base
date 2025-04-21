// Main git operations index module
import branch_operations from './branch_operations.mjs'
import worktree_operations from './worktree_operations.mjs'
import file_operations from './file_operations.mjs'
import search_operations from './search_operations.mjs'
import commit_operations from './commit_operations.mjs'
import core_operations from './core_operations.mjs'

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
  delete_file
} = file_operations

export const {
  get_diff,
  search_repository,
  get_commits_with_diffs,
  get_merge_commit_info
} = search_operations

export const { add_files, commit_changes } = commit_operations

export const { is_submodule, ensure_directory, get_repo_info, git_init } =
  core_operations

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

  // Search operations
  get_diff,
  search_repository,
  get_commits_with_diffs,

  // Commit operations
  add_files,
  commit_changes,

  // Core operations
  is_submodule,
  ensure_directory,
  get_repo_info,
  git_init
}
