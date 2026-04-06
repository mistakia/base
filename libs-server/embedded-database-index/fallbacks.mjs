/**
 * Filesystem Fallback Functions
 *
 * Wraps filesystem listing functions to provide fallback data when the
 * embedded index backend is unavailable. Each function accepts the same
 * params as the corresponding backend method, extracts relevant filters,
 * and delegates to the filesystem listing function.
 */

import debug from 'debug'

import list_threads, {
  list_thread_ids
} from '#libs-server/threads/list-threads.mjs'
import { list_tasks_from_filesystem } from '#libs-server/task/index.mjs'
import { list_physical_items_from_filesystem } from '#libs-server/physical-items/list-physical-items-from-filesystem.mjs'

const log = debug('embedded-index:fallback')

/**
 * Extract a filter value from a filters array by column_id.
 * @param {Array} filters - Array of { column_id, operator, value }
 * @param {string} column_id - Column to find
 * @returns {*} The filter value or undefined
 */
function get_filter_value(filters, column_id) {
  const filter = filters.find((f) => f.column_id === column_id)
  return filter?.value
}

/**
 * Query threads from filesystem.
 * Accepts the same params as the SQLite query_threads backend method.
 */
async function query_threads({ filters = [], limit = 50, offset = 0 } = {}) {
  log('Falling back to filesystem for thread query')

  const user_public_key = get_filter_value(filters, 'user_public_key')
  const thread_state = get_filter_value(filters, 'thread_state')

  return list_threads({
    user_public_key,
    thread_state,
    limit,
    offset
  })
}

/**
 * Count threads from filesystem.
 * Uses lightweight directory listing when no filters are applied,
 * otherwise falls back to full metadata loading.
 */
async function count_threads({ filters = [] } = {}) {
  log('Falling back to filesystem for thread count')

  const user_public_key = get_filter_value(filters, 'user_public_key')
  const thread_state = get_filter_value(filters, 'thread_state')

  // Fast path: no filters, just count directories
  if (!user_public_key && !thread_state) {
    const ids = await list_thread_ids()
    return ids.length
  }

  // Filtered count requires loading metadata
  const all = await list_threads({
    user_public_key,
    thread_state,
    limit: 10000,
    offset: 0
  })
  return all.length
}

/**
 * Query tasks from filesystem.
 * Accepts the same params as the SQLite query_tasks backend method.
 */
async function query_tasks({ filters = [] } = {}) {
  log('Falling back to filesystem for task query')

  const status = get_filter_value(filters, 'status')
  const archived_filter = get_filter_value(filters, 'archived')
  const archived = archived_filter === true || archived_filter === 1

  return list_tasks_from_filesystem({
    status,
    archived
  })
}

/**
 * Count tasks from filesystem.
 */
async function count_tasks({ filters = [] } = {}) {
  const tasks = await query_tasks({ filters })
  return tasks.length
}

/**
 * Query tasks for activity from filesystem.
 * Accepts the same params as the SQLite query_tasks_for_activity backend method.
 */
async function query_tasks_for_activity({ archived = false } = {}) {
  log('Falling back to filesystem for task activity query')
  return list_tasks_from_filesystem({ archived })
}

/**
 * Query physical items from filesystem.
 */
async function query_physical_items() {
  log('Falling back to filesystem for physical item query')
  return list_physical_items_from_filesystem()
}

/**
 * Count physical items from filesystem.
 */
async function count_physical_items() {
  const items = await query_physical_items()
  return items.length
}

const fallbacks = {
  query_threads,
  count_threads,
  query_tasks,
  count_tasks,
  query_tasks_for_activity,
  query_physical_items,
  count_physical_items
}

export default fallbacks
