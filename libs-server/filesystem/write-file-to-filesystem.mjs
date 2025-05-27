import { promises as fs } from 'fs'
import { dirname } from 'path'
import { ensure_directory } from './ensure-directory.mjs'

/**
 * Writes content to a file at the specified absolute path, ensuring the directory exists
 * @param {Object} params - The parameters
 * @param {string} params.absolute_path - The absolute path where to write the file
 * @param {string} params.file_content - The content to write to the file
 * @returns {Promise<void>}
 */
export async function write_file_to_filesystem({
  absolute_path,
  file_content
}) {
  // Ensure the directory exists
  const dir_path = dirname(absolute_path)
  await ensure_directory(dir_path)

  // Write the file
  await fs.writeFile(absolute_path, file_content, 'utf8')
}
