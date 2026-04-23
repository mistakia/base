/**
 * Base URI Utilities
 *
 * Centralized utilities for constructing, parsing, and validating base URIs
 * according to the Resource URI Specification.
 *
 * This module provides the single source of truth for all base_uri operations
 * to ensure consistency and ease of maintenance across the codebase.
 */

import path from 'path'
import debug from 'debug'

import config from '#config'
import {
  get_system_base_directory,
  get_user_base_directory
} from './base-directory-registry.mjs'
import { is_path_within_directory } from '#libs-server/utils/is-path-within-directory.mjs'

const log = debug('base-uri:utilities')

/**
 * Create a system repository URI
 * @param {string} resource_path - Path within system repository (e.g., 'schema/task.md')
 * @returns {string} - Complete base_uri (e.g., 'sys:schema/task.md')
 */
export function create_system_uri(resource_path) {
  const clean_path = resource_path.replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
  return `sys:${clean_path}`
}

/**
 * Create a user repository URI
 * @param {string} resource_path - Path within user repository (e.g., 'task/my-task.md')
 * @returns {string} - Complete base_uri (e.g., 'user:task/my-task.md')
 */
export function create_user_uri(resource_path) {
  const clean_path = resource_path.replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
  return `user:${clean_path}`
}

/**
 * Create base URI from git file information
 * @param {Object} params - Parameters
 * @param {string} params.git_relative_path - The git relative path
 * @param {string} params.repo_path - The repository path
 * @returns {string} - Proper base URI
 */
export function create_base_uri_from_git_file({
  git_relative_path,
  repo_path
}) {
  // Convert git relative path to absolute path within the repository
  const absolute_file_path = path.join(repo_path, git_relative_path)

  // Use centralized utility to create appropriate base URI
  return create_base_uri_from_path(absolute_file_path)
}

/**
 * Parse a base_uri into its components
 * @param {string} base_uri - The base_uri to parse
 * @returns {Object} - Parsed components { scheme, authority, path, branch, fragment }
 */
export function parse_base_uri(base_uri) {
  if (!base_uri || typeof base_uri !== 'string') {
    throw new Error('Invalid base_uri: must be a non-empty string')
  }

  // Handle branch notation (e.g., git://repo/file@branch)
  // Note: branch notation uses @, fragment uses #, so we need to handle both
  // The fragment can appear after the branch: git://repo/file@branch#fragment
  const [uri_part_without_branch, branch_and_fragment] = base_uri.split('@')

  // Strip fragment identifier from URI (RFC 3986: fragment is separated by #)
  // Fragment is for client-side navigation, not part of file path
  const [uri_part, uri_fragment] = uri_part_without_branch.split('#')

  // If branch contains a fragment (e.g., "main#section"), extract it
  let branch = branch_and_fragment || null
  let fragment = uri_fragment || null

  if (branch && branch.includes('#')) {
    const [branch_part, branch_fragment] = branch.split('#')
    branch = branch_part
    fragment = branch_fragment
  }

  // First try to match path-only schemes (sys:, user:, storage:)
  const path_only_match = uri_part.match(/^(sys|user|storage):(.*)$/)
  if (path_only_match) {
    const [, scheme, path] = path_only_match
    return {
      scheme,
      authority: '',
      path,
      branch: branch || null,
      fragment: fragment || null,
      original: base_uri
    }
  }

  // Then try to match authority-based schemes (scheme://authority/path)
  const authority_match = uri_part.match(/^([^:]+):\/\/(.*)$/)
  if (!authority_match) {
    throw new Error(`Invalid base_uri format: ${base_uri}`)
  }

  const [, scheme, remainder] = authority_match

  // For authority-based schemes, split authority and path
  const slash_index = remainder.indexOf('/')
  if (slash_index === -1) {
    // No path, only authority
    return {
      scheme,
      authority: remainder,
      path: '',
      branch: branch || null,
      fragment: fragment || null,
      original: base_uri
    }
  }

  const authority = remainder.substring(0, slash_index)
  const path = remainder.substring(slash_index + 1)

  return {
    scheme,
    authority,
    path,
    branch: branch || null,
    fragment: fragment || null,
    original: base_uri
  }
}

/**
 * Validate base_uri format
 * @param {string} base_uri - The base_uri to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function is_valid_base_uri(base_uri) {
  try {
    const parsed = parse_base_uri(base_uri)
    const valid_schemes = [
      'sys',
      'user',
      'storage',
      'ssh',
      'git',
      'http',
      'https'
    ]
    return valid_schemes.includes(parsed.scheme)
  } catch {
    return false
  }
}

/**
 * Resolve base_uri to absolute filesystem path using registered directories
 * @param {string} base_uri - The base_uri to resolve
 * @param {Object} [options] - Resolution options (for backward compatibility)
 * @param {string} [options.user_base_directory] - Override user base directory
 * @param {string} [options.system_base_directory] - Override system base directory
 * @returns {string} - Absolute filesystem path
 */
