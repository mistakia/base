import { spawn, exec } from 'child_process'
import { join, dirname, isAbsolute, basename } from 'path'
import { access, mkdir, copyFile, readFile, stat } from 'fs/promises'
import { constants, existsSync } from 'fs'
import { homedir } from 'os'
import { promisify } from 'util'
import { glob } from 'glob'
import debug from 'debug'

import config from '#config'
import validate_working_directory from './validate-working-directory.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import {
  get_container_runtime_name,
  get_container_compose_cmd
} from '#libs-server/container/runtime-config.mjs'
import {
  DOCKER_CONTAINER_NAME,
  validate_execution_mode,
  translate_to_container_path
} from '#libs-server/container/execution-mode.mjs'
import {
  get_user_container_name,
  resolve_account_host_path,
  ensure_user_container_running
} from './user-container-manager.mjs'
import { get_local_api_endpoint } from '#libs-server/machine/local-api-endpoint.mjs'

const execAsync = promisify(exec)
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

let _container_claude_home = null
let _container_claude_home_is_fallback = false

export const get_container_claude_home = () => {
  if (_container_claude_home && !_container_claude_home_is_fallback) {
    return _container_claude_home
  }

  const user_base_dir = get_user_base_directory()
  const parent_dir = dirname(user_base_dir)

  const candidates = [
    join(parent_dir, 'base-container-data', 'claude-home'),
    join(parent_dir, '.base-container-data', 'claude-home'),
    join(homedir(), '.base-container-data', 'claude-home')
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      _container_claude_home = candidate
      _container_claude_home_is_fallback = false
      return _container_claude_home
    }
  }

  _container_claude_home = candidates[candidates.length - 1]
  _container_claude_home_is_fallback = true
  return _container_claude_home
}

/**
 * Derive the projects directory name from a working directory path
 * Converts /home/user/my-project to -home-user-my-project
 *
 * @param {string} working_directory - Absolute path to working directory
 * @returns {string} Derived projects directory name
 */
export const derive_projects_dir_name = (working_directory) => {
  return working_directory.replace(/\//g, '-')
}

/**
 * Derive a short account-namespace label from a container CLAUDE_CONFIG_DIR.
 * Primary (null or `.claude`) becomes 'primary'; secondary dirs surface their
 * basename with the leading dot stripped (e.g. `.claude-earn.crop.code` ->
 * `claude-earn.crop.code`). Used for human-readable error messages.
 */
export const derive_account_namespace = (container_config_dir) => {
  if (!container_config_dir) return 'primary'
  const base = basename(container_config_dir.replace(/\/$/, ''))
  if (base === '.claude') return 'primary'
  return base.replace(/^\./, '')
}

/**
 * Pre-flight resume gate: assert the live session JSONL exists at the exact
 * path `claude -r <session_id>` will read. On ENOENT, throw a descriptive
 * error naming account_namespace, session_id, expected path, and
 * claude_config_dir so the failure is self-explanatory in job output rather
 * than surfacing only as a silent fork or a terse CLI stderr.
 */
export const assert_live_session_file_exists = async ({
  session_id,
  username,
  claude_config_dir,
  working_directory
}) => {
  const resolved_claude_home = resolve_account_host_path({
    username,
    container_config_dir: claude_config_dir
  })
  const projects_dir_name = derive_projects_dir_name(working_directory)
  const expected_session_file = join(
    resolved_claude_home,
    'projects',
    projects_dir_name,
    `${session_id}.jsonl`
  )
  const account_namespace = derive_account_namespace(claude_config_dir)
  try {
    await access(expected_session_file, constants.F_OK)
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `Pre-flight resume check failed: live session file not found. ` +
          `account_namespace=${account_namespace} ` +
          `session_id=${session_id} ` +
          `claude_config_dir=${claude_config_dir || '(default)'} ` +
          `expected_path=${expected_session_file}`
      )
    }
    throw err
  }
  return expected_session_file
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
 * - `--tools`, `--disallowedTools`, `--permission-mode`: Tool restrictions from thread_config
 * - `--setting-sources user`: Restrict settings loading for user containers
 * - `--`: Separator to prevent prompts starting with `-` from being parsed as flags
 *
 * @param {Object} params
 * @param {string} params.prompt - User prompt text
 * @param {string} [params.session_id] - Session ID to resume (optional)
 * @param {boolean} [params.skip_permissions] - Skip permission prompts (default: true for headless)
 * @param {Object} [params.thread_config] - Per-user thread configuration
 * @param {string} [params.execution_mode] - Execution mode
 * @returns {string[]} CLI arguments array
 */
