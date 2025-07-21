/**
 * Registry-based utility functions
 *
 * These functions use the registered directories to resolve paths without
 * requiring directory parameters to be passed around.
 */

import path from 'path'
import debug from 'debug'
import { parse_base_uri } from './base-uri-utilities.mjs'
import {
  get_system_base_directory,
  get_user_base_directory
} from './base-directory-registry.mjs'

const log = debug('base-uri:registry-utilities')

/**
 * Resolve base_uri to absolute filesystem path using only registered directories
 * @param {string} base_uri - The base_uri to resolve
 * @returns {string} - Absolute filesystem path
 * @throws {Error} If directories are not registered or URI scheme is unsupported
 */
export function resolve_base_uri_from_registry(base_uri) {
  const parsed = parse_base_uri(base_uri)

  switch (parsed.scheme) {
    case 'sys': {
      const system_base_directory = get_system_base_directory()
      return path.join(system_base_directory, parsed.path)
    }

    case 'user': {
      const user_base_directory = get_user_base_directory()
      return path.join(user_base_directory, parsed.path)
    }

    case 'ssh':
    case 'git':
    case 'http':
    case 'https':
      // These require special handling and cannot be resolved to local paths
      throw new Error(`Cannot resolve remote URI to local path: ${base_uri}`)

    default:
      log(`Unexpected URI scheme '${parsed.scheme}' in base URI resolution - this may indicate a coding gap`)
      throw new Error(`Unknown URI scheme: ${parsed.scheme}`)
  }
}

/**
 * Get git relative path and repository path from base_uri using registry
 * @param {string} base_uri - The base_uri to process
 * @returns {Object} - { git_relative_path, repo_path }
 * @throws {Error} If directories are not registered or scheme is unsupported
 */
export function get_git_info_from_registry(base_uri) {
  const parsed = parse_base_uri(base_uri)

  let repo_path
  const git_relative_path = parsed.path

  switch (parsed.scheme) {
    case 'sys':
      repo_path = get_system_base_directory()
      break
    case 'user':
      repo_path = get_user_base_directory()
      break
    case 'ssh':
    case 'git':
    case 'http':
    case 'https':
      throw new Error(`Unsupported scheme for git operations: ${parsed.scheme}`)
    default:
      log(`Unexpected URI scheme '${parsed.scheme}' in git operations - this may indicate a coding gap`)
      throw new Error(`Unsupported scheme for git operations: ${parsed.scheme}`)
  }

  return { git_relative_path, repo_path }
}
