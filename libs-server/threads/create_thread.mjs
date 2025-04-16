import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import debug from 'debug'

import { THREAD_BASE_DIRECTORY } from './threads_constants.mjs'
import { thread_constants } from '#libs-shared'

const { THREAD_STATUS, validate_thread_state } = thread_constants
const log = debug('threads:create')

/**
 * Create a new thread with proper structure
 *
 * @param {Object} params Thread creation parameters
 * @param {string} params.user_id ID of the user who owns the thread
 * @param {string} params.inference_provider Name of inference provider (e.g., 'ollama')
 * @param {string} params.model Model to use from the provider
 * @param {string} [params.state=THREAD_STATUS.ACTIVE] Thread state
 * @param {string} [params.initial_message] Initial user message to add to timeline
 * @param {Array<string>} [params.tools=[]] Tools available for this thread
 * @param {Object} [params.metadata={}] Additional metadata
 * @returns {Promise<Object>} Created thread object
 */
export default async function create_thread({
  user_id,
  inference_provider,
  model,
  state = THREAD_STATUS.ACTIVE,
  initial_message,
  tools = [],
  thread_base_directory = THREAD_BASE_DIRECTORY,
  ...additional_metadata
}) {
  // Validate required parameters
  if (!user_id) {
    throw new Error('user_id is required')
  }

  if (!inference_provider) {
    throw new Error('inference_provider is required')
  }

  if (!model) {
    throw new Error('model is required')
  }

  // Validate state using shared function
  validate_thread_state(state)

  // Generate thread ID
  const thread_id = uuid()
  log(`Creating thread ${thread_id} for user ${user_id}`)

  // Create thread directory structure
  const thread_dir = path.join(thread_base_directory, thread_id)
  const memory_dir = path.join(thread_dir, 'memory')

  await fs.mkdir(thread_dir, { recursive: true })
  await fs.mkdir(memory_dir, { recursive: true })

  // Generate timestamps
  const now = new Date().toISOString()

  // Create metadata
  const metadata = {
    thread_id,
    user_id,
    inference_provider,
    model,
    state,
    created_at: now,
    updated_at: now,
    current_stage: null,
    ...additional_metadata
  }

  // Add tools if provided
  if (tools && tools.length > 0) {
    metadata.tools = tools
  }

  // Write metadata to file
  await fs.writeFile(
    path.join(thread_dir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  )

  // Initialize timeline
  const timeline = []

  // Add initial message if provided
  if (initial_message) {
    timeline.push({
      id: `msg_${uuid().split('-')[0]}`,
      timestamp: now,
      type: 'message',
      role: 'user',
      content: initial_message
    })
  }

  // Write timeline to file
  await fs.writeFile(
    path.join(thread_dir, 'timeline.json'),
    JSON.stringify(timeline, null, 2),
    'utf-8'
  )

  // Return thread information
  return {
    ...metadata,
    timeline,
    context_dir: thread_dir
  }
}
