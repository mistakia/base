import express from 'express'

import { get_watcher_status } from '#libs-server/watcher-state.mjs'

const router = express.Router({ mergeParams: true })

/**
 * GET /api/health
 *
 * Lightweight health endpoint that responds from in-memory state only.
 * No async I/O, no database queries, no filesystem reads.
 * Registered before auth middleware so it works without authentication.
 */
router.get('/', (_req, res) => {
  const memory = process.memoryUsage()

  res.status(200).json({
    status: 'ok',
    uptime_seconds: Math.floor(process.uptime()),
    memory: {
      rss_mb: Math.round(memory.rss / 1024 / 1024),
      heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
      external_mb: Math.round(memory.external / 1024 / 1024)
    },
    watchers: get_watcher_status()
  })
})

export default router
