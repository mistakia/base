import { takeLatest, fork, call, put } from 'redux-saga/effects'

import {
  get_git_status_all,
  get_git_status,
  get_git_diff,
  get_file_at_ref,
  get_git_file_content,
  stage_files,
  unstage_files,
  discard_files,
  commit_changes,
  pull_changes,
  push_changes,
  resolve_conflict,
  get_conflict_versions,
  abort_merge
} from '@core/api/sagas'
import { git_action_types } from './actions'
import { notification_actions } from '@core/notification/actions'

/**
 * Helper to show permission denied notification
 * @param {Error} error - The error object from API
 * @param {string} action - Description of the action that was denied
 */
function* show_permission_error(error, action) {
  const denied_files = error.denied_files
  let message = `Access denied: ${action}`
  if (denied_files && denied_files.length > 0) {
    message += `. Denied files: ${denied_files.slice(0, 3).join(', ')}`
    if (denied_files.length > 3) {
      message += ` and ${denied_files.length - 3} more`
    }
  }
  yield put(
    notification_actions.show_notification({
      severity: 'warning',
      message
    })
  )
}

// ============================================================================
// Load Status Sagas
// ============================================================================

export function* load_git_status_all() {
  yield call(get_git_status_all)
}

export function* load_git_status({ payload }) {
  const { repo_path } = payload
  yield call(get_git_status, { repo_path })
}

// ============================================================================
// Load Diff Saga
// ============================================================================

export function* load_git_diff({ payload }) {
  const { repo_path, file_path, staged } = payload
  yield call(get_git_diff, { repo_path, file_path, staged })
}

// ============================================================================
// Load File at Ref Saga
// ============================================================================

export function* load_file_at_ref({ payload }) {
  const { repo_path, file_path, ref } = payload
  yield call(get_file_at_ref, { repo_path, file_path, ref })
}

// ============================================================================
// Load File Content Saga (Working Copy)
// ============================================================================

export function* load_file_content({ payload }) {
  const { repo_path, file_path } = payload
  yield call(get_git_file_content, { repo_path, file_path })
}

// ============================================================================
// Stage/Unstage Sagas
// ============================================================================

export function* request_stage_files({ payload }) {
  const { repo_path, files } = payload
  try {
    yield call(stage_files, { repo_path, files })
    // Refresh status after staging
    yield call(get_git_status, { repo_path })
  } catch (error) {
    if (error.permission_denied) {
      yield* show_permission_error(error, 'staging files')
    }
    // Re-throw to let the generic error handling continue
    throw error
  }
}

export function* request_unstage_files({ payload }) {
  const { repo_path, files } = payload
  try {
    yield call(unstage_files, { repo_path, files })
    // Refresh status after unstaging
    yield call(get_git_status, { repo_path })
  } catch (error) {
    if (error.permission_denied) {
      yield* show_permission_error(error, 'unstaging files')
    }
    throw error
  }
}

// ============================================================================
// Discard Changes Saga
// ============================================================================

export function* request_discard_files({ payload }) {
  const { repo_path, files } = payload
  try {
    yield call(discard_files, { repo_path, files })
    // Refresh status after discarding
    yield call(get_git_status, { repo_path })
  } catch (error) {
    if (error.permission_denied) {
      yield* show_permission_error(error, 'discarding changes')
    }
    throw error
  }
}

// ============================================================================
// Commit Saga
// ============================================================================

export function* request_commit({ payload }) {
  const { repo_path, message } = payload
  try {
    yield call(commit_changes, { repo_path, message })
    // Refresh status after commit
    yield call(get_git_status, { repo_path })
    // Show success notification
    yield put(
      notification_actions.show_notification({
        severity: 'success',
        message: 'Changes committed successfully'
      })
    )
  } catch (error) {
    if (error.permission_denied) {
      yield* show_permission_error(error, 'committing changes')
    }
    throw error
  }
}

// ============================================================================
// Pull Saga
// ============================================================================

export function* request_pull({ payload }) {
  const { repo_path, remote, branch, stash_changes } = payload
  try {
    yield call(pull_changes, { repo_path, remote, branch, stash_changes })
    // Refresh status after pull
    yield call(get_git_status, { repo_path })
    yield put(
      notification_actions.show_notification({
        severity: 'success',
        message: 'Pull completed successfully'
      })
    )
  } catch (error) {
    if (error.permission_denied) {
      yield* show_permission_error(error, 'pulling changes')
    }
    throw error
  }
}

// ============================================================================
// Push Saga
// ============================================================================

