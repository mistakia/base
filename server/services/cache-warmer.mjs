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
  merge_activity_and_calculate_scores,
  aggregate_task_activity
} from '#libs-server/activity/index.mjs'
import {
  get_task_summary_stats,
  get_task_stats_by_tag,
  get_task_completion_series
} from '#libs-server/activity/task-stats.mjs'
import { list_tasks_from_filesystem } from '#libs-server/task/index.mjs'

import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  query_tasks_from_entities,
  query_git_activity_daily,
  query_thread_activity_aggregated,
  query_heatmap_daily_all,
  upsert_heatmap_daily_batch,
  get_heatmap_daily_count,
  truncate_heatmap_daily
} from '#libs-server/embedded-database-index/sqlite/sqlite-activity-queries.mjs'

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
 * using the DuckDB fast path (git + thread activity queries).
 * @param {number} days Number of days to compute
 * @returns {Promise<Object>} Heatmap data with data array, max_score, date_range
 */
async function compute_fresh_days(days) {
  const [git_activity, thread_activity, task_activity] = await Promise.all([
    query_git_activity_daily({ days }),
    query_thread_activity_aggregated({ days }),
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
 * Warm the activity heatmap cache
 * Uses an incremental strategy when DuckDB is available:
 *   - Cold start (empty table): full computation + bulk insert
 *   - Incremental: read frozen past days from cache table, recompute only today + yesterday
 * Falls back to full computation when DuckDB is unavailable.
 */
async function warm_activity_cache() {
  try {
    const days = 365
    log('Warming activity heatmap cache for %d days', days)

    // When DuckDB is not ready, fall back to full computation
    if (!embedded_index_manager.is_duckdb_ready()) {
      log('DuckDB not ready, using full computation fallback')
      cache.activity_heatmap = {
        data: await get_activity_heatmap_data({ days }),
        timestamp: Date.now(),
        days
      }
      log('Activity heatmap cache warmed (fallback)')
      return
    }

    let row_count
    try {
      row_count = await get_heatmap_daily_count()
    } catch (error) {
      log(
        'Failed to query heatmap daily count, using full fallback: %s',
        error.message
      )
      cache.activity_heatmap = {
        data: await get_activity_heatmap_data({ days }),
        timestamp: Date.now(),
        days
      }
      return
    }

    if (row_count === 0) {
      // Cold start: full computation, then bulk insert into cache table
      log('Cold start detected, performing full computation')
      const heatmap_data = await compute_fresh_days(days)
      if (!embedded_index_manager.read_only) {
        await upsert_heatmap_daily_batch({ entries: heatmap_data.data })
      }
      cache.activity_heatmap = {
        data: heatmap_data,
        timestamp: Date.now(),
        days
      }
      log(
        'Activity heatmap cache warmed (cold start, %d entries%s)',
        heatmap_data.data.length,
        embedded_index_manager.read_only ? '' : ' persisted'
      )
      return
    }

    // Incremental: read frozen days from cache table, recompute today + yesterday
    log('Incremental warm: %d cached rows, recomputing 2 fresh days', row_count)

    let frozen_days, fresh_result
    try {
      ;[frozen_days, fresh_result] = await Promise.all([
        query_heatmap_daily_all({ days }),
        compute_fresh_days(2)
      ])
    } catch (error) {
      log('Incremental queries failed, using full fallback: %s', error.message)
      cache.activity_heatmap = {
        data: await get_activity_heatmap_data({ days }),
        timestamp: Date.now(),
        days
      }
      return
    }

    // Ensure today and yesterday have entries even with zero activity,
    // so stale cached data for those dates gets overwritten
    const today_str = new Date().toISOString().split('T')[0]
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterday_str = yesterday.toISOString().split('T')[0]

    const ZERO_ENTRY_FIELDS = {
      activity_git_commits: 0,
      activity_git_lines_changed: 0,
      activity_git_files_changed: 0,
      activity_token_usage: 0,
      activity_thread_edits: 0,
      activity_thread_lines_changed: 0,
      tasks_created: 0,
      tasks_completed: 0,
      score: 0
    }

    const fresh_dates = new Set(fresh_result.data.map((e) => e.date))
    const zero_entries = []
    if (!fresh_dates.has(today_str))
      zero_entries.push({ date: today_str, ...ZERO_ENTRY_FIELDS })
    if (!fresh_dates.has(yesterday_str))
      zero_entries.push({ date: yesterday_str, ...ZERO_ENTRY_FIELDS })

    const all_fresh = [...fresh_result.data, ...zero_entries]

    // Persist fresh days (skip in read-only mode)
    if (!embedded_index_manager.read_only) {
      await upsert_heatmap_daily_batch({ entries: all_fresh })
    }

    // Merge: frozen days as base, fresh days overwrite matching dates
    const merged_by_date = new Map()
    for (const entry of frozen_days) {
      merged_by_date.set(entry.date, entry)
    }
    for (const entry of all_fresh) {
      merged_by_date.set(entry.date, entry)
    }

    const merged_data = Array.from(merged_by_date.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    )

    if (merged_data.length < days * 0.5) {
      log(
        'Warning: merged heatmap has only %d entries for %d day range (possible gaps)',
        merged_data.length,
        days
      )
    }

    const max_score = merged_data.reduce(
      (max, entry) => Math.max(max, entry.score ?? 0),
      0
    )

    const since_date = new Date()
    since_date.setDate(since_date.getDate() - days)

    cache.activity_heatmap = {
      data: {
        data: merged_data,
        max_score,
        date_range: {
          start: since_date.toISOString().split('T')[0],
          end: today_str
        }
      },
      timestamp: Date.now(),
      days
    }

    log(
      'Activity heatmap cache warmed (incremental, %d total entries)',
      merged_data.length
    )
  } catch (error) {
    log('Failed to warm activity cache: %s', error.message)
  }
}

/**
 * Warm the tasks cache for public requests
 * Uses DuckDB when available for faster queries, falls back to filesystem.
 */
/**
 * Convert flat DuckDB task row to nested entity format expected by route handlers.
 * Filesystem results already have entity_properties/file_info structure.
 */
function normalize_duckdb_task(task) {
  // Already in nested format (from filesystem)
  if (task.entity_properties) return task

  // Convert flat DuckDB row to nested structure
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

    const all_tasks = await try_duckdb_or_fallback({
      label: 'tasks cache',
      duckdb_fn: () => query_tasks_from_entities({ archived: false }),
      fallback_fn: () => list_tasks_from_filesystem({ archived: false })
    })

    // Normalize to nested entity format (DuckDB returns flat rows)
    const normalized = all_tasks.map(normalize_duckdb_task)

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
 * Truncates the DuckDB cache table and performs a full recomputation.
 */
export async function rebuild_activity_heatmap() {
  log('Rebuilding activity heatmap from scratch')
  if (embedded_index_manager.is_duckdb_ready()) {
    await truncate_heatmap_daily()
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
 * Invalidate tasks cache (called by file watcher)
 */
export function invalidate_tasks_cache() {
  cache.tasks.timestamp = 0
  cache.task_stats.timestamp = 0
  log('Tasks cache invalidated')
  // Immediately re-warm in background
  warm_tasks_cache()
  warm_task_stats_cache()
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

  log('Cache warmer service stopped')
}
