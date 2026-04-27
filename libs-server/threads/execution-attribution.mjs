import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'

const PER_USER_CONTAINER_PREFIX = 'base-user-'

const is_per_user_container = (container_name) =>
  typeof container_name === 'string' &&
  container_name.startsWith(PER_USER_CONTAINER_PREFIX)

const VALID_ENVIRONMENTS = [
  'controlled_host',
  'controlled_container',
  'provider_hosted'
]

/**
 * Build the canonical thread.execution attribution object.
 *
 * @param {Object} params
 * @param {'controlled_host'|'controlled_container'|'provider_hosted'} params.environment
 * @param {string} [params.username] - When set, identifies a per-user container;
 *   container_name is derived as `${PER_USER_CONTAINER_PREFIX}${username}`.
 * @param {string} [params.container_name] - Explicit container name; required for
 *   controlled_container mode when username is not supplied.
 * @param {string} [params.container_runtime='docker'] - Runtime binary name; ignored for
 *   controlled_host and provider_hosted modes.
 * @param {string|null} [params.machine_id] - Override machine_id resolution (for tests /
 *   non-current-machine stamping). Pass null explicitly for provider_hosted.
 * @param {string} [params.account_namespace] - Optional account namespace (e.g. 'fee.trace.wrap').
 * @returns {{environment: string, machine_id: string|null, container_runtime: string|null, container_name: string|null}}
 */
export const build_execution_attribution = ({
  environment,
  username = null,
  container_name = null,
  container_runtime = 'docker',
  machine_id = undefined,
  account_namespace = undefined
}) => {
  if (!VALID_ENVIRONMENTS.includes(environment)) {
    throw new Error(
      `build_execution_attribution: environment must be one of ${VALID_ENVIRONMENTS.join(', ')}, got ${environment}`
    )
  }

  if (environment === 'provider_hosted') {
    if (username || container_name) {
      throw new Error(
        'build_execution_attribution: provider_hosted cannot carry username or container_name'
      )
    }
    const result = {
      environment: 'provider_hosted',
      machine_id: null,
      container_runtime: null,
      container_name: null
    }
    if (account_namespace !== undefined) result.account_namespace = account_namespace
    return result
  }

  const resolved_machine_id =
    machine_id === undefined ? get_current_machine_id() : machine_id

  if (environment === 'controlled_host') {
    if (username || container_name) {
      throw new Error(
        'build_execution_attribution: controlled_host cannot carry username or container_name'
      )
    }
    const result = {
      environment: 'controlled_host',
      machine_id: resolved_machine_id,
      container_runtime: null,
      container_name: null
    }
    if (account_namespace !== undefined) result.account_namespace = account_namespace
    return result
  }

  // controlled_container
  const resolved_container_name = username
    ? `${PER_USER_CONTAINER_PREFIX}${username}`
    : container_name
  if (!resolved_container_name) {
    throw new Error(
      'build_execution_attribution: controlled_container requires container_name or username'
    )
  }
  if (!container_runtime) {
    throw new Error(
      'build_execution_attribution: controlled_container requires container_runtime'
    )
  }

  const result = {
    environment: 'controlled_container',
    machine_id: resolved_machine_id,
    container_runtime,
    container_name: resolved_container_name
  }
  if (account_namespace !== undefined) result.account_namespace = account_namespace
  return result
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

/**
 * Equality guard: returns true when both existing and incoming are non-null
 * and differ from each other. Callers can use this to decide whether an
 * overwrite is suspicious (e.g. different machine or environment).
 *
 * @param {Object|null} existing
 * @param {Object|null} incoming
 * @returns {boolean}
 */
export const would_overwrite_with_different = (existing, incoming) => {
  if (!existing || !incoming) return false
  return JSON.stringify(existing) !== JSON.stringify(incoming)
}

export { is_per_user_container, PER_USER_CONTAINER_PREFIX }
