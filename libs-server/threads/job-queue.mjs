import { Queue } from 'bullmq'
import { randomUUID } from 'crypto'
import config from '#config'
import debug from 'debug'
import {
  get_redis_connection,
  close_redis_connection
} from '#libs-server/redis/get-connection.mjs'

const log = debug('threads:queue')

/**
 * BullMQ job queue for thread creation
 * Manages queuing and processing of thread creation jobs with Redis persistence
 */

// Configuration constants with defaults
const QUEUE_CONFIG = {
  name: 'thread-creation',
  retry_attempts: config.threads?.queue?.retry_attempts || 3,
  retry_delay_ms: (config.threads?.queue?.retry_delay_seconds || 30) * 1000,
  completed_job_age_seconds: 3600, // 1 hour
  completed_job_count: 100,
  failed_job_age_seconds: 86400 // 24 hours
}

// Module-level singleton instances
let thread_creation_queue = null

/**
 * Check if an error is Redis connection related
 *
 * @param {Error} error - Error object
 * @returns {boolean}
 */
const is_redis_connection_error = (error) => {
  const message = error.message || ''
  return message.includes('ECONNREFUSED') || message.includes('Redis')
}

/**
 * Initialize BullMQ queue with configuration
 *
 * @param {IORedis} connection - Redis connection instance
 * @returns {Queue} BullMQ queue instance
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

  log('Thread creation queue initialized')
  return queue
}

/**
 * Get or create thread creation queue singleton
 *
 * @returns {Queue} BullMQ queue instance
 */
export const get_thread_creation_queue = () => {
  if (!thread_creation_queue) {
    const connection = get_redis_connection()
    thread_creation_queue = initialize_queue(connection)
  }
  return thread_creation_queue
}

/**
 * Create a mock job object when Redis is unavailable
 *
 * @returns {Object} Mock job object
 */
const create_mock_job = () => {
  log('Redis not available, returning mock job object')
  return {
    id: `mock-${randomUUID()}`,
    queue_position: 1
  }
}

/**
 * Calculate queue position for a job
 *
 * @param {Queue} queue - BullMQ queue instance
 * @param {string} job_id - Job ID to find position for
 * @returns {Promise<number>} 1-indexed position in queue, or 0 if not waiting
 */
const calculate_queue_position = async (queue, job_id) => {
  try {
    const waiting_jobs = await queue.getWaiting()
    const position = waiting_jobs.findIndex((j) => j.id === job_id)
    return position >= 0 ? position + 1 : 0
  } catch (error) {
    log(`Failed to calculate queue position for job ${job_id}:`, error)
    return 0
  }
}

/**
 * Add a thread creation job to the queue
 *
 * @param {Object} params - Job parameters
 * @param {string} params.prompt - User prompt for Claude CLI
 * @param {string} params.working_directory - Working directory for CLI execution
 * @param {string} params.user_public_key - User public key for permissions
 * @param {string} [params.session_id] - Optional Claude session ID for resume
 * @param {string} [params.thread_id] - Optional thread ID for session state restoration
 * @param {string} [params.execution_mode] - Where to execute: 'host' (default) or 'container'
 * @returns {Promise<Object>} Job object with id and queue_position
 */
export const add_thread_creation_job = async ({
  prompt,
  working_directory,
  user_public_key,
  session_id = null,
  thread_id = null,
  execution_mode
}) => {
  try {
    const queue = get_thread_creation_queue()

    const job = await queue.add(
      'create-session',
      {
        prompt,
        working_directory,
        user_public_key,
        session_id,
        thread_id,
        execution_mode
      },
      {
        priority: 1 // Lower number = higher priority
      }
    )

    log(`Added thread creation job: ${job.id}`)

    const queue_position = await calculate_queue_position(queue, job.id)

    return {
      id: job.id,
      queue_position
    }
  } catch (error) {
    log('Failed to add thread creation job:', error)

    // Gracefully handle Redis unavailability
    if (is_redis_connection_error(error)) {
      return create_mock_job()
    }

    throw error
  }
}

/**
 * Get the position of a job in the queue
 *
 * @param {string} job_id - Job ID
 * @returns {Promise<number>} 1-indexed position in queue, or 0 if not found
 */
export const get_queue_position = async (job_id) => {
  const queue = get_thread_creation_queue()
  return calculate_queue_position(queue, job_id)
}

/**
 * Get the status of a job
 *
 * @param {string} job_id - Job ID
 * @returns {Promise<Object|null>} Job status object or null if not found
 */
export const get_job_status = async (job_id) => {
  try {
    const queue = get_thread_creation_queue()
    const job = await queue.getJob(job_id)

    if (!job) {
      return null
    }

    const state = await job.getState()

    return {
      id: job.id,
      state,
      progress: job.progress,
      data: job.data,
      return_value: job.returnvalue,
      failed_reason: job.failedReason,
      attempts_made: job.attemptsMade
    }
  } catch (error) {
    log(`Failed to get job status for ${job_id}:`, error)
    return null
  }
}

/**
 * Close the queue and Redis connection gracefully
 * Ensures proper cleanup order: queue first, then connection
 *
 * @returns {Promise<void>}
 */
export const close_queue = async () => {
  try {
    if (thread_creation_queue) {
      await thread_creation_queue.close()
      thread_creation_queue = null
      log('Thread creation queue closed')
    }

    await close_redis_connection()
  } catch (error) {
    log('Error closing queue/connection:', error)
    // Reset instances even if close fails
    thread_creation_queue = null
  }
}
