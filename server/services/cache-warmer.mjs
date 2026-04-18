/**
 * Cache Warmer Service
 *
 * Proactively maintains warm caches for public endpoints.
 * Ensures fast response times even after periods of no traffic.
 * Uses SQLite for fast queries when available, falls back to filesystem.
 */

import debug from 'debug'

import {
  get_activity_heatmap_data,
  merge_activity_and_calculate_scores,
  aggregate_task_activity
} from '#libs-server/activity/index.mjs'
import {
  get_task_summary_stats,
  get_task_stats_by_tag,
  get_task_completion_series
} from '#libs-server/activity/task-stats.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'

const log = debug('server:cache-warmer')

// Refresh intervals (in milliseconds)
const ACTIVITY_REFRESH_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours
const TASKS_REFRESH_INTERVAL = 20 * 60 * 1000 // 20 minutes

// Store interval IDs for cleanup
let activity_interval = null
let tasks_interval = null
let task_stats_interval = null

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
  },
  task_stats: {
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
 * Compute fresh heatmap entries for the given number of trailing days
 * using the SQLite fast path (git + thread activity queries).
 * @param {number} days Number of days to compute
 * @returns {Promise<Object>} Heatmap data with data array, max_score, date_range
 */
async function compute_fresh_days(days) {
  const [git_activity, thread_activity, task_activity] = await Promise.all([
    embedded_index_manager.query_git_activity_daily({ days }),
    embedded_index_manager.query_thread_activity_aggregated({ days }),
    aggregate_task_activity({ days })
  ])
  return merge_activity_and_calculate_scores({
    git_activity,
    thread_activity,
    task_activity,
    days
  })
}

/**
 * Merge frozen and fresh heatmap entries, compute max score, and build
 * the cache result object. Shared by read-only and write-mode paths.
 */
function merge_and_finalize_heatmap({ frozen_entries, fresh_entries, days }) {
  const merged_by_date = new Map()
  for (const entry of frozen_entries) {
    merged_by_date.set(entry.date, entry)
  }
  for (const entry of fresh_entries) {
    merged_by_date.set(entry.date, entry)
  }

  const merged_data = Array.from(merged_by_date.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  const max_score = merged_data.reduce(
    (max, entry) => Math.max(max, entry.score ?? 0),
    0
  )
  const since_date = new Date()
  since_date.setDate(since_date.getDate() - days)

  return {
    data: merged_data,
    max_score,
    date_range: {
      start: since_date.toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    }
  }
}

/**
 * Warm the activity heatmap cache
 * Uses an incremental strategy when SQLite is available:
 *   - Cold start (empty table): full computation + bulk insert
 *   - Incremental: read frozen past days from cache table, recompute only today + yesterday
 * Falls back to full computation when SQLite is unavailable.
 */
async function warm_activity_cache() {
  try {
    const days = 365
    log('Warming activity heatmap cache for %d days', days)

    // When index is not ready, fall back to full computation
    if (!embedded_index_manager.is_ready()) {
      log('Index not ready, using full computation fallback')
      cache.activity_heatmap = {
        data: await get_activity_heatmap_data({ days }),
        timestamp: Date.now(),
        days
      }
      log('Activity heatmap cache warmed (fallback)')
      return
    }

    // base-api holds no writer handle, so the incremental strategy cannot
    // persist daily entries to activity_heatmap_daily. Use frozen data from
    // the table as a base but recompute from the last frozen date forward
    // to fill gaps.
    let frozen_days = []
    try {
      frozen_days = await embedded_index_manager.query_heatmap_daily({ days })
    } catch (error) {
      log('Failed to read frozen days, computing all fresh: %s', error.message)
    }

    let fresh_days = days
    if (frozen_days.length > 0) {
      const last_frozen = frozen_days[frozen_days.length - 1].date
      const last_frozen_date = new Date(last_frozen + 'T00:00:00Z')
      const now = new Date()
      const diff_ms = now.getTime() - last_frozen_date.getTime()
      fresh_days = Math.max(Math.ceil(diff_ms / (24 * 60 * 60 * 1000)) + 1, 2)
      fresh_days = Math.min(fresh_days, days)
    }

    log(
      '%d frozen rows, computing %d fresh days',
      frozen_days.length,
      fresh_days
    )

    const fresh_result = await compute_fresh_days(fresh_days)
    const heatmap_data = merge_and_finalize_heatmap({
      frozen_entries: frozen_days,
      fresh_entries: fresh_result.data,
      days
    })

    cache.activity_heatmap = {
      data: heatmap_data,
      timestamp: Date.now(),
      days
    }
    log(
      'Activity heatmap cache warmed (%d total entries)',
      heatmap_data.data.length
    )
  } catch (error) {
    log('Failed to warm activity cache: %s', error.message)
  }
}

/**
 * Warm the tasks cache for public requests
 * Uses SQLite when available for faster queries, falls back to filesystem.
 */
/**
 * Convert flat SQLite task row to nested entity format expected by route handlers.
 * Filesystem results already have entity_properties/file_info structure.
 */
function normalize_sqlite_task(task) {
  // Already in nested format (from filesystem)
  if (task.entity_properties) return task

  // Convert flat SQLite row to nested structure
  return {
    entity_properties: { ...task },
    file_info: {
      base_uri: task.base_uri,
      absolute_path: null
    }
  }
}

async function warm_tasks_cache() {
  try {
    log('Warming tasks cache')

    const all_tasks = await embedded_index_manager.query_tasks_for_activity({
      archived: false
    })

    // Normalize to nested entity format (SQLite returns flat rows)
    const normalized = all_tasks.map(normalize_sqlite_task)

    cache.tasks = {
      data: normalized,
      timestamp: Date.now()
    }

    log('Tasks cache warmed (%d tasks)', normalized.length)
  } catch (error) {
    log('Failed to warm tasks cache: %s', error.message)
  }
}

/**
 * Warm the task stats cache
 */
async function warm_task_stats_cache() {
  try {
    log('Warming task stats cache')

    const [summary, by_tag, completion_series] = await Promise.all([
      get_task_summary_stats(),
      get_task_stats_by_tag(),
      get_task_completion_series()
    ])

    cache.task_stats = {
      data: { summary, by_tag, completion_series },
      timestamp: Date.now()
    }

    log('Task stats cache warmed')
  } catch (error) {
    log('Failed to warm task stats cache: %s', error.message)
  }
}

/**
 * Rebuild the activity heatmap from scratch.
 * Truncates the SQLite cache table and performs a full recomputation.
 */
export async function rebuild_activity_heatmap() {
  log('Rebuilding activity heatmap from scratch')
  if (embedded_index_manager.is_ready()) {
    await embedded_index_manager.truncate_heatmap_daily()
  }
  cache.activity_heatmap.timestamp = 0
  await warm_activity_cache()
  log('Activity heatmap rebuild complete')
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
 * Invalidate tasks cache (called by file watcher).
 * Debounced to coalesce rapid-fire events (e.g., FSEvents reconciliation
 * re-emits thousands of entity files, each calling this function).
 */
let tasks_invalidation_timer = null
export function invalidate_tasks_cache() {
  cache.tasks.timestamp = 0
  cache.task_stats.timestamp = 0

  if (tasks_invalidation_timer) return

  tasks_invalidation_timer = setTimeout(() => {
    tasks_invalidation_timer = null
    log('Tasks cache invalidated, re-warming')
    warm_tasks_cache()
    warm_task_stats_cache()
  }, 2000)
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
 * Get cached task stats
 * Returns cached data if fresh, null otherwise
 */
export function get_cached_task_stats() {
  const cached = cache.task_stats
  const now = Date.now()

  if (cached.data && now - cached.timestamp < CACHE_TTL.tasks) {
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
  await Promise.all([
    warm_activity_cache(),
    warm_tasks_cache(),
    warm_task_stats_cache()
  ])

  // Set up periodic refresh intervals
  activity_interval = setInterval(
    warm_activity_cache,
    ACTIVITY_REFRESH_INTERVAL
  )
  tasks_interval = setInterval(warm_tasks_cache, TASKS_REFRESH_INTERVAL)
  task_stats_interval = setInterval(
    warm_task_stats_cache,
    TASKS_REFRESH_INTERVAL
  )

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

  if (task_stats_interval) {
    clearInterval(task_stats_interval)
    task_stats_interval = null
  }

  if (tasks_invalidation_timer) {
    clearTimeout(tasks_invalidation_timer)
    tasks_invalidation_timer = null
  }

  log('Cache warmer service stopped')
}
