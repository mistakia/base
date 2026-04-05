import { Worker, DelayedError } from 'bullmq'
import debug from 'debug'
import config from '#config'

import os from 'os'

import { get_redis_connection, QUEUE_CONFIG } from './queue.mjs'
import { execute_command } from '#libs-server/cli-queue/execute-command.mjs'
import {
  try_acquire_tags,
  unregister_job_tags
} from '#libs-server/cli-queue/tag-limiter.mjs'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { http_report_job } from '#libs-server/jobs/http-report-job.mjs'
import {
  buffer_report,
  drain_buffer
} from '#libs-server/jobs/job-report-buffer.mjs'

const log = debug('cli-queue:worker')

// Worker configuration
const WORKER_CONCURRENCY = 10 // Max concurrent jobs (actual limit by tags)
const TAG_CHECK_DELAY_MS = 2000 // Delay when tags at limit

// Module state
let cli_queue_worker = null

/**
 * Get tag limits from config
 */
const get_tag_limits = () => {
  return config.cli_queue?.tag_limits || { default: { max_concurrent: 10 } }
}

/**
 * Process a CLI command job
 */
const process_cli_job = async (job) => {
  const {
    command,
    tags = [],
    working_directory,
    timeout_ms,
    execution_mode
  } = job.data
  const redis = get_redis_connection()
  const tag_limits = get_tag_limits()

  log(`Job ${job.id}: attempting to acquire tags [${tags.join(', ')}]`)

  // Atomically check limits and register - prevents race conditions
  // Idempotent: jobs can re-acquire their own tags after worker restart
  const { acquired, blocking_tags } = await try_acquire_tags({
    job_id: job.id,
    tags,
    tag_limits,
    redis
  })

  if (!acquired) {
    log(
      `Job ${job.id}: blocked by tags [${blocking_tags.join(', ')}], delaying`
    )
    await job.moveToDelayed(Date.now() + TAG_CHECK_DELAY_MS)
    // Throw DelayedError to signal BullMQ this is intentional delay, not failure
    throw new DelayedError()
  }

  try {
    log(`Job ${job.id}: executing command`)

    const result = await execute_command({
      command,
      working_directory,
      timeout_ms,
      execution_mode
    })

    log(
      `Job ${job.id}: completed (exit_code=${result.exit_code}, duration=${result.duration_ms}ms)`
    )

    return {
      success: result.success,
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      duration_ms: result.duration_ms,
      timed_out: result.timed_out,
      completed_at: new Date().toISOString()
    }
  } finally {
    // Always unregister tags, even on failure
    await unregister_job_tags({ job_id: job.id, tags, redis })
  }
}

/**
 * Build the reason text for a failed job execution
 */
const build_failure_reason = ({ result, error }) => {
  if (result?.stderr) return result.stderr
  if (error?.message) return error.message
  if (result?.timed_out) {
    return `Timed out after ${Math.round((result.duration_ms || 0) / 1000)}s`
  }
  if (result?.stdout) return result.stdout

  if (result?.exit_code != null) {
    const signal_info = result.signal ? ` (signal: ${result.signal})` : ''
    const stdout_tail = result?.stdout?.trim()?.slice(-300)
    return stdout_tail
      ? `Exit code ${result.exit_code}${signal_info}\n\nOutput (last 300 chars):\n${stdout_tail}`
      : `Exit code ${result.exit_code}${signal_info} — no output captured`
  }

  const stdout_tail = result?.stdout?.trim()?.slice(-200)
  return stdout_tail
    ? `Unknown failure\n\nOutput:\n${stdout_tail}`
    : 'Unknown failure — no output or exit code captured'
}

/**
 * Send a report payload via HTTP API, buffering on failure
 */
const send_http_report = async (payload) => {
  const api_url = config.job_tracker?.api_url
  const api_key = config.job_tracker?.api_key
  if (!api_url || !api_key) {
    log('HTTP report skipped: missing api_url or api_key in config')
    return
  }

  const http_result = await http_report_job({ api_url, api_key, payload })
  if (http_result.success) {
    // Opportunistically drain any previously buffered reports
    drain_buffer({
      report_fn: (p) => http_report_job({ api_url, api_key, payload: p })
    }).catch((err) => log('Buffer drain error: %s', err.message))
  } else {
    log('HTTP report failed, buffering: %s', http_result.error)
    await buffer_report({ payload })
  }
}

