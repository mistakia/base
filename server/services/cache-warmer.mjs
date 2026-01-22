/**
 * Cache Warmer Service
 *
 * Proactively maintains warm caches for public endpoints.
 * Ensures fast response times even after periods of no traffic.
 * Uses DuckDB for fast queries when available, falls back to filesystem.
 */

import debug from 'debug'

import {
  get_activity_heatmap_data,
  merge_activity_and_calculate_scores
} from '#libs-server/activity/index.mjs'
import { list_tasks_from_filesystem } from '#libs-server/task/index.mjs'

import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  query_tasks_from_entities,
  query_git_activity_daily,
  query_thread_activity_aggregated
} from '#libs-server/embedded-database-index/duckdb/duckdb-activity-queries.mjs'

const log = debug('server:cache-warmer')

/**
 * Try DuckDB query with fallback
 * @param {Object} params Parameters
 * @param {Function} params.duckdb_fn Async function that queries DuckDB
 * @param {Function} params.fallback_fn Async function for fallback
 * @param {string} params.label Label for logging
 * @returns {Promise<any>} Query result
 */
async function try_duckdb_or_fallback({ duckdb_fn, fallback_fn, label }) {
  if (embedded_index_manager.is_duckdb_ready()) {
    try {
      log('Using DuckDB for %s', label)
      return await duckdb_fn()
    } catch (error) {
      log('DuckDB query failed for %s, falling back: %s', label, error.message)
    }
  }
  log('Using fallback for %s', label)
  return fallback_fn()
}

// Refresh intervals (in milliseconds)
const ACTIVITY_REFRESH_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours
const TASKS_REFRESH_INTERVAL = 20 * 60 * 1000 // 20 minutes

// Store interval IDs for cleanup
let activity_interval = null
let tasks_interval = null

// Cache storage (shared with route handlers via exports)
export const cache = {
  activity_heatmap: {
    data: null,
    timestamp: 0,
    days: 365
  },
  tasks: {
    data: null,
    timestamp: 0
  }
}

// Cache TTLs (for checking freshness)
export const CACHE_TTL = {
  activity: ACTIVITY_REFRESH_INTERVAL,
  tasks: TASKS_REFRESH_INTERVAL
}

/**
 * Warm the activity heatmap cache
 * Uses DuckDB when available for faster queries, falls back to full computation.
 */
async function warm_activity_cache() {
  try {
    const days = 365
    log('Warming activity heatmap cache for %d days', days)

    const heatmap_data = await try_duckdb_or_fallback({
      label: 'activity cache',
      duckdb_fn: async () => {
        const [git_activity, thread_activity] = await Promise.all([
          query_git_activity_daily({ days }),
          query_thread_activity_aggregated({ days })
        ])
        return merge_activity_and_calculate_scores({
          git_activity,
          thread_activity,
          days
        })
      },
      fallback_fn: () => get_activity_heatmap_data({ days })
    })

    cache.activity_heatmap = {
      data: heatmap_data,
      timestamp: Date.now(),
      days
    }

    log('Activity heatmap cache warmed')
  } catch (error) {
    log('Failed to warm activity cache: %s', error.message)
  }
}

/**
 * Warm the tasks cache for public requests
 * Uses DuckDB when available for faster queries, falls back to filesystem.
 */
async function warm_tasks_cache() {
  try {
    log('Warming tasks cache')

    const all_tasks = await try_duckdb_or_fallback({
      label: 'tasks cache',
      duckdb_fn: () => query_tasks_from_entities({ archived: false }),
      fallback_fn: () => list_tasks_from_filesystem({ archived: false })
    })

    cache.tasks = {
      data: all_tasks,
      timestamp: Date.now()
    }

    log('Tasks cache warmed (%d tasks)', all_tasks.length)
  } catch (error) {
    log('Failed to warm tasks cache: %s', error.message)
  }
}

/**
 * Invalidate activity cache (called by file watcher or on-demand)
 */
export function invalidate_activity_cache() {
  cache.activity_heatmap.timestamp = 0
  log('Activity cache invalidated')
  // Immediately re-warm in background
  warm_activity_cache()
}

/**
 * Invalidate tasks cache (called by file watcher)
 */
export function invalidate_tasks_cache() {
  cache.tasks.timestamp = 0
  log('Tasks cache invalidated')
  // Immediately re-warm in background
  warm_tasks_cache()
}

/**
 * Get cached activity heatmap data
 * Returns cached data if fresh, null otherwise
 */
export function get_cached_activity_heatmap({ days = 365 }) {
  const cached = cache.activity_heatmap
  const now = Date.now()

  if (
    cached.data &&
    cached.days === days &&
    now - cached.timestamp < CACHE_TTL.activity
  ) {
    return cached.data
  }

  return null
}

/**
 * Get cached tasks list
 * Returns cached data if fresh, null otherwise
 */
export function get_cached_tasks() {
  const cached = cache.tasks
  const now = Date.now()

  if (cached.data && now - cached.timestamp < CACHE_TTL.tasks) {
    return cached.data
  }

  return null
}

/**
 * Start the cache warmer service
 * Immediately warms all caches and sets up periodic refresh
 */
export async function start_cache_warmer() {
  log('Starting cache warmer service')

  // Immediately warm all caches
  await Promise.all([warm_activity_cache(), warm_tasks_cache()])

  // Set up periodic refresh intervals
  activity_interval = setInterval(
    warm_activity_cache,
    ACTIVITY_REFRESH_INTERVAL
  )
  tasks_interval = setInterval(warm_tasks_cache, TASKS_REFRESH_INTERVAL)

  log('Cache warmer service started')
}

/**
 * Stop the cache warmer service
 */
export function stop_cache_warmer() {
  log('Stopping cache warmer service')

  if (activity_interval) {
    clearInterval(activity_interval)
    activity_interval = null
  }

  if (tasks_interval) {
    clearInterval(tasks_interval)
    tasks_interval = null
  }

  log('Cache warmer service stopped')
}
