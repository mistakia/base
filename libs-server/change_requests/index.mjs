/**
 * Change Requests Module
 *
 * This module provides functionality for managing change requests, which represent
 * proposed changes to the codebase that can be reviewed, approved, and merged.
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
