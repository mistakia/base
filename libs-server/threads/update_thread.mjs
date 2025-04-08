import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import get_thread from './get_thread.mjs'
import { THREAD_BASE_DIRECTORY } from './threads_constants.mjs'

const log = debug('threads:update')
const VALID_STATES = ['active', 'paused', 'terminated']

/**
 * Update thread state
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to update
 * @param {string} params.state New thread state
 * @param {string} [params.reason] Reason for state change
 * @param {string} [params.thread_base_directory] Base directory for threads
 * @returns {Promise<Object>} Updated thread data
 */
export async function update_thread_state({
  thread_id,
  state,
  reason,
  thread_base_directory = THREAD_BASE_DIRECTORY
}) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  if (!state) {
    throw new Error('state is required')
  }

  if (!VALID_STATES.includes(state)) {
    throw new Error(
      `Invalid state: ${state}. Must be one of: ${VALID_STATES.join(', ')}`
    )
  }

  log(`Updating thread ${thread_id} state to ${state}`)

  // Get current thread data
  const thread = await get_thread({ thread_id, thread_base_directory })

  // No change if state is already set
  if (thread.state === state) {
    return thread
  }

  // Update metadata
  const metadata_path = path.join(thread.context_dir, 'metadata.json')
  const metadata = { ...thread }

  delete metadata.timeline
  delete metadata.context_dir

  // Set new state
  metadata.state = state
  metadata.updated_at = new Date().toISOString()

  // Add state-specific fields
  if (state === 'paused' && reason) {
    metadata.pause_reason = reason
  } else if (state === 'terminated' && reason) {
    metadata.termination_reason = reason
  }

  // Remove state-specific fields if no longer applicable
  if (state !== 'paused') {
    delete metadata.pause_reason
  }

  if (state !== 'terminated') {
    delete metadata.termination_reason
  }

  // Write updated metadata
  await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2), 'utf-8')

  // Add state change entry to timeline
  const timeline_entry = {
    id: `state_${Date.now()}`,
    timestamp: metadata.updated_at,
    type: 'state_change',
    previous_state: thread.state,
    new_state: state
  }

  if (reason) {
    timeline_entry.reason = reason
  }

  const timeline = [...thread.timeline, timeline_entry]

  // Write updated timeline
  await fs.writeFile(
    path.join(thread.context_dir, 'timeline.json'),
    JSON.stringify(timeline, null, 2),
    'utf-8'
  )

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
 * @param {string} [params.thread_base_directory] Base directory for threads
 * @returns {Promise<Object>} Updated thread data
 */
export async function update_thread_metadata({
  thread_id,
  metadata = {},
  thread_base_directory = THREAD_BASE_DIRECTORY
}) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  if (!metadata || Object.keys(metadata).length === 0) {
    throw new Error('metadata must contain at least one field to update')
  }

  log(`Updating thread ${thread_id} metadata`)

  // Get current thread data
  const thread = await get_thread({ thread_id, thread_base_directory })

  // Update metadata
  const metadata_path = path.join(thread.context_dir, 'metadata.json')
  const current_metadata = { ...thread }

  delete current_metadata.timeline
  delete current_metadata.context_dir

  // Prevent updating protected fields
  const protected_fields = ['thread_id', 'user_id', 'created_at']

  for (const field of protected_fields) {
    if (metadata[field] !== undefined) {
      delete metadata[field]
    }
  }

  // Special handling for state changes
  if (metadata.state !== undefined && metadata.state !== thread.state) {
    // Use the dedicated function for state changes
    return update_thread_state({
      thread_id,
      state: metadata.state,
      reason: metadata.reason,
      thread_base_directory
    })
  }

  // Update metadata
  const updated_metadata = {
    ...current_metadata,
    ...metadata,
    updated_at: new Date().toISOString()
  }

  // Write updated metadata
  await fs.writeFile(
    metadata_path,
    JSON.stringify(updated_metadata, null, 2),
    'utf-8'
  )

  // Return updated thread data
  return {
    ...updated_metadata,
    timeline: thread.timeline,
    context_dir: thread.context_dir
  }
}

// Export default function as update_thread_state for convenience
export default update_thread_state
