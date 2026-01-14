import { promises as fs } from 'fs'
import path from 'path'
import debug from 'debug'

import config from '#config'
import { load_search_config } from './search-config.mjs'

const log = debug('search:threads')

/**
 * List all thread directories in the user base
 *
 * @param {string} user_base_dir - User base directory path
 * @returns {Promise<string[]>} Array of thread IDs
 */
async function list_thread_ids(user_base_dir) {
  const thread_dir = path.join(user_base_dir, 'thread')

  try {
    const entries = await fs.readdir(thread_dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => {
        // UUID format validation
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          name
        )
      })
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('Thread directory not found')
      return []
    }
    throw error
  }
}

/**
 * Read thread metadata from a thread directory
 *
 * @param {Object} params - Parameters
 * @param {string} params.thread_id - Thread ID
 * @param {string} params.user_base_dir - User base directory
 * @returns {Promise<Object|null>} Thread metadata or null if not found
 */
async function read_thread_metadata({ thread_id, user_base_dir }) {
  const metadata_path = path.join(
    user_base_dir,
    'thread',
    thread_id,
    'metadata.json'
  )

  try {
    const content = await fs.readFile(metadata_path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    log(`Error reading metadata for thread ${thread_id}: ${error.message}`)
    return null
  }
}

/**
 * Read thread timeline from a thread directory
 *
 * @param {Object} params - Parameters
 * @param {string} params.thread_id - Thread ID
 * @param {string} params.user_base_dir - User base directory
 * @returns {Promise<Array|null>} Thread timeline or null if not found
 */
async function read_thread_timeline({ thread_id, user_base_dir }) {
  const timeline_path = path.join(
    user_base_dir,
    'thread',
    thread_id,
    'timeline.json'
  )

  try {
    const content = await fs.readFile(timeline_path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    log(`Error reading timeline for thread ${thread_id}: ${error.message}`)
    return null
  }
}

/**
 * Extract searchable text from thread metadata
 *
 * @param {Object} metadata - Thread metadata
 * @returns {string} Searchable text
 */
function extract_metadata_text(metadata) {
  const parts = []

  // Thread ID
  if (metadata.thread_id) {
    parts.push(metadata.thread_id)
  }

  // Title if available
  if (metadata.title) {
    parts.push(metadata.title)
  }

  // Short description
  if (metadata.short_description) {
    parts.push(metadata.short_description)
  }

  // Working directory
  if (metadata.external_session?.provider_metadata?.working_directory) {
    parts.push(metadata.external_session.provider_metadata.working_directory)
  }

  // Git branch
  if (metadata.external_session?.provider_metadata?.git_branch) {
    parts.push(metadata.external_session.provider_metadata.git_branch)
  }

  // Workflow base URI
  if (metadata.workflow_base_uri) {
    parts.push(metadata.workflow_base_uri)
  }

  return parts.join(' ').toLowerCase()
}

/**
 * Extract searchable text from timeline entries
 *
 * @param {Array} timeline - Thread timeline
 * @param {number} max_entries - Maximum entries to process
 * @returns {string} Searchable text
 */
function extract_timeline_text(timeline, max_entries = 50) {
  if (!timeline || !Array.isArray(timeline)) {
    return ''
  }

  const parts = []

  // Only check first N entries for performance
  const entries_to_check = timeline.slice(0, max_entries)

  for (const entry of entries_to_check) {
    if (entry.type === 'message' && entry.role === 'user' && entry.content) {
      // Extract user messages (likely search-relevant)
      const content =
        typeof entry.content === 'string'
          ? entry.content
          : JSON.stringify(entry.content)
      parts.push(content.substring(0, 500)) // Limit per message
    }
  }

  return parts.join(' ').toLowerCase()
}

/**
 * Check if a thread matches the search query
 *
 * @param {Object} params - Parameters
 * @param {string} params.query - Search query
 * @param {Object} params.metadata - Thread metadata
 * @param {Array} [params.timeline] - Thread timeline (optional)
 * @param {Object} params.search_config - Search configuration
 * @returns {boolean} True if thread matches
 */
function thread_matches_query({ query, metadata, timeline, search_config }) {
  const query_lower = query.toLowerCase()

  // Search metadata
  const metadata_text = extract_metadata_text(metadata)
  if (metadata_text.includes(query_lower)) {
    return true
  }

  // Search timeline if enabled
  if (search_config.result_types?.threads?.search_timeline && timeline) {
    const timeline_text = extract_timeline_text(timeline)
    if (timeline_text.includes(query_lower)) {
      return true
    }
  }

  return false
}

/**
 * Search threads by metadata and timeline content
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {number} [params.max_results=20] - Maximum results to return
 * @param {boolean} [params.include_archived=true] - Include archived threads
 * @param {boolean} [params.search_timeline=false] - Search timeline content
 * @returns {Promise<Array<Object>>} Matching threads
 */
export async function search_threads({
  query,
  max_results = 20,
  include_archived = true,
  search_timeline = false
}) {
  if (!query || !query.trim()) {
    return []
  }

  const search_config = await load_search_config()
  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  const thread_ids = await list_thread_ids(user_base_dir)
  log(`Searching ${thread_ids.length} threads for: ${query}`)

  // Limit threads to search for performance (search most recent threads)
  // Get metadata stats to sort by date
  const max_threads_to_search = 500
  const threads_to_search = thread_ids.slice(0, max_threads_to_search)

  // Process in parallel batches for performance
  const batch_size = 50
  const results = []

  for (
    let i = 0;
    i < threads_to_search.length && results.length < max_results;
    i += batch_size
  ) {
    const batch = threads_to_search.slice(i, i + batch_size)

    const batch_results = await Promise.all(
      batch.map(async (thread_id) => {
        const metadata = await read_thread_metadata({
          thread_id,
          user_base_dir
        })
        if (!metadata) return null

        // Skip archived threads if not included
        if (!include_archived && metadata.thread_state === 'archived') {
          return null
        }

        // Load timeline only if enabled and needed
        let timeline = null
        if (
          search_timeline &&
          search_config.result_types?.threads?.search_timeline
        ) {
          timeline = await read_thread_timeline({ thread_id, user_base_dir })
        }

        // Check if thread matches
        if (
          thread_matches_query({ query, metadata, timeline, search_config })
        ) {
          return {
            thread_id: metadata.thread_id,
            title: metadata.title || null,
            thread_state: metadata.thread_state,
            created_at: metadata.created_at,
            updated_at: metadata.updated_at,
            working_directory:
              metadata.external_session?.provider_metadata?.working_directory ||
              null,
            workflow_base_uri: metadata.workflow_base_uri || null,
            message_count: metadata.message_count || 0,
            type: 'thread',
            file_path: `thread/${thread_id}`,
            absolute_path: path.join(user_base_dir, 'thread', thread_id)
          }
        }
        return null
      })
    )

    // Add non-null results
    for (const result of batch_results) {
      if (result && results.length < max_results) {
        results.push(result)
      }
    }
  }

  // Sort by updated_at descending
  results.sort((a, b) => {
    const date_a = new Date(a.updated_at || a.created_at || 0)
    const date_b = new Date(b.updated_at || b.created_at || 0)
    return date_b.getTime() - date_a.getTime()
  })

  return results
}

/**
 * Get thread metadata for display in search results
 *
 * @param {string} thread_id - Thread ID
 * @returns {Promise<Object|null>} Thread summary or null
 */
export async function get_thread_summary(thread_id) {
  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    return null
  }

  const metadata = await read_thread_metadata({ thread_id, user_base_dir })
  if (!metadata) {
    return null
  }

  return {
    thread_id: metadata.thread_id,
    title: metadata.title || null,
    thread_state: metadata.thread_state,
    created_at: metadata.created_at,
    updated_at: metadata.updated_at,
    working_directory:
      metadata.external_session?.provider_metadata?.working_directory || null,
    message_count: metadata.message_count || 0
  }
}

export default {
  search_threads,
  get_thread_summary
}
