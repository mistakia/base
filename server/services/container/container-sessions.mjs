/**
 * Container session detection
 *
 * Detect active Claude CLI sessions inside a Docker container using
 * `docker top` and BullMQ job queries. Designed for use by the
 * safe-container-stop library and user-container-manager.
 */

import { execFile } from 'child_process'
import { Queue } from 'bullmq'
import debug from 'debug'

import { DOCKER_CONTAINER_NAME } from '#libs-server/container/execution-mode.mjs'
import { get_container_runtime_name } from '#libs-server/container/runtime-config.mjs'
import { get_redis_connection } from '#server/services/redis/get-connection.mjs'

const log = debug('docker:container-sessions')

const THREAD_QUEUE_NAME = 'thread-creation'

/**
 * Run docker top for a container and return raw output
 *
 * @param {string} container_name - Docker container name
 * @returns {Promise<string>} Raw docker top output
 */
const run_docker_top = (container_name) => {
  return new Promise((resolve, reject) => {
    execFile(
      get_container_runtime_name(),
      ['top', container_name, '-o', 'pid,args'],
      (error, stdout, stderr) => {
        if (error) {
          // Container not running returns exit code 1
          if (
            stderr?.includes('No such container') ||
            stderr?.includes('is not running')
          ) {
            resolve('')
            return
          }
          reject(error)
          return
        }
        resolve(stdout)
      }
    )
  })
}

/**
 * Parse docker top output for claude processes
 *
 * @param {string} output - Raw docker top output
 * @returns {Array<{pid: string, args: string}>} Matched processes
 */
const parse_claude_processes = (output) => {
  if (!output) return []

  const lines = output.trim().split('\n')
  // Skip header line
  const process_lines = lines.slice(1)

  return process_lines
    .filter((line) => /\bclaude\b/.test(line))
    .map((line) => {
      const trimmed = line.trim()
      const first_space = trimmed.indexOf(' ')
      if (first_space === -1) return null
      return {
        pid: trimmed.slice(0, first_space).trim(),
        args: trimmed.slice(first_space).trim()
      }
    })
    .filter(Boolean)
}

/**
 * Detect active Claude CLI sessions inside a Docker container
 *
 * Uses `docker top` to inspect running processes without exec'ing
 * into the container.
 *
 * @param {string} container_name - Docker container name (defaults to DOCKER_CONTAINER_NAME)
 * @returns {Promise<{active_sessions: number, session_details: Array<{pid: string, args: string}>}>}
 */
export const detect_container_sessions = async (
  container_name = DOCKER_CONTAINER_NAME
) => {
  log(`Detecting sessions in container: ${container_name}`)

  const output = await run_docker_top(container_name)
  const session_details = parse_claude_processes(output)

  log(`Found ${session_details.length} active session(s) in ${container_name}`)

  return {
    active_sessions: session_details.length,
    session_details
  }
}

/**
 * Get queued/active BullMQ jobs targeting a container
 *
 * Queries the thread-creation queue for jobs with container execution mode.
 *
 * @param {string} container_name - Docker container name (defaults to DOCKER_CONTAINER_NAME)
 * @returns {Promise<{active_jobs: number, job_details: Array<{job_id: string, thread_id: string|null, state: string}>}>}
 */
export const get_queued_jobs_for_container = async (
  container_name = DOCKER_CONTAINER_NAME
) => {
  log(`Querying queued jobs for container: ${container_name}`)

  let queue = null
  try {
    const connection = get_redis_connection()
    queue = new Queue(THREAD_QUEUE_NAME, { connection })

    const [active_jobs, waiting_jobs] = await Promise.all([
      queue.getActive(),
      queue.getWaiting()
    ])

    const all_jobs = [...active_jobs, ...waiting_jobs]
    const container_jobs = all_jobs.filter((job) => {
      const mode = job.data?.execution_mode
      return mode === 'container' || mode === 'container_user'
    })

    const job_details = await Promise.all(
      container_jobs.map(async (job) => {
        const state = await job.getState()
        return {
          job_id: job.id,
          thread_id: job.data?.thread_id || null,
          state
        }
      })
    )

    log(`Found ${job_details.length} queued job(s) for ${container_name}`)

    return {
      active_jobs: job_details.length,
      job_details
    }
  } catch (error) {
    log(`Failed to query jobs for ${container_name}: ${error.message}`)
    return {
      active_jobs: 0,
      job_details: []
    }
  } finally {
    if (queue) {
      await queue.close().catch(() => {})
    }
  }
}

/**
 * Get combined container session status from process detection and job queue
 *
 * @param {string} container_name - Docker container name (defaults to DOCKER_CONTAINER_NAME)
 * @returns {Promise<{container_name: string, has_active_sessions: boolean, process_count: number, job_count: number, processes: Array, jobs: Array}>}
 */
export const get_container_session_status = async (
  container_name = DOCKER_CONTAINER_NAME
) => {
  log(`Getting session status for container: ${container_name}`)

  const [process_result, job_result] = await Promise.all([
    detect_container_sessions(container_name),
    get_queued_jobs_for_container(container_name)
  ])

  const status = {
    container_name,
    has_active_sessions:
      process_result.active_sessions > 0 || job_result.active_jobs > 0,
    process_count: process_result.active_sessions,
    job_count: job_result.active_jobs,
    processes: process_result.session_details,
    jobs: job_result.job_details
  }

  log(
    `Session status for ${container_name}: ${status.process_count} process(es), ${status.job_count} job(s)`
  )

  return status
}
