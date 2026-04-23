import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'

const PER_USER_CONTAINER_PREFIX = 'base-user-'

const is_per_user_container = (container_name) =>
  typeof container_name === 'string' &&
  container_name.startsWith(PER_USER_CONTAINER_PREFIX)

/**
 * Build the canonical thread.execution attribution object.
 *
 * @param {Object} params
 * @param {'host'|'container'} params.mode
 * @param {string} [params.username] - When set, identifies a per-user container;
 *   container_name is derived as `${PER_USER_CONTAINER_PREFIX}${username}`.
 * @param {string} [params.container_name] - Explicit container name; required for
 *   container mode when username is not supplied.
 * @param {string} [params.container_runtime='docker'] - Runtime binary name; ignored for host mode.
 * @param {string|null} [params.machine_id] - Override machine_id resolution (for tests / non-current-machine stamping).
 * @returns {{mode: string, machine_id: string|null, container_runtime: string|null, container_name: string|null}}
 */
export const build_execution_attribution = ({
  mode,
  username = null,
  container_name = null,
  container_runtime = 'docker',
  machine_id = undefined
}) => {
  if (mode !== 'host' && mode !== 'container') {
    throw new Error(
      `build_execution_attribution: mode must be 'host' or 'container', got ${mode}`
    )
  }

  const resolved_machine_id =
    machine_id === undefined ? get_current_machine_id() : machine_id

  if (mode === 'host') {
    if (username || container_name) {
      throw new Error(
        'build_execution_attribution: host mode cannot carry username or container_name'
      )
    }
    return {
      mode: 'host',
      machine_id: resolved_machine_id,
      container_runtime: null,
      container_name: null
    }
  }

  const resolved_container_name = username
    ? `${PER_USER_CONTAINER_PREFIX}${username}`
    : container_name
  if (!resolved_container_name) {
    throw new Error(
      'build_execution_attribution: container mode requires container_name or username'
    )
  }
  if (!container_runtime) {
    throw new Error(
      'build_execution_attribution: container mode requires container_runtime'
    )
  }

  return {
    mode: 'container',
    machine_id: resolved_machine_id,
    container_runtime,
    container_name: resolved_container_name
  }
}

/**
 * Idempotency guard for sync paths: returns true when an incoming attribution
 * would downgrade a per-user container stamp to something less specific.
 * Mirrors the previous "never downgrade container_user" rule from
 * libs-server/integrations/thread/create-from-session.mjs.
 *
 * @param {Object|null} existing - The currently stored execution object (may be null/undefined).
 * @param {Object|null} incoming - The proposed replacement.
 * @returns {boolean}
 */
export const would_downgrade_per_user_container = (existing, incoming) => {
  if (!existing || !is_per_user_container(existing.container_name)) return false
  if (!incoming) return true
  return !is_per_user_container(incoming.container_name)
}

export { is_per_user_container, PER_USER_CONTAINER_PREFIX }
