import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import debug from 'debug'
import config from '#config'
import { create_session_claude_cli } from './create-session-claude-cli.mjs'

const log = debug('threads:worker')

// Constants
const QUEUE_NAME = 'thread-creation'
const DEFAULT_REDIS_URL = 'redis://localhost:6379'
const DEFAULT_CONCURRENCY = 3

// Module state
let redis_connection = null
let thread_worker = null

/**
 * Get or create Redis connection for the worker
 */
const get_redis_connection = () => {
  if (redis_connection) {
    return redis_connection
  }

  const redis_url =
    config.threads?.queue?.redis_url ||
    process.env.REDIS_URL ||
    DEFAULT_REDIS_URL

  redis_connection = new IORedis(redis_url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  })

  redis_connection.on('error', (error) => {
    log('Redis error:', error)
  })

  redis_connection.on('connect', () => {
    log('Redis connected')
  })

  return redis_connection
}

/**
 * Process a thread creation job
 * Creates or resumes a Claude CLI session
 */
const process_thread_creation_job = async (job) => {
  const {
    prompt,
    working_directory,
    user_public_key,
    session_id = null
  } = job.data

  const action = session_id ? 'resuming' : 'starting new'
  log(
    `Job ${job.id}: ${action} Claude CLI session${session_id ? ` ${session_id}` : ''}`
  )

  try {
    const result = await create_session_claude_cli({
      prompt,
      working_directory,
      user_public_key,
      session_id
    })

    log(`Job ${job.id}: completed (exit code ${result.exit_code})`)

    return {
      success: true,
      session_directory: result.session_directory,
      session_id,
      exit_code: result.exit_code,
      completed_at: new Date().toISOString()
    }
  } catch (error) {
    log(`Job ${job.id}: failed -`, error.message)
    throw error
  }
}

/**
 * Event handlers
 */
const handle_job_completed = (job, result) => {
  log(`Job ${job.id}: completed successfully`, result)
}

const handle_job_failed = (job, error) => {
  log(`Job ${job.id}: failed -`, error.message)
}

const handle_job_active = (job) => {
  log(`Job ${job.id}: active`)
}

const handle_worker_error = (error) => {
  log('Worker error:', error)
}

/**
 * Start the BullMQ worker
 */
export const start_worker = () => {
  if (thread_worker) {
    log('Worker already running')
    return thread_worker
  }

  const connection = get_redis_connection()
  const concurrency =
    config.threads?.queue?.max_concurrent_jobs || DEFAULT_CONCURRENCY

  log(`Starting worker (concurrency: ${concurrency})`)

  thread_worker = new Worker(QUEUE_NAME, process_thread_creation_job, {
    connection,
    concurrency
  })

  thread_worker.on('completed', handle_job_completed)
  thread_worker.on('failed', handle_job_failed)
  thread_worker.on('active', handle_job_active)
  thread_worker.on('error', handle_worker_error)

  log('Worker ready')

  return thread_worker
}

/**
 * Stop the worker and close connections
 */
export const stop_worker = async () => {
  if (!thread_worker) {
    return
  }

  log('Stopping worker...')

  await thread_worker.close()
  thread_worker = null

  if (redis_connection) {
    await redis_connection.quit()
    redis_connection = null
  }

  log('Worker stopped')
}
