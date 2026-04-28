/**
 * Path-Type Map
 *
 * Maps the first directory segment of an entity file path to the expected
 * entity type. Used by `base entity create`, `base entity convert`, and the
 * validator to prevent silent mismatches between a file's location and its
 * declared `type` (e.g. `workflow/X.md` with `type: task`).
 */

import path from 'path'

import config from '#config'
import {
  get_system_base_directory,
  get_user_base_directory
} from './base-directory-registry.mjs'
import { is_path_within_directory } from '#libs-server/utils/is-path-within-directory.mjs'

/**
 * Directory-to-type mapping. The key is the first path segment relative to
 * the user-base or system root; the value is the required entity type for
 * files in that directory. Directories not listed here are unrestricted.
 */
export const DIRECTORY_TYPE_MAP = Object.freeze({
  workflow: 'workflow',
  task: 'task',
  guideline: 'guideline',
  text: 'text',
  tag: 'tag',
  person: 'person',
  role: 'role',
  'physical-item': 'physical_item',
  'physical-location': 'physical_location',
  identity: 'identity',
  extension: 'extension',
  'scheduled-command': 'scheduled-command',
  repository: 'repository',
  thread: 'thread',
  schema: 'schema'
})

/**
 * Resolve the expected entity type for a filesystem path based on its first
 * directory segment relative to the user-base or system root.
 *
 * @param {Object} params
 * @param {string} params.absolute_path - Absolute filesystem path to the entity file
 * @returns {string|null} Expected type, or null if the directory has no mapping
 */
export function get_expected_type_for_path({ absolute_path }) {
  if (!absolute_path || typeof absolute_path !== 'string') {
    return null
  }

  let system_base_directory
  let user_base_directory

  try {
    system_base_directory = get_system_base_directory()
  } catch {
    system_base_directory = config.system_base_directory
  }

  try {
    user_base_directory = get_user_base_directory()
  } catch {
    user_base_directory = config.user_base_directory
  }

  // Check system directory first (may be nested inside user directory)
  let relative_path = null
  if (
    system_base_directory &&
    is_path_within_directory(absolute_path, system_base_directory)
  ) {
    relative_path = path.relative(system_base_directory, absolute_path)
  } else if (
    user_base_directory &&
    is_path_within_directory(absolute_path, user_base_directory)
  ) {
    relative_path = path.relative(user_base_directory, absolute_path)
  }

  if (!relative_path) {
    return null
  }

  const first_segment = relative_path.split(path.sep)[0]
  if (!first_segment) {
    return null
  }

  return DIRECTORY_TYPE_MAP[first_segment] || null
}

export default {
  DIRECTORY_TYPE_MAP,
  get_expected_type_for_path
}
