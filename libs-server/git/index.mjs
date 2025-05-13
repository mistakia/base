// Main git operations index module
import branch_operations from './branch-operations.mjs'
import worktree_operations from './worktree-operations.mjs'
import file_operations from './file-operations.mjs'
import search_operations from './search-operations.mjs'
import commit_operations from './commit-operations.mjs'
import repository_operations from './repository-operations.mjs'
import git_files from './git-files/index.mjs'

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

export const { add_files, commit_changes } = commit_operations

export const { is_submodule, get_repo_info, git_init } = repository_operations

export const { write_file_to_git, delete_file_from_git } = git_files

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

  // Commit operations
  add_files,
  commit_changes,

  // Core operations
  is_submodule,
  get_repo_info,
  git_init
}
