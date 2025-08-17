import path from 'path'
import debug from 'debug'

import get_thread from './get-thread.mjs'
import { thread_constants } from '#libs-shared'
import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'

const { THREAD_STATE, validate_thread_state, validate_archive_reason } =
  thread_constants
const log = debug('threads:update')

/**
 * Update thread state
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to update
 * @param {string} params.thread_state New thread state
 * @param {string} [params.reason] Reason for state change (for archived state, must be valid archive reason)
 * @returns {Promise<Object>} Updated thread data
 */
export async function update_thread_state({ thread_id, thread_state, reason }) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  if (!thread_state) {
    throw new Error('thread_state is required')
  }

  // Validate thread_state using shared function
  validate_thread_state(thread_state)

  log(`Updating thread ${thread_id} state to ${thread_state}`)

  // Get current thread data
  const thread = await get_thread({
    thread_id
  })

  // No change if thread_state is already set
  if (thread.thread_state === thread_state) {
    return thread
  }

  // Update metadata
  const metadata_path = path.join(thread.context_dir, 'metadata.json')
  const metadata = { ...thread }

  delete metadata.timeline
  delete metadata.context_dir

  // Set new thread_state
  metadata.thread_state = thread_state
  metadata.updated_at = new Date().toISOString()

  // Add thread_state-specific fields
  if (thread_state === THREAD_STATE.ARCHIVED) {
    metadata.archived_at = new Date().toISOString()
    if (reason) {
      validate_archive_reason(reason)
      metadata.archive_reason = reason
    }
  }

  // Remove thread_state-specific fields if no longer applicable
  if (thread_state !== THREAD_STATE.ARCHIVED) {
    delete metadata.archived_at
    delete metadata.archive_reason
  }

  // Write updated metadata
  await write_file_to_filesystem({
    absolute_path: metadata_path,
    file_content: JSON.stringify(metadata, null, 2)
  })

  // Add thread_state change entry to timeline
  const timeline_entry = {
    id: `thread_state_${Date.now()}`,
    timestamp: metadata.updated_at,
    type: 'thread_state_change',
    previous_thread_state: thread.thread_state,
    new_thread_state: thread_state
  }

  if (reason) {
    timeline_entry.reason = reason
  }

  const timeline = [...thread.timeline, timeline_entry]

  // Write updated timeline
  await write_file_to_filesystem({
    absolute_path: path.join(thread.context_dir, 'timeline.json'),
    file_content: JSON.stringify(timeline, null, 2)
  })

  // Return updated thread data
  return {
    ...metadata,
    timeline,
    context_dir: thread.context_dir
  }
}

/**
 * Update thread metadata
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to update
 * @param {Object} params.metadata Metadata fields to update
 * @param {string} [params.user_base_directory] Custom user base directory (overrides registry)
 * @returns {Promise<Object>} Updated thread data
 */
export async function update_thread_metadata({
  thread_id,
  metadata = {},
  user_base_directory
}) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  if (!metadata || Object.keys(metadata).length === 0) {
    throw new Error('metadata must contain at least one field to update')
  }

  log(`Updating thread ${thread_id} metadata`)

  // Get current thread data
  const thread = await get_thread({
    thread_id
  })

  // Update metadata
  const metadata_path = path.join(thread.context_dir, 'metadata.json')
  const current_metadata = { ...thread }

  delete current_metadata.timeline
  delete current_metadata.context_dir

  // Prevent updating protected fields
  const protected_fields = ['thread_id', 'user_public_key', 'created_at']

  for (const field of protected_fields) {
    if (metadata[field] !== undefined) {
      delete metadata[field]
    }
  }

  // Special handling for thread_state changes
  if (
    metadata.thread_state !== undefined &&
    metadata.thread_state !== thread.thread_state
  ) {
    // Use the dedicated function for thread_state changes
    return update_thread_state({
      thread_id,
      thread_state: metadata.thread_state,
      reason: metadata.reason,
      user_base_directory
    })
  }

  // Update metadata
  const updated_metadata = {
    ...current_metadata,
    ...metadata,
    updated_at: new Date().toISOString()
  }

  // Write updated metadata
  await write_file_to_filesystem({
    absolute_path: metadata_path,
    file_content: JSON.stringify(updated_metadata, null, 2)
  })

  // Return updated thread data
  return {
    ...updated_metadata,
    timeline: thread.timeline,
    context_dir: thread.context_dir
  }
}

// Export default function as update_thread_state for convenience
export default update_thread_state
