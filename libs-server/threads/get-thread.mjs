import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { get_thread_base_directory } from './threads-constants.mjs'

const log = debug('threads:get')

async function read_json_file({ file_path }) {
  const raw = await fs.readFile(file_path, 'utf-8')
  return JSON.parse(raw)
}

async function read_json_file_or_default({ file_path, default_value }) {
  try {
    return await read_json_file({ file_path })
  } catch (error) {
    if (error.code === 'ENOENT') {
      return default_value
    }
    throw error
  }
}

function add_backward_compatibility_fields({ metadata, thread_dir, timeline }) {
  const enriched = {
    ...metadata,
    timeline,
    context_dir: thread_dir
  }

  if (metadata.models && metadata.models.length > 0 && !metadata.model) {
    enriched.model = metadata.models[0]
  }

  return enriched
}

function get_effective_updated_at({ metadata }) {
  const updated_at = metadata.updated_at || metadata.created_at || 0
  return new Date(updated_at)
}

/**
 * Get thread data by ID
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to retrieve
 * @returns {Promise<Object>} Thread data object
 * @throws {Error} If thread is not found
 */
export default async function get_thread({ thread_id }) {
  if (!thread_id || typeof thread_id !== 'string') {
    throw new Error('thread_id is required')
  }

  log(`Getting thread ${thread_id}`)

  const thread_base_directory = get_thread_base_directory()
  const thread_dir = path.join(thread_base_directory, thread_id)

  try {
    await fs.access(thread_dir)

    const metadata_path = path.join(thread_dir, 'metadata.json')
    const timeline_path = path.join(thread_dir, 'timeline.json')

    const [metadata, timeline] = await Promise.all([
      read_json_file({ file_path: metadata_path }),
      read_json_file_or_default({ file_path: timeline_path, default_value: [] })
    ])

    return add_backward_compatibility_fields({ metadata, thread_dir, timeline })
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
 * @param {string} [params.user_public_key] Filter by user public key
 * @param {string} [params.thread_state] Filter by thread state
 * @param {number} [params.limit=50] Maximum number of threads to return
 * @param {number} [params.offset=0] Number of threads to skip
 * @param {string} [params.user_base_directory] Custom user base directory (overrides registry)
 * @returns {Promise<Array>} Array of thread summary objects
 */
export async function list_threads({
  user_public_key,
  thread_state,
  limit = 50,
  offset = 0,
  user_base_directory
}) {
  log(
    `Listing threads${user_public_key ? ` for user ${user_public_key}` : ''}${thread_state ? ` with state ${thread_state}` : ''}`
  )

  const threads_dir = get_thread_base_directory({ user_base_directory })

  try {
    await fs.mkdir(threads_dir, { recursive: true })

    const thread_dirs = await fs.readdir(threads_dir)

    const results = await Promise.allSettled(
      thread_dirs.map(async (thread_id) => {
        try {
          const metadata_path = path.join(
            threads_dir,
            thread_id,
            'metadata.json'
          )
          const metadata = await read_json_file({ file_path: metadata_path })

          if (user_public_key && metadata.user_public_key !== user_public_key)
            return null
          if (thread_state && metadata.thread_state !== thread_state)
            return null

          const thread_summary = { ...metadata }

          if (
            metadata.models &&
            metadata.models.length > 0 &&
            !metadata.model
          ) {
            thread_summary.model = metadata.models[0]
          }

          return thread_summary
        } catch (error) {
          log(`Error reading thread ${thread_id}: ${error.message}`)
          return null
        }
      })
    )

    const threads = results
      .filter((r) => r.status === 'fulfilled' && r.value)
      .map((r) => r.value)

    threads.sort(
      (a, b) =>
        get_effective_updated_at({ metadata: b }) -
        get_effective_updated_at({ metadata: a })
    )

    return threads.slice(offset, offset + limit)
  } catch (error) {
    log(`Error listing threads: ${error.message}`)
    throw error
  }
}
