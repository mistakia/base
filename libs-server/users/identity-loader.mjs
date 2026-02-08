import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

const log = debug('identity-loader')

/**
 * Cache for identity entities
 * Uses mtime-based invalidation to detect file changes
 */
const identity_cache = {
  by_public_key: new Map(),
  by_username: new Map(),
  all_identities: null,
  mtimes: new Map()
}

/** Promise for in-progress scan to prevent cache stampede */
let scan_in_progress = null

/**
 * Get file mtime for cache invalidation
 * @param {string} file_path - Absolute path to file
 * @returns {Promise<number|null>} mtime in milliseconds or null if file doesn't exist
 */
async function get_file_mtime(file_path) {
  try {
    const stats = await fs.stat(file_path)
    return stats.mtime.getTime()
  } catch (error) {
    return null
  }
}

/**
 * Check if cache entry is still valid based on mtime
 * @param {string} file_path - Absolute path to file
 * @returns {Promise<boolean>}
 */
async function is_cache_entry_valid(file_path) {
  const cached_mtime = identity_cache.mtimes.get(file_path)
  if (!cached_mtime) {
    return false
  }
  const current_mtime = await get_file_mtime(file_path)
  return current_mtime === cached_mtime
}

/**
 * Load a single identity entity from file
 * @param {string} absolute_path - Absolute path to identity file
 * @returns {Promise<Object|null>} Parsed identity entity or null
 */
async function load_identity_from_file(absolute_path) {
  const result = await read_entity_from_filesystem({ absolute_path })

  if (!result.success) {
    log(`Failed to read identity from ${absolute_path}: ${result.error}`)
    return null
  }

  const { entity_properties } = result

  // Validate required identity fields
  if (entity_properties.type !== 'identity') {
    log(`File ${absolute_path} is not an identity entity`)
    return null
  }

  if (!entity_properties.auth_public_key) {
    log(`Identity at ${absolute_path} missing required auth_public_key`)
    return null
  }

  if (!entity_properties.username) {
    log(`Identity at ${absolute_path} missing required username`)
    return null
  }

  // Get mtime for cache invalidation
  const mtime = await get_file_mtime(absolute_path)

  return {
    ...entity_properties,
    absolute_path,
    _mtime: mtime
  }
}

/**
 * List markdown files in a directory
 * @param {string} dir_path - Directory path to scan
 * @returns {Promise<Array<string>>} Array of absolute paths
 */
async function list_markdown_files(dir_path) {
  try {
    const entries = await fs.readdir(dir_path, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
      const full_path = path.join(dir_path, entry.name)
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(full_path)
      }
    }

    return files
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

/**
 * Scan and load all identity entities
 * Uses promise deduplication to prevent cache stampede
 * @returns {Promise<Array>} Array of identity entities
 */
async function scan_all_identities() {
  // Prevent concurrent scans (cache stampede protection)
  if (scan_in_progress) {
    log('Scan already in progress, waiting...')
    return scan_in_progress
  }

  scan_in_progress = (async () => {
    try {
      // Get user base directory and scan identity folder
      const user_base = get_user_base_directory()
      const identity_dir = path.join(user_base, 'identity')
      const files = await list_markdown_files(identity_dir)

      if (files.length === 0) {
        log('No identity files found')
        identity_cache.all_identities = []
        identity_cache.by_public_key.clear()
        identity_cache.by_username.clear()
        identity_cache.mtimes.clear()
        return []
      }

      // Load files in parallel
      const identity_results = await Promise.all(
        files.map((file_path) => load_identity_from_file(file_path))
      )

      const identities = identity_results.filter(Boolean)

      // Update cache
      identity_cache.all_identities = identities
      identity_cache.by_public_key.clear()
      identity_cache.by_username.clear()
      identity_cache.mtimes.clear()

      for (const identity of identities) {
        identity_cache.by_public_key.set(identity.auth_public_key, identity)
        identity_cache.by_username.set(identity.username, identity)
        if (identity._mtime) {
          identity_cache.mtimes.set(identity.absolute_path, identity._mtime)
        }
      }

      log(`Loaded ${identities.length} identity entities`)
      return identities
    } finally {
      scan_in_progress = null
    }
  })()

  return scan_in_progress
}

/**
 * Load identity by public key
 * @param {Object} params - Parameters
 * @param {string} params.public_key - Hex-encoded public key
 * @returns {Promise<Object|null>} Identity entity or null
 */
export async function load_identity_by_public_key({ public_key }) {
  if (!public_key) {
    return null
  }

  // Check cache first
  const cached = identity_cache.by_public_key.get(public_key)
  if (cached) {
    const is_valid = await is_cache_entry_valid(cached.absolute_path)
    if (is_valid) {
      log(`Cache hit for identity with public key: ${public_key.slice(0, 8)}...`)
      return cached
    }
    log(`Cache invalidated for identity with public key: ${public_key.slice(0, 8)}...`)
  }

  // Scan all identities if cache miss or invalid
  await scan_all_identities()

  return identity_cache.by_public_key.get(public_key) || null
}

/**
 * Load identity by username
 * @param {Object} params - Parameters
 * @param {string} params.username - Username
 * @returns {Promise<Object|null>} Identity entity or null
 */
export async function load_identity_by_username({ username }) {
  if (!username) {
    return null
  }

  // Check cache first
  const cached = identity_cache.by_username.get(username)
  if (cached) {
    const is_valid = await is_cache_entry_valid(cached.absolute_path)
    if (is_valid) {
      log(`Cache hit for identity with username: ${username}`)
      return cached
    }
    log(`Cache invalidated for identity with username: ${username}`)
  }

  // Scan all identities if cache miss or invalid
  await scan_all_identities()

  return identity_cache.by_username.get(username) || null
}

/**
 * Load all identity entities
 * @returns {Promise<Array>} Array of all identity entities
 */
export async function load_all_identities() {
  if (identity_cache.all_identities) {
    return identity_cache.all_identities
  }

  return await scan_all_identities()
}

/**
 * Clear the identity cache
 * Used for testing and when identity files are known to have changed
 */
export function clear_identity_cache() {
  identity_cache.by_public_key.clear()
  identity_cache.by_username.clear()
  identity_cache.mtimes.clear()
  identity_cache.all_identities = null
  scan_in_progress = null
  log('Identity cache cleared')
}

export default {
  load_identity_by_public_key,
  load_identity_by_username,
  load_all_identities,
  clear_identity_cache
}
