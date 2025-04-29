import fs from 'fs'
import debug from 'debug'

const log = debug('filesystem:directory-exists-sync')

/**
 * Synchronously checks if a directory exists at the specified absolute path and is readable
 * @param {Object} params - The parameters
 * @param {string} params.absolute_path - The absolute path to check
 * @returns {boolean} - True if the directory exists and is readable, false otherwise
 */
export function directory_exists_in_filesystem_sync({ absolute_path }) {
  log(`Checking if directory exists and is readable at ${absolute_path}`)
  try {
    // First check if the path exists and is a directory
    const stats = fs.statSync(absolute_path)

    if (!stats.isDirectory()) {
      return false
    }

    // Always verify read access
    try {
      fs.accessSync(absolute_path, fs.constants.R_OK)
    } catch (error) {
      log(`Directory exists but is not readable: ${absolute_path}`)
      return false
    }

    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}
