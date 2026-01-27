import { spawn } from 'child_process'
import debug from 'debug'

const log = debug('cli-queue:executor')

const DEFAULT_TIMEOUT_MS = 300000 // 5 minutes
const KILL_TIMEOUT_MS = 5000 // Time between SIGTERM and SIGKILL

/**
 * Execute a CLI command with timeout handling
 * @param {Object} params
 * @param {string} params.command - Command to execute
 * @param {string} [params.working_directory] - Working directory
 * @param {number} [params.timeout_ms] - Timeout in milliseconds
 * @returns {Promise<Object>} Execution result
 */
export const execute_command = async ({
  command,
  working_directory = process.cwd(),
  timeout_ms = DEFAULT_TIMEOUT_MS
}) => {
  const start_time = Date.now()

  log(`Executing: ${command}`)
  log(`Working directory: ${working_directory}`)
  log(`Timeout: ${timeout_ms}ms`)

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let killed = false
    let timeout_handle = null
    let kill_timeout_handle = null

    const child = spawn(command, {
      shell: true,
      cwd: working_directory,
      env: {
        ...process.env,
        FORCE_COLOR: '0' // Disable color output for cleaner logs
      }
    })

    const cleanup = () => {
      clearTimeout(timeout_handle)
      clearTimeout(kill_timeout_handle)
      timeout_handle = null
      kill_timeout_handle = null
    }

    const kill_process = () => {
      if (killed) return

      log(`Timeout reached, sending SIGTERM to process ${child.pid}`)
      killed = true
      child.kill('SIGTERM')

      // Force kill after grace period
      kill_timeout_handle = setTimeout(() => {
        if (!child.killed) {
          log(`Process ${child.pid} did not terminate, sending SIGKILL`)
          child.kill('SIGKILL')
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