export function resolve_base_uri(base_uri, options = {}) {
  const parsed = parse_base_uri(base_uri)

  // Try to use registry first, fall back to options or config
  let user_base_directory, system_base_directory

  try {
    system_base_directory =
      options.system_base_directory || get_system_base_directory()
  } catch {
    system_base_directory =
      options.system_base_directory || config.system_base_directory
  }

  try {
    user_base_directory =
      options.user_base_directory || get_user_base_directory()
  } catch {
    user_base_directory =
      options.user_base_directory || config.user_base_directory
  }

  const resolve_and_validate = (base_directory) => {
    const resolved = path.resolve(base_directory, parsed.path)
    const base_resolved = path.resolve(base_directory)
    if (
      !resolved.startsWith(base_resolved + path.sep) &&
      resolved !== base_resolved
    ) {
      throw new Error(`Path traversal detected in base URI: ${base_uri}`)
    }
    return resolved
  }

  switch (parsed.scheme) {
    case 'sys':
      return resolve_and_validate(system_base_directory)

    case 'user':
      if (!user_base_directory) {
        throw new Error('User base directory not configured')
      }
      return resolve_and_validate(user_base_directory)

    case 'storage': {
      const storage_root = config.storage && config.storage.root_dir
      if (!storage_root) {
        throw new Error('Storage root_dir not configured')
      }
      // Accept both `storage:foo.png` and `storage:/foo.png`.
      const stripped_leading = parsed.path.replace(/^\/+/, '')
      const decoded = decodeURIComponent(stripped_leading)
      const initial = path.resolve(storage_root, decoded)
      if (!is_path_within_directory(initial, storage_root)) {
        throw new Error(`Path traversal detected in storage URI: ${base_uri}`)
      }
      // Symlink-escape guard is performed asynchronously by the caller via
      // verify_storage_realpath so this resolver does not block the event loop.
      return initial
    }

    case 'ssh':
    case 'git':
    case 'http':
    case 'https':
      // These require special handling and cannot be resolved to local paths
      throw new Error(`Cannot resolve remote URI to local path: ${base_uri}`)

    default:
      log(
        `Unexpected URI scheme '${parsed.scheme}' in base URI path resolution - this may indicate a coding gap`
      )
      throw new Error(`Unknown URI scheme: ${parsed.scheme}`)
  }
}

/**
 * Create base_uri from absolute filesystem path using registered directories
 * @param {string} absolute_path - Absolute filesystem path
 * @param {Object} [options] - Creation options (for backward compatibility)
 * @param {string} [options.user_base_directory] - Override user base directory
 * @param {string} [options.system_base_directory] - Override system base directory
 * @returns {string} - Appropriate base_uri
 */
export function create_base_uri_from_path(absolute_path, options = {}) {
  // Try to use registry first, fall back to options or config
  let user_base_directory, system_base_directory

  try {
    system_base_directory =
      options.system_base_directory || get_system_base_directory()
  } catch {
    system_base_directory =
      options.system_base_directory || config.system_base_directory
  }

  try {
    user_base_directory =
      options.user_base_directory || get_user_base_directory()
  } catch {
    user_base_directory =
      options.user_base_directory || config.user_base_directory
  }

  // Check system directory FIRST (it may be nested inside user directory)
  if (
    system_base_directory &&
    is_path_within_directory(absolute_path, system_base_directory)
  ) {
    const relative_path = path.relative(system_base_directory, absolute_path)
    return create_system_uri(relative_path)
  }

  // Check if path is within user directory
  if (
    user_base_directory &&
    is_path_within_directory(absolute_path, user_base_directory)
  ) {
    const relative_path = path.relative(user_base_directory, absolute_path)
    return create_user_uri(relative_path)
  }

  // External paths are not supported - only managed repositories
  throw new Error(
    `Path outside managed repositories not supported: ${absolute_path}`
  )
}

/**
 * Asynchronously realpath a resolved storage path and verify it still sits
 * inside storage.root_dir. Defense-in-depth against symlink escapes; the
 * initial resolve_base_uri call already enforced lexical containment.
 *
 * @param {string} resolved_path - Path returned by resolve_base_uri for a storage: URI
 * @returns {Promise<string>} - Realpath-resolved absolute path
 */
export async function verify_storage_realpath(resolved_path) {
  const { realpath } = await import('fs/promises')
  const storage_root = config.storage && config.storage.root_dir
  if (!storage_root) throw new Error('Storage root_dir not configured')
  const real = await realpath(resolved_path)
  const real_root = await realpath(storage_root)
  if (!is_path_within_directory(real, real_root)) {
    throw new Error(`Symlink escape detected: ${resolved_path}`)
  }
  return real
}

// Default export with all utilities
export default {
  create_system_uri,
  create_user_uri,
  parse_base_uri,
  is_valid_base_uri,
  resolve_base_uri,
  create_base_uri_from_path,
  create_base_uri_from_git_file,
  verify_storage_realpath
}
