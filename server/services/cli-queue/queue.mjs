import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { randomUUID } from 'crypto'
import debug from 'debug'
import config from '#config'

const log = debug('cli-queue:queue')

// Configuration with defaults
const QUEUE_CONFIG = {
  name: config.cli_queue?.queue_name || 'base-cli-commands',
  redis_url:
    config.threads?.queue?.redis_url ||
    process.env.REDIS_URL ||
    'redis://localhost:6379',
  retry_attempts: config.cli_queue?.retry_attempts || 2,
  retry_delay_ms: (config.cli_queue?.retry_delay_seconds || 30) * 1000,
  default_timeout_ms: config.cli_queue?.default_timeout_ms || 300000,
  completed_job_age_seconds: 3600,
  completed_job_count: 100,
  failed_job_age_seconds: 86400
}

// Module-level singletons
let redis_connection = null
let cli_queue = null

/**
 * Initialize Redis connection
 */
const initialize_redis_connection = () => {
  log(`Connecting to Redis: ${QUEUE_CONFIG.redis_url}`)

  const connection = new IORedis(QUEUE_CONFIG.redis_url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  })

  connection.on('error', (error) => {
    log('Redis connection error:', error.message)
  })

  connection.on('connect', () => {
    log('Redis connected')
  })

  return connection
}

/**
 * Get or create Redis connection singleton
 */
export const get_redis_connection = () => {
  if (!redis_connection) {
    redis_connection = initialize_redis_connection()
  }
  return redis_connection
}

/**
 * Initialize BullMQ queue
 */
const initialize_queue = (connection) => {
  const queue = new Queue(QUEUE_CONFIG.name, {
    connection,
    defaultJobOptions: {
      attempts: QUEUE_CONFIG.retry_attempts,
      backoff: {
        type: 'exponential',
        delay: QUEUE_CONFIG.retry_delay_ms
      },
      removeOnComplete: {
        age: QUEUE_CONFIG.completed_job_age_seconds,
        count: QUEUE_CONFIG.completed_job_count
      },
      removeOnFail: {
        age: QUEUE_CONFIG.failed_job_age_seconds
      }
    }
  })

  log('CLI command queue initialized')
  return queue
}

/**
 * Get or create CLI queue singleton
 */
export const get_cli_queue = () => {
  if (!cli_queue) {
    const connection = get_redis_connection()
    cli_queue = initialize_queue(connection)
  }
  return cli_queue
}

/**
 * Add a CLI command job to the queue
 * @param {Object} params
 * @param {string} params.command - CLI command to execute
 * @param {string[]} [params.tags=[]] - Tags for concurrency control
 * @param {number} [params.priority=10] - Job priority (lower = higher priority)
 * @param {string} [params.working_directory] - Working directory for command
 * @param {number} [params.timeout_ms] - Command timeout in milliseconds
 * @param {string} [params.execution_mode] - Where to execute: 'host' (default) or 'container'
 * @param {Object} [params.metadata={}] - Additional metadata
 * @returns {Promise<Object>} Job object with id and tags
 */
export const add_cli_job = async ({
  command,
  tags = [],
  priority = 10,
  working_directory,
  timeout_ms = QUEUE_CONFIG.default_timeout_ms,
  execution_mode,
  metadata = {}
}) => {
  // Default working_directory for host-mode jobs to the caller's cwd.
  // For container/container_user modes, leave undefined so execute_command
  // uses CONTAINER_USER_BASE_PATH on the actual worker machine (avoids
  // cross-machine path mismatch when different workers share the queue).
  if (
    !working_directory &&
    execution_mode !== 'container' &&
    execution_mode !== 'container_user'
  ) {
    working_directory = process.cwd()
  }
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new Error('command must be a non-empty string')
  }

  if (!Number.isFinite(timeout_ms) || timeout_ms <= 0) {
    throw new Error('timeout_ms must be a positive finite number')
  }

  try {
    const queue = get_cli_queue()

    const job_data = {
      command,
      tags,
      working_directory,
      timeout_ms,
      execution_mode,
      metadata,
      queued_at: new Date().toISOString()
    }

    const job = await queue.add('cli-command', job_data, {
      priority,
      jobId: `cli-${randomUUID()}`
    })

    log(`Added CLI job ${job.id}: ${command.substring(0, 50)}...`)

    return {
      id: job.id,
      tags
    }
  } catch (error) {
    log('Failed to add CLI job:', error.message)
    throw error
  }
}

/**
 * Get job status by ID
 */
export const get_job_status = async (job_id) => {
  try {
    const queue = get_cli_queue()
    const job = await queue.getJob(job_id)

    if (!job) {
      return null
    }

    const state = await job.getState()

    return {
      id: job.id,
      state,
      data: job.data,
      return_value: job.returnvalue,
      failed_reason: job.failedReason,
      attempts_made: job.attemptsMade
    }
  } catch (error) {
    log(`Failed to get job status for ${job_id}:`, error.message)
    return null
  }
}

/**
 * Get queue statistics
 */
export const get_queue_stats = async () => {
  try {
    const queue = get_cli_queue()
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount()
    ])

    return { waiting, active, completed, failed }
  } catch (error) {
    log('Failed to get queue stats:', error.message)
    return { waiting: 0, active: 0, completed: 0, failed: 0 }
  }
}

/**
 * Test Redis connectivity. Returns true if Redis is reachable, false otherwise.
 * @param {number} [timeout_ms=3000] - Connection timeout
 * @returns {Promise<boolean>}
 */
export const test_redis_connection = async (timeout_ms = 3000) => {
  let timer
  try {
    const connection = get_redis_connection()
    await Promise.race([
      connection.ping(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeout_ms)
      })
    ])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Close queue and Redis connection
 */
export const close_cli_queue = async () => {
  try {
    if (cli_queue) {
      await cli_queue.close()
      cli_queue = null
      log('CLI queue closed')
    }

    if (redis_connection) {
      await redis_connection.quit()
      redis_connection = null
      log('Redis connection closed')
    }
  } catch (error) {
    log('Error closing queue/connection:', error.message)
    cli_queue = null
    redis_connection = null
  }
}

export { QUEUE_CONFIG }
