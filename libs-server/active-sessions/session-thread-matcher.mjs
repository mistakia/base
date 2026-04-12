import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import config from '#config'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { read_json_file } from '#libs-server/threads/thread-utils.mjs'

const log = debug('active-sessions:matcher')
const log_lifecycle = debug('base:session-lifecycle')

/**
 * Match active sessions to existing threads
 * Uses in-memory reverse index from thread watcher metadata cache for O(1) lookup,
 * falling back to filesystem scan for threads not yet processed by watcher.
 */

// In-memory reverse indexes
const session_id_to_thread_id = new Map()
const transcript_path_to_thread_id = new Map()

// Reference to thread watcher metadata cache (set via register_metadata_cache)
let metadata_cache_ref = null

/**
 * Register the thread watcher metadata cache for building reverse indexes.
 * Called once at server startup after the thread watcher is initialized.
 *
 * @param {Map<string, Object>} cache - Thread watcher metadata cache
 */
export const register_metadata_cache = (cache) => {
  metadata_cache_ref = cache
  rebuild_index()
}

/**
 * Rebuild the reverse index from the metadata cache.
 * Called on initial registration and can be called to refresh.
 */
export const rebuild_index = () => {
  if (!metadata_cache_ref) return

  session_id_to_thread_id.clear()
  transcript_path_to_thread_id.clear()

  for (const [thread_id, metadata] of metadata_cache_ref) {
    index_thread_metadata(thread_id, metadata)
  }

  log(`Rebuilt index: ${session_id_to_thread_id.size} session mappings`)
}

/**
 * Index a single thread's metadata into the reverse index.
 * Called when thread watcher processes metadata changes.
 *
 * @param {string} thread_id
 * @param {Object} metadata
 */
export const index_thread_metadata = (thread_id, metadata) => {
  if (metadata?.source?.session_id) {
    session_id_to_thread_id.set(metadata.source.session_id, thread_id)
  }
  if (metadata?.source?.provider_metadata?.file_source) {
    transcript_path_to_thread_id.set(
      metadata.source.provider_metadata.file_source,
      thread_id
    )
  }
}

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

  // O(1) index lookup
  if (session_id && session_id_to_thread_id.has(session_id)) {
    const thread_id = session_id_to_thread_id.get(session_id)
    log_lifecycle(
      'MATCHER found session_id=%s thread_id=%s method=index_session_id',
      session_id,
      thread_id
    )
    return thread_id
  }

  if (transcript_path && transcript_path_to_thread_id.has(transcript_path)) {
    const thread_id = transcript_path_to_thread_id.get(transcript_path)
    log_lifecycle(
      'MATCHER found session_id=%s thread_id=%s method=index_transcript_path',
      session_id,
      thread_id
    )
    return thread_id
  }

  // Fallback: filesystem scan for threads not yet processed by watcher (cold start)
  const threads_dir = get_thread_base_directory({
    user_base_directory: config.user_base_directory
  })

  try {
    try {
      await fs.access(threads_dir)
    } catch {
      log('Threads directory does not exist')
      return null
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

        // Index for future lookups
        index_thread_metadata(thread_id, metadata)

        const source = metadata.source
        if (session_id && source?.session_id === session_id) {
          log_lifecycle(
            'MATCHER found session_id=%s thread_id=%s method=session_id',
            session_id,
            thread_id
          )
          log(`Found thread ${thread_id} matching session_id ${session_id}`)
          return thread_id
        }

        if (
          transcript_path &&
          source?.provider_metadata?.file_source === transcript_path
        ) {
          log_lifecycle(
            'MATCHER found session_id=%s thread_id=%s method=transcript_path',
            session_id,
            thread_id
          )
          log(
            `Found thread ${thread_id} matching transcript_path ${transcript_path}`
          )
          return thread_id
        }
      } catch (error) {
        log(`Error reading thread ${thread_id}: ${error.message}`)
      }
    }

    log_lifecycle('MATCHER not_found session_id=%s', session_id)
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
