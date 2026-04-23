import { join, basename } from 'path'
import { existsSync } from 'fs'
import { promisify } from 'util'
import { exec } from 'child_process'
import debug from 'debug'

import { bootstrap_claude_home } from './claude-home-bootstrap.mjs'
import { generate_compose_config } from './user-container-compose.mjs'
import { get_container_claude_home } from './create-session-claude-cli.mjs'
import config from '#config'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import { CONTAINER_USER_BASE_PATH } from '#libs-server/container/execution-mode.mjs'
import {
  get_container_runtime_name,
  get_container_compose_cmd
} from '#libs-server/container/runtime-config.mjs'

const execAsync = promisify(exec)
const log = debug('threads:user-container-manager')

/**
 * Get the container name for a user
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @returns {string} Docker container name
 */
export const get_user_container_name = ({ username }) => {
  return `base-user-${username}`
}

/**
 * Get the user data directory (parent for all per-user container data)
 *
 * @returns {string} Path to user data directory
 */
export const get_user_data_directory = () => {
  const user_containers_config = config.user_containers || {}
  return user_containers_config.data_directory || '/tmp/user-containers'
}

/**
 * Resolve the host path for a user's per-account Claude config directory.
 *
 * The mapping convention: the primary account (container `/home/node/.claude`)
 * lives at `<user_data_dir>/<username>/claude-home`. Secondary accounts strip
 * the leading dot from the container basename and join under the user dir,
 * e.g. `/home/node/.claude-earn.crop.code` -> `<user_data_dir>/<username>/claude-earn.crop.code`.
 *
 * @param {Object} params
 * @param {string} params.username
 * @param {string|null} [params.container_config_dir] - Container CLAUDE_CONFIG_DIR
 *   (e.g. `/home/node/.claude` or `/home/node/.claude-earn.crop.code`). When
 *   null/undefined or the primary path, returns the primary claude-home.
 * @returns {string} Host path
 */
export const resolve_account_host_path = ({
  username,
  container_config_dir
}) => {
  const user_dir = join(get_user_data_directory(), username)
  if (!container_config_dir) {
    return join(user_dir, 'claude-home')
  }
  const normalized = container_config_dir.replace(/\/$/, '')
  const base = basename(normalized)
  if (base === '.claude') {
    return join(user_dir, 'claude-home')
  }
  return join(user_dir, base.replace(/^\./, ''))
}

/**
 * Get the path to a user's primary claude-home directory on the host.
 * Thin alias over resolve_account_host_path for the no-config-dir case.
 */
export const get_user_container_claude_home = ({ username }) => {
  return resolve_account_host_path({
    username,
    container_config_dir: null
  })
}

/**
 * Translate a container-internal transcript_path (e.g. from a Claude hook) to
 * the corresponding host path. Supports primary (.claude) and secondary
 * (.claude-foo, etc.) account dirs under /home/node/.
 *
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.transcript_path - Container path
 * @returns {{ host_path: string } | { error: string }}
 */
export const translate_container_transcript_path = ({
  username,
  transcript_path
}) => {
  const container_root = '/home/node/'
  if (!transcript_path.startsWith(container_root)) {
    return { error: `transcript_path must start with ${container_root}` }
  }
  const remainder = transcript_path.slice(container_root.length)
  const segments = remainder.split('/')
  if (segments.some((seg) => seg === '..' || seg === '.')) {
    return { error: `transcript_path must not contain . or .. segments` }
  }
  const config_basename = segments[0]
  if (!config_basename.startsWith('.claude')) {
    return {
      error: `transcript_path config segment must begin with .claude (got ${config_basename})`
    }
  }
  const host_root = resolve_account_host_path({
    username,
    container_config_dir: container_root + config_basename
  })
  const tail_segments = segments.slice(1)
  return {
    host_path: tail_segments.length
      ? join(host_root, ...tail_segments)
      : host_root
  }
}

/**
 * Check if a user container is running
 *
 * @param {Object} params
 * @param {string} params.container_name - Docker container name
 * @returns {Promise<boolean>} True if container is running
 */
