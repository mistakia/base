import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { get_thread_base_directory } from './threads-constants.mjs'

const log = debug('threads:get')

/**
 * Get thread data by ID
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to retrieve
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Thread data object
 * @throws {Error} If thread is not found
 */
export default async function get_thread({ thread_id, user_base_directory }) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  log(`Getting thread ${thread_id}`)

  const thread_base_directory = get_thread_base_directory({
    user_base_directory
  })
  const thread_dir = path.join(thread_base_directory, thread_id)

  try {
    // Check if thread directory exists
    await fs.access(thread_dir)

    // Read metadata
    const metadata_path = path.join(thread_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

    // Read timeline
    const timeline_path = path.join(thread_dir, 'timeline.json')
    const timeline = JSON.parse(await fs.readFile(timeline_path, 'utf-8'))

    // Return combined thread data
    return {
      ...metadata,
      timeline,
      context_dir: thread_dir
    }
  } catch (error) {
    log(`Error getting thread ${thread_id}: ${error.message}`)
    if (error.code === 'ENOENT') {
      throw new Error(`Thread not found: ${thread_id}`)
    }
    throw error
  }
}

/**
 * List threads with optional filtering
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_id] Filter by user ID
 * @param {string} [params.thread_state] Filter by thread state
 * @param {number} [params.limit=50] Maximum number of threads to return
 * @param {number} [params.offset=0] Number of threads to skip
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Array>} Array of thread summary objects
 */
export async function list_threads({
  user_id,
  thread_state,
  limit = 50,
  offset = 0,
  user_base_directory
}) {
  log(
    `Listing threads${user_id ? ` for user ${user_id}` : ''}${thread_state ? ` with state ${thread_state}` : ''}`
  )

  const threads_dir = get_thread_base_directory({ user_base_directory })

  try {
    // Create threads directory if it doesn't exist
    await fs.mkdir(threads_dir, { recursive: true })

    // List thread directories
    const thread_dirs = await fs.readdir(threads_dir)

    // Get thread summaries
    const threads = []

    for (const thread_id of thread_dirs) {
      try {
        const metadata_path = path.join(threads_dir, thread_id, 'metadata.json')
        const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

        // Apply filters
        if (user_id && metadata.user_id !== user_id) continue
        if (thread_state && metadata.thread_state !== thread_state) continue

        // Create thread summary (metadata only, no timeline)
        threads.push({
          thread_id: metadata.thread_id,
          user_id: metadata.user_id,
          inference_provider: metadata.inference_provider,
          model: metadata.model,
          thread_state: metadata.thread_state,
          created_at: metadata.created_at,
          updated_at: metadata.updated_at
        })
      } catch (error) {
        log(`Error reading thread ${thread_id}: ${error.message}`)
        // Skip invalid threads
        continue
      }
    }

    // Sort by updated_at (newest first)
    threads.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

    // Apply pagination
    return threads.slice(offset, offset + limit)
  } catch (error) {
    log(`Error listing threads: ${error.message}`)
    throw error
  }
}
