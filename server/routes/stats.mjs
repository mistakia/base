import express from 'express'
import debug from 'debug'

import config from '#config'
import {
  get_stats_database_connection,
  query_latest_snapshot,
  query_metric_series
} from '#libs-server/stats/database.mjs'

const log = debug('api:stats')
const router = express.Router({ mergeParams: true })

async function get_pool() {
  return get_stats_database_connection({ config })
}

/**
 * GET /api/stats/latest
 *
 * Returns the most recent full snapshot grouped by category.
 */
router.get('/latest', async (req, res) => {
  try {
    const pool = await get_pool()
    const rows = await query_latest_snapshot({ pool })

    const grouped = {}
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = []
      grouped[row.category].push({
        metric_name: row.metric_name,
        metric_value: row.metric_value,
        unit: row.unit,
        dimensions: row.dimensions
      })
    }

    res.json({
      snapshot_date: rows[0]?.snapshot_date || null,
      categories: grouped
    })
  } catch (error) {
    log('Error fetching latest snapshot: %s', error.message)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

/**
 * GET /api/stats/series
 *
 * Returns a time series for a single metric.
 * Query params: metric (required), from, to, dimensions (JSON string)
 */
router.get('/series', async (req, res) => {
  try {
    const { metric, from, to, dimensions } = req.query

    if (!metric) {
      return res.status(400).json({ error: 'metric parameter is required' })
    }

    const pool = await get_pool()
    const parsed_dimensions = dimensions ? JSON.parse(dimensions) : undefined

    const rows = await query_metric_series({
      pool,
      metric_name: metric,
      from_date: from,
      to_date: to,
      dimensions: parsed_dimensions
    })

    res.json({ metric, series: rows })
  } catch (error) {
    log('Error fetching metric series: %s', error.message)
    res.status(500).json({ error: 'Failed to fetch series' })
  }
})

export default router
