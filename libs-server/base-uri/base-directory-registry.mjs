/**
 * Base Directory Registry
 *
 * Provides a centralized registry for managing base directories.
 * This allows functions to only receive base_uri parameters and resolve
 * absolute paths internally without passing multiple directory parameters.
 *
 * By default, directories from config are automatically registered.
 */

import config from '#config'
import debug from 'debug'

const log = debug('base-uri:registry')

const registered_directories = {
  system_base_directory: null,
  user_base_directory: null
}

// Auto-register config directories on module load
if (config.system_base_directory && config.user_base_directory) {
  registered_directories.system_base_directory = config.system_base_directory
  registered_directories.user_base_directory = config.user_base_directory
}

/**
 * Register base directories for the system and user repositories
 * This will override any previously registered directories (including config defaults)
 * @param {Object} directories - Directory configuration
 * @param {string} directories.system_base_directory - Path to system repository (required)
 * @param {string} directories.user_base_directory - Path to user repository (required)
 */
export function register_base_directories({
  system_base_directory,
  user_base_directory
}) {
  if (!system_base_directory || typeof system_base_directory !== 'string') {
    throw new Error('system_base_directory is required')
  }

  if (!user_base_directory || typeof user_base_directory !== 'string') {
    throw new Error('user_base_directory is required')
  }

  registered_directories.system_base_directory = system_base_directory
  registered_directories.user_base_directory = user_base_directory
}

/**
 * Register only the user base directory, keeping the current system directory
 * @param {string} user_base_directory - Path to user repository
 */
export function register_user_base_directory(user_base_directory) {
  if (!user_base_directory || typeof user_base_directory !== 'string') {
    throw new Error('user_base_directory is required')
  }
  registered_directories.user_base_directory = user_base_directory
}

/**
 * Register only the system base directory, keeping the current user directory
 * @param {string} system_base_directory - Path to system repository
 */
export function register_system_base_directory(system_base_directory) {
  if (!system_base_directory || typeof system_base_directory !== 'string') {
    throw new Error('system_base_directory is required')
  }
  registered_directories.system_base_directory = system_base_directory
}

/**
 * Add standard directory CLI options to a yargs instance
 * @param {Object} yargs_instance - The yargs instance to add options to
 * @returns {Object} The yargs instance with directory options added
 */
export function add_directory_cli_options(yargs_instance) {
  return yargs_instance
    .option('system_base_directory', {
      type: 'string',
      description: 'System base directory (for entry point usage)',
      default: undefined
    })
    .option('user_base_directory', {
      type: 'string',
      description: 'User base directory (for entry point usage)',
      default: undefined
    })
}

/**
 * Handle CLI directory registration based on parsed arguments
 * This function implements the standard pattern for entry point scripts
 * @param {Object} argv - Parsed CLI arguments from yargs
 * @param {string} [argv.system_base_directory] - System base directory from CLI
 * @param {string} [argv.user_base_directory] - User base directory from CLI
 */
export function handle_cli_directory_registration(argv) {
  // Register directories if provided (will override config defaults)
  if (argv.system_base_directory && argv.user_base_directory) {
    log('Registering both system and user base directories from CLI parameters')
    register_base_directories({
      system_base_directory: argv.system_base_directory,
      user_base_directory: argv.user_base_directory
    })
  } else if (argv.user_base_directory) {
    log('Registering user base directory from CLI parameters')
    register_user_base_directory(argv.user_base_directory)
  } else if (argv.system_base_directory) {
    log('Registering system base directory from CLI parameters')
    register_system_base_directory(argv.system_base_directory)
  }
}

/**
 * Get the registered system base directory
 * @returns {string} The registered system base directory path
 * @throws {Error} If system base directory is not registered
 */
export function get_system_base_directory() {
  if (!registered_directories.system_base_directory) {
    throw new Error('System base directory not registered')
  }
  return registered_directories.system_base_directory
}

/**
 * Get the registered user base directory
 * @returns {string} The registered user base directory path
 * @throws {Error} If user base directory is not registered
 */
export function get_user_base_directory() {
  if (!registered_directories.user_base_directory) {
    throw new Error('User base directory not registered')
  }
  return registered_directories.user_base_directory
}

/**
 * Get both registered directories
 * @returns {Object} Object containing both directory paths
 * @throws {Error} If directories are not registered
 */
export function get_registered_directories() {
  return {
    system_base_directory: get_system_base_directory(),
    user_base_directory: get_user_base_directory()
  }
}

/**
 * Clear registered directories (mainly for testing)
 */
export function clear_registered_directories() {
  registered_directories.system_base_directory = null
  registered_directories.user_base_directory = null
}
