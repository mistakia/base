import crypto from 'crypto'
import express from 'express'
import debug from 'debug'
import config from '#config'

import { require_auth } from '#server/middleware/jwt-parser.mjs'
import {
  report_job,
  load_job,
  load_all_jobs
} from '#libs-server/jobs/report-job.mjs'
import { check_global_write_permission } from '#server/middleware/permission/index.mjs'

const log = debug('api:jobs')
const router = express.Router({ mergeParams: true })

/**
 * POST /api/jobs/report
 * Report a job execution result (external jobs via API key auth)
 */
router.post('/report', async (req, res) => {
  const auth_header = req.headers.authorization
  const expected_key = config.job_tracker?.api_key

  if (!expected_key || !auth_header) {
    return res.status(401).json({ error: 'Missing API key' })
  }

  const provided_key = auth_header.replace(/^Bearer\s+/i, '')
  const provided_buf = Buffer.from(provided_key)
  const expected_buf = Buffer.from(expected_key)
  if (
    provided_buf.length !== expected_buf.length ||
    !crypto.timingSafeEqual(provided_buf, expected_buf)
  ) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  const {
    job_id,
    success,
    reason,
    duration_ms,
    exit_code,
    project,
    server,
    name,
    source,
    schedule,
    schedule_type,
    schedule_entity_uri,
    command
  } = req.body

  if (!job_id || typeof success !== 'boolean') {
    return res
      .status(400)
      .json({ error: 'Missing required fields: job_id, success' })
  }

  try {
    const job = await report_job({
      job_id,
      name,
      source: source || 'external',
      success,
      reason,
      duration_ms,
      exit_code,
      project,
      server,
      schedule,
      schedule_type,
      schedule_entity_uri,
      command
    })

    const is_new = job.stats.total_runs === 1
    log('Job reported: %s (new=%s, success=%s)', job_id, is_new, success)

    return res.status(is_new ? 201 : 200).json(job)
  } catch (error) {
    log('Error reporting job: %s', error.message)
    return res.status(500).json({ error: 'Failed to report job' })
  }
})

/**
 * GET /api/jobs
 * List all tracked jobs
 */
router.get('/', require_auth, async (req, res) => {
  const has_permission = await check_global_write_permission(
    req.user.user_public_key
  )
  if (!has_permission) {
    return res.status(403).json({ error: 'Permission denied' })
  }

  try {
    const jobs = await load_all_jobs()
    return res.status(200).json(jobs)
  } catch (error) {
    log('Error listing jobs: %s', error.message)
    return res.status(500).json({ error: 'Failed to load jobs' })
  }
})

/**
 * GET /api/jobs/:job_id
 * Get a specific job by ID
 */
router.get('/:job_id', require_auth, async (req, res) => {
  const has_permission = await check_global_write_permission(
    req.user.user_public_key
  )
  if (!has_permission) {
    return res.status(403).json({ error: 'Permission denied' })
  }

  try {
    const job = await load_job({ job_id: req.params.job_id })
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }
    return res.status(200).json(job)
  } catch (error) {
    log('Error loading job %s: %s', req.params.job_id, error.message)
    return res.status(500).json({ error: 'Failed to load job' })
  }
})

export default router
