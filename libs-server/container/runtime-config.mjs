import config from '#config'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'

const DEFAULT_RUNTIME = 'docker'

/**
 * Resolve the container runtime binary name for the current process.
 *
 * Precedence (first non-empty wins):
 *   1. machine_registry[current_machine_id].container_runtime
 *   2. config.container_runtime
 *   3. 'docker'
 *
 * Per-machine overrides win over the global so a single deployment file can
 * mix host platforms (e.g. docker on linux, podman on macOS) without forking
 * config.
 *
 * @returns {string}
 */
export const get_container_runtime_name = () => {
  const machine_id = get_current_machine_id()
  const per_machine =
    machine_id && config.machine_registry?.[machine_id]?.container_runtime
  return per_machine || config.container_runtime || DEFAULT_RUNTIME
}

/**
 * Resolve the compose command (binary + subcommand) for the current process.
 * Returns a single string -- callers that need argv must split it.
 */
export const get_container_compose_cmd = () => {
  const runtime = get_container_runtime_name()
  return `${runtime} compose`
}

export { DEFAULT_RUNTIME }
