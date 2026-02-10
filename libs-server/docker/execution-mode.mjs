/**
 * Docker execution mode configuration
 *
 * Shared constants and validation for executing commands either on the host
 * machine or inside the Docker container via `docker exec`.
 *
 * Security Note: Commands passed to docker exec are validated by
 * validate_shell_command() which blocks shell metacharacters (;|`$><&)
 * to prevent command injection in both host and container contexts.
 */

/**
 * Docker container name for base-container
 */
export const DOCKER_CONTAINER_NAME = 'base-container'

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
