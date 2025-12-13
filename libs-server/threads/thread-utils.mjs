import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { get_thread_base_directory } from './threads-constants.mjs'
import { check_thread_permission } from '#server/middleware/permission/index.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'

const log = debug('threads:utils')

/**
 * Read a JSON file and parse its contents
 * @param {Object} params Parameters
 * @param {string} params.file_path Path to the JSON file
 * @returns {Promise<Object>} Parsed JSON content
 * @throws {Error} If file cannot be read or parsed
 */
export async function read_json_file({ file_path }) {
  const raw = await fs.readFile(file_path, 'utf-8')
  return JSON.parse(raw)
}

/**
 * Read a JSON file or return a default value if the file doesn't exist
 * @param {Object} params Parameters
 * @param {string} params.file_path Path to the JSON file
 * @param {*} params.default_value Default value to return if file doesn't exist
 * @returns {Promise<*>} Parsed JSON content or default value
 * @throws {Error} If file exists but cannot be read or parsed
 */
export async function read_json_file_or_default({ file_path, default_value }) {
  try {
    return await read_json_file({ file_path })
  } catch (error) {
    if (error.code === 'ENOENT') {
      return default_value
    }
    throw error
  }
}

/**
 * Add backward compatibility fields to thread metadata
 * @param {Object} params Parameters
 * @param {Object} params.metadata Thread metadata
 * @param {string} params.thread_dir Thread directory path
 * @param {Array} params.timeline Thread timeline
 * @returns {Object} Enriched metadata with backward compatibility fields
 */
export function add_backward_compatibility_fields({
  metadata,
  thread_dir,
  timeline
}) {
  const enriched = {
    ...metadata,
    timeline,
    context_dir: thread_dir
  }

  if (metadata.models && metadata.models.length > 0 && !metadata.model) {
    enriched.model = metadata.models[0]
  }

  return enriched
}

/**
 * Get the effective updated_at timestamp for a thread
 * @param {Object} params Parameters
 * @param {Object} params.metadata Thread metadata
 * @returns {Date} Effective updated_at date
 */
export function get_effective_updated_at({ metadata }) {
  const updated_at = metadata.updated_at || metadata.created_at || 0
  return new Date(updated_at)
}

/**
 * Read thread metadata and timeline from filesystem
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Object containing metadata, timeline, and thread_dir
 * @throws {Error} If thread directory or metadata file doesn't exist
 */
export async function read_thread_data({ thread_id, user_base_directory }) {
  const thread_base_directory = get_thread_base_directory({
    user_base_directory
  })
  const thread_dir = path.join(thread_base_directory, thread_id)

  try {
    await fs.access(thread_dir)

    const metadata_path = path.join(thread_dir, 'metadata.json')
    const timeline_path = path.join(thread_dir, 'timeline.json')

    const [metadata, timeline] = await Promise.all([
      read_json_file({ file_path: metadata_path }),
      read_json_file_or_default({ file_path: timeline_path, default_value: [] })
    ])

    return { metadata, timeline, thread_dir }
  } catch (error) {
    log(`Error reading thread data for ${thread_id}: ${error.message}`)
    if (error.code === 'ENOENT') {
      throw new Error(`Thread not found: ${thread_id}`)
    }
    throw error
  }
}

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
