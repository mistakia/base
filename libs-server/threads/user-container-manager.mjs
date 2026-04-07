import { join } from 'path'
import { existsSync } from 'fs'
import { promisify } from 'util'
import { exec } from 'child_process'
import debug from 'debug'

import { bootstrap_claude_home } from './claude-home-bootstrap.mjs'
import { generate_compose_config } from './user-container-compose.mjs'
import { get_container_claude_home } from './create-session-claude-cli.mjs'
import config from '#config'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import { CONTAINER_USER_BASE_PATH } from '#libs-server/docker/execution-mode.mjs'

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
 * Get the path to a user's claude-home directory on the host
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @returns {string} Host path to user's claude-home
 */
export const get_user_container_claude_home = ({ username }) => {
  const user_data_dir = get_user_data_directory()
  return join(user_data_dir, username, 'claude-home')
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
      `docker ps --filter name=${container_name} --format '{{.Status}}'`
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
        `docker exec ${container_name} cat /tmp/entrypoint-ready 2>/dev/null`
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
      `docker top ${container_name} -o pid,comm 2>/dev/null | grep -c claude || echo 0`
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
    await execAsync(`docker compose -f "${compose_path}" up -d`)
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
