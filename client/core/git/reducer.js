import { Record, Map, fromJS } from 'immutable'

import { git_action_types } from './actions'

// ============================================================================
// Initial State
// ============================================================================

const GitState = new Record({
  // Map of repo_path -> repo status data
  repos: new Map(),
  // Currently active repository path
  active_repo: null,
  // Currently selected file for diff viewing
  selected_file: null,
  // Map of repo_path -> file_path -> diff data
  diffs: new Map(),
  // Map of "${repo_path}:${file_path}:${ref}" -> { content, is_redacted }
  file_at_ref: new Map(),
  // Map of "${repo_path}:${file_path}" -> { content, is_redacted } for working copy
  file_content: new Map(),
  // Map of "${repo_path}:${file_path}" -> conflict version data
  conflict_versions: new Map(),
  // Loading states
  is_loading_status: false,
  is_loading_diff: false,
  is_loading_file_at_ref: false,
  is_loading_file_content: false,
  is_loading_conflict_versions: false,
  is_committing: false,
  is_pulling: false,
  is_pushing: false,
  is_resolving_conflict: false,
  is_generating_commit_message: false,
  generated_commit_message: null,
  // Error state
  error: null
})

// ============================================================================
// Reducer Function
// ============================================================================

export function git_reducer(state = new GitState(), { payload, type }) {
  switch (type) {
    // ========================================================================
    // Status Loading (All Repos)
    // ========================================================================

    case git_action_types.GET_GIT_STATUS_ALL_PENDING:
      return state.merge({
        is_loading_status: true,
        error: null
      })

    case git_action_types.GET_GIT_STATUS_ALL_FULFILLED: {
      const repos_array = payload.data?.repos || []
      const repos_map = new Map(
        repos_array.map((repo) => [repo.repo_path, fromJS(repo)])
      )

      // Set active_repo to first repo with changes, or user_base
      let active_repo = state.get('active_repo')
      if (!active_repo) {
        const repo_with_changes = repos_array.find((r) => r.has_changes)
        active_repo = repo_with_changes
          ? repo_with_changes.repo_path
          : repos_array[0]?.repo_path || null
      }

      return state.merge({
        repos: repos_map,
        active_repo,
        is_loading_status: false,
        error: null
      })
    }

    case git_action_types.GET_GIT_STATUS_ALL_FAILED:
      return state.merge({
        is_loading_status: false,
        error: payload.error
      })

    // ========================================================================
    // Status Loading (Single Repo)
    // ========================================================================

    case git_action_types.GET_GIT_STATUS_PENDING:
      return state.merge({
        is_loading_status: true,
        error: null
      })

    case git_action_types.GET_GIT_STATUS_FULFILLED: {
      const repo_path = payload.opts?.repo_path
      if (!repo_path) return state

      // Get existing repo data to preserve fields not returned by single-repo status
      // (repo_path, repo_name, is_user_base are only returned by /status/all)
      const existing_repo = state.getIn(['repos', repo_path])
      const new_data = fromJS(payload.data)

      // Merge new status data with existing repo data, preserving metadata fields
      const merged_repo = existing_repo
        ? existing_repo.merge(new_data)
        : new_data

      return state.setIn(['repos', repo_path], merged_repo).merge({
        is_loading_status: false,
        error: null
      })
    }

    case git_action_types.GET_GIT_STATUS_FAILED:
      return state.merge({
        is_loading_status: false,
        error: payload.error
      })

    // ========================================================================
    // Diff Loading
    // ========================================================================

    case git_action_types.GET_GIT_DIFF_PENDING:
      return state.merge({
        is_loading_diff: true,
        error: null
      })

    case git_action_types.GET_GIT_DIFF_FULFILLED: {
      const { repo_path, file_path } = payload.opts || {}
      if (!repo_path) return state

      const diff_key = file_path || '__all__'

      return state
        .setIn(['diffs', repo_path, diff_key], fromJS(payload.data))
        .merge({
          is_loading_diff: false,
          error: null
        })
    }

    case git_action_types.GET_GIT_DIFF_FAILED:
      return state.merge({
        is_loading_diff: false,
        error: payload.error
      })

    // ========================================================================
    // File at Ref Loading
    // ========================================================================

    case git_action_types.GET_FILE_AT_REF_PENDING:
      return state.merge({
        is_loading_file_at_ref: true,
        error: null
      })

    case git_action_types.GET_FILE_AT_REF_FULFILLED: {
      const { repo_path, file_path, ref } = payload.opts || {}
      if (!repo_path || !file_path) return state

      const cache_key = `${repo_path}:${file_path}:${ref || 'HEAD'}`

      return state
        .setIn(
          ['file_at_ref', cache_key],
          fromJS({
            content: payload.data?.content,
            is_redacted: payload.data?.is_redacted || false,
            is_new_file: payload.data?.is_new_file || false
          })
        )
        .merge({
          is_loading_file_at_ref: false,
          error: null
        })
    }

    case git_action_types.GET_FILE_AT_REF_FAILED:
      return state.merge({
        is_loading_file_at_ref: false,
        error: payload.error
      })

    // ========================================================================
    // File Content Loading (Working Copy)
    // ========================================================================

    case git_action_types.GET_FILE_CONTENT_PENDING:
      return state.merge({
        is_loading_file_content: true,
        error: null
      })

    case git_action_types.GET_FILE_CONTENT_FULFILLED: {
      const { repo_path, file_path } = payload.opts || {}
      if (!repo_path || !file_path) return state

      const cache_key = `${repo_path}:${file_path}`

      return state
        .setIn(
          ['file_content', cache_key],
          fromJS({
            content: payload.data?.content,
            is_redacted: payload.data?.is_redacted || false
          })
        )
        .merge({
          is_loading_file_content: false,
          error: null
        })
    }

    case git_action_types.GET_FILE_CONTENT_FAILED:
      return state.merge({
        is_loading_file_content: false,
        error: payload.error
      })

    // ========================================================================
    // Conflict Versions Loading
    // ========================================================================

    case git_action_types.GET_CONFLICT_VERSIONS_PENDING:
      return state.merge({
        is_loading_conflict_versions: true,
        error: null
      })

    case git_action_types.GET_CONFLICT_VERSIONS_FULFILLED: {
      const { repo_path, file_path } = payload.opts || {}
      if (!repo_path || !file_path) return state

      const cache_key = `${repo_path}:${file_path}`

      return state
        .setIn(['conflict_versions', cache_key], fromJS(payload.data))
        .merge({
          is_loading_conflict_versions: false,
          error: null
        })
    }

    case git_action_types.GET_CONFLICT_VERSIONS_FAILED:
      return state.merge({
        is_loading_conflict_versions: false,
        error: payload.error
      })

    // ========================================================================
    // Stage/Unstage Files
    // ========================================================================

    case git_action_types.STAGE_FILES_FULFILLED:
    case git_action_types.UNSTAGE_FILES_FULFILLED:
      // Status will be refreshed by saga after these operations
      return state

    case git_action_types.STAGE_FILES_FAILED:
    case git_action_types.UNSTAGE_FILES_FAILED:
      return state.set('error', payload.error)

    // ========================================================================
    // Commit
    // ========================================================================

    case git_action_types.COMMIT_CHANGES_PENDING:
      return state.merge({
        is_committing: true,
        error: null
      })

    case git_action_types.COMMIT_CHANGES_FULFILLED:
      return state.merge({
        is_committing: false,
        generated_commit_message: null,
        error: null
      })

    case git_action_types.COMMIT_CHANGES_FAILED:
      return state.merge({
        is_committing: false,
        error: payload.error
      })

    // ========================================================================
    // Pull
    // ========================================================================

    case git_action_types.PULL_CHANGES_PENDING:
      return state.merge({
        is_pulling: true,
        error: null
      })

    case git_action_types.PULL_CHANGES_FULFILLED:
      return state.merge({
        is_pulling: false,
        error: null
      })

    case git_action_types.PULL_CHANGES_FAILED:
      return state.merge({
        is_pulling: false,
        error: payload.error
      })

    // ========================================================================
    // Push
    // ========================================================================

    case git_action_types.PUSH_CHANGES_PENDING:
      return state.merge({
        is_pushing: true,
        error: null
      })

    case git_action_types.PUSH_CHANGES_FULFILLED:
      return state.merge({
        is_pushing: false,
        error: null
      })

    case git_action_types.PUSH_CHANGES_FAILED:
      return state.merge({
        is_pushing: false,
        error: payload.error
      })

    // ========================================================================
    // Resolve Conflict
    // ========================================================================

    case git_action_types.RESOLVE_CONFLICT_PENDING:
      return state.merge({
        is_resolving_conflict: true,
        error: null
      })

    case git_action_types.RESOLVE_CONFLICT_FULFILLED: {
      const { repo_path, file_path } = payload.opts || {}
      if (!repo_path || !file_path) {
        return state.merge({ is_resolving_conflict: false, error: null })
      }
      const cache_key = `${repo_path}:${file_path}`
      const head_cache_key = `${repo_path}:${file_path}:HEAD`
      // Clear all cached data for the resolved file to ensure fresh data on next load
      return state
        .deleteIn(['conflict_versions', cache_key])
        .deleteIn(['file_content', cache_key])
        .deleteIn(['file_at_ref', head_cache_key])
        .merge({
          is_resolving_conflict: false,
          error: null
        })
    }

    case git_action_types.RESOLVE_CONFLICT_FAILED:
      return state.merge({
        is_resolving_conflict: false,
        error: payload.error
      })

    // ========================================================================
    // Generate Commit Message
    // ========================================================================

    case git_action_types.GENERATE_COMMIT_MESSAGE_PENDING:
      return state.merge({
        is_generating_commit_message: true,
        generated_commit_message: null,
        error: null
      })

    case git_action_types.GENERATE_COMMIT_MESSAGE_FULFILLED:
      return state.merge({
        is_generating_commit_message: false,
        generated_commit_message: payload.data?.message || null,
        error: null
      })

    case git_action_types.GENERATE_COMMIT_MESSAGE_FAILED:
      return state.merge({
        is_generating_commit_message: false,
        error: payload.error
      })

    // ========================================================================
    // UI State
    // ========================================================================

    case git_action_types.SET_SELECTED_FILE:
      return state.set(
        'selected_file',
        fromJS({
          repo_path: payload.repo_path,
          file_path: payload.file_path
        })
      )

    case git_action_types.CLEAR_SELECTED_FILE:
      return state.set('selected_file', null)

    case git_action_types.SET_ACTIVE_REPO:
      return state.set('active_repo', payload.repo_path)

    default:
      return state
  }
}
