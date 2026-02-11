import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import config from '#config'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { read_json_file } from '#libs-server/threads/thread-utils.mjs'

const log = debug('active-sessions:matcher')

/**
 * Match active sessions to existing threads
 * Searches thread metadata for matching session_id or transcript_path
 */

/**
 * Find a thread that matches the given session parameters
 *
 * @param {Object} params - Search parameters
 * @param {string} params.session_id - Claude session ID to match
 * @param {string} [params.transcript_path] - Transcript file path for fallback matching
 * @returns {Promise<string|null>} Thread ID if found, null otherwise
 */
export const find_thread_for_session = async ({
  session_id,
  transcript_path
}) => {
  if (!session_id && !transcript_path) {
    log('No session_id or transcript_path provided for matching')
    return null
  }

  log(`Searching for thread matching session_id=${session_id}`)

  const threads_dir = get_thread_base_directory({
    user_base_directory: config.user_base_directory
  })

  try {
    // Check if threads directory exists
    try {
      await fs.access(threads_dir)
    } catch {
      log('Threads directory does not exist')
      return null
    }

    const all_items = await fs.readdir(threads_dir)

    // Filter to UUID directories
    const thread_dirs = all_items.filter((item) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        item
      )
    )

    // Search through threads for a match
    for (const thread_id of thread_dirs) {
      try {
        const metadata_path = path.join(threads_dir, thread_id, 'metadata.json')
        const metadata = await read_json_file({ file_path: metadata_path })

        // Primary match: session_id
        const source = metadata.source
        if (session_id && source?.session_id === session_id) {
          log(`Found thread ${thread_id} matching session_id ${session_id}`)
          return thread_id
        }

        // Secondary match: transcript_path (file_source)
        if (
          transcript_path &&
          source?.provider_metadata?.file_source === transcript_path
        ) {
          log(
            `Found thread ${thread_id} matching transcript_path ${transcript_path}`
          )
          return thread_id
        }
      } catch (error) {
        // Skip threads that can't be read
        log(`Error reading thread ${thread_id}: ${error.message}`)
      }
    }

    log('No matching thread found')
    return null
  } catch (error) {
    log(`Error searching for thread: ${error.message}`)
    return null
  }
}

/**
 * Find all threads that match a given session_id
 * Used for debugging/verification when multiple threads might exist
 *
 * @param {Object} params - Search parameters
 * @param {string} params.session_id - Claude session ID to match
 * @returns {Promise<Array<string>>} Array of matching thread IDs
 */
export const find_all_threads_for_session = async ({ session_id }) => {
  if (!session_id) {
    return []
  }

  log(`Searching for all threads matching session_id=${session_id}`)

  const threads_dir = get_thread_base_directory({
    user_base_directory: config.user_base_directory
  })

  const matching_threads = []

  try {
    try {
      await fs.access(threads_dir)
    } catch {
      return []
    }

    const all_items = await fs.readdir(threads_dir)
    const thread_dirs = all_items.filter((item) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        item
      )
    )

    for (const thread_id of thread_dirs) {
      try {
        const metadata_path = path.join(threads_dir, thread_id, 'metadata.json')
        const metadata = await read_json_file({ file_path: metadata_path })

        const source = metadata.source
        if (source?.session_id === session_id) {
          matching_threads.push(thread_id)
        }
      } catch {
        // Skip unreadable threads
      }
    }

    log(`Found ${matching_threads.length} threads matching session_id`)
    return matching_threads
  } catch (error) {
    log(`Error searching threads: ${error.message}`)
    return []
  }
}
