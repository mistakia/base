import express from 'express'
import debug from 'debug'

import {
  get_activity_heatmap_data,
  merge_activity_and_calculate_scores,
  aggregate_task_activity
} from '#libs-server/activity/index.mjs'
import {
  get_cached_activity_heatmap,
  get_cached_task_stats,
  rebuild_activity_heatmap
} from '#server/services/cache-warmer.mjs'
import {
  HTTP_MAX_AGE,
  HTTP_STALE_WHILE_REVALIDATE
} from '#server/constants/http-cache.mjs'
import {
  query_entities_by_thread_activity,
  query_git_activity_daily,
  query_thread_activity_aggregated
} from '#libs-server/embedded-database-index/duckdb/duckdb-activity-queries.mjs'
import {
  parse_time_period_date,
  is_valid_time_period
} from '#libs-server/utils/parse-time-period.mjs'
import {
  get_task_summary_stats,
  get_task_stats_by_tag,
  get_task_completion_series
} from '#libs-server/activity/task-stats.mjs'

const log = debug('api:activity')
const router = express.Router({ mergeParams: true })

/**
 * GET /api/activity/heatmap
 *
 * Returns activity heatmap data aggregated by date
 * Query params:
 *   - days: Number of trailing days (default: 365)
 */
router.get('/heatmap', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 365

    // Set HTTP cache headers for public caching
    res.set(
      'Cache-Control',
      `public, max-age=${HTTP_MAX_AGE}, stale-while-revalidate=${HTTP_STALE_WHILE_REVALIDATE}`
    )

    // Check centralized cache (maintained by cache-warmer service)
    const cached_data = get_cached_activity_heatmap({ days })
    if (cached_data) {
      log(`Returning cached activity heatmap data for ${days} days`)
      return res.json(cached_data)
    }

    // Try DuckDB fast path before falling back to slow file aggregation
    log(
      `Fetching activity heatmap data for ${days} days (cache miss, trying DuckDB)`
    )
    try {
      const [git_activity, thread_activity, task_activity] = await Promise.all([
        query_git_activity_daily({ days }),
        query_thread_activity_aggregated({ days }),
        aggregate_task_activity({ days })
      ])

      if (
        git_activity.length > 0 ||
        thread_activity.length > 0 ||
        task_activity.length > 0
      ) {
        const heatmap_data = merge_activity_and_calculate_scores({
          git_activity,
          thread_activity,
          task_activity,
          days
        })
        log(
          `Returning DuckDB heatmap data: ${heatmap_data.data.length} days, max_score: ${heatmap_data.max_score}`
        )
        return res.json(heatmap_data)
      }
    } catch (duckdb_error) {
      log(
        `DuckDB heatmap query failed, falling back to file aggregation: ${duckdb_error.message}`
      )
    }

    // Final fallback: slow file-based aggregation
    const heatmap_data = await get_activity_heatmap_data({ days })

    res.json(heatmap_data)
  } catch (error) {
    log(`Error fetching activity heatmap: ${error.message}`)
    res.status(500).json({
      error: 'Failed to fetch activity heatmap data',
      message: error.message
    })
  }
})

/**
 * GET /api/activity/entities
 *
 * Returns entities ranked by recent thread activity.
 * Query params:
 *   - period: Time period string (e.g., "24h", "7d", "2w", "1m"). Default: "7d"
 *   - type: Entity type filter (e.g., "task")
 *   - limit: Max results (default: 50)
 *   - offset: Pagination offset (default: 0)
 */
router.get('/entities', async (req, res) => {
  try {
    const period = req.query.period || '7d'
    const entity_type = req.query.type || null
    const limit = parseInt(req.query.limit, 10) || 50
    const offset = parseInt(req.query.offset, 10) || 0

    if (!is_valid_time_period(period)) {
      return res.status(400).json({
        error: 'Invalid period format',
        message: `Period "${period}" is invalid. Use format like 24h, 7d, 2w, 1m`
      })
    }

    const since_date = parse_time_period_date(period)
    log(
      `Fetching entities by thread activity since ${since_date.toISOString()} (type: ${entity_type})`
    )

    const entities = await query_entities_by_thread_activity({
      since_date,
      entity_types: entity_type,
      limit,
      offset
    })

    res.json(entities)
  } catch (error) {
    log(`Error fetching entity activity: ${error.message}`)
    res.status(500).json({
      error: 'Failed to fetch entity activity data',
      message: error.message
    })
  }
})

/**
 * POST /api/activity/rebuild-heatmap
 *
 * Truncates the heatmap cache table and performs a full recomputation.
 * Requires authentication.
 */
router.post('/rebuild-heatmap', async (req, res) => {
  try {
    if (!req.user?.user_public_key) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    log('Rebuilding activity heatmap (requested via API)')
    await rebuild_activity_heatmap()
    res.json({ success: true })
  } catch (error) {
    log(`Error rebuilding activity heatmap: ${error.message}`)
    res.status(500).json({
      error: 'Failed to rebuild activity heatmap',
      message: error.message
    })
  }
})

/**
 * GET /api/activity/task-stats
 *
 * Returns task productivity statistics.
 * Unauthenticated: returns summary and completion_series only (no by_tag)
 */
router.get('/task-stats', async (req, res) => {
  try {
    res.set(
      'Cache-Control',
      `public, max-age=${HTTP_MAX_AGE}, stale-while-revalidate=${HTTP_STALE_WHILE_REVALIDATE}`
    )

    // Check cache first, fall back to direct queries
    let data = get_cached_task_stats()
    if (data) {
      log('Returning cached task stats')
    } else {
      log('Computing task stats (cache miss)')
      const [summary, by_tag, completion_series] = await Promise.all([
        get_task_summary_stats(),
        get_task_stats_by_tag(),
        get_task_completion_series()
      ])
      data = { summary, by_tag, completion_series }
    }

    const is_authenticated = Boolean(req.user?.user_public_key)
    if (!is_authenticated) {
      return res.json({
        summary: data.summary,
        completion_series: data.completion_series
      })
    }

    res.json(data)
  } catch (error) {
    log(`Error fetching task stats: ${error.message}`)
    res.status(500).json({
      error: 'Failed to fetch task stats',
      message: error.message
    })
  }
})

export default router
