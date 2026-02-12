import fs from 'fs/promises'
import path from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import secure_config from '@tsmx/secure-config'
import config from '#config'

const { dirname, join, resolve } = path

// Constants
const TEST_ENV = 'test'
const TEST_DIRECTORY_PATTERN = 'base_data_'
const ENTITY_DIRECTORIES = ['task', 'workflow', 'text', 'thread', 'identity', 'role']
const ENTITY_FILE_EXTENSIONS = ['.md', '.json']

/**
 * Safely executes a function with NODE_ENV temporarily unset, then restores it
 * @param {Function} fn - Function to execute
 * @returns {*} Return value of the function
 */
function with_production_env(fn) {
  const original_node_env = process.env.NODE_ENV
  delete process.env.NODE_ENV

  try {
    return fn()
  } finally {
    if (original_node_env !== undefined) {
      process.env.NODE_ENV = original_node_env
    }
  }
}

/**
 * Get the production user_base_directory from config (before test override)
 * @returns {string|null} Production user_base_directory path or null if not configured
 */
function get_production_user_base_directory() {
  try {
    return with_production_env(() => {
      const current_file = fileURLToPath(import.meta.url)
      const tests_dir = dirname(current_file)
      const base_dir = dirname(dirname(tests_dir))
      const config_dir = join(base_dir, 'config')
      const production_config = secure_config({ directory: config_dir })
      return production_config.user_base_directory || null
    })
  } catch (error) {
    // If we can't read production config, return null (validation will still work)
    return null
  }
}

/**
 * Validates that we're running in test environment
 * @throws {Error} If not in test environment
 */
function validate_test_environment() {
  if (process.env.NODE_ENV !== TEST_ENV) {
    throw new Error(
      `reset_all_tables can only run in test environment (NODE_ENV=${TEST_ENV})`
    )
  }
}

/**
 * Checks if directory is in a safe test location (tmp or has test pattern)
 * @param {string} directory_path - The directory path to check
 * @returns {boolean} True if directory is in a safe test location
 */
function is_safe_test_location(directory_path) {
  const normalized_path = resolve(directory_path)
  const normalized_tmp = resolve(tmpdir())
  const is_in_tmp = normalized_path.startsWith(normalized_tmp)
  const has_test_pattern = normalized_path.includes(TEST_DIRECTORY_PATTERN)
  return is_in_tmp || has_test_pattern
}

/**
 * Checks if directory matches or is within a blocked production path
 * @param {string} directory_path - The directory path to check
 * @param {string} blocked_path - The blocked path to check against
 * @returns {boolean} True if directory is blocked
 */
function is_blocked_path(directory_path, blocked_path) {
  const normalized_path = resolve(directory_path)
  const normalized_blocked = resolve(blocked_path)
  return (
    normalized_path === normalized_blocked ||
    normalized_path.startsWith(normalized_blocked + path.sep)
  )
}

/**
 * Safety check to ensure we're not operating on the real user-base directory
 * @param {string} directory_path - The directory path to validate
 * @throws {Error} If the directory is not a safe test directory
 */
function validate_test_directory(directory_path) {
  validate_test_environment()

  if (!is_safe_test_location(directory_path)) {
    throw new Error(
      `reset_all_tables attempted to run on non-test directory: ${directory_path}. ` +
        `Test directories must be in /tmp or contain "${TEST_DIRECTORY_PATTERN}" pattern.`
    )
  }

  const production_user_base = get_production_user_base_directory()
  if (production_user_base) {
    const blocked_paths = [production_user_base, resolve(production_user_base)]
    for (const blocked_path of blocked_paths) {
      if (is_blocked_path(directory_path, blocked_path)) {
        throw new Error(
          `reset_all_tables attempted to run on production user-base: ${directory_path}. ` +
            'This is a safety check to prevent accidental data loss.'
        )
      }
    }
  }
}

/**
 * Cleans up entity files in a specific directory
 * @param {string} dir_path - The directory path to clean
 */
async function clean_entity_directory(dir_path) {
  try {
    const files = await fs.readdir(dir_path)
    for (const file of files) {
      const should_delete = ENTITY_FILE_EXTENSIONS.some((ext) =>
        file.endsWith(ext)
      )
      if (should_delete) {
        await fs.unlink(join(dir_path, file))
      }
    }
  } catch (err) {
    // Directory might not exist, create it
    try {
      await fs.mkdir(dir_path, { recursive: true })
    } catch (mkdirErr) {
      // Ignore mkdir errors
    }
  }
}

/**
 * Cleans up all entity directories in the test directory
 * @param {string} test_directory - The test directory path
 */
async function reset_entity_directories(test_directory) {
  for (const dir of ENTITY_DIRECTORIES) {
    const dir_path = join(test_directory, dir)
    await clean_entity_directory(dir_path)
  }
}

/**
 * Resets all tables/files in the test directory
 * This function performs safety checks and cleans up test data
 */
export default async function reset_all_tables() {
  const test_directory = config.user_base_directory

  validate_test_directory(test_directory)

  try {
    await reset_entity_directories(test_directory)
  } catch (err) {
    // Ignore cleanup errors in tests
    console.warn('Test cleanup warning:', err.message)
  }
}
