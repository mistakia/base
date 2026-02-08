import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

const log = debug('role-loader')

/**
 * Cache for role entities
 * Uses mtime-based invalidation to detect file changes
 */
const role_cache = {
  by_base_uri: new Map(),
  all_roles: null,
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
  const cached_mtime = role_cache.mtimes.get(file_path)
  if (!cached_mtime) {
    return false
  }
  const current_mtime = await get_file_mtime(file_path)
  return current_mtime === cached_mtime
}

/**
 * Load a single role entity from file
 * @param {string} absolute_path - Absolute path to role file
 * @returns {Promise<Object|null>} Parsed role entity or null
 */
async function load_role_from_file(absolute_path) {
  const result = await read_entity_from_filesystem({ absolute_path })

  if (!result.success) {
    log(`Failed to read role from ${absolute_path}: ${result.error}`)
    return null
  }

  const { entity_properties } = result

  // Validate required role fields
  if (entity_properties.type !== 'role') {
    log(`File ${absolute_path} is not a role entity`)
    return null
  }

  if (!entity_properties.rules || !Array.isArray(entity_properties.rules)) {
    log(`Role at ${absolute_path} missing required rules array`)
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
 * Scan and load all role entities
 * Uses promise deduplication to prevent cache stampede
 * @returns {Promise<Array>} Array of role entities
 */
async function scan_all_roles() {
  // Prevent concurrent scans (cache stampede protection)
  if (scan_in_progress) {
    log('Scan already in progress, waiting...')
    return scan_in_progress
  }

  scan_in_progress = (async () => {
    try {
      // Get user base directory and scan role folder
      const user_base = get_user_base_directory()
      const role_dir = path.join(user_base, 'role')
      const files = await list_markdown_files(role_dir)

      if (files.length === 0) {
        log('No role files found')
        role_cache.all_roles = []
        role_cache.by_base_uri.clear()
        role_cache.mtimes.clear()
        return []
      }

      // Load files in parallel
      const role_results = await Promise.all(
        files.map((file_path) => load_role_from_file(file_path))
      )

      const roles = role_results.filter(Boolean)

      // Update cache
      role_cache.all_roles = roles
      role_cache.by_base_uri.clear()
      role_cache.mtimes.clear()

      for (const role of roles) {
        if (role.base_uri) {
          role_cache.by_base_uri.set(role.base_uri, role)
        }
        if (role._mtime) {
          role_cache.mtimes.set(role.absolute_path, role._mtime)
        }
      }

      log(`Loaded ${roles.length} role entities`)
      return roles
    } finally {
      scan_in_progress = null
    }
  })()

  return scan_in_progress
}

/**
 * Load role by base_uri
 * @param {Object} params - Parameters
 * @param {string} params.base_uri - Role base_uri (e.g., user:role/admin.md)
 * @returns {Promise<Object|null>} Role entity or null
 */
export async function load_role({ base_uri }) {
  if (!base_uri) {
    return null
  }

  // Check cache first
  const cached = role_cache.by_base_uri.get(base_uri)
  if (cached) {
    const is_valid = await is_cache_entry_valid(cached.absolute_path)
    if (is_valid) {
      log(`Cache hit for role: ${base_uri}`)
      return cached
    }
    log(`Cache invalidated for role: ${base_uri}`)
  }

  // Try to load directly from file path
  try {
    const absolute_path = resolve_base_uri(base_uri)
    const role = await load_role_from_file(absolute_path)
    if (role) {
      role_cache.by_base_uri.set(base_uri, role)
      if (role._mtime) {
        role_cache.mtimes.set(role.absolute_path, role._mtime)
      }
      return role
    }
  } catch (error) {
    log(`Failed to resolve role base_uri ${base_uri}: ${error.message}`)
  }

  // Fall back to scanning all roles
  await scan_all_roles()

  return role_cache.by_base_uri.get(base_uri) || null
}

/**
 * Load all role entities
 * @returns {Promise<Array>} Array of all role entities
 */
export async function load_all_roles() {
  if (role_cache.all_roles) {
    return role_cache.all_roles
  }

  return await scan_all_roles()
}

/**
 * Clear the role cache
 * Used for testing and when role files are known to have changed
 */
export function clear_role_cache() {
  role_cache.by_base_uri.clear()
  role_cache.mtimes.clear()
  role_cache.all_roles = null
  scan_in_progress = null
  log('Role cache cleared')
}

export default {
  load_role,
  load_all_roles,
  clear_role_cache
}