export function* request_push({ payload }) {
  const { repo_path, remote, branch } = payload
  try {
    yield call(push_changes, { repo_path, remote, branch })
    // Refresh status after push
    yield call(get_git_status, { repo_path })
    yield put(
      notification_actions.show_notification({
        severity: 'success',
        message: 'Push completed successfully'
      })
    )
  } catch (error) {
    if (error.permission_denied) {
      yield* show_permission_error(error, 'pushing changes')
    }
    throw error
  }
}

// ============================================================================
// Resolve Conflict Saga
// ============================================================================

export function* request_resolve_conflict({ payload }) {
  const { repo_path, file_path, resolution, merged_content } = payload
  try {
    yield call(resolve_conflict, {
      repo_path,
      file_path,
      resolution,
      merged_content
    })
    // Refresh status after resolving conflict
    yield call(get_git_status, { repo_path })
    yield put(
      notification_actions.show_notification({
        severity: 'success',
        message: `Conflict resolved for ${file_path}`
      })
    )
  } catch (error) {
    if (error.permission_denied) {
      yield* show_permission_error(error, 'resolving conflict')
    }
    throw error
  }
}

// ============================================================================
// Load Conflict Versions Saga
// ============================================================================

export function* load_conflict_versions({ payload }) {
  const { repo_path, file_path } = payload
  yield call(get_conflict_versions, { repo_path, file_path })
}

// ============================================================================
// Abort Merge Saga
// ============================================================================

export function* request_abort_merge({ payload }) {
  const { repo_path } = payload
  try {
    yield call(abort_merge, { repo_path })
    // Refresh status after aborting merge
    yield call(get_git_status_all)
    yield put(
      notification_actions.show_notification({
        severity: 'success',
        message: 'Merge aborted successfully'
      })
    )
  } catch (error) {
    if (error.permission_denied) {
      yield* show_permission_error(error, 'aborting merge')
    }
    throw error
  }
}

// ============================================================================
// Watchers
// ============================================================================

export function* watch_load_git_status_all() {
  yield takeLatest(git_action_types.LOAD_GIT_STATUS_ALL, load_git_status_all)
}

export function* watch_load_git_status() {
  yield takeLatest(git_action_types.LOAD_GIT_STATUS, load_git_status)
}

export function* watch_load_git_diff() {
  yield takeLatest(git_action_types.LOAD_GIT_DIFF, load_git_diff)
}

export function* watch_load_file_at_ref() {
  yield takeLatest(git_action_types.LOAD_FILE_AT_REF, load_file_at_ref)
}

export function* watch_load_file_content() {
  yield takeLatest(git_action_types.LOAD_FILE_CONTENT, load_file_content)
}

export function* watch_stage_files() {
  yield takeLatest(git_action_types.REQUEST_STAGE_FILES, request_stage_files)
}

export function* watch_unstage_files() {
  yield takeLatest(
    git_action_types.REQUEST_UNSTAGE_FILES,
    request_unstage_files
  )
}

export function* watch_discard_files() {
  yield takeLatest(
    git_action_types.REQUEST_DISCARD_FILES,
    request_discard_files
  )
}

export function* watch_commit() {
  yield takeLatest(git_action_types.REQUEST_COMMIT, request_commit)
}

export function* watch_pull() {
  yield takeLatest(git_action_types.REQUEST_PULL, request_pull)
}

export function* watch_push() {
  yield takeLatest(git_action_types.REQUEST_PUSH, request_push)
}

export function* watch_resolve_conflict() {
  yield takeLatest(
    git_action_types.REQUEST_RESOLVE_CONFLICT,
    request_resolve_conflict
  )
}

export function* watch_load_conflict_versions() {
  yield takeLatest(
    git_action_types.LOAD_CONFLICT_VERSIONS,
    load_conflict_versions
  )
}

export function* watch_abort_merge() {
  yield takeLatest(git_action_types.REQUEST_ABORT_MERGE, request_abort_merge)
}

// ============================================================================
// Root Saga Export
// ============================================================================

export const git_sagas = [
  fork(watch_load_git_status_all),
  fork(watch_load_git_status),
  fork(watch_load_git_diff),
  fork(watch_load_file_at_ref),
  fork(watch_load_file_content),
  fork(watch_stage_files),
  fork(watch_unstage_files),
  fork(watch_discard_files),
  fork(watch_commit),
  fork(watch_pull),
  fork(watch_push),
  fork(watch_resolve_conflict),
  fork(watch_load_conflict_versions),
  fork(watch_abort_merge)
]