/**
 * Report internal scheduled-command execution to job tracker
 */
const report_to_job_tracker = async ({ job, success, result, error }) => {
  if (!config.job_tracker?.enabled) {
    return
  }

  const metadata = job.data?.metadata
  if (!metadata?.schedule_entity_id) {
    return
  }

  try {
    const reason_text = !success
      ? build_failure_reason({ result, error })
      : null

    const payload = {
      job_id: `internal-${metadata.schedule_entity_id}`,
      name: metadata.schedule_title,
      source: 'internal',
      success,
      duration_ms: result?.duration_ms ?? null,
      exit_code: result?.exit_code ?? null,
      reason: reason_text ? reason_text.slice(-2000) : null,
      project: 'base',
      server: os.hostname(),
      schedule: metadata.schedule_expression,
      schedule_type: metadata.schedule_type,
      schedule_entity_uri: metadata.schedule_entity_uri || null,
      command: metadata.command || null
    }

    if (get_current_machine_id() === 'storage') {
      const { report_job } = await import('#libs-server/jobs/report-job.mjs')
      await report_job(payload)
    } else {
      await send_http_report(payload)
    }
  } catch (report_error) {
    log(`Job ${job.id}: job tracker report failed - ${report_error.message}`)
  }
}

/**
 * Event handlers
 */
const handle_job_completed = (job, result) => {
  if (result) {
    log(`Job ${job.id}: completed${result.success ? '' : ' (command failed)'}`)
    report_to_job_tracker({ job, success: result.success, result })
  }
}

const handle_job_failed = (job, error) => {
  log(`Job ${job.id}: failed - ${error.message}`)
  report_to_job_tracker({ job, success: false, error })
}

const handle_job_active = (job) => {
  log(`Job ${job.id}: active - ${job.data.command?.substring(0, 50)}...`)
}

const handle_worker_error = (error) => {
  log('Worker error:', error.message)
}

/**
 * Handle stalled jobs - just log for monitoring
 * With idempotent tag acquisition, stalled jobs can re-acquire their own tags
 * when reactivated by BullMQ, so no cleanup needed here.
 */
const handle_job_stalled = (job_id) => {
  log(`Job ${job_id}: stalled - BullMQ will reactivate`)
}

/**
 * Start the CLI queue worker
 */
export const start_cli_queue_worker = () => {
  if (cli_queue_worker) {
    log('Worker already running')
    return cli_queue_worker
  }

  const connection = get_redis_connection()

  log(`Starting CLI queue worker (concurrency: ${WORKER_CONCURRENCY})`)

  cli_queue_worker = new Worker(QUEUE_CONFIG.name, process_cli_job, {
    connection,
    concurrency: WORKER_CONCURRENCY,
    // Stalled job detection - recover jobs from crashed workers.
    // Scheduled commands can have timeouts up to 900s (import-claude-sessions).
    // lockDuration must exceed the longest job timeout so BullMQ auto-renewal
    // (at lockDuration/2) fires before stall detection. Previous 300s value
    // caused false stalls on jobs blocking the event loop for >150s.
    stalledInterval: 30000, // Check for stalled jobs every 30 seconds
    lockDuration: 1200000, // Jobs locked for 20 minutes (covers 15-min timeout jobs with margin)
    maxStalledCount: 2 // Allow 2 stalls before failing (handles transient issues)
  })

  // Job lifecycle events
  cli_queue_worker.on('completed', handle_job_completed)
  cli_queue_worker.on('failed', handle_job_failed)
  cli_queue_worker.on('active', handle_job_active)
  cli_queue_worker.on('error', handle_worker_error)
  cli_queue_worker.on('stalled', handle_job_stalled)

  log('CLI queue worker ready')

  // Drain any buffered job reports from previous offline periods
  if (get_current_machine_id() !== 'storage' && config.job_tracker?.api_url) {
    drain_buffer({
      report_fn: (payload) =>
        http_report_job({
          api_url: config.job_tracker.api_url,
          api_key: config.job_tracker.api_key,
          payload
        })
    }).catch((err) => log('Startup buffer drain error: %s', err.message))
  }

  return cli_queue_worker
}

/**
 * Stop the CLI queue worker
 */
export const stop_cli_queue_worker = async () => {
  if (!cli_queue_worker) {
    return
  }

  log('Stopping CLI queue worker...')

  await cli_queue_worker.close()
  cli_queue_worker = null

  log('CLI queue worker stopped')
}
