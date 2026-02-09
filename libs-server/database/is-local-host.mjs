/**
 * Host Detection Utility
 *
 * Determines if a storage_config.host matches the current machine.
 * Used to decide whether to access databases locally or via SSH.
 */

import os from 'os'
import debug from 'debug'

const log = debug('database:is-local-host')

/**
 * Check if the specified host is the local machine
 *
 * @param {Object} options - Options object
 * @param {string} options.host - SSH config host alias to check
 * @returns {boolean} True if host is local or omitted
 */
export function is_local_host({ host } = {}) {
  // No host specified means local
  if (!host || host === '') {
    log('No host specified, treating as local')
    return true
  }

  const hostname = os.hostname()

  // Direct hostname match
  if (host === hostname) {
    log('Host matches hostname: %s', hostname)
    return true
  }

  // Common local aliases
  const local_aliases = ['localhost', '127.0.0.1', '::1']
  if (local_aliases.includes(host)) {
    log('Host is local alias: %s', host)
    return true
  }

  log('Host %s does not match local machine %s', host, hostname)
  return false
}

export default { is_local_host }
