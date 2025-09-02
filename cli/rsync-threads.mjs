#!/usr/bin/env node

/**
 * Rsync Threads CLI - Standalone utility for syncing thread directories
 *
 * This script provides a command-line interface for the rsync threads utility.
 * It can be called directly from the command line or by automation scripts.
 */

import {
  rsync_thread_directory,
  rsync_all_thread_directories,
  get_thread_rsync_status,
  test_thread_rsync_server_connection
} from '#libs-server/thread-rsync-utility.mjs'

/**
 * Display CLI usage information
 */
function display_usage() {
  console.log(`
Rsync Threads Utility - Standalone rsync utility for thread directory synchronization

USAGE:
  rsync-threads <command> [options]

COMMANDS:
  sync <thread-id>    Sync a specific thread directory to remote storage
  sync-all           Sync all thread directories to remote storage
  status             Show storage sync status and configuration
  test-connection    Test storage server connection and configuration
  help              Show this help message

EXAMPLES:
  rsync-threads sync a1b2c3d4-e5f6-7890-abcd-ef1234567890
  rsync-threads sync-all
  rsync-threads status
  rsync-threads test-connection

EXIT CODES:
  0    Success
  1    General error
  2    Configuration error
  3    Connection error
  4    Sync error
`)
}

/**
 * Validate thread ID format
 * @param {string} thread_id - Thread ID to validate
 * @returns {boolean} True if valid UUID format
 */
function is_valid_thread_id(thread_id) {
  if (!thread_id) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    thread_id
  )
}

/**
 * Execute sync command for a specific thread
 * @param {string} thread_id - Thread ID to sync
 * @returns {Promise<number>} Exit code
 */
async function execute_sync_thread(thread_id) {
  try {
    if (!is_valid_thread_id(thread_id)) {
      console.error(`Error: Invalid thread ID format: ${thread_id}`)
      console.error('Thread ID must be a valid UUID')
      return 1
    }

    console.log(`Syncing thread: ${thread_id}`)
    const sync_result = await rsync_thread_directory(thread_id)

    console.log('✓ Sync completed successfully')
    console.log(`  Execution time: ${sync_result.execution_time || 0}ms`)

    return 0
  } catch (error) {
    console.error(`✗ Sync failed: ${error.message}`)

    if (error.message.includes('not configured')) {
      return 2
    } else if (error.message.includes('not available')) {
      return 3
    } else {
      return 4
    }
  }
}

/**
 * Execute sync-all command
 * @returns {Promise<number>} Exit code
 */
async function execute_sync_all_threads() {
  try {
    console.log('Syncing all threads...')
    const sync_results = await rsync_all_thread_directories()

    const successful_syncs = sync_results.filter((result) => result.success)
    const failed_syncs = sync_results.filter((result) => !result.success)

    console.log('\n✓ Sync completed')
    console.log(`  Total threads: ${sync_results.length}`)
    console.log(`  Successful: ${successful_syncs.length}`)
    console.log(`  Failed: ${failed_syncs.length}`)

    if (failed_syncs.length > 0) {
      console.log('\nFailed threads:')
      failed_syncs.forEach((sync_result) => {
        console.log(`  - ${sync_result.thread_id}: ${sync_result.error}`)
      })
    }

    return failed_syncs.length > 0 ? 4 : 0
  } catch (error) {
    console.error(`✗ Sync all failed: ${error.message}`)

    if (error.message.includes('not configured')) {
      return 2
    } else if (error.message.includes('not available')) {
      return 3
    } else {
      return 4
    }
  }
}

/**
 * Execute status command
 * @returns {Promise<number>} Exit code
 */
async function execute_status_check() {
  try {
    console.log('Thread Rsync Status')
    console.log('===================')

    const sync_status = await get_thread_rsync_status()

    console.log(
      `Configuration: ${sync_status.configured ? '✓ Configured' : '✗ Not configured'}`
    )
    console.log(
      `Server Status: ${sync_status.server_available ? '✓ Available' : '✗ Not available'}`
    )
    console.log(`Message: ${sync_status.message}`)

    if (sync_status.configured && sync_status.config) {
      console.log('\nConfiguration Details:')
      console.log(`  Host: ${sync_status.config.host}`)
      console.log(`  User: ${sync_status.config.user}`)
      console.log(`  Remote Path: ${sync_status.config.remote_path}`)
      console.log(
        `  Max Concurrent: ${sync_status.config.max_concurrent_syncs}`
      )
    }

    if (sync_status.error) {
      console.log(`\nError: ${sync_status.error}`)
    }

    return 0
  } catch (error) {
    console.error(`✗ Status check failed: ${error.message}`)
    return 1
  }
}

/**
 * Execute test-connection command
 * @returns {Promise<number>} Exit code
 */
async function execute_connection_test() {
  try {
    console.log('Testing thread rsync server connection...')

    const test_result = await test_thread_rsync_server_connection()

    console.log(
      `Configuration: ${test_result.configured ? '✓ Valid' : '✗ Not configured'}`
    )
    console.log(
      `Server Connection: ${test_result.server_available ? '✓ Available' : '✗ Not available'}`
    )
    console.log(`Message: ${test_result.message}`)

    if (test_result.configured && test_result.config) {
      console.log('\nConnection Details:')
      console.log(`  Host: ${test_result.config.host}`)
      console.log(`  User: ${test_result.config.user}`)
      console.log(`  Remote Path: ${test_result.config.remote_path}`)
    }

    if (test_result.error) {
      console.log(`\nError: ${test_result.error}`)
    }

    return test_result.success ? 0 : test_result.configured ? 3 : 2
  } catch (error) {
    console.error(`✗ Connection test failed: ${error.message}`)
    return 3
  }
}

/**
 * Main CLI handler
 * @returns {Promise<number>} Exit code
 */
async function run_storage_sync_cli() {
  const cli_args = process.argv.slice(2)
  const command = cli_args[0]
  const thread_id = cli_args[1]

  if (!command) {
    display_usage()
    return 1
  }

  switch (command) {
    case 'sync':
      if (!thread_id) {
        console.error('Error: Thread ID is required for sync command')
        console.error('Usage: rsync-threads sync <thread-id>')
        return 1
      }
      return await execute_sync_thread(thread_id)

    case 'sync-all':
      return await execute_sync_all_threads()

    case 'status':
      return await execute_status_check()

    case 'test-connection':
      return await execute_connection_test()

    case 'help':
    case '--help':
    case '-h':
      display_usage()
      return 0

    default:
      console.error(`Error: Unknown command: ${command}`)
      display_usage()
      return 1
  }
}

/**
 * Main entry point for the CLI script
 */
async function main() {
  try {
    const exit_code = await run_storage_sync_cli()
    process.exit(exit_code)
  } catch (error) {
    console.error('Fatal error:', error.message)
    process.exit(1)
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message)
  process.exit(1)
})

// Run the main function
main()
