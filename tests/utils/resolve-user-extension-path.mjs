import { existsSync } from 'fs'
import path from 'path'

import config from '#config'

/**
 * Resolve the absolute path to a user-base extension directory if it is
 * installed, or null if the user_base_directory is unset or the extension
 * is not present. Used by integration tests that need to dynamically import
 * extension code and should skip when the extension is absent.
 */
export function resolve_user_extension_path(extension_name) {
  if (!config.user_base_directory) return null
  const extension_dir = path.join(
    config.user_base_directory,
    'extension',
    extension_name
  )
  if (!existsSync(path.join(extension_dir, 'extension.md'))) return null
  return extension_dir
}
