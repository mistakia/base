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
 */
export const CONTAINER_USER_BASE_PATH = '/Users/trashman/user-base'

/**
 * Valid execution modes for CLI commands
 * - 'host': Execute directly on the host machine (default)
 * - 'container': Execute inside the Docker container via docker exec
 */
export const EXECUTION_MODES = ['host', 'container']

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
 * Translate a host working directory path to the container equivalent.
 * On storage server: /mnt/md0/user-base/... -> /Users/trashman/user-base/...
 * On MacBook: /Users/trashman/user-base/... -> /Users/trashman/user-base/... (no change)
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
    return CONTAINER_USER_BASE_PATH + host_path.slice(user_base_directory.length)
  }

  // Path is not within user-base; return as-is (best effort)
  return host_path
}
