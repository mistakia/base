/**
 * Safe container stop
 *
 * Orchestrate safe Docker container stops with active session detection.
 * Supports --force (stop despite sessions) and --wait (poll until clear)
 * modes. Uses container-sessions.mjs for detection.
 */

import { execFile } from 'child_process'
import debug from 'debug'

import {
  detect_container_sessions,
  get_container_session_status
} from '#libs-server/docker/container-sessions.mjs'
import { DOCKER_CONTAINER_NAME } from '#libs-server/docker/execution-mode.mjs'

const log = debug('docker:safe-stop')

const DEFAULT_WAIT_TIMEOUT_MS = 300000 // 5 minutes
const DEFAULT_POLL_INTERVAL_MS = 10000 // 10 seconds

/**
 * Stop a Docker container via docker compose down
 *
 * @param {string} container_name - Container name for logging
 * @returns {Promise<void>}
 */
const stop_container = (container_name) => {
  return new Promise((resolve, reject) => {
    log(`Stopping container: ${container_name}`)
    execFile(
      'docker',
      ['compose', 'down'],
      { timeout: 60000 },
      (error) => {
        if (error) {
          log(`Failed to stop container: ${error.message}`)
          reject(error)
          return
        }
        log(`Container stopped: ${container_name}`)
        resolve()
      }
    )
  })
}

/**
 * Wait for active sessions to clear by polling
 *
 * @param {string} container_name - Container name to monitor
 * @param {number} wait_timeout_ms - Maximum wait time
 * @param {number} poll_interval_ms - Polling interval
 * @returns {Promise<boolean>} True if sessions cleared, false if timed out
 */
const wait_for_sessions_to_clear = async (
  container_name,
  wait_timeout_ms,
  poll_interval_ms
) => {
  const start = Date.now()
  log(
    `Waiting for sessions to clear (timeout: ${wait_timeout_ms}ms, poll: ${poll_interval_ms}ms)`
  )

  while (Date.now() - start < wait_timeout_ms) {
    await new Promise((resolve) => setTimeout(resolve, poll_interval_ms))

    const result = await detect_container_sessions(container_name)
    if (result.active_sessions === 0) {
      log('All sessions cleared')
      return true
    }

    const elapsed = Math.round((Date.now() - start) / 1000)
    log(
      `Still ${result.active_sessions} active session(s) after ${elapsed}s`
    )
  }

  log('Wait timeout exceeded')
  return false
}

/**
 * Safely stop a Docker container with active session detection
 *
 * Checks for active Claude CLI sessions before stopping. Supports
 * force (stop anyway) and wait (poll until clear) modes.
 *
 * @param {Object} params
 * @param {string} [params.container_name] - Container name (defaults to DOCKER_CONTAINER_NAME)
 * @param {boolean} [params.force=false] - Force stop despite active sessions
 * @param {boolean} [params.wait=false] - Wait for sessions to clear before stopping
 * @param {number} [params.wait_timeout_ms=300000] - Max wait time (5 min default)
 * @param {number} [params.poll_interval_ms=10000] - Poll interval (10s default)
 * @returns {Promise<Object>} Result object with stop outcome details
 */
export const safe_container_stop = async ({
  container_name = DOCKER_CONTAINER_NAME,
  force = false,
  wait = false,
  wait_timeout_ms = DEFAULT_WAIT_TIMEOUT_MS,
  poll_interval_ms = DEFAULT_POLL_INTERVAL_MS
} = {}) => {
  log(
    `Safe stop requested for ${container_name} (force: ${force}, wait: ${wait})`
  )

  const session_status = await get_container_session_status(container_name)

  if (!session_status.has_active_sessions) {
    log('No active sessions, proceeding with stop')
    await stop_container(container_name)
    return {
      stopped: true,
      had_active_sessions: false
    }
  }

  log(
    `Active sessions found: ${session_status.process_count} process(es), ${session_status.job_count} job(s)`
  )

  if (force) {
    log('Force flag set, stopping despite active sessions')
    await stop_container(container_name)
    return {
      stopped: true,
      had_active_sessions: true,
      force: true,
      session_status
    }
  }

  if (wait) {
    log('Wait flag set, polling for session completion')
    const cleared = await wait_for_sessions_to_clear(
      container_name,
      wait_timeout_ms,
      poll_interval_ms
    )

    if (cleared) {
      await stop_container(container_name)
      return {
        stopped: true,
        had_active_sessions: true,
        waited: true
      }
    }

    return {
      stopped: false,
      had_active_sessions: true,
      waited: true,
      timed_out: true,
      session_status,
      reason: 'wait_timeout_exceeded'
    }
  }

  return {
    stopped: false,
    had_active_sessions: true,
    session_status,
    reason: 'active_sessions_found'
  }
}
