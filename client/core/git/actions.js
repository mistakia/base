import { create_api_action_types, create_api_actions } from '@core/utils'

// Action type base names
const GET_GIT_STATUS_ALL = 'GET_GIT_STATUS_ALL'
const GET_GIT_STATUS = 'GET_GIT_STATUS'
const GET_GIT_DIFF = 'GET_GIT_DIFF'
const STAGE_FILES = 'STAGE_FILES'
const UNSTAGE_FILES = 'UNSTAGE_FILES'
const COMMIT_CHANGES = 'COMMIT_CHANGES'
const PULL_CHANGES = 'PULL_CHANGES'
const PUSH_CHANGES = 'PUSH_CHANGES'
const GET_CONFLICTS = 'GET_CONFLICTS'
const RESOLVE_CONFLICT = 'RESOLVE_CONFLICT'

export const git_action_types = {
  // API action types with PENDING/FULFILLED/FAILED variants
  ...create_api_action_types(GET_GIT_STATUS_ALL),
  ...create_api_action_types(GET_GIT_STATUS),
  ...create_api_action_types(GET_GIT_DIFF),
  ...create_api_action_types(STAGE_FILES),
  ...create_api_action_types(UNSTAGE_FILES),
  ...create_api_action_types(COMMIT_CHANGES),
  ...create_api_action_types(PULL_CHANGES),
  ...create_api_action_types(PUSH_CHANGES),
  ...create_api_action_types(GET_CONFLICTS),
  ...create_api_action_types(RESOLVE_CONFLICT),

  // Trigger actions
  LOAD_GIT_STATUS_ALL: 'LOAD_GIT_STATUS_ALL',
  LOAD_GIT_STATUS: 'LOAD_GIT_STATUS',
  LOAD_GIT_DIFF: 'LOAD_GIT_DIFF',
  REQUEST_STAGE_FILES: 'REQUEST_STAGE_FILES',
  REQUEST_UNSTAGE_FILES: 'REQUEST_UNSTAGE_FILES',
  REQUEST_COMMIT: 'REQUEST_COMMIT',
  REQUEST_PULL: 'REQUEST_PULL',
  REQUEST_PUSH: 'REQUEST_PUSH',
  REQUEST_RESOLVE_CONFLICT: 'REQUEST_RESOLVE_CONFLICT',

  // UI state actions
  SET_SELECTED_FILE: 'GIT_SET_SELECTED_FILE',
  CLEAR_SELECTED_FILE: 'GIT_CLEAR_SELECTED_FILE',
  SET_ACTIVE_REPO: 'GIT_SET_ACTIVE_REPO'
}

// API actions (used by sagas)
export const get_git_status_all_actions = create_api_actions(GET_GIT_STATUS_ALL)
export const get_git_status_actions = create_api_actions(GET_GIT_STATUS)
export const get_git_diff_actions = create_api_actions(GET_GIT_DIFF)
export const stage_files_actions = create_api_actions(STAGE_FILES)
export const unstage_files_actions = create_api_actions(UNSTAGE_FILES)
export const commit_changes_actions = create_api_actions(COMMIT_CHANGES)
export const pull_changes_actions = create_api_actions(PULL_CHANGES)
export const push_changes_actions = create_api_actions(PUSH_CHANGES)
export const get_conflicts_actions = create_api_actions(GET_CONFLICTS)
export const resolve_conflict_actions = create_api_actions(RESOLVE_CONFLICT)

// Action creators for component use
export const git_actions = {
  // Load all repositories status
  load_git_status_all: () => ({
    type: git_action_types.LOAD_GIT_STATUS_ALL
  }),

  // Load status for a specific repository
  load_git_status: (repo_path) => ({
    type: git_action_types.LOAD_GIT_STATUS,
    payload: { repo_path }
  }),

  // Load diff for a file
  load_git_diff: ({ repo_path, file_path, staged }) => ({
    type: git_action_types.LOAD_GIT_DIFF,
    payload: { repo_path, file_path, staged }
  }),

  // Stage files
  stage_files: ({ repo_path, files }) => ({
    type: git_action_types.REQUEST_STAGE_FILES,
    payload: { repo_path, files }
  }),

  // Unstage files
  unstage_files: ({ repo_path, files }) => ({
    type: git_action_types.REQUEST_UNSTAGE_FILES,
    payload: { repo_path, files }
  }),

  // Commit changes
  commit: ({ repo_path, message }) => ({
    type: git_action_types.REQUEST_COMMIT,
    payload: { repo_path, message }
  }),

  // Pull from remote
  pull: ({ repo_path, remote, branch, stash_changes }) => ({
    type: git_action_types.REQUEST_PULL,
    payload: { repo_path, remote, branch, stash_changes }
  }),

  // Push to remote
  push: ({ repo_path, remote, branch }) => ({
    type: git_action_types.REQUEST_PUSH,
    payload: { repo_path, remote, branch }
  }),

  // Resolve conflict
  resolve_conflict: ({ repo_path, file_path, resolution, merged_content }) => ({
    type: git_action_types.REQUEST_RESOLVE_CONFLICT,
    payload: { repo_path, file_path, resolution, merged_content }
  }),

  // UI actions
  set_selected_file: ({ repo_path, file_path }) => ({
    type: git_action_types.SET_SELECTED_FILE,
    payload: { repo_path, file_path }
  }),

  clear_selected_file: () => ({
    type: git_action_types.CLEAR_SELECTED_FILE
  }),

  set_active_repo: (repo_path) => ({
    type: git_action_types.SET_ACTIVE_REPO,
    payload: { repo_path }
  })
}
