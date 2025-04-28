import fs from 'fs/promises'
import debug from 'debug'

const log = debug('filesystem:ensure-directory')

/**
 * Ensure a directory exists
 * @param {String} dir_path Path to ensure exists
 */
export async function ensure_directory(dir_path) {
  log(`Ensuring directory ${dir_path} exists`)
  await fs.mkdir(dir_path, { recursive: true })
}
