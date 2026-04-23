import { spawn } from 'child_process'
import debug from 'debug'

import {
  DOCKER_CONTAINER_NAME,
  CONTAINER_USER_BASE_PATH,
  validate_execution_mode,
  translate_to_container_path
} from '#libs-server/container/execution-mode.mjs'
import { validate_queued_command } from '#libs-server/utils/validate-shell-command.mjs'
import { get_container_runtime_name } from '#libs-server/container/runtime-config.mjs'

const log = debug('cli-queue:executor')

const DEFAULT_TIMEOUT_MS = 300000 // 5 minutes
const KILL_TIMEOUT_MS = 5000 // Time between SIGTERM and SIGKILL

/**
 * Execute a CLI command with timeout handling
 * @param {Object} params
 * @param {string} params.command - Command to execute
 * @param {string} [params.working_directory] - Working directory
 * @param {number} [params.timeout_ms] - Timeout in milliseconds
 * @param {string} [params.execution_mode] - Where to execute: 'host' (default) or 'container'
 * @returns {Promise<Object>} Execution result
 */
export const execute_command = async ({
  command,
  working_directory,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  execution_mode = 'host'
}) => {
  // Default working directory based on execution mode:
  // - container: use CONTAINER_USER_BASE_PATH (host cwd may not exist in container,
  //   and cross-machine workers would have the wrong host path)
  // - host: use process.cwd()
  if (!working_directory) {
    working_directory =
      execution_mode === 'container' || execution_mode === 'container_user'
        ? CONTAINER_USER_BASE_PATH
        : process.cwd()
  }
  // Validate command for shell metacharacter injection
  // Uses the queued-command variant that allows $VAR/${VAR} and && (needed by scheduled commands)
  validate_queued_command(command)

  const start_time = Date.now()

  // Validate execution_mode
  validate_execution_mode(execution_mode)

  log(`Executing: ${command}`)
  log(`Working directory: ${working_directory}`)
  log(`Timeout: ${timeout_ms}ms`)
  log(`Execution mode: ${execution_mode}`)

  // Common environment configuration
  const spawn_env = {
    ...process.env,
    FORCE_COLOR: '0'
  }

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let killed = false
    let timeout_handle = null
    let kill_timeout_handle = null

    // Build spawn arguments based on execution mode
    let child
    if (execution_mode === 'container') {
      // Container mode: spawn via docker exec
      // Translate host path to container path (host user-base -> CONTAINER_USER_BASE_PATH)
      // Wrap with `timeout` so the in-container kernel enforces the deadline
      // even if the outer docker-exec client's SIGKILL fails to propagate
      // (e.g. a blocked child reparents to container PID 1).
      const container_cwd = translate_to_container_path(working_directory)
      const timeout_seconds = Math.max(1, Math.ceil(timeout_ms / 1000))
      const kill_after_seconds = Math.max(1, Math.ceil(KILL_TIMEOUT_MS / 1000))
      child = spawn(
        get_container_runtime_name(),
        [
          'exec',
          '-u',
          'node',
          '-w',
          container_cwd,
          DOCKER_CONTAINER_NAME,
          'timeout',
          `--kill-after=${kill_after_seconds}s`,
          `${timeout_seconds}s`,
          'bash',
          '-c',
          command
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
          env: spawn_env
        }
      )
    } else {
      // Host mode: spawn with shell and detached process group
      child = spawn(command, {
        shell: true,
        cwd: working_directory,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        env: spawn_env
      })
    }

    const cleanup = () => {
      clearTimeout(timeout_handle)
      clearTimeout(kill_timeout_handle)
      timeout_handle = null
      kill_timeout_handle = null
    }

    const kill_process = () => {
      if (killed) return

      killed = true

      // Kill entire process group (negative PID) to ensure all children die
      // Both modes use detached: true, so process group killing works for both
      log(`Timeout reached, sending SIGTERM to process group ${child.pid}`)
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }

      // Force kill after grace period
      kill_timeout_handle = setTimeout(() => {
        if (!child.killed) {
          log(`Process group ${child.pid} did not terminate, sending SIGKILL`)
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            child.kill('SIGKILL')
          }
        }
      }, KILL_TIMEOUT_MS)
    }

    // Set timeout
    timeout_handle = setTimeout(kill_process, timeout_ms)

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      cleanup()
      const duration_ms = Date.now() - start_time

      log(`Command error: ${error.message}`)

      resolve({
        success: false,
        exit_code: -1,
        stdout,
        stderr: stderr + `\nError: ${error.message}`,
        duration_ms,
        timed_out: false,
        error: error.message
      })
    })

    child.on('close', (exit_code, signal) => {
      cleanup()
      const duration_ms = Date.now() - start_time
      const timed_out = killed

      log(
        `Command completed: exit_code=${exit_code}, signal=${signal}, duration=${duration_ms}ms`
      )

      resolve({
        success: exit_code === 0 && !timed_out,
        exit_code: exit_code ?? -1,
        stdout,
        stderr,
        duration_ms,
        timed_out,
        signal
      })
    })
  })
}
