import { spawn } from 'child_process'
import path from 'path'

import { directory_exists_in_filesystem_sync } from '#libs-server/filesystem/directory-exists-in-filesystem-sync.mjs'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024

/**
 * Run a git command with arguments passed as argv (shell: false).
 * Paths, refs, author/grep patterns, and pathspecs are safe from shell
 * injection because no shell interpreter sees them.
 *
 * @param {string[]} args Git argv after the `git` executable (e.g.
 *   ['log', '--follow', '-p', '--', relative_path]). -c key=value tokens
 *   belong before the subcommand, matching git's own CLI.
 * @param {Object} [options]
 * @param {string} [options.cwd] Working directory; validated to exist.
 * @param {number} [options.timeout=30000] Milliseconds before SIGKILL.
 * @param {number} [options.maxBuffer=10485760] Byte cap on stdout/stderr;
 *   exceeding it rejects with code 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'.
 * @param {Object} [options.env] Override environment for the child.
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export const execute_git_command = (args, options = {}) => {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error(
      'execute_git_command: args must be a non-empty array of strings'
    )
  }
  for (const arg of args) {
    if (typeof arg !== 'string') {
      throw new Error(
        `execute_git_command: all args must be strings, got ${typeof arg}`
      )
    }
  }

  const {
    cwd,
    timeout = DEFAULT_TIMEOUT_MS,
    maxBuffer = DEFAULT_MAX_BUFFER,
    env
  } = options

  if (cwd) {
    const cwd_path = path.resolve(cwd)
    if (!directory_exists_in_filesystem_sync({ absolute_path: cwd_path })) {
      throw new Error(
        `Working directory does not exist or cannot be accessed: ${cwd_path}`
      )
    }
  }

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn('git', args, {
        cwd,
        env,
        shell: false,
        windowsHide: true
      })
    } catch (err) {
      return reject(err)
    }

    const stdout_chunks = []
    const stderr_chunks = []
    let stdout_size = 0
    let stderr_size = 0
    let buffer_exceeded = null
    let timed_out = false
    let settled = false

    const timer =
      timeout > 0
        ? setTimeout(() => {
            timed_out = true
            child.kill('SIGKILL')
          }, timeout)
        : null

    child.stdout.on('data', (chunk) => {
      stdout_size += chunk.length
      if (stdout_size > maxBuffer) {
        if (!buffer_exceeded) buffer_exceeded = 'stdout'
        child.kill('SIGKILL')
        return
      }
      stdout_chunks.push(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr_size += chunk.length
      if (stderr_size > maxBuffer) {
        if (!buffer_exceeded) buffer_exceeded = 'stderr'
        child.kill('SIGKILL')
        return
      }
      stderr_chunks.push(chunk)
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)

      const stdout = Buffer.concat(stdout_chunks).toString('utf8')
      const stderr = Buffer.concat(stderr_chunks).toString('utf8')

      if (buffer_exceeded) {
        const err = new Error(
          `git exceeded maxBuffer of ${maxBuffer} bytes on ${buffer_exceeded}`
        )
        err.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
        err.stdout = stdout
        err.stderr = stderr
        return reject(err)
      }

      if (timed_out) {
        const err = new Error(`git command timed out after ${timeout}ms`)
        err.code = 'ETIMEDOUT'
        err.killed = true
        err.stdout = stdout
        err.stderr = stderr
        return reject(err)
      }

      if (code !== 0) {
        const trimmed_stderr = stderr.trim()
        const err = new Error(
          trimmed_stderr ||
            `git exited with code ${code}${signal ? ` (signal ${signal})` : ''}`
        )
        err.code = code
        err.signal = signal
        err.stdout = stdout
        err.stderr = stderr
        return reject(err)
      }

      resolve({ stdout, stderr })
    })
  })
}

/**
 * True when an error from execute_git_command represents an "unknown
 * revision" failure (commit/ref not found). Callers typically want to
 * treat this as an empty result rather than a 500.
 */
export const is_unknown_revision_error = (error) => {
  if (!error) return false
  const stderr = error.stderr || ''
  const message = error.message || ''
  return (
    stderr.includes('unknown revision') ||
    message.includes('unknown revision') ||
    stderr.includes('bad revision') ||
    message.includes('bad revision')
  )
}
