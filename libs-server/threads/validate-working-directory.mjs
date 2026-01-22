import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'

import {
  is_valid_base_uri,
  resolve_base_uri
} from '#libs-server/base-uri/index.mjs'

const log = debug('threads:validate-working-directory')

/**
 * Validate that a working directory path is safe and accessible
 *
 * Security: Prevents path traversal attacks by ensuring the directory
 * is within the user-base directory bounds
 *
 * @param {Object} params - Parameters
 * @param {string} params.working_directory - Directory path to validate
 * @param {string} params.user_base_directory - User base directory root (security boundary)
 * @returns {Promise<string>} Validated absolute path
 * @throws {Error} If path is invalid, outside bounds, or doesn't exist
 */
export default async function validate_working_directory({
  working_directory,
  user_base_directory
}) {
  validate_required_parameters({ working_directory, user_base_directory })

  // Resolve base URIs (e.g., 'user:', 'user:task/') to filesystem paths
  const resolved_working_directory = resolve_base_uri_if_needed({
    working_directory,
    user_base_directory
  })

  const resolved_paths = resolve_to_absolute_paths({
    working_directory: resolved_working_directory,
    user_base_directory
  })

  log(`Validating: ${resolved_paths.working_dir}`)
  log(`Against base: ${resolved_paths.base_dir}`)

  enforce_security_boundary(resolved_paths)
  await verify_directory_access(resolved_paths.working_dir, working_directory)
  await verify_is_directory(resolved_paths.working_dir, working_directory)

  log(`✓ Directory validated: ${resolved_paths.working_dir}`)
  return resolved_paths.working_dir
}

/**
 * Validate required parameters are provided
 */
function validate_required_parameters({
  working_directory,
  user_base_directory
}) {
  if (!working_directory) {
    throw new Error('working_directory is required')
  }

  if (!user_base_directory) {
    throw new Error('user_base_directory is required for validation')
  }
}

/**
 * Resolve base URI to filesystem path if the input is a base URI
 * Supports user: and sys: schemes (e.g., 'user:', 'user:task/', 'sys:system/')
 */
function resolve_base_uri_if_needed({
  working_directory,
  user_base_directory
}) {
  // Check if the working_directory is a base URI
  if (!is_valid_base_uri(working_directory)) {
    // Not a base URI, return as-is (assumed to be a filesystem path)
    return working_directory
  }

  log(`Resolving base URI: ${working_directory}`)

  try {
    const resolved_path = resolve_base_uri(working_directory, {
      user_base_directory
    })
    log(`Resolved to filesystem path: ${resolved_path}`)
    return resolved_path
  } catch (error) {
    log(`Failed to resolve base URI: ${error.message}`)
    throw new Error(
      `Cannot resolve working directory URI to local path: ${working_directory}`
    )
  }
}

/**
 * Resolve paths to absolute to prevent path traversal attacks
 */
function resolve_to_absolute_paths({ working_directory, user_base_directory }) {
  return {
    working_dir: path.resolve(working_directory),
    base_dir: path.resolve(user_base_directory)
  }
}

/**
 * Security check: Ensure working directory is within user-base directory
 * Prevents path traversal attacks (e.g., ../../../etc/passwd)
 */
function enforce_security_boundary({ working_dir, base_dir }) {
  if (!working_dir.startsWith(base_dir)) {
    log('✗ Security violation: directory outside base boundary')
    log(`  Working: ${working_dir}`)
    log(`  Base: ${base_dir}`)
    throw new Error('Working directory must be within user-base directory')
  }
}

/**
 * Verify directory exists and is accessible (readable and executable)
 */
async function verify_directory_access(resolved_path, original_path) {
  try {
    await fs.access(resolved_path, fs.constants.R_OK | fs.constants.X_OK)
  } catch (access_error) {
    log(`✗ Directory not accessible: ${original_path}`)
    throw new Error(
      `Working directory does not exist or is not accessible: ${original_path}`
    )
  }
}

/**
 * Verify the path is actually a directory (not a file)
 */
async function verify_is_directory(resolved_path, original_path) {
  try {
    const stats = await fs.stat(resolved_path)
    if (!stats.isDirectory()) {
      log(`✗ Path is not a directory: ${original_path}`)
      throw new Error(`Path is not a directory: ${original_path}`)
    }
  } catch (stat_error) {
    if (stat_error.message.includes('Path is not a directory')) {
      throw stat_error
    }
    log(`✗ Error checking directory: ${stat_error.message}`)
    throw new Error(`Unable to validate directory: ${original_path}`)
  }
}
