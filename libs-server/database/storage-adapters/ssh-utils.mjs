/**
 * SSH Utilities for Remote Storage Adapters
 *
 * Provides secure SSH command execution with proper escaping,
 * timeout handling, and resource cleanup.
 */

import { spawn } from 'child_process'
import debug from 'debug'

const log = debug('database:ssh-utils')

// Default timeout for SSH operations (30 seconds)
const DEFAULT_SSH_TIMEOUT_MS = 30000

/**
 * Escape a string for safe use in shell commands
 *
 * Uses single quotes with proper escaping for the value.
 * This prevents command injection by ensuring special characters
 * are treated as literal text.
 *
 * @param {string} value - Value to escape
 * @returns {string} Shell-safe escaped string
 */
export function escape_shell_arg(value) {
  if (value === null || value === undefined) {
    return "''"
  }
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

/**
 * Validate SSH host alias
 *
 * Ensures the host parameter is a valid SSH config alias or hostname.
 * Prevents command injection via malicious host values.
 *
 * @param {string} host - SSH host alias to validate
 * @returns {boolean} True if valid
 * @throws {Error} If host is invalid
 */
export function validate_ssh_host(host) {
  if (!host || typeof host !== 'string') {
    throw new Error('SSH host is required')
  }

  // Allow alphanumeric, dots, hyphens, and underscores (standard hostname/alias chars)
  const valid_pattern = /^[a-zA-Z0-9._-]+$/
  if (!valid_pattern.test(host)) {
    throw new Error(`Invalid SSH host alias: ${host}`)
  }

  return true
}

/**
 * Execute a command via SSH with timeout and proper cleanup
 *
 * @param {string} host - SSH config host alias
 * @param {string} command - Command to execute on remote host
 * @param {Object} options - Options
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @returns {Promise<string>} stdout from command
 */
export function execute_ssh(
  host,
  command,
  { timeout = DEFAULT_SSH_TIMEOUT_MS } = {}
) {
  return new Promise((resolve, reject) => {
    validate_ssh_host(host)

    log('SSH to %s: %s', host, command.substring(0, 100))

    const ssh = spawn('ssh', [host, command], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    // Set up timeout
    const timeout_id = setTimeout(() => {
      killed = true
      ssh.kill('SIGTERM')
      // Give process time to terminate gracefully, then force kill
      setTimeout(() => {
        if (!ssh.killed) {
          ssh.kill('SIGKILL')
        }
      }, 1000)
      reject(new Error(`SSH command timed out after ${timeout}ms`))
    }, timeout)

    ssh.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ssh.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ssh.on('close', (code) => {
      clearTimeout(timeout_id)
      if (killed) {
        return // Already rejected via timeout
      }
      if (code !== 0) {
        log('SSH command failed with code %d: %s', code, stderr)
        reject(
          new Error(`SSH command failed: ${stderr || `exit code ${code}`}`)
        )
        return
      }
      resolve(stdout)
    })

    ssh.on('error', (err) => {
      clearTimeout(timeout_id)
      ssh.kill('SIGTERM')
      log('SSH spawn error: %s', err.message)
      reject(err)
    })
  })
}

/**
 * Write content to a remote file via SSH
 *
 * @param {string} host - SSH config host alias
 * @param {string} file_path - Remote file path (will be shell-escaped)
 * @param {string} content - Content to write
 * @param {Object} options - Options
 * @param {number} options.timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
export function write_remote_file(
  host,
  file_path,
  content,
  { timeout = DEFAULT_SSH_TIMEOUT_MS } = {}
) {
  return new Promise((resolve, reject) => {
    validate_ssh_host(host)

    log('Writing to %s:%s', host, file_path)

    // Use shell-escaped path to prevent injection
    const escaped_path = escape_shell_arg(file_path)
    const ssh = spawn('ssh', [host, `cat > ${escaped_path}`], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stderr = ''
    let killed = false

    const timeout_id = setTimeout(() => {
      killed = true
      ssh.kill('SIGTERM')
      setTimeout(() => {
        if (!ssh.killed) {
          ssh.kill('SIGKILL')
        }
      }, 1000)
      reject(new Error(`SSH write timed out after ${timeout}ms`))
    }, timeout)

    ssh.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ssh.on('close', (code) => {
      clearTimeout(timeout_id)
      if (killed) {
        return
      }
      if (code !== 0) {
        log('SSH write failed with code %d: %s', code, stderr)
        reject(new Error(`SSH write failed: ${stderr || `exit code ${code}`}`))
        return
      }
      log('Written %d bytes to %s:%s', content.length, host, file_path)
      resolve()
    })

    ssh.on('error', (err) => {
      clearTimeout(timeout_id)
      ssh.kill('SIGTERM')
      log('SSH spawn error: %s', err.message)
      reject(err)
    })

    // Write content to stdin and close
    ssh.stdin.write(content)
    ssh.stdin.end()
  })
}

export default {
  escape_shell_arg,
  validate_ssh_host,
  execute_ssh,
  write_remote_file
}
