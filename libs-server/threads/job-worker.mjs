import { Worker } from 'bullmq'
import debug from 'debug'
import config from '#config'
import {
  get_redis_connection,
  close_redis_connection
} from '#libs-server/redis/get-connection.mjs'
import { add_cli_job } from '#libs-server/cli-queue/queue.mjs'
import {
  emit_thread_job_failed,
  emit_thread_job_started
} from '#libs-server/active-sessions/index.mjs'
import {
  create_session_claude_cli,
  get_container_claude_home,
  derive_projects_dir_name
} from './create-session-claude-cli.mjs'
import { translate_to_container_path } from '#libs-server/docker/execution-mode.mjs'
import { create_threads_from_session_provider } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'

const log = debug('threads:worker')

// Constants
const QUEUE_NAME = 'thread-creation'
const DEFAULT_CONCURRENCY = 3
const LOCK_DURATION_MS = 600000 // 10 minutes - long-running Claude CLI sessions
const STALLED_INTERVAL_MS = 30000 // Check for stalled jobs every 30 seconds
const LOCK_EXTEND_INTERVAL_MS = 300000 // Extend lock every 5 minutes
const MAX_STALLED_COUNT = 0 // Disable stall re-queuing (detached processes survive crashes)

// Module state
let thread_worker = null

/**
 * Process a thread creation job
 * Creates or resumes a Claude CLI session
 */
const process_thread_creation_job = async (job) => {
  const {
    prompt,
    working_directory,
    user_public_key,
    session_id = null,
    thread_id = null,
    execution_mode,
    thread_config = null,
    username = null
  } = job.data

  const action = session_id ? 'resuming' : 'starting new'
  log(
    `Job ${job.id}: ${action} Claude CLI session${session_id ? ` ${session_id}` : ''}`
  )

  // Periodically extend job lock to prevent BullMQ from marking long-running
  // Claude CLI sessions as stalled. Sessions can run for 60+ minutes but the
  // lock expires after LOCK_DURATION_MS. This interval renews it.
  const lock_interval = setInterval(async () => {
    try {
      await job.extendLock(job.token, LOCK_DURATION_MS)
      log(`Job ${job.id}: lock extended`)
    } catch (error) {
      log(`Job ${job.id}: lock extension failed - ${error.message}`)
    }
  }, LOCK_EXTEND_INTERVAL_MS)

  try {
    const result = await create_session_claude_cli({
      prompt,
      working_directory,
      user_public_key,
      session_id,
      thread_id,
      job_id: job.id,
      execution_mode,
      thread_config,
      username
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
  } finally {
    clearInterval(lock_interval)
  }
}

/**
 * Re-import session JSONL back to thread raw-data as a fallback
 * for when SessionEnd hooks fail (e.g., git lock contention).
 *
 * For container sessions, reads the updated JSONL from the container's
 * claude-home mount. For host sessions, reads from the host's projects dir.
 */
const sync_session_fallback = async (job) => {
  const { session_id, thread_id, working_directory, execution_mode, username } =
    job.data

  if (!session_id || !thread_id) {
    return
  }

  try {
    const { join } = await import('path')
    const { access } = await import('fs/promises')

    let session_file
    if (execution_mode === 'container_user' && username) {
      const { get_user_container_claude_home } = await import(
        './user-container-manager.mjs'
      )
      const container_working_dir =
        translate_to_container_path(working_directory)
      const projects_dir_name = derive_projects_dir_name(container_working_dir)
      session_file = join(
        get_user_container_claude_home({ username }),
        'projects',
        projects_dir_name,
        `${session_id}.jsonl`
      )
    } else if (execution_mode === 'container') {
      const container_working_dir =
        translate_to_container_path(working_directory)
      const projects_dir_name = derive_projects_dir_name(container_working_dir)
      session_file = join(
        get_container_claude_home(),
        'projects',
        projects_dir_name,
        `${session_id}.jsonl`
      )
    } else {
      const { homedir } = await import('os')
      const projects_dir_name = derive_projects_dir_name(working_directory)
      session_file = join(
        homedir(),
        '.claude',
        'projects',
        projects_dir_name,
        `${session_id}.jsonl`
      )
    }

    // Check if session file exists before attempting import
    await access(session_file)

    log(
      `Job ${job.id}: running post-session sync fallback from ${session_file}`
    )

    // Build source overrides for container_user threads
    const source_overrides =
      execution_mode === 'container_user'
        ? {
            execution_mode: 'container_user',
            container_user: true,
            container_name: `base-user-${username}`
          }
        : execution_mode === 'container'
          ? { execution_mode: 'container' }
          : { execution_mode: execution_mode || 'host' }

    const result = await create_threads_from_session_provider({
      provider_name: 'claude',
      allow_updates: true,
      provider_options: {
        session_file
      },
      user_public_key: job.data.user_public_key,
      source_overrides
    })

    const updated = result.updated?.length || 0
    const created = result.created?.length || 0
    log(
      `Job ${job.id}: sync fallback complete (created: ${created}, updated: ${updated})`
    )
  } catch (error) {
    log(`Job ${job.id}: sync fallback failed - ${error.message}`)
  }
}

/**
 * Event handlers
 */
const handle_job_completed = async (job, result) => {
  log(`Job ${job.id}: completed successfully`, result)

  // Re-import session as fallback for when SessionEnd hooks fail
  await sync_session_fallback(job)

  // Queue immediate push-threads to reduce sync delay after session completion
  try {
    await add_cli_job({
      command:
        '$USER_BASE_DIRECTORY/repository/active/base/cli/push-threads.sh',
      tags: ['thread-sync'],
      priority: 5,
      timeout_ms: 120000
    })
    log(`Job ${job.id}: queued push-threads after session completion`)
  } catch (error) {
    log(`Job ${job.id}: failed to queue push-threads -`, error.message)
  }
}

const handle_job_failed = (job, error) => {
  log(`Job ${job.id}: failed -`, error.message)

  emit_thread_job_failed({
    job_id: job.id,
    error_message: error.message
  }).catch((emit_error) => {
    log(`Job ${job.id}: failed to emit THREAD_JOB_FAILED -`, emit_error.message)
  })
}

const handle_job_active = (job) => {
  log(`Job ${job.id}: active`)
  if (job.data.thread_id) {
    emit_thread_job_started({
      job_id: job.id,
      thread_id: job.data.thread_id
    }).catch((err) => {
      log(`Job ${job.id}: failed to emit THREAD_JOB_STARTED - ${err.message}`)
    })
  }
}

const handle_worker_error = (error) => {
  log('Worker error:', error)
}

const handle_job_stalled = (job_id) => {
  log(`Job ${job_id}: stalled detected`)
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
    concurrency,
    // Long-running job protection: Claude CLI sessions run for 60+ minutes.
    // Without explicit config, BullMQ defaults to 30s lockDuration which causes
    // stall detection to re-queue jobs that are still running, spawning duplicates.
    lockDuration: LOCK_DURATION_MS,
    stalledInterval: STALLED_INTERVAL_MS,
    maxStalledCount: MAX_STALLED_COUNT
  })

  thread_worker.on('completed', handle_job_completed)
  thread_worker.on('failed', handle_job_failed)
  thread_worker.on('active', handle_job_active)
  thread_worker.on('error', handle_worker_error)
  thread_worker.on('stalled', handle_job_stalled)

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

  await close_redis_connection()

  log('Worker stopped')
}
