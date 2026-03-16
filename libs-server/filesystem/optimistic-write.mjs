import { promises as fs } from 'fs'
import debug from 'debug'

import { write_file_to_filesystem } from './write-file-to-filesystem.mjs'

const log = debug('base:filesystem:optimistic-write')

/**
 * Performs a read-modify-write with optimistic concurrency control.
 * Reads file content and mtime, passes content to the modify callback,
 * then re-checks mtime before writing. Retries on conflict.
 *
 * @param {Object} params
 * @param {string} params.absolute_path - Absolute path to the file
 * @param {Function} params.modify - Async callback: (content: string) => string
 * @param {number} [params.max_retries=3] - Maximum retry attempts on mtime conflict
 * @returns {Promise<string>} The written content
 */
export async function read_modify_write({
  absolute_path,
  modify,
  max_retries = 3
}) {
  for (let attempt = 0; attempt <= max_retries; attempt++) {
    const pre_stat = await fs.stat(absolute_path)
    const content = await fs.readFile(absolute_path, 'utf8')

    const new_content = await modify(content)

    // Re-check mtime before writing
    const post_stat = await fs.stat(absolute_path)
    if (pre_stat.mtimeMs !== post_stat.mtimeMs) {
      log(
        'mtime conflict on %s (attempt %d/%d)',
        absolute_path,
        attempt + 1,
        max_retries
      )
      if (attempt < max_retries) {
        continue
      }
      throw new Error(
        `read_modify_write: max retries (${max_retries}) exhausted for ${absolute_path} — file was modified concurrently`
      )
    }

    await write_file_to_filesystem({
      absolute_path,
      file_content: new_content
    })

    return new_content
  }
}
