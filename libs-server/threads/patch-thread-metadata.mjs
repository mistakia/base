import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import debug from 'debug'

import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'

const log = debug('threads:patch-metadata')

/**
 * Apply a targeted field merge to a thread's metadata.json.
 * Reads the current file, applies patches, writes back.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread UUID
 * @param {Object} params.patches - Fields to merge into metadata
 * @returns {Promise<Object>} Updated metadata
 * @throws {Error} If thread metadata cannot be read
 */
const patch_thread_metadata = async ({ thread_id, patches }) => {
  const user_base_directory = get_user_base_directory()
  const thread_base_directory = get_thread_base_directory({
    user_base_directory
  })
  const metadata_path = join(thread_base_directory, thread_id, 'metadata.json')
  const raw = await readFile(metadata_path, 'utf-8')
  const metadata = JSON.parse(raw)

  Object.assign(metadata, patches, { updated_at: new Date().toISOString() })

  await writeFile(metadata_path, JSON.stringify(metadata, null, 2), 'utf-8')
  log(
    `Thread ${thread_id}: patched fields [${Object.keys(patches).join(', ')}]`
  )
  return metadata
}

export default patch_thread_metadata
