/**
 * Change Requests Module
 *
 * This module provides functionality for managing change requests, which represent
 * proposed changes to the codebase that can be reviewed, approved, and merged.
 * Git operations are centralized here as the source of truth for change requests.
 */

// Export everything from the modular files
export { create_change_request } from './create.mjs'
export { get_change_request, list_change_requests } from './retrieve.mjs'
export {
  update_change_request_status,
  merge_change_request
} from './update.mjs'
export { handle_github_webhook } from './webhooks.mjs'
export { VALID_STATUSES, VALID_TRANSITIONS } from './constants.mjs'

// Export utility functions
export {
  get_change_request_commits,
  merge_branch_for_change_request,
  build_change_request_from_git
} from './utils.mjs'
