/**
 * Docker execution mode configuration
 *
 * Shared constants and validation for executing commands either on the host
 * machine or inside the Docker container via `docker exec`.
 *
 * Both machines mount their local user-base directory to
 * CONTAINER_USER_BASE_PATH inside the container, giving both containers
 * identical working directory paths regardless of host filesystem layout.
 */

import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'

/**
 * Docker container name for base-container
 */
export const DOCKER_CONTAINER_NAME = 'base-container'

/**
 * The fixed user-base path inside the container.
 * Both machines (MacBook and storage server) mount their local user-base
 * to this path inside their respective containers.
 *
 * Set via CONTAINER_USER_BASE_PATH environment variable in docker-compose
 * and pm2.config.js.
 */
if (!process.env.CONTAINER_USER_BASE_PATH) {
  throw new Error('CONTAINER_USER_BASE_PATH environment variable is not set')
}
export const CONTAINER_USER_BASE_PATH = process.env.CONTAINER_USER_BASE_PATH

/**
 * Prefix for user container names
 */
export const CONTAINER_USER_PREFIX = 'base-user-'

/**
 * Valid execution modes for CLI commands
 * - 'host': Execute directly on the host machine (default)
 * - 'container': Execute inside the Docker container via docker exec
 * - 'container_user': Execute inside a per-user Docker container
 */
export const EXECUTION_MODES = ['host', 'container', 'container_user']

/**
 * Validate execution mode parameter
 *
 * @param {string} execution_mode - Mode to validate
 * @throws {Error} If execution_mode is not valid
 */
export const validate_execution_mode = (execution_mode) => {
  if (!EXECUTION_MODES.includes(execution_mode)) {
    throw new Error(
      `Invalid execution_mode: ${execution_mode}. Must be one of: ${EXECUTION_MODES.join(', ')}`
    )
  }
}

/**
 * Get the container name for a given execution mode
 *
 * @param {Object} params
 * @param {string} params.execution_mode - Execution mode
 * @param {string} [params.username] - Username (required for container_user mode)
 * @returns {string} Docker container name
 * @throws {Error} If username is missing for container_user mode
 */
export const get_container_name = ({ execution_mode, username }) => {
  if (execution_mode === 'container') {
    return DOCKER_CONTAINER_NAME
  }
  if (execution_mode === 'container_user') {
    if (!username) {
      throw new Error('username is required for container_user execution mode')
    }
    return `${CONTAINER_USER_PREFIX}${username}`
  }
  return null
}

/**
 * Translate a host working directory path to the container equivalent.
 * When the host user-base path differs from CONTAINER_USER_BASE_PATH,
 * the host prefix is replaced with the container prefix.
 * When they match (e.g. on MacBook), no translation is needed.
 *
 * @param {string} host_path - Absolute path on the host
 * @returns {string} Equivalent path inside the container
 */
export const translate_to_container_path = (host_path) => {
  const user_base_directory = get_user_base_directory()

  // If host path already matches container path, no translation needed
  if (user_base_directory === CONTAINER_USER_BASE_PATH) {
    return host_path
  }

  // Replace host user-base prefix with container user-base prefix
  if (host_path.startsWith(user_base_directory)) {
    return (
      CONTAINER_USER_BASE_PATH + host_path.slice(user_base_directory.length)
    )
  }

  // Path is not within user-base; return as-is (best effort)
  return host_path
}

/**
 * Translate a container working directory path to the host equivalent.
 * Inverse of translate_to_container_path -- replaces the container
 * user-base prefix with the host prefix.
 * When they match (e.g. on MacBook), no translation is needed.
 *
 * @param {string} container_path - Absolute path inside the container
 * @returns {string} Equivalent path on the host
 */
export const translate_to_host_path = (container_path) => {
  const user_base_directory = get_user_base_directory()

  if (user_base_directory === CONTAINER_USER_BASE_PATH) {
    return container_path
  }

  if (container_path.startsWith(CONTAINER_USER_BASE_PATH)) {
    return (
      user_base_directory +
      container_path.slice(CONTAINER_USER_BASE_PATH.length)
    )
  }

  return container_path
}
