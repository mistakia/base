import { join } from 'path'
import { access } from 'fs/promises'
import { constants } from 'fs'
import debug from 'debug'

import { NEVER_MOUNT_DIRS } from './claude-home-bootstrap.mjs'

const log = debug('threads:volume-mount-generator')

/**
 * Validate that a mount source is not in the never-mount safety list
 *
 * @param {string} source - Source path relative to user-base
 * @returns {boolean} True if the source is safe to mount
 */
const is_safe_mount_source = (source) => {
  const normalized = source.endsWith('/') ? source : `${source}/`
  for (const blocked of NEVER_MOUNT_DIRS) {
    if (normalized === blocked || normalized.startsWith(blocked)) {
      return false
    }
  }
  return true
}

/**
 * Generate Docker volume mount specs from thread_config.mounts
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @param {Object} params.thread_config - User's thread configuration
 * @param {string} params.user_base_directory - Host path to user-base
 * @param {string} params.user_data_directory - Host path to user container data parent
 * @param {string} [params.container_user_base_path] - Container-internal user-base path
 * @returns {Promise<string[]>} Array of Docker volume mount strings (host:container:mode)
 */
export const generate_volume_mounts = async ({
  username,
  thread_config,
  user_base_directory,
  user_data_directory,
  container_user_base_path = '/home/node/user-base'
}) => {
  const mounts = []

  // Always include the user-scoped claude-home volume mount
  const claude_home_host = join(user_data_directory, username, 'claude-home')
  mounts.push(`${claude_home_host}:/home/node/.claude:cached`)

  // Process thread_config.mounts
  const config_mounts = thread_config.mounts || []

  for (const mount_config of config_mounts) {
    const { source, mode, target } = mount_config

    // Validate against never-mount safety list
    if (!is_safe_mount_source(source)) {
      log(
        `Rejecting mount source '${source}' -- matches never-mount safety list`
      )
      continue
    }

    // Validate mount source exists on host
    const host_source = join(user_base_directory, source)
    try {
      await access(host_source, constants.F_OK)
    } catch {
      log(`Warning: Mount source '${host_source}' does not exist, skipping`)
      continue
    }

    // Determine container target path
    const container_target = target || join(container_user_base_path, source)
    const mount_mode = mode === 'rw' ? 'cached' : 'ro'
    mounts.push(`${host_source}:${container_target}:${mount_mode}`)
  }

  log(`Generated ${mounts.length} volume mounts for ${username}`)
  return mounts
}

/**
 * Derive allowed working directories from rw mounts in thread_config
 *
 * @param {Object} params
 * @param {Object} params.thread_config - User's thread configuration
 * @param {string} [params.container_user_base_path] - Container-internal user-base path
 * @returns {string[]} Array of container-internal absolute paths
 */
export const get_allowed_working_directories = ({
  thread_config,
  container_user_base_path = '/home/node/user-base'
}) => {
  const config_mounts = thread_config.mounts || []
  const dirs = []

  for (const mount_config of config_mounts) {
    if (mount_config.mode === 'rw') {
      const container_path =
        mount_config.target ||
        join(container_user_base_path, mount_config.source)
      dirs.push(container_path)
    }
  }

  return dirs
}

export default {
  generate_volume_mounts,
  get_allowed_working_directories
}
