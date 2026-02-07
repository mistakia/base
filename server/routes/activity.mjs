import express from 'express'
import debug from 'debug'

import { get_activity_heatmap_data } from '#libs-server/activity/index.mjs'
import { get_cached_activity_heatmap } from '#server/services/cache-warmer.mjs'
import {
  HTTP_MAX_AGE,
  HTTP_STALE_WHILE_REVALIDATE
} from '#server/constants/http-cache.mjs'

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

    // Cache miss - fetch fresh data
    log(`Fetching activity heatmap data for ${days} days (cache miss)`)
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

export default router