const build_claude_cli_args = ({
  prompt,
  session_id,
  skip_permissions = true,
  thread_config = null,
  execution_mode = 'host'
}) => {
  const args = ['-p']

  // Permission mode: thread_config.permission_mode overrides skip_permissions
  if (thread_config?.permission_mode) {
    args.push('--permission-mode', thread_config.permission_mode)
  } else if (skip_permissions) {
    args.push('--dangerously-skip-permissions')
  }

  // Tool restrictions from thread_config
  if (thread_config?.tools?.length) {
    args.push('--tools', thread_config.tools.join(','))
  }
  if (thread_config?.disallowed_tools?.length) {
    for (const tool of thread_config.disallowed_tools) {
      args.push('--disallowedTools', tool)
    }
  }

  // MCP config
  if (thread_config?.mcp_config) {
    args.push(
      '--mcp-config',
      JSON.stringify(thread_config.mcp_config),
      '--strict-mcp-config'
    )
  }

  // System prompt append
  if (thread_config?.append_system_prompt) {
    args.push('--append-system-prompt', thread_config.append_system_prompt)
  }

  // For container_user mode, restrict settings to user-level only
  if (execution_mode === 'container_user') {
    args.push('--setting-sources', 'user')
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
      `${get_container_runtime_name()} ps --filter name=base-container --format '{{.Status}}'`
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
    await execAsync(`${get_container_compose_cmd()} -f "${compose_file}" up -d`)
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
  user_base_directory,
  execution_mode = 'container',
  username = null,
  claude_config_dir = null
}) => {
  if (!session_id || !thread_id) {
    log('Skipping session state restoration - missing session_id or thread_id')
    return
  }

  log(
    `Restoring session state for session ${session_id} from thread ${thread_id}`
  )

  // Resolve the correct claude-home based on execution mode and account
  const claude_home =
    execution_mode === 'container_user' && username
      ? resolve_account_host_path({
          username,
          container_config_dir: claude_config_dir
        })
      : get_container_claude_home()

  // Ensure the appropriate container is running before restoring files
  if (execution_mode === 'container_user') {
    // User container should already be running (ensured earlier in the flow)
    log(`Using user container claude-home for ${username}: ${claude_home}`)
  } else {
    await ensure_container_running(user_base_directory)
  }

  // Pre-create container home if it doesn't exist
  try {
    await mkdir(claude_home, { recursive: true })
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
    projects_dir_name,
    claude_home
  })

  // 2. Restore todos
  await restore_todos({
    raw_data_dir,
    claude_home
  })

  // 3. Restore plan
  await restore_plan({
    thread_dir,
    user_base_directory,
    claude_home
  })

  log('Session state restoration complete')
}

/**
 * Restore session JSONL file to container projects directory
 */
