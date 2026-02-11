import { spawn, exec } from 'child_process'
import { join, dirname, isAbsolute, basename } from 'path'
import { access, mkdir, copyFile, readFile } from 'fs/promises'
import { constants, existsSync } from 'fs'
import { homedir } from 'os'
import { promisify } from 'util'
import glob_pkg from 'glob'
import debug from 'debug'

import config from '#config'
import validate_working_directory from './validate-working-directory.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import {
  DOCKER_CONTAINER_NAME,
  validate_execution_mode,
  translate_to_container_path
} from '#libs-server/docker/execution-mode.mjs'

const execAsync = promisify(exec)
const glob = promisify(glob_pkg)
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

/**
 * Resolve the container Claude home directory on the host side.
 * This is the host directory that maps to /home/node/.claude in the container.
 *
 * Per-machine mount paths (from docker-compose configs):
 *   MacBook: /Users/trashman/.base-container-data/claude-home
 *   Storage: /mnt/md0/base-container-data/claude-home
 *
 * Derivation: check sibling directories of user-base with both naming
 * conventions, falling back to homedir.
 */
const resolve_container_claude_home = () => {
  const user_base_dir = get_user_base_directory()
  const parent_dir = dirname(user_base_dir)

  // Check both naming conventions used across machines
  const candidates = [
    join(parent_dir, 'base-container-data', 'claude-home'),
    join(parent_dir, '.base-container-data', 'claude-home'),
    join(homedir(), '.base-container-data', 'claude-home')
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  // Default fallback (will be created on first use)
  return candidates[candidates.length - 1]
}

const CONTAINER_CLAUDE_HOME = resolve_container_claude_home()

/**
 * Derive the projects directory name from a working directory path
 * Converts /Users/trashman/user-base to -Users-trashman-user-base
 *
 * @param {string} working_directory - Absolute path to working directory
 * @returns {string} Derived projects directory name
 */
const derive_projects_dir_name = (working_directory) => {
  return working_directory.replace(/\//g, '-')
}

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
 * - `--dangerously-skip-permissions`: Skip permission prompts (required for headless operation)
 * - `--`: Separator to prevent prompts starting with `-` from being parsed as flags
 *
 * @param {Object} params
 * @param {string} params.prompt - User prompt text
 * @param {string} [params.session_id] - Session ID to resume (optional)
 * @param {boolean} [params.skip_permissions] - Skip permission prompts (default: true for headless)
 * @returns {string[]} CLI arguments array
 */
const build_claude_cli_args = ({
  prompt,
  session_id,
  skip_permissions = true
}) => {
  const args = ['-p']

  // Skip permissions for headless/programmatic execution
  // Without this, commands requiring approval will fail repeatedly
  if (skip_permissions) {
    args.push('--dangerously-skip-permissions')
  }

  if (session_id) {
    args.push('-r', session_id)
  }

  // Separator and prompt must come last
  args.push('--', prompt)

  return args
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
// Session State Restoration
// =============================================================================

/**
 * Check if the container is running
 *
 * @returns {Promise<boolean>} True if container is running
 */
const is_container_running = async () => {
  try {
    const { stdout } = await execAsync(
      "docker ps --filter name=base-container --format '{{.Status}}'"
    )
    return stdout.includes('Up')
  } catch {
    return false
  }
}

/**
 * Start the container if not running
 *
 * @param {string} user_base_directory - User base directory path
 */
const ensure_container_running = async (user_base_directory) => {
  if (await is_container_running()) {
    log('Container already running')
    return
  }

  log('Container not running, starting...')
  const compose_file = join(
    user_base_directory,
    'config',
    'base-container',
    'docker-compose.yml'
  )

  try {
    await execAsync(`docker compose -f "${compose_file}" up -d`)
    log('Container started')

    // Wait briefly for container to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000))
  } catch (error) {
    log(`Warning: Failed to start container: ${error.message}`)
  }
}

/**
 * Restore session state files to container Claude home directory
 *
 * This function restores the session JSONL, todos, and plan files from the
 * thread submodule to the container's Claude home directory before resuming
 * a session. All operations are best-effort with logging.
 *
 * @param {Object} params
 * @param {string} params.session_id - Claude session ID to restore
 * @param {string} params.thread_id - Thread ID for locating archived files
 * @param {string} params.working_directory - Working directory for the session
 * @param {string} params.user_base_directory - User base directory path
 */
const restore_session_state = async ({
  session_id,
  thread_id,
  working_directory,
  user_base_directory
}) => {
  if (!session_id || !thread_id) {
    log('Skipping session state restoration - missing session_id or thread_id')
    return
  }

  log(
    `Restoring session state for session ${session_id} from thread ${thread_id}`
  )

  // Ensure container is running before restoring files
  await ensure_container_running(user_base_directory)

  // Pre-create container home if it doesn't exist
  try {
    await mkdir(CONTAINER_CLAUDE_HOME, { recursive: true })
  } catch {
    // Directory already exists
  }

  const thread_dir = join(user_base_directory, 'thread', thread_id)
  const raw_data_dir = join(thread_dir, 'raw-data')
  const projects_dir_name = derive_projects_dir_name(working_directory)

  // 1. Restore session JSONL
  await restore_session_jsonl({
    session_id,
    raw_data_dir,
    projects_dir_name
  })

  // 2. Restore todos
  await restore_todos({
    raw_data_dir
  })

  // 3. Restore plan
  await restore_plan({
    thread_dir,
    user_base_directory
  })

  log('Session state restoration complete')
}

/**
 * Restore session JSONL file to container projects directory
 */
const restore_session_jsonl = async ({
  session_id,
  raw_data_dir,
  projects_dir_name
}) => {
  const source_jsonl = join(raw_data_dir, 'claude-session.jsonl')
  const target_dir = join(CONTAINER_CLAUDE_HOME, 'projects', projects_dir_name)
  const target_jsonl = join(target_dir, `${session_id}.jsonl`)

  try {
    // Check if target already exists
    await access(target_jsonl)
    log(`Session JSONL already exists at ${target_jsonl}`)
    return
  } catch {
    // Target doesn't exist, proceed with restore
  }

  try {
    // Check if source exists
    await access(source_jsonl)

    // Create target directory
    await mkdir(target_dir, { recursive: true })

    // Copy the file
    await copyFile(source_jsonl, target_jsonl)
    log(`Restored session JSONL to ${target_jsonl}`)
  } catch (error) {
    log(`Warning: Failed to restore session JSONL: ${error.message}`)
  }
}

/**
 * Restore todo files to container todos directory
 */
const restore_todos = async ({ raw_data_dir }) => {
  const source_todos_dir = join(raw_data_dir, 'todos')
  const target_todos_dir = join(CONTAINER_CLAUDE_HOME, 'todos')

  try {
    // Check if source todos directory exists
    await access(source_todos_dir)
  } catch {
    log('No todos directory found in thread raw-data')
    return
  }

  try {
    // Create target directory
    await mkdir(target_todos_dir, { recursive: true })

    // Get all todo files
    const todo_files = await glob(join(source_todos_dir, '*.json'))

    if (todo_files.length === 0) {
      log('No todo files to restore')
      return
    }

    // Copy all todo files in parallel
    await Promise.all(
      todo_files.map((todo_file) => {
        const filename = basename(todo_file)
        const target_file = join(target_todos_dir, filename)
        return copyFile(todo_file, target_file)
      })
    )

    log(`Restored ${todo_files.length} todo file(s)`)
  } catch (error) {
    log(`Warning: Failed to restore todos: ${error.message}`)
  }
}

/**
 * Restore plan file to container plans directory
 */
const restore_plan = async ({ thread_dir, user_base_directory }) => {
  const target_plans_dir = join(CONTAINER_CLAUDE_HOME, 'plans')

  try {
    // Read thread metadata to get plan_slug
    const metadata_path = join(thread_dir, 'metadata.json')
    const metadata_content = await readFile(metadata_path, 'utf-8')
    const metadata = JSON.parse(metadata_content)
    const source = metadata.source
    const plan_slug = source?.provider_metadata?.plan_slug || source?.plan_slug

    if (!plan_slug) {
      log('No plan_slug in thread metadata')
      return
    }

    const target_plan = join(target_plans_dir, `${plan_slug}.md`)

    // Check if target already exists
    try {
      await access(target_plan)
      log(`Plan ${plan_slug} already exists in container`)
      return
    } catch {
      // Target doesn't exist, proceed with restore
    }

    // Check for plan in shared location
    const shared_plan = join(
      user_base_directory,
      'thread',
      'plans',
      `${plan_slug}.md`
    )

    try {
      await access(shared_plan)

      // Create target directory
      await mkdir(target_plans_dir, { recursive: true })

      // Copy the plan
      await copyFile(shared_plan, target_plan)
      log(`Restored plan ${plan_slug} to container`)
    } catch {
      log(`Warning: Plan file ${plan_slug}.md not found in shared location`)
    }
  } catch (error) {
    log(`Warning: Failed to restore plan: ${error.message}`)
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
 * @param {string} [params.thread_id] - Thread ID for session state restoration on resume
 * @param {boolean} [params.skip_permissions] - Skip permission prompts (default: true)
 * @param {string} [params.execution_mode] - Where to execute: 'host' (default) or 'container'
 * @returns {Promise<Object>} Result with exit_code and session_directory
 * @throws {Error} If validation fails, process errors, or timeout occurs
 */
export const create_session_claude_cli = async ({
  prompt,
  working_directory,
  user_public_key,
  session_id = null,
  thread_id = null,
  skip_permissions = true,
  execution_mode = 'host'
}) => {
  // -------------------------
  // 1. Validate & Log
  // -------------------------

  // Validate execution_mode
  validate_execution_mode(execution_mode)

  const operation = session_id ? 'Resuming' : 'Creating'
  const session_info = session_id ? ` (session: ${session_id})` : ''

  log(`${operation} Claude CLI session${session_info}`)
  log(`Working directory: ${working_directory}`)
  log(`User: ${user_public_key}`)
  log(`Execution mode: ${execution_mode}`)

  // Validate working directory is within user's base directory
  const user_base_directory = get_user_base_directory()
  await validate_working_directory({
    working_directory,
    user_base_directory
  })

  // -------------------------
  // 2. Translate Working Directory for Container Mode
  // -------------------------

  // When executing in a container, translate host paths to container paths.
  // e.g. /mnt/md0/user-base -> /Users/trashman/user-base (container mount point)
  const container_working_directory =
    execution_mode === 'container'
      ? translate_to_container_path(working_directory)
      : working_directory

  // -------------------------
  // 3. Restore Session State (for resume)
  // -------------------------

  if (session_id && thread_id) {
    await restore_session_state({
      session_id,
      thread_id,
      // Use container path for JSONL project directory derivation so the
      // restored files land where the container's Claude CLI expects them
      working_directory: container_working_directory,
      user_base_directory
    })
  }

  // -------------------------
  // 4. Get Configuration & Resolve Command Path
  // -------------------------

  const cli_command_config =
    process.env.CLAUDE_CLI_COMMAND ||
    config.threads?.cli?.command ||
    DEFAULT_CLI_COMMAND
  const timeout_minutes =
    config.threads?.cli?.session_timeout_minutes || DEFAULT_TIMEOUT_MINUTES

  const cli_args = build_claude_cli_args({
    prompt,
    session_id,
    skip_permissions
  })

  // Common spawn options
  // - stdio: 'ignore' because CLI writes output to .claude/ directory
  // - detached: true ensures the process survives if the parent (base-api) is killed
  const base_spawn_options = {
    shell: false,
    stdio: 'ignore',
    detached: true
  }

  // Build spawn arguments based on execution mode
  let spawn_command
  let spawn_args
  let spawn_options

  if (execution_mode === 'container') {
    // Container mode: spawn via docker exec
    // The -w flag uses the translated container path, not the host path
    // Use 'claude' directly since it's in the container's PATH
    spawn_command = 'docker'
    spawn_args = [
      'exec',
      '-w',
      container_working_directory,
      DOCKER_CONTAINER_NAME,
      'claude',
      ...cli_args
    ]
    spawn_options = base_spawn_options
  } else {
    // Host mode: resolve command path and spawn directly
    const cli_command = await resolve_cli_command(cli_command_config)
    spawn_command = cli_command
    spawn_args = cli_args
    spawn_options = {
      ...base_spawn_options,
      cwd: working_directory
    }
  }

  log(`Command: ${spawn_command} ${spawn_args.join(' ')}`)
  log(`Timeout: ${timeout_minutes} minutes`)
  log(`Skip permissions: ${skip_permissions}`)

  // -------------------------
  // 5. Spawn Process
  // -------------------------

  return new Promise((resolve, reject) => {
    // Spawn Claude CLI process
    // stdio: 'ignore' because CLI writes output to .claude/ directory
    const child = spawn(spawn_command, spawn_args, spawn_options)

    // Setup timeout protection
    const timeout_handle = setup_process_timeout({
      child,
      timeout_minutes,
      reject
    })

    // -------------------------
    // 6. Handle Process Events
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
