import { promises as fs } from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import debug from 'debug'

import config from '#config'
import { load_search_config } from './search-config.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { execute_sqlite_query } from '#libs-server/embedded-database-index/sqlite/sqlite-database-client.mjs'

const log = debug('search:threads')

/**
 * Searchable metadata fields for thread search.
 * These are the JSON keys that ripgrep will match against.
 */
const SEARCHABLE_FIELDS = [
  'title',
  'short_description',
  'thread_id',
  'workflow_base_uri',
  'working_directory',
  'git_branch'
]

/**
 * Escape special regex characters in a string
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for regex
 */
function escape_regex(str) {
  return str.replace(/[-.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build PCRE2 regex pattern for searching specific JSON fields
 *
 * @param {string} query - Search query
 * @returns {string} PCRE2 regex pattern
 */
function build_field_regex(query) {
  const fields_pattern = SEARCHABLE_FIELDS.join('|')
  const escaped_query = escape_regex(query)
  // Match: "field_name": "...query..." (case-insensitive on query)
  return `"(${fields_pattern})":\\s*"[^"]*${escaped_query}[^"]*"`
}

/**
 * Search thread metadata files using ripgrep with PCRE2
 *
 * Uses ripgrep's PCRE2 engine to search specific JSON fields across all
 * thread metadata files. This approach searches all threads without limits,
 * relying on ripgrep's performance (~60-80ms for thousands of files).
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {string} params.user_base_dir - User base directory path
 * @param {number} params.timeout - Search timeout in milliseconds
 * @returns {Promise<string[]>} Array of matching metadata file paths
 */
async function search_with_ripgrep({ query, user_base_dir, timeout = 5000 }) {
  const thread_dir = path.join(user_base_dir, 'thread')
  const pattern = build_field_regex(query)

  return new Promise((resolve) => {
    const matching_files = []
    let stderr_output = ''

    // Use ripgrep with PCRE2 for regex support
    // -P: PCRE2 engine
    // -i: case-insensitive
    // -l: only print file names
    // -g: glob pattern to match only metadata.json files
    const rg = spawn(
      'rg',
      ['-Pil', '-g', 'metadata.json', pattern, thread_dir],
      {
        timeout,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    rg.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n')
      for (const line of lines) {
        if (line) {
          matching_files.push(line)
        }
      }
    })

    rg.stderr.on('data', (data) => {
      stderr_output += data.toString()
    })

    rg.on('close', (code, signal) => {
      // ripgrep returns 1 when no matches found, 0 on success, 2 on error
      if (code === 0 || code === 1) {
        resolve(matching_files)
      } else if (signal) {
        log(`ripgrep terminated by signal ${signal}`)
        resolve([])
      } else {
        log(`ripgrep error (code ${code}): ${stderr_output}`)
        // Fall back to empty results on error rather than failing
        resolve([])
      }
    })

    rg.on('error', (error) => {
      log(`ripgrep spawn error: ${error.message}`)
      // Fall back to empty results if ripgrep not available
      resolve([])
    })
  })
}

/**
 * Extract thread ID from metadata file path
 *
 * @param {string} file_path - Full path to metadata.json
 * @returns {string|null} Thread ID or null if invalid path
 */
function extract_thread_id(file_path) {
  const match = file_path.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/metadata\.json$/i
  )
  return match ? match[1] : null
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
 * Format thread metadata as search result
 *
 * @param {Object} metadata - Thread metadata
 * @param {string} user_base_dir - User base directory
 * @returns {Object} Formatted search result
 */
function format_thread_result(metadata, user_base_dir) {
  return {
    thread_id: metadata.thread_id,
    title: metadata.title || null,
    thread_state: metadata.thread_state,
    created_at: metadata.created_at,
    updated_at: metadata.updated_at,
    working_directory:
      metadata.source?.provider_metadata?.working_directory || null,
    workflow_base_uri: metadata.workflow_base_uri || null,
    message_count: metadata.message_count || 0,
    type: 'thread',
    file_path: `thread/${metadata.thread_id}`,
    absolute_path: path.join(user_base_dir, 'thread', metadata.thread_id)
  }
}

/**
 * Search threads using SQLite (fast path, <5ms)
 *
 * Queries the indexed threads table using ILIKE for text matching across
 * searchable fields. Returns formatted results sorted by updated_at desc.
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {number} params.max_results - Maximum results
 * @param {boolean} params.include_archived - Include archived threads
 * @param {string} params.user_base_dir - User base directory
 * @returns {Promise<Array<Object>|null>} Results or null if SQLite unavailable
 */
async function search_threads_sqlite({
  query,
  max_results,
  include_archived,
  user_base_dir
}) {
  if (!embedded_index_manager.is_sqlite_ready()) {
    return null
  }

  try {
    const like_pattern = `%${query}%`

    // Search indexed fields with ILIKE
    // Note: workflow_base_uri and git_branch from SEARCHABLE_FIELDS are not
    // in the SQLite schema; the ripgrep fallback covers those fields.
    let sql = `
      SELECT thread_id, title, short_description, thread_state,
             created_at, updated_at, working_directory, message_count
      FROM threads
      WHERE (
        title ILIKE $1
        OR short_description ILIKE $1
        OR thread_id ILIKE $1
        OR working_directory ILIKE $1
      )`

    const params = [like_pattern]

    if (!include_archived) {
      sql += ` AND (thread_state IS NULL OR thread_state != 'archived')`
    }

    params.push(max_results)
    sql += ` ORDER BY updated_at DESC NULLS LAST LIMIT $${params.length}`

    const result = await execute_sqlite_query({ query: sql, params })

    if (!result?.rows) {
      return null
    }

    return result.rows.map((row) => ({
      thread_id: row.thread_id,
      title: row.title || null,
      thread_state: row.thread_state,
      created_at: row.created_at,
      updated_at: row.updated_at,
      working_directory: row.working_directory || null,
      workflow_base_uri: null,
      message_count: row.message_count || 0,
      type: 'thread',
      file_path: `thread/${row.thread_id}`,
      absolute_path: path.join(user_base_dir, 'thread', row.thread_id)
    }))
  } catch (error) {
    log(`SQLite thread search failed: ${error.message}`)
    return null
  }
}

/**
 * Search threads by metadata
 *
 * Uses SQLite as the primary search path (<5ms) with ripgrep fallback.
 * Searches specific fields: title, short_description, thread_id,
 * workflow_base_uri, working_directory, git_branch
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {number} [params.max_results=20] - Maximum results to return
 * @param {boolean} [params.include_archived=true] - Include archived threads
 * @returns {Promise<Array<Object>>} Matching threads sorted by updated_at desc
 */
export async function search_threads({
  query,
  max_results = 20,
  include_archived = true
}) {
  if (!query || !query.trim()) {
    return []
  }

  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY

  if (!user_base_dir) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  // Try SQLite first (fast path)
  const sqlite_results = await search_threads_sqlite({
    query: query.trim(),
    max_results,
    include_archived,
    user_base_dir
  })

  if (sqlite_results !== null) {
    log(
      `SQLite thread search found ${sqlite_results.length} results for: ${query}`
    )
    return sqlite_results
  }

  // Fallback to ripgrep search
  log('SQLite unavailable, falling back to ripgrep thread search')
  const search_config = await load_search_config()

  // Use ripgrep to find matching metadata files
  const matching_files = await search_with_ripgrep({
    query: query.trim(),
    user_base_dir,
    timeout: search_config.search_timeout || 5000
  })

  log(`Found ${matching_files.length} threads matching: ${query}`)

  // Extract thread IDs from file paths
  const thread_ids = matching_files
    .map(extract_thread_id)
    .filter((id) => id !== null)

  // Read metadata for matching threads in parallel
  const metadata_results = await Promise.all(
    thread_ids.map(async (thread_id) => {
      const metadata = await read_thread_metadata({ thread_id, user_base_dir })
      if (!metadata) return null

      // Skip archived threads if not included
      if (!include_archived && metadata.thread_state === 'archived') {
        return null
      }

      return format_thread_result(metadata, user_base_dir)
    })
  )

  // Filter nulls and sort by updated_at descending
  const results = metadata_results
    .filter((result) => result !== null)
    .sort((a, b) => {
      const date_a = new Date(a.updated_at || a.created_at || 0)
      const date_b = new Date(b.updated_at || b.created_at || 0)
      return date_b.getTime() - date_a.getTime()
    })

  // Apply max_results limit after sorting
  return results.slice(0, max_results)
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
      metadata.source?.provider_metadata?.working_directory || null,
    message_count: metadata.message_count || 0
  }
}

export default {
  search_threads,
  get_thread_summary
}
