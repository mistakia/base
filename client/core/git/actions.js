import { create_api_action_types, create_api_actions } from '@core/utils'

// Action type base names
const GET_GIT_STATUS_ALL = 'GET_GIT_STATUS_ALL'
const GET_GIT_STATUS = 'GET_GIT_STATUS'
const GET_GIT_DIFF = 'GET_GIT_DIFF'
const GET_FILE_AT_REF = 'GET_FILE_AT_REF'
const GET_FILE_CONTENT = 'GET_FILE_CONTENT'
const STAGE_FILES = 'STAGE_FILES'
const UNSTAGE_FILES = 'UNSTAGE_FILES'
const COMMIT_CHANGES = 'COMMIT_CHANGES'
const PULL_CHANGES = 'PULL_CHANGES'
const PUSH_CHANGES = 'PUSH_CHANGES'
const GET_CONFLICTS = 'GET_CONFLICTS'
const RESOLVE_CONFLICT = 'RESOLVE_CONFLICT'
const GET_CONFLICT_VERSIONS = 'GET_CONFLICT_VERSIONS'
const ABORT_MERGE = 'ABORT_MERGE'

export const git_action_types = {
  // API action types with PENDING/FULFILLED/FAILED variants
  ...create_api_action_types(GET_GIT_STATUS_ALL),
  ...create_api_action_types(GET_GIT_STATUS),
  ...create_api_action_types(GET_GIT_DIFF),
  ...create_api_action_types(GET_FILE_AT_REF),
  ...create_api_action_types(GET_FILE_CONTENT),
  ...create_api_action_types(STAGE_FILES),
  ...create_api_action_types(UNSTAGE_FILES),
  ...create_api_action_types(COMMIT_CHANGES),
  ...create_api_action_types(PULL_CHANGES),
  ...create_api_action_types(PUSH_CHANGES),
  ...create_api_action_types(GET_CONFLICTS),
  ...create_api_action_types(RESOLVE_CONFLICT),
  ...create_api_action_types(GET_CONFLICT_VERSIONS),
  ...create_api_action_types(ABORT_MERGE),

  // Trigger actions
  LOAD_GIT_STATUS_ALL: 'LOAD_GIT_STATUS_ALL',
  LOAD_GIT_STATUS: 'LOAD_GIT_STATUS',
  LOAD_GIT_DIFF: 'LOAD_GIT_DIFF',
  LOAD_FILE_AT_REF: 'LOAD_FILE_AT_REF',
  LOAD_FILE_CONTENT: 'LOAD_FILE_CONTENT',
  REQUEST_STAGE_FILES: 'REQUEST_STAGE_FILES',
  REQUEST_UNSTAGE_FILES: 'REQUEST_UNSTAGE_FILES',
  REQUEST_COMMIT: 'REQUEST_COMMIT',
  REQUEST_PULL: 'REQUEST_PULL',
  REQUEST_PUSH: 'REQUEST_PUSH',
  REQUEST_RESOLVE_CONFLICT: 'REQUEST_RESOLVE_CONFLICT',
  LOAD_CONFLICT_VERSIONS: 'LOAD_CONFLICT_VERSIONS',
  REQUEST_ABORT_MERGE: 'REQUEST_ABORT_MERGE',

  // UI state actions
  SET_SELECTED_FILE: 'GIT_SET_SELECTED_FILE',
  CLEAR_SELECTED_FILE: 'GIT_CLEAR_SELECTED_FILE',
  SET_ACTIVE_REPO: 'GIT_SET_ACTIVE_REPO'
}

// API actions (used by sagas)
export const get_git_status_all_actions = create_api_actions(GET_GIT_STATUS_ALL)
export const get_git_status_actions = create_api_actions(GET_GIT_STATUS)
export const get_git_diff_actions = create_api_actions(GET_GIT_DIFF)
export const get_file_at_ref_actions = create_api_actions(GET_FILE_AT_REF)
export const get_file_content_actions = create_api_actions(GET_FILE_CONTENT)
export const stage_files_actions = create_api_actions(STAGE_FILES)
export const unstage_files_actions = create_api_actions(UNSTAGE_FILES)
export const commit_changes_actions = create_api_actions(COMMIT_CHANGES)
export const pull_changes_actions = create_api_actions(PULL_CHANGES)
export const push_changes_actions = create_api_actions(PUSH_CHANGES)
export const get_conflicts_actions = create_api_actions(GET_CONFLICTS)
export const resolve_conflict_actions = create_api_actions(RESOLVE_CONFLICT)
export const get_conflict_versions_actions = create_api_actions(
  GET_CONFLICT_VERSIONS
)
export const abort_merge_actions = create_api_actions(ABORT_MERGE)

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

  // Load file content at a specific ref
  load_file_at_ref: ({ repo_path, file_path, ref = 'HEAD' }) => ({
    type: git_action_types.LOAD_FILE_AT_REF,
    payload: { repo_path, file_path, ref }
  }),

  // Load file content from working copy
  load_file_content: ({ repo_path, file_path }) => ({
    type: git_action_types.LOAD_FILE_CONTENT,
    payload: { repo_path, file_path }
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

  // Abort merge
  abort_merge: ({ repo_path }) => ({
    type: git_action_types.REQUEST_ABORT_MERGE,
    payload: { repo_path }
  }),

  // Load conflict versions for a specific file
  load_conflict_versions: ({ repo_path, file_path }) => ({
    type: git_action_types.LOAD_CONFLICT_VERSIONS,
    payload: { repo_path, file_path }
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
