import { spawn } from 'child_process'
import { join, isAbsolute } from 'path'
import { access } from 'fs/promises'
import { constants } from 'fs'
import { homedir } from 'os'
import debug from 'debug'
import config from '#config'
import validate_working_directory from './validate-working-directory.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'

const log = debug('threads:claude-cli')

// =============================================================================
// Configuration Constants
// =============================================================================

const DEFAULT_CLI_COMMAND = 'claude'
const DEFAULT_TIMEOUT_MINUTES = 60
const FORCE_KILL_DELAY_MS = 10000
const SESSION_DIRECTORY_NAME = '.claude'

/**
 * Common installation locations for Claude CLI
 * These paths are checked when the config uses just "claude" instead of a full path
 */
const CLAUDE_CLI_PATHS = [join(homedir(), '.claude', 'local', 'claude')]

// =============================================================================
// Command Path Resolution
// =============================================================================

/**
 * Verify that a file path exists and is executable
 *
 * @param {string} file_path - Path to check
 * @returns {Promise<boolean>} True if file exists and is executable
 */
const is_executable = async (file_path) => {
  try {
    await access(file_path, constants.F_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the CLI command to an absolute path
 *
 * Since spawn() with shell: false doesn't use shell aliases, we need to
 * resolve the command path explicitly. This function:
 * 1. Returns absolute paths as-is (after verifying they exist)
 * 2. Checks common locations for 'claude' command name
 * 3. Throws descriptive error if command cannot be found
 *
 * @param {string} command - Command name or absolute path
 * @returns {Promise<string>} Absolute path to executable
 * @throws {Error} If command cannot be found or is not executable
 */
const resolve_cli_command = async (command) => {
  // If already an absolute path, verify it exists and is executable
  if (isAbsolute(command)) {
    if (await is_executable(command)) {
      return command
    }
    throw new Error(
      `Claude CLI command not found or not executable: ${command}`
    )
  }

  // For 'claude' command name, check common installation locations
  if (command === DEFAULT_CLI_COMMAND) {
    for (const cli_path of CLAUDE_CLI_PATHS) {
      if (await is_executable(cli_path)) {
        log(`Resolved claude command to: ${cli_path}`)
        return cli_path
      }
    }
  }

  // Command not found - provide helpful error message
  const attempted_paths =
    command === DEFAULT_CLI_COMMAND
      ? `\nChecked paths: ${CLAUDE_CLI_PATHS.join(', ')}`
      : ''
  throw new Error(
    `Claude CLI command not found: ${command}.${attempted_paths}\n` +
      'Please configure config.threads.cli.command with the full path to the claude executable.'
  )
}

// =============================================================================
// CLI Arguments Builder
// =============================================================================

/**
 * Build Claude CLI arguments for programmatic execution
 *
 * Flags:
 * - `-p`: Non-interactive mode (programmatic)
 * - `-r <session_id>`: Resume existing session
 * - `--`: Separator to prevent prompts starting with `-` from being parsed as flags
 *
 * @param {Object} params
 * @param {string} params.prompt - User prompt text
 * @param {string} [params.session_id] - Session ID to resume (optional)
 * @returns {string[]} CLI arguments array
 */
const build_claude_cli_args = ({ prompt, session_id }) => {
  const base_args = ['-p', '--', prompt]

  if (session_id) {
    // Resume existing session: claude -r <session_id> -p -- <prompt>
    return ['-r', session_id, ...base_args]
  }

  // New session: claude -p -- <prompt>
  return base_args
}

// =============================================================================
// Process Timeout Management
// =============================================================================

/**
 * Setup timeout handler with graceful shutdown
 * Attempts SIGTERM first, then SIGKILL after delay if needed
 *
 * @param {Object} params
 * @param {ChildProcess} params.child - Child process to monitor
 * @param {number} params.timeout_minutes - Timeout duration in minutes
 * @param {Function} params.reject - Promise reject function
 * @returns {Timeout} Timeout handle
 */
const setup_process_timeout = ({ child, timeout_minutes, reject }) => {
  const timeout_ms = timeout_minutes * 60 * 1000

  return setTimeout(() => {
    log(
      `Process timeout after ${timeout_minutes} minutes - attempting graceful shutdown`
    )

    // Attempt graceful termination
    child.kill('SIGTERM')

    // Schedule force kill if process doesn't terminate
    const force_kill_timeout = setTimeout(() => {
      if (!child.killed) {
        log('Graceful shutdown failed - force killing with SIGKILL')
        child.kill('SIGKILL')
      }
    }, FORCE_KILL_DELAY_MS)

    // Clean up force kill timeout if process terminates
    child.once('close', () => {
      clearTimeout(force_kill_timeout)
    })

    reject(
      new Error(`Claude CLI process timeout after ${timeout_minutes} minutes`)
    )
  }, timeout_ms)
}

/**
 * Clear timeout handler safely
 */
const clear_process_timeout = (timeout_handle) => {
  if (timeout_handle) {
    clearTimeout(timeout_handle)
  }
}

// =============================================================================
// Success Handler
// =============================================================================

/**
 * Build success result object
 *
 * @param {Object} params
 * @param {string} params.working_directory - Working directory path
 * @param {string} [params.session_id] - Session ID if resuming
 * @param {number} params.exit_code - Process exit code
 * @returns {Object} Success result
 */
const build_success_result = ({ working_directory, session_id, exit_code }) => {
  const session_directory = join(working_directory, SESSION_DIRECTORY_NAME)
  const action = session_id ? 'updated' : 'created'

  log(`Success: Session ${action} in ${session_directory}`)

  return {
    exit_code,
    session_directory
  }
}

// =============================================================================
// Main Export: Claude CLI Session Creator
// =============================================================================

/**
 * Create or resume a Claude CLI session
 *
 * This function spawns the Claude CLI in non-interactive mode to execute
 * a prompt and manages the process lifecycle with timeout handling.
 *
 * Called by the job worker to process thread creation/resume requests.
 *
 * @param {Object} params
 * @param {string} params.prompt - User prompt for Claude
 * @param {string} params.working_directory - Directory to execute CLI in
 * @param {string} params.user_public_key - User public key for permissions
 * @param {string} [params.session_id] - Session ID to resume (creates new if omitted)
 * @returns {Promise<Object>} Result with exit_code and session_directory
 * @throws {Error} If validation fails, process errors, or timeout occurs
 */
export const create_session_claude_cli = async ({
  prompt,
  working_directory,
  user_public_key,
  session_id = null
}) => {
  // -------------------------
  // 1. Validate & Log
  // -------------------------

  const operation = session_id ? 'Resuming' : 'Creating'
  const session_info = session_id ? ` (session: ${session_id})` : ''

  log(`${operation} Claude CLI session${session_info}`)
  log(`Working directory: ${working_directory}`)
  log(`User: ${user_public_key}`)

  // Validate working directory is within user's base directory
  const user_base_directory = get_user_base_directory()
  await validate_working_directory({
    working_directory,
    user_base_directory
  })

  // -------------------------
  // 2. Get Configuration & Resolve Command Path
  // -------------------------

  const cli_command_config = config.threads?.cli?.command || DEFAULT_CLI_COMMAND
  const timeout_minutes =
    config.threads?.cli?.session_timeout_minutes || DEFAULT_TIMEOUT_MINUTES

  // Resolve command to absolute path (handles shell aliases and common locations)
  const cli_command = await resolve_cli_command(cli_command_config)
  const cli_args = build_claude_cli_args({ prompt, session_id })

  log(`Command: ${cli_command} ${cli_args.join(' ')}`)
  log(`Timeout: ${timeout_minutes} minutes`)

  // -------------------------
  // 3. Spawn Process
  // -------------------------

  return new Promise((resolve, reject) => {
    // Spawn Claude CLI process
    // stdio: 'ignore' because CLI writes output to .claude/ directory
    const child = spawn(cli_command, cli_args, {
      cwd: working_directory,
      shell: false,
      stdio: 'ignore',
      detached: false
    })

    // Setup timeout protection
    const timeout_handle = setup_process_timeout({
      child,
      timeout_minutes,
      reject
    })

    // -------------------------
    // 4. Handle Process Events
    // -------------------------

    child.on('close', (code, signal) => {
      clear_process_timeout(timeout_handle)

      log(`Process closed: exit_code=${code}, signal=${signal || 'none'}`)

      if (code === 0) {
        resolve(
          build_success_result({
            working_directory,
            session_id,
            exit_code: code
          })
        )
      } else {
        const signal_info = signal ? ` (signal: ${signal})` : ''
        const error_message = `Claude CLI exited with code ${code}${signal_info}`
        log(`Error: ${error_message}`)
        reject(new Error(error_message))
      }
    })

    child.on('error', (error) => {
      clear_process_timeout(timeout_handle)

      log(`Process spawn error: ${error.message}`)
      reject(new Error(`Failed to spawn Claude CLI: ${error.message}`))
    })
  })
}
