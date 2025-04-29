import { promises as fs } from 'fs'
import debug from 'debug'

const log = debug('filesystem:file-exists')

/**
 * Checks if a file exists at the specified absolute path and is readable
 * @param {Object} params - The parameters
 * @param {string} params.absolute_path - The absolute path to check
 * @returns {Promise<boolean>} - True if the file exists and is readable, false otherwise
 */
export async function file_exists_in_filesystem({ absolute_path }) {
  log(`Checking if file exists and is readable at ${absolute_path}`)
  try {
    // First check if the path exists and is a file
    const stats = await fs.stat(absolute_path)

    if (!stats.isFile()) {
      return false
    }

    // Always verify read access
    try {
      await fs.access(absolute_path, fs.constants.R_OK)
    } catch (error) {
      log(`File exists but is not readable: ${absolute_path}`)
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