const is_user_container_running = async ({ container_name }) => {
  try {
    const { stdout } = await execAsync(
      `${get_container_runtime_name()} ps --filter name=${container_name} --format '{{.Status}}'`
    )
    return stdout.includes('Up')
  } catch {
    return false
  }
}

/**
 * Wait for container entrypoint to complete (readiness check)
 *
 * @param {Object} params
 * @param {string} params.container_name - Docker container name
 * @param {number} [params.timeout_ms] - Timeout in milliseconds
 * @returns {Promise<void>}
 * @throws {Error} If timeout is reached
 */
export const wait_for_container_ready = async ({
  container_name,
  timeout_ms
}) => {
  const user_containers_config = config.user_containers || {}
  const effective_timeout =
    timeout_ms || user_containers_config.container_ready_timeout_ms || 60000
  const poll_interval = 1000
  const start = Date.now()

  log(
    `Waiting for ${container_name} to be ready (timeout: ${effective_timeout}ms)`
  )

  while (Date.now() - start < effective_timeout) {
    try {
      const { stdout } = await execAsync(
        `${get_container_runtime_name()} exec -u node ${container_name} cat /tmp/entrypoint-ready 2>/dev/null`
      )
      if (stdout !== undefined) {
        log(`${container_name} is ready`)
        return
      }
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, poll_interval))
  }

  throw new Error(
    `Container ${container_name} did not become ready within ${effective_timeout}ms`
  )
}

/**
 * Get count of active docker exec sessions in a user's container
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @returns {Promise<number>} Count of active exec sessions
 */
export const get_active_sessions = async ({ username }) => {
  const container_name = get_user_container_name({ username })
  try {
    const { stdout } = await execAsync(
      `${get_container_runtime_name()} top ${container_name} -o pid,comm 2>/dev/null | grep -c claude || echo 0`
    )
    return parseInt(stdout.trim(), 10) || 0
  } catch {
    return 0
  }
}

/**
 * Ensure a user's container is running, bootstrapping if needed
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @param {Object} params.thread_config - User's thread configuration
 * @returns {Promise<string>} Container name
 */
export const ensure_user_container_running = async ({
  username,
  thread_config,
  user_public_key = null
}) => {
  const container_name = get_user_container_name({ username })

  // Check if already running
  if (await is_user_container_running({ container_name })) {
    log(`Container ${container_name} already running`)

    // Verify claude-home has settings.json -- if the container was rebuilt
    // (clearing bind mounts), claude-home may be empty despite container running
    const user_data_directory = get_user_data_directory()
    const admin_claude_home = get_container_claude_home()
    const settings_path = join(
      user_data_directory,
      username,
      'claude-home',
      'settings.json'
    )
    if (!existsSync(settings_path)) {
      log(`settings.json missing for ${username}, re-bootstrapping claude-home`)
      await bootstrap_claude_home({
        username,
        thread_config,
        user_data_directory,
        admin_claude_home,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })
    }

    return container_name
  }

  log(`Container ${container_name} not running, setting up...`)

  const user_base_directory = get_user_base_directory()
  const user_data_directory = get_user_data_directory()
  const admin_claude_home = get_container_claude_home()

  // Bootstrap claude-home (idempotent)
  await bootstrap_claude_home({
    username,
    thread_config,
    user_data_directory,
    admin_claude_home,
    container_user_base_path: CONTAINER_USER_BASE_PATH
  })

  // Generate compose config
  const compose_path = await generate_compose_config({
    username,
    thread_config,
    user_base_directory,
    user_data_directory,
    container_user_base_path: CONTAINER_USER_BASE_PATH,
    user_public_key
  })

  // Start container via docker compose
  log(`Starting ${container_name} via docker compose`)
  try {
    await execAsync(`${get_container_compose_cmd()} -f "${compose_path}" up -d`)
    log(`Container ${container_name} started`)
  } catch (error) {
    throw new Error(
      `Failed to start user container ${container_name}: ${error.message}`
    )
  }

  // Wait for readiness
  await wait_for_container_ready({ container_name })

  return container_name
}

export default {
  get_user_container_name,
  get_user_container_claude_home,
  get_user_data_directory,
  get_active_sessions,
  ensure_user_container_running,
  wait_for_container_ready
}
