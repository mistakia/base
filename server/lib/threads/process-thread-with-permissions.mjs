import debug from 'debug'

import { add_backward_compatibility_fields } from '#libs-server/threads/thread-utils.mjs'
import { check_thread_permission } from '#server/middleware/permission/index.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'

const log = debug('threads:utils')

/**
 * Process thread data with permission checking and redaction
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {Object} params.metadata Thread metadata
 * @param {Array} params.timeline Thread timeline
 * @param {string} params.thread_dir Thread directory path
 * @param {string|null} params.user_public_key User public key for permission checking
 * @returns {Promise<Object>} Processed thread data (potentially redacted)
 */
export async function process_thread_with_permissions({
  thread_id,
  metadata,
  timeline,
  thread_dir,
  user_public_key
}) {
  const thread_data = add_backward_compatibility_fields({
    metadata,
    thread_dir,
    timeline
  })

  // Build pre-loaded metadata to avoid duplicate filesystem reads
  // The permission system can use this instead of re-reading the metadata file
  const preloaded_metadata = {
    owner_public_key: metadata.user_public_key || null,
    public_read: {
      explicit:
        metadata.public_read !== undefined && metadata.public_read !== null,
      value: metadata.public_read === true
    },
    resource_type: 'thread',
    raw: metadata
  }

  // Use centralized thread permission checking with pre-loaded metadata
  const permission_result = await check_thread_permission({
    user_public_key,
    thread_id,
    metadata: preloaded_metadata
  })

  if (!permission_result.read.allowed) {
    log(`Access denied to thread ${thread_id}, returning redacted content`)
    return redact_thread_data(thread_data)
  }

  return thread_data
}
