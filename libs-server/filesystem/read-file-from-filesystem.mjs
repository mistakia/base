import { promises as fs } from 'fs'
import debug from 'debug'
import { file_exists_in_filesystem } from './file-exists-in-filesystem.mjs'

const log = debug('filesystem:read-file')

/**
 * Reads a file from the filesystem at the specified absolute path
 * @param {Object} params - The parameters
 * @param {string} params.absolute_path - The absolute path to the file
 * @returns {Promise<string>} - The file content as a string
 * @throws {Error} If the file doesn't exist or can't be read
 */
export async function read_file_from_filesystem({ absolute_path } = {}) {
  if (!absolute_path) {
    throw new Error('absolute_path is required')
  }

  log(`Reading file from ${absolute_path}`)

  // Check if file exists before trying to read
  const file_exists = await file_exists_in_filesystem({
    absolute_path
  })

  if (!file_exists) {
    throw new Error(`File does not exist at ${absolute_path}`)
  }

  try {
    // Read the file content
    const content = await fs.readFile(absolute_path, 'utf-8')
    return content
  } catch (error) {
    log(`Error reading file from ${absolute_path}: ${error.message}`)
    throw new Error(
      `Failed to read file from ${absolute_path}: ${error.message}`
    )
  }
}
