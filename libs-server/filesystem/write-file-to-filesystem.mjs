import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { randomBytes } from 'crypto'
import { ensure_directory } from './ensure-directory.mjs'

/**
 * Writes content to a file at the specified absolute path, ensuring the directory exists.
 * Uses atomic write (temp file + rename) to prevent corruption from concurrent writers.
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

  // Atomic write: write to temp file in same directory, then rename.
  // rename() is atomic on POSIX, preventing corruption when concurrent
  // processes write to the same file (e.g., session import hooks racing
  // with thread archive/update operations on metadata.json).
  const tmp_suffix = randomBytes(6).toString('hex')
  const tmp_path = join(dir_path, `.tmp-write-${tmp_suffix}`)
  try {
    await fs.writeFile(tmp_path, file_content, 'utf8')
    await fs.rename(tmp_path, absolute_path)
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tmp_path)
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}
