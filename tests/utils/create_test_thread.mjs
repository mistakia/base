import path from 'path'
import fs from 'fs/promises'
import { v4 as uuid } from 'uuid'

import { create_test_user } from './index.mjs'
import create_temp_test_directory from './create_temp_test_directory.mjs'
import { thread_constants } from '#libs-shared'

const { THREAD_STATUS } = thread_constants

/**
 * Creates a test thread with specified parameters
 *
 * @param {Object} options Thread options
 * @param {string} [options.user_id] User ID (creates test user if not provided)
 * @param {string} [options.inference_provider='ollama'] Inference provider name
 * @param {string} [options.model='llama2'] Model name
 * @param {string} [options.state=THREAD_STATUS.ACTIVE] Thread state (active, paused, terminated)
 * @param {string} [options.user_base_directory] User base directory
 * @param {Array} [options.initial_timeline=[]] Initial timeline entries
 * @param {Object} [options.metadata={}] Additional metadata
 * @returns {Promise<Object>} Created thread info including thread_id, context_dir, and user
 */
export default async function create_test_thread(options = {}) {
  // Create test user if not provided
  const user = options.user_id
    ? { user_id: options.user_id }
    : await create_test_user()

  // Generate thread ID
  const thread_id = uuid()

  // Create thread directory
  let base_dir
  let thread_base_directory
  if (!options.user_base_directory) {
    base_dir = await create_temp_test_directory('thread_context')
    thread_base_directory = base_dir.path
  } else {
    thread_base_directory = path.join(options.user_base_directory, 'threads')
  }
  const thread_dir = path.join(thread_base_directory, thread_id)
  await fs.mkdir(thread_dir, { recursive: true })

  // Create memory directory
  const memory_dir = path.join(thread_dir, 'memory')
  await fs.mkdir(memory_dir, { recursive: true })

  // Default metadata
  const metadata = {
    thread_id,
    user_id: user.user_id,
    inference_provider: options.inference_provider || 'ollama',
    model: options.model || 'llama2',
    state: options.state || THREAD_STATUS.ACTIVE,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_stage: null,
    ...options.metadata
  }

  // Write metadata file
  await fs.writeFile(
    path.join(thread_dir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  )

  // Create initial timeline
  const timeline = options.initial_timeline || []

  // Write timeline file
  await fs.writeFile(
    path.join(thread_dir, 'timeline.json'),
    JSON.stringify(timeline, null, 2),
    'utf-8'
  )

  const cleanup = () => {
    if (base_dir) {
      base_dir.cleanup()
    }
  }

  return {
    thread_id,
    user,
    context_dir: thread_dir,
    base_dir,
    metadata,
    thread_base_directory,
    cleanup
  }
}
