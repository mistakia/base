import { join } from 'path'
import debug from 'debug'

import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import { assert_valid_thread_metadata } from '#libs-server/threads/validate-thread-metadata.mjs'
import { write_thread_metadata } from '#libs-server/threads/write-thread-metadata.mjs'
import { build_thread_audit_context } from '#libs-server/threads/build-thread-audit-context.mjs'
import { check_thread_fields_writable } from '#libs-server/threads/check-thread-fields.mjs'

const log = debug('threads:patch-metadata')

/**
 * Apply a targeted field merge to a thread's metadata.json under optimistic
 * concurrency. Reads the current file with an mtime guard, applies patches,
 * writes back; retries on concurrent-writer mtime conflict.
 *
 * @param {Object} params
 * @param {string} params.thread_id - Thread UUID
 * @param {Object} params.patches - Fields to merge into metadata
 * @returns {Promise<Object>} Updated metadata
 * @throws {Error} If thread metadata cannot be read or concurrent writers
 *   exhaust retry budget (error.code === 'EMTIME_CONFLICT').
 */
const patch_thread_metadata = async ({ thread_id, patches }) => {
  const user_base_directory = get_user_base_directory()
  const thread_base_directory = get_thread_base_directory({
    user_base_directory
  })
  const metadata_path = join(thread_base_directory, thread_id, 'metadata.json')

  check_thread_fields_writable({
    thread_id,
    fields: Object.keys(patches),
    op: 'patch'
  })

  const updated_metadata = await write_thread_metadata({
    absolute_path: metadata_path,
    modify: async (metadata) => {
      Object.assign(metadata, patches, { updated_at: new Date().toISOString() })
      await assert_valid_thread_metadata(metadata)
      return metadata
    },
    audit_context: build_thread_audit_context({ thread_id, op: 'patch' })
  })

  log(
    `Thread ${thread_id}: patched fields [${Object.keys(patches).join(', ')}]`
  )
  return updated_metadata
}

export default patch_thread_metadata