export const restore_session_jsonl = async ({
  session_id,
  raw_data_dir,
  projects_dir_name,
  claude_home
}) => {
  const source_jsonl = join(raw_data_dir, 'claude-session.jsonl')
  const target_dir = join(
    claude_home || get_container_claude_home(),
    'projects',
    projects_dir_name
  )
  const target_jsonl = join(target_dir, `${session_id}.jsonl`)

  try {
    const source_stat = await stat(source_jsonl)

    // Skip restore when the live file is at least as fresh as our snapshot.
    // size guarantees correctness when mtime is second-resolution and ties.
    let target_stat
    try {
      target_stat = await stat(target_jsonl)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (
      target_stat &&
      target_stat.size >= source_stat.size &&
      target_stat.mtimeMs >= source_stat.mtimeMs
    ) {
      log(
        `Skipping restore for ${target_jsonl}: live is fresher ` +
          `(target=${target_stat.size}B/${target_stat.mtimeMs}ms, ` +
          `source=${source_stat.size}B/${source_stat.mtimeMs}ms)`
      )
      return
    }

    await mkdir(target_dir, { recursive: true })
    await copyFile(source_jsonl, target_jsonl)
    log(
      `Restored session JSONL to ${target_jsonl} (${source_stat.size}B from snapshot)`
    )
  } catch (error) {
    log(`Warning: Failed to restore session JSONL: ${error.message}`)
  }
}

/**
 * Restore todo files to container todos directory
 */
const restore_todos = async ({ raw_data_dir, claude_home }) => {
  const source_todos_dir = join(raw_data_dir, 'todos')
  const target_todos_dir = join(
    claude_home || get_container_claude_home(),
    'todos'
  )

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
const restore_plan = async ({
  thread_dir,
  user_base_directory,
  claude_home
}) => {
  const target_plans_dir = join(
    claude_home || get_container_claude_home(),
    'plans'
  )

  try {
    // Read thread metadata to get plan_slug
    const metadata_path = join(thread_dir, 'metadata.json')
    const metadata_content = await readFile(metadata_path, 'utf-8')
    const metadata = JSON.parse(metadata_content)
    const external_session = metadata.external_session
    const plan_slug =
      external_session?.provider_metadata?.plan_slug ||
      external_session?.plan_slug

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
 * @param {string} [params.job_id] - BullMQ job ID for correlating with active sessions
 * @param {string} [params.execution_mode] - Where to execute: 'host', 'container', or 'container_user'
 * @param {Object} [params.thread_config] - Per-user thread configuration (for container_user mode)
 * @param {string} [params.username] - Username (required for container_user mode)
 * @param {string} [params.claude_config_dir] - Override CLAUDE_CONFIG_DIR for account rotation
 * @returns {Promise<Object>} Result with exit_code and session_directory
 * @throws {Error} If validation fails, process errors, or timeout occurs
 */
export const create_session_claude_cli = async ({
  prompt,
  working_directory,
  user_public_key,
  session_id = null,
  thread_id = null,
  job_id = null,
  skip_permissions = true,
  execution_mode = 'host',
  thread_config = null,
  username = null,
  claude_config_dir = null
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
  if (claude_config_dir) {
    log(`Claude config dir: ${claude_config_dir}`)
  }

  // Validate working directory is within user's base directory.
  // Also resolves base URIs (e.g. 'user:') to host filesystem paths.
  const user_base_directory = get_user_base_directory()
  const validated_working_directory = await validate_working_directory({
    working_directory,
    user_base_directory
  })

  // -------------------------
  // 2. Translate Working Directory for Container Mode
  // -------------------------

  // When executing in a container, translate host paths to container paths.
  // e.g. host user-base path -> CONTAINER_USER_BASE_PATH mount point
  const container_working_directory =
    execution_mode === 'container' || execution_mode === 'container_user'
      ? translate_to_container_path(validated_working_directory)
      : validated_working_directory

  // -------------------------
  // 3. Ensure User Container Running (container_user mode)
  // -------------------------

  if (execution_mode === 'container_user') {
    if (!username || !thread_config) {
      throw new Error(
        'username and thread_config are required for container_user execution mode'
      )
    }
    await ensure_user_container_running({
      username,
      thread_config,
      user_public_key
    })
  }

  // -------------------------
  // 4. Restore Session State (for resume)
  // -------------------------

  if (session_id && thread_id) {
    await restore_session_state({
      session_id,
      thread_id,
      // Use container path for JSONL project directory derivation so the
      // restored files land where the container's Claude CLI expects them
      working_directory: container_working_directory,
      user_base_directory,
      execution_mode,
      username,
      claude_config_dir
    })

    if (execution_mode === 'container_user' && username) {
      const live_session_file = await assert_live_session_file_exists({
        session_id,
        username,
        claude_config_dir,
        working_directory: container_working_directory
      })
      // Loud-warn if the live file is smaller than the raw-data snapshot we
      // just restored. Under normal operation live >= snapshot because the
      // restore just copied snapshot into live (mtime/size guard may have
      // skipped the copy if live was already fresher). A smaller live here
      // signals snapshot corruption or a rollback we failed to prevent.
      const snapshot_file = join(
        user_base_directory,
        'thread',
        thread_id,
        'raw-data',
        'claude-session.jsonl'
      )
      try {
        const [live_stat, snapshot_stat] = await Promise.all([
          stat(live_session_file),
          stat(snapshot_file)
        ])
        if (live_stat.size < snapshot_stat.size) {
          log(
            `WARN pre-spawn size mismatch: live=${live_stat.size}B < ` +
              `snapshot=${snapshot_stat.size}B (live=${live_session_file} ` +
              `snapshot=${snapshot_file})`
          )
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          log(
            `Pre-spawn size check failed: ${err.message} ` +
              `(live=${live_session_file} snapshot=${snapshot_file})`
          )
        }
      }
    }
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
    skip_permissions,
    thread_config,
    execution_mode
  })

  // Common spawn options
  // - stdio: stdin ignored, stdout/stderr piped to capture diagnostics on
  //   non-zero exit (CLI writes primary output to .claude/ directory)
  // - detached: true ensures the process survives if the parent (base-api) is killed
  const base_spawn_options = {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  }

  // Build spawn arguments based on execution mode
  let spawn_command
  let spawn_args
  let spawn_options

  if (execution_mode === 'container' || execution_mode === 'container_user') {
    // Container mode: spawn via docker exec
    // The -w flag uses the translated container path, not the host path
    // Use 'claude' directly since it's in the container's PATH
    const target_container =
      execution_mode === 'container_user'
        ? get_user_container_name({ username })
        : DOCKER_CONTAINER_NAME
    const { proto: api_proto, port: api_port } = get_local_api_endpoint()
    spawn_command = get_container_runtime_name()
    spawn_args = [
      'exec',
      '-u',
      'node',
      '-w',
      container_working_directory,
      ...(job_id ? ['-e', `JOB_ID=${job_id}`] : []),
      ...(thread_id ? ['-e', `THREAD_ID=${thread_id}`] : []),
      ...(claude_config_dir
        ? ['-e', `CLAUDE_CONFIG_DIR=${claude_config_dir}`]
        : []),
      '-e',
      `BASE_API_PROTO=${api_proto}`,
      '-e',
      `BASE_API_PORT=${api_port}`,
      target_container,
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
      cwd: validated_working_directory,
      env: {
        ...process.env,
        ...(job_id ? { JOB_ID: job_id } : {}),
        ...(thread_id ? { THREAD_ID: thread_id } : {}),
        ...(claude_config_dir ? { CLAUDE_CONFIG_DIR: claude_config_dir } : {})
      }
    }
  }

  log(`Command: ${spawn_command} ${spawn_args.join(' ')}`)
  log(`Timeout: ${timeout_minutes} minutes`)
  log(`Skip permissions: ${skip_permissions}`)

  // -------------------------
  // 5. Spawn Process
  // -------------------------

  return new Promise((resolve, reject) => {
    // Settlement guard: prevent double resolve/reject when timeout fires
    // but process close event also fires shortly after
    let settled = false

    const guarded_resolve = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const guarded_reject = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }

    // Spawn Claude CLI process
    const child = spawn(spawn_command, spawn_args, spawn_options)

    // Collect stdout/stderr for diagnostics (capped to prevent unbounded memory use)
    const MAX_STDERR_BYTES = 8192
    const MAX_STDOUT_BYTES = 8192
    const stderr_chunks = []
    let stderr_bytes = 0
    const stdout_chunks = []
    let stdout_bytes = 0
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        if (stdout_bytes < MAX_STDOUT_BYTES) {
          stdout_chunks.push(chunk)
          stdout_bytes += chunk.length
        }
      })
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (stderr_bytes < MAX_STDERR_BYTES) {
          stderr_chunks.push(chunk)
          stderr_bytes += chunk.length
        }
      })
    }

    // Setup timeout protection
    const timeout_handle = setup_process_timeout({
      child,
      timeout_minutes,
      reject: guarded_reject
    })

    // -------------------------
    // 6. Handle Process Events
    // -------------------------

    child.on('close', (code, signal) => {
      clear_process_timeout(timeout_handle)

      const stderr_output = Buffer.concat(stderr_chunks)
        .toString('utf8')
        .slice(0, MAX_STDERR_BYTES)
        .trim()

      const stdout_output = Buffer.concat(stdout_chunks)
        .toString('utf8')
        .slice(0, MAX_STDOUT_BYTES)
        .trim()

      log(`Process closed: exit_code=${code}, signal=${signal || 'none'}`)
      if (stdout_output) {
        log(`Process stdout: ${stdout_output}`)
      }
      if (stderr_output) {
        log(`Process stderr: ${stderr_output}`)
      }

      if (code === 0) {
        guarded_resolve(
          build_success_result({
            working_directory: validated_working_directory,
            session_id,
            exit_code: code
          })
        )
      } else {
        const signal_info = signal ? ` (signal: ${signal})` : ''
        const stderr_info = stderr_output
          ? `\nstderr: ${stderr_output.slice(0, 500)}`
          : ''
        const stdout_info = stdout_output
          ? `\nstdout: ${stdout_output.slice(0, 500)}`
          : ''
        const error_message = `Claude CLI exited with code ${code}${signal_info}${stderr_info}${stdout_info}`
        log(`Error: ${error_message}`)
        guarded_reject(new Error(error_message))
      }
    })

    child.on('error', (error) => {
      clear_process_timeout(timeout_handle)

      log(`Process spawn error: ${error.message}`)
      guarded_reject(new Error(`Failed to spawn Claude CLI: ${error.message}`))
    })
  })
}
