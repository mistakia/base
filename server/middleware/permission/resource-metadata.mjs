import debug from 'debug'
import path from 'path'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { read_json_file } from '#libs-server/threads/thread-utils.mjs'

const log = debug('permission:resource-metadata')

/**
 * @typedef {Object} ResourceMetadata
 * @property {string|null} owner_public_key - Owner's public key or null if unknown
 * @property {{explicit: boolean, value: boolean}} public_read - Public read status
 * @property {'thread'|'entity'|'file'} resource_type - Type of resource
 * @property {string[]} tags - Array of tag base_uris assigned to the resource
 * @property {Object} raw - Original metadata for callers needing full data
 */

/**
 * Extract owner_public_key from raw metadata
 *
 * @param {Object} raw - Raw metadata object
 * @returns {string|null} Owner public key or null
 */
const extract_owner_public_key = (raw) => {
  return raw?.user_public_key || null
}

/**
 * Extract public_read status from raw metadata
 *
 * @param {Object} raw - Raw metadata object
 * @returns {{explicit: boolean, value: boolean}} Public read status
 */
const extract_public_read = (raw) => {
  const public_read = raw?.public_read
  const is_explicit = public_read !== undefined && public_read !== null
  const value = public_read === true

  return { explicit: is_explicit, value }
}

/**
 * Load metadata for a thread resource
 *
 * @param {Object} params - Parameters
 * @param {string} params.thread_id - Thread ID
 * @returns {Promise<ResourceMetadata|null>} Resource metadata or null on error
 */
export const load_thread_metadata = async ({ thread_id }) => {
  try {
    const threads_dir = get_thread_base_directory()
    const metadata_path = path.join(threads_dir, thread_id, 'metadata.json')
    const raw = await read_json_file({ file_path: metadata_path })

    log(`Loaded thread metadata for ${thread_id}`)

    return {
      owner_public_key: extract_owner_public_key(raw),
      public_read: extract_public_read(raw),
      tags: raw?.tags || [],
      resource_type: 'thread',
      raw
    }
  } catch (error) {
    log(`Error loading thread metadata for ${thread_id}: ${error.message}`)
    return null
  }
}

/**
 * Load metadata for an entity resource
 *
 * @param {Object} params - Parameters
 * @param {string} params.resource_path - Base-URI path of the resource
 * @returns {Promise<ResourceMetadata|null>} Resource metadata or null on error
 */
export const load_entity_metadata = async ({ resource_path }) => {
  try {
    const absolute_path = resolve_base_uri(resource_path)

    if (!absolute_path) {
      log(`Could not resolve base-uri: ${resource_path}`)
      return null
    }

    // Only .md files can contain YAML frontmatter with entity metadata.
    // Skip non-.md files (e.g. .db, .duckdb) to avoid reading large binary
    // files into memory just to discover they have no frontmatter.
    if (!absolute_path.endsWith('.md')) {
      log(`Skipping non-markdown file for metadata: ${resource_path}`)
      return null
    }

    const result = await read_entity_from_filesystem({
      absolute_path,
      metadata_only: true
    })

    if (!result.success) {
      log(`Could not read entity at ${absolute_path}: ${result.error}`)
      return null
    }

    const raw = result.entity_properties || {}

    log(`Loaded entity metadata for ${resource_path}`)

    return {
      owner_public_key: extract_owner_public_key(raw),
      public_read: extract_public_read(raw),
      tags: raw?.tags || [],
      resource_type: 'entity',
      raw
    }
  } catch (error) {
    log(`Error loading entity metadata for ${resource_path}: ${error.message}`)
    return null
  }
}

/**
 * Parse a resource path to determine resource type and extract identifiers
 *
 * @param {string} resource_path - Base-URI path of the resource
 * @returns {{type: string, thread_id?: string}} Parsed resource info
 */
const parse_resource_path = (resource_path) => {
  if (!resource_path || typeof resource_path !== 'string') {
    return { type: 'unknown' }
  }

  // Check for thread resource pattern: user:thread/{thread_id} or user:thread/{thread_id}/subpath
  // Sub-resources (e.g. timeline.jsonl, metadata.json) inherit parent thread permissions
  const thread_match = resource_path.match(/^user:thread\/([^/]+)/)
  if (thread_match) {
    return { type: 'thread', thread_id: thread_match[1] }
  }

  // Check for entity resource patterns: user:* or sys:*
  if (resource_path.startsWith('user:') || resource_path.startsWith('sys:')) {
    return { type: 'entity' }
  }

  return { type: 'unknown' }
}

/**
 * Load resource metadata for any resource type (unified loader)
 *
 * This function reads metadata once and normalizes it to a common interface,
 * eliminating duplicate filesystem reads.
 *
 * @param {Object} params - Parameters
 * @param {string} params.resource_path - Base-URI path of the resource
 * @returns {Promise<ResourceMetadata|null>} Resource metadata or null on error
 */
export const load_resource_metadata = async ({ resource_path }) => {
  const parsed = parse_resource_path(resource_path)

  log(`Loading metadata for ${resource_path} (type: ${parsed.type})`)

  if (parsed.type === 'thread') {
    return load_thread_metadata({ thread_id: parsed.thread_id })
  }

  if (parsed.type === 'entity') {
    return load_entity_metadata({ resource_path })
  }

  log(`Unknown resource type for path: ${resource_path}`)
  return null
}

/**
 * Maps a thread ID to a base-uri path
 *
 * @param {string} thread_id - Thread ID to map
 * @returns {string} Base-URI path (e.g., "user:thread/abc123")
 */
export const map_thread_id_to_base_uri = (thread_id) => {
  if (!thread_id || typeof thread_id !== 'string') {
    return ''
  }

  return `user:thread/${thread_id}`
}
