import config from '#config'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'

/**
 * Resolve the local base-api endpoint (proto + port) from machine_registry.
 *
 * Centralizes the previous duplicated logic that read process.env.SSL_ENABLED
 * and process.env.SERVER_PORT directly. Reading from the user-base config
 * avoids the brittle assumption that every process generating compose files
 * or spawning docker-exec was started by PM2 (which is the only place those
 * env vars are injected).
 *
 * Port default mirrors pm2.config.mjs: 8081 when SSL is on, 8080 otherwise.
 *
 * @param {Object} [params]
 * @param {string} [params.machine_id] - Override current machine id (for tests)
 * @returns {{proto: 'http'|'https', port: number}}
 */
export const get_local_api_endpoint = ({ machine_id } = {}) => {
  const id = machine_id || get_current_machine_id()
  const entry = config.machine_registry?.[id]
  const ssl = Boolean(entry?.ssl_key_path)
  return {
    proto: ssl ? 'https' : 'http',
    port: Number(entry?.server_port) || (ssl ? 8081 : 8080)
  }
}
