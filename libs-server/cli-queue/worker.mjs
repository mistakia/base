import { Worker, DelayedError } from 'bullmq'
import debug from 'debug'
import config from '#config'

import { get_redis_connection, QUEUE_CONFIG } from './queue.mjs'
import { execute_command } from './execute-command.mjs'
import { try_acquire_tags, unregister_job_tags } from './tag-limiter.mjs'

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
  const { command, tags = [], working_directory, timeout_ms } = job.data
  const redis = get_redis_connection()
  const tag_limits = get_tag_limits()

  log(`Job ${job.id}: attempting to acquire tags [${tags.join(', ')}]`)

  // Atomically check limits and register - prevents race conditions
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
      timeout_ms
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
 * Event handlers
 */
const handle_job_completed = (job, result) => {
  if (result) {
    log(`Job ${job.id}: completed successfully`)
  }
}

const handle_job_failed = (job, error) => {
  log(`Job ${job.id}: failed - ${error.message}`)
}

const handle_job_active = (job) => {
  log(`Job ${job.id}: active - ${job.data.command?.substring(0, 50)}...`)
}

const handle_worker_error = (error) => {
  log('Worker error:', error.message)
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
    concurrency: WORKER_CONCURRENCY
  })

  cli_queue_worker.on('completed', handle_job_completed)
  cli_queue_worker.on('failed', handle_job_failed)
  cli_queue_worker.on('active', handle_job_active)
  cli_queue_worker.on('error', handle_worker_error)

  log('CLI queue worker ready')

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
