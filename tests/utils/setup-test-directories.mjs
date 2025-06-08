/**
 * Test directory setup utilities for base_uri registry
 */

import {
  register_base_directories,
  clear_registered_directories
} from '#libs-server/base-uri/index.mjs'
import create_temp_test_directory from './create-temp-test-directory.mjs'

/**
 * Setup test directories and register them with the base_uri registry
 * @param {Object} options - Setup options
 * @param {string} [options.system_prefix='test-system-'] - Prefix for system directory
 * @param {string} [options.user_prefix='test-user-'] - Prefix for user directory
 * @returns {Object} Object with directory paths and cleanup function
 */
export function setup_test_directories({
  system_prefix = 'test-system-',
  user_prefix = 'test-user-'
} = {}) {
  // Clear any existing registrations
  clear_registered_directories()

  // Create temporary directories
  const system_dir = create_temp_test_directory(system_prefix)
  const user_dir = create_temp_test_directory(user_prefix)

  // Register directories
  register_base_directories({
    system_base_directory: system_dir.path,
    user_base_directory: user_dir.path
  })

  // Combined cleanup function
  const cleanup = () => {
    clear_registered_directories()
    system_dir.cleanup()
    user_dir.cleanup()
  }

  return {
    system_path: system_dir.path,
    user_path: user_dir.path,
    cleanup
  }
}

/**
 * Setup function for tests that need registry but already have directories
 * @param {Object} directories - Directory paths to register
 * @param {string} directories.system_base_directory - System directory path
 * @param {string} directories.user_base_directory - User directory path
 * @returns {Function} Cleanup function that clears the registry
 */
export function register_test_directories({
  system_base_directory,
  user_base_directory
}) {
  clear_registered_directories()

  register_base_directories({
    system_base_directory,
    user_base_directory
  })

  return () => clear_registered_directories()
}

/**
 * Setup registry for API integration tests using existing thread directories
 * This is specifically for tests that create threads and need the registry
 * to be aware of the thread's directories for API calls
 * @param {Object} thread_info - Thread information from create_test_thread
 * @param {string} thread_info.system_base_directory - System directory path
 * @param {string} thread_info.user_base_directory - User directory path
 * @returns {Function} Cleanup function that clears the registry
 */
export function setup_api_test_registry(thread_info) {
  clear_registered_directories()

  register_base_directories({
    system_base_directory: thread_info.system_base_directory,
    user_base_directory: thread_info.user_base_directory
  })

  return () => clear_registered_directories()
}

/**
 * Global test setup function for test suites that need registry management
 * This should be called in before/beforeEach hooks
 * @param {Object} options - Setup options
 * @param {boolean} [options.clear_existing=true] - Whether to clear existing registrations
 * @param {Object} [options.directories] - Specific directories to register
 * @returns {Function} Cleanup function
 */
export function setup_test_registry({
  clear_existing = true,
  directories = null
} = {}) {
  if (clear_existing) {
    clear_registered_directories()
  }

  if (directories) {
    register_base_directories(directories)
    return () => clear_registered_directories()
  }

  // Return no-op cleanup if no directories provided
  return () => {}
}

export default setup_test_directories
