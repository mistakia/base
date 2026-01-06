/**
 * Cache Warmer Service
 *
 * Proactively maintains warm caches for public endpoints.
 * Ensures fast response times even after periods of no traffic.
 */

import debug from 'debug'

import { get_activity_heatmap_data } from '#libs-server/activity/index.mjs'
import { list_threads } from '#libs-server/threads/index.mjs'
import { list_tasks_from_filesystem } from '#libs-server/task/index.mjs'
import { enrich_thread_with_timeline } from '#libs-server/threads/thread-utils.mjs'

const log = debug('server:cache-warmer')

// Refresh intervals (in milliseconds)
const ACTIVITY_REFRESH_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours
const THREADS_REFRESH_INTERVAL = 20 * 60 * 1000 // 20 minutes
const TASKS_REFRESH_INTERVAL = 20 * 60 * 1000 // 20 minutes

// Store interval IDs for cleanup
let activity_interval = null
let threads_interval = null
let tasks_interval = null

// Cache storage (shared with route handlers via exports)
export const cache = {
  activity_heatmap: {
    data: null,
    timestamp: 0,
    days: 365
  },
  threads: new Map(), // Map<thread_state, { data, timestamp }>
  tasks: {
    data: null,
    timestamp: 0
  }
}

// Cache TTLs (for checking freshness)
export const CACHE_TTL = {
  activity: ACTIVITY_REFRESH_INTERVAL,
  threads: THREADS_REFRESH_INTERVAL,
  tasks: TASKS_REFRESH_INTERVAL
}

/**
 * Warm the activity heatmap cache
 */
async function warm_activity_cache() {
  try {
    const days = 365
    log('Warming activity heatmap cache for %d days', days)

    const heatmap_data = await get_activity_heatmap_data({ days })

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
 * Warm the threads cache for public requests
 */
async function warm_threads_cache() {
  try {
    log('Warming threads cache')

    // Warm cache for default (all) threads
    const all_threads = await list_threads({
      limit: 1000,
      offset: 0
    })

    // Enrich with timeline data
    const enriched_threads = await Promise.all(
      all_threads.map((thread) => enrich_thread_with_timeline({ thread }))
    )

    cache.threads.set('__all__', {
      data: enriched_threads,
      timestamp: Date.now()
    })

    // Also warm common thread_state filters
    for (const state of ['active', 'archived']) {
      const filtered_threads = await list_threads({
        thread_state: state,
        limit: 1000,
        offset: 0
      })

      const enriched = await Promise.all(
        filtered_threads.map((thread) =>
          enrich_thread_with_timeline({ thread })
        )
      )

      cache.threads.set(state, {
        data: enriched,
        timestamp: Date.now()
      })
    }

    log('Threads cache warmed (all, active, archived)')
  } catch (error) {
    log('Failed to warm threads cache: %s', error.message)
  }
}

/**
 * Warm the tasks cache for public requests
 */
async function warm_tasks_cache() {
  try {
    log('Warming tasks cache')

    const all_tasks = await list_tasks_from_filesystem({
      archived: false
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
 * Invalidate threads cache (called by file watcher)
 */
export function invalidate_threads_cache() {
  cache.threads.clear()
  log('Threads cache invalidated')
  // Immediately re-warm in background
  warm_threads_cache()
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
 * Get cached threads list
 * Returns cached data if fresh, null otherwise
 */
export function get_cached_threads({ thread_state }) {
  const cache_key = thread_state || '__all__'
  const cached = cache.threads.get(cache_key)
  const now = Date.now()

  if (cached && now - cached.timestamp < CACHE_TTL.threads) {
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
    warm_threads_cache(),
    warm_tasks_cache()
  ])

  // Set up periodic refresh intervals
  activity_interval = setInterval(
    warm_activity_cache,
    ACTIVITY_REFRESH_INTERVAL
  )
  threads_interval = setInterval(warm_threads_cache, THREADS_REFRESH_INTERVAL)
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

  if (threads_interval) {
    clearInterval(threads_interval)
    threads_interval = null
  }

  if (tasks_interval) {
    clearInterval(tasks_interval)
    tasks_interval = null
  }

  log('Cache warmer service stopped')
}
