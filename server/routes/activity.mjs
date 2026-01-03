import express from 'express'
import debug from 'debug'

import { get_activity_heatmap_data } from '#libs-server/activity/index.mjs'

const log = debug('api:activity')
const router = express.Router({ mergeParams: true })

// Cache for heatmap data (15 minute TTL)
const CACHE_TTL_MS = 15 * 60 * 1000
let heatmap_cache = null
let cache_timestamp = 0
let cache_days = 0

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
    const now = Date.now()

    // Check cache validity
    const cache_valid =
      heatmap_cache &&
      cache_days === days &&
      now - cache_timestamp < CACHE_TTL_MS

    if (cache_valid) {
      log(`Returning cached activity heatmap data for ${days} days`)
      return res.json(heatmap_cache)
    }

    log(`Fetching activity heatmap data for ${days} days`)

    const heatmap_data = await get_activity_heatmap_data({ days })

    // Update cache
    heatmap_cache = heatmap_data
    cache_timestamp = now
    cache_days = days

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
