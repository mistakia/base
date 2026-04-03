#!/usr/bin/env bun

/**
 * Sync Embedded Index CLI
 *
 * Manual sync tool with server detection and multiple sync modes.
 *
 * Usage:
 *   bun cli/sync-embedded-index.mjs [options]
 *
 * Options:
 *   --incremental   Git-based change detection only (default)
 *   --resync        Update-in-place full scan with orphan cleanup
 *   --reset         Destructive drop and rebuild (for schema changes/corruption)
 *   --status        Show current sync status
 *   --verbose       Verbose output
 *   --help          Show help
 */

import fs from 'fs/promises'
import path from 'path'

import config from '#config'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { get_all_index_metadata } from '#libs-server/embedded-database-index/sqlite/sqlite-metadata-operations.mjs'
import {
  write_sync_trigger,
  poll_for_sync_result,
  RESULT_FILE_NAME
} from '#libs-server/embedded-database-index/sync/sync-trigger-handler.mjs'

const SERVER_LOCK_FILE = '.server-lock'

/**
 * Parse command line arguments
 */
function parse_args() {
  const args = process.argv.slice(2)
  const options = {
    mode: 'incremental',
    status_only: false,
    verbose: false,
    help: false
  }

  for (const arg of args) {
    switch (arg) {
      case '--incremental':
        options.mode = 'incremental'
        break
      case '--resync':
        options.mode = 'resync'
        break
      case '--reset':
        options.mode = 'reset'
        break
      case '--status':
        options.status_only = true
        break
      case '--verbose':
      case '-v':
        options.verbose = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`)
          options.help = true
        }
    }
  }

  return options
}

/**
 * Print help message
 */
function print_help() {
  console.log(`
Sync Embedded Index CLI

Usage:
  bun cli/sync-embedded-index.mjs [options]

Options:
  --incremental   Git-based change detection only (default)
  --resync        Update-in-place full scan with orphan cleanup
  --reset         Destructive drop and rebuild (for schema changes/corruption)
  --status        Show current sync status (read metadata)
  --verbose, -v   Verbose output
  --help, -h      Show this help

Examples:
  bun cli/sync-embedded-index.mjs                 # Incremental sync (default)
  bun cli/sync-embedded-index.mjs --resync        # Full resync with orphan cleanup
  bun cli/sync-embedded-index.mjs --reset         # Drop and rebuild everything
  bun cli/sync-embedded-index.mjs --status        # Show sync status
`)
}

/**
 * Check if server is running by looking for lock file.
 *
 * Note: Uses process.kill(pid, 0) to check if process is running, which has
 * a TOCTOU race condition (process could terminate between check and use).
 * This is acceptable for this use case since worst case is either:
 * - We write a trigger file to a non-running server (detected by timeout)
 * - We try direct access when server just started (will fail on DB lock)
 *
 * @returns {Promise<Object|null>} Lock file data or null if not running
 */
async function check_server_lock_file() {
  const lock_path = path.join(
    config.user_base_directory,
    'embedded-database-index',
    SERVER_LOCK_FILE
  )

  try {
    const content = await fs.readFile(lock_path, 'utf-8')
    const lock_data = JSON.parse(content)

    // Validate lock file has required fields
    if (!lock_data.pid) {
      console.log('Invalid lock file format (missing pid), removing...')
      await fs.unlink(lock_path)
      return null
    }

    // Verify the process is still running
    try {
      process.kill(lock_data.pid, 0)
      return lock_data
    } catch {
      // Process not running, lock file is stale
      console.log('Stale lock file detected (PID not running), removing...')
      await fs.unlink(lock_path)
      return null
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * Trigger sync via file-based IPC (when server is running)
 */
async function trigger_sync_via_server({ mode, verbose }) {
  const trigger_directory = path.join(
    config.user_base_directory,
    'embedded-database-index'
  )

  console.log(`Triggering ${mode} sync via server...`)

  // Write trigger file
  const request_id = await write_sync_trigger({
    trigger_directory,
    request_type: mode
  })

  if (verbose) {
    console.log(`Request ID: ${request_id}`)
  }

  // Poll for result
  const result_path = path.join(trigger_directory, RESULT_FILE_NAME)
  console.log('Waiting for sync to complete...')

  const result = await poll_for_sync_result({
    result_path,
    request_id,
    timeout_ms: 900000, // 15 minutes for full resync on spinning disks
    poll_interval_ms: 500
  })

  if (!result) {
    console.error('Timeout waiting for sync result')
    process.exit(1)
  }

  return result
}

/**
 * Run sync directly (when server is not running)
 */
async function run_sync_directly({ mode, verbose }) {
  console.log(`Running ${mode} sync directly (server not running)...`)

  // Initialize index manager
  await embedded_index_manager.initialize()

  if (!embedded_index_manager.is_ready()) {
    console.error('Failed to initialize embedded index')
    await embedded_index_manager.shutdown()
    process.exit(1)
  }

  // Perform sync
  const result = await embedded_index_manager.perform_sync({ mode })

  // Shutdown
  await embedded_index_manager.shutdown()

  return result
}

/**
 * Show current sync status
 */
async function show_status({ verbose }) {
  console.log('Checking sync status...\n')

  // Check server status
  const lock_data = await check_server_lock_file()
  if (lock_data) {
    console.log(
      `Server Status: Running (PID: ${lock_data.pid}, Port: ${lock_data.port})`
    )
    console.log(`Started: ${lock_data.started_at}`)
  } else {
    console.log('Server Status: Not running')
  }

  console.log('')

  // Try to read metadata
  try {
    // Initialize just enough to read metadata
    await embedded_index_manager.initialize()

    if (!embedded_index_manager.is_sqlite_ready()) {
      console.log('SQLite Status: Not available')
      await embedded_index_manager.shutdown()
      return
    }

    console.log('DuckDB Status: Ready')

    const metadata = await get_all_index_metadata()

    if (Object.keys(metadata).length === 0) {
      console.log('Sync Metadata: Not yet initialized')
    } else {
      console.log('\nSync Metadata:')
      console.log(`  Schema Version: ${metadata.schema_version || 'unknown'}`)
      console.log(`  Last Sync SHA: ${metadata.last_sync_commit_sha || 'none'}`)
      console.log(
        `  Last Sync Time: ${metadata.last_sync_timestamp || 'never'}`
      )

      if (verbose && metadata.sync_state) {
        console.log(`  Sync State: ${metadata.sync_state}`)
      }
    }

    await embedded_index_manager.shutdown()
  } catch (error) {
    console.error(`Error reading status: ${error.message}`)
    try {
      await embedded_index_manager.shutdown()
    } catch {
      // Ignore shutdown errors
    }
  }
}

/**
 * Print sync result
 */
function print_result({ result, verbose }) {
  console.log('')

  if (result.success) {
    console.log(`Sync completed successfully (method: ${result.method})`)
  } else {
    console.error(`Sync failed: ${result.error || 'unknown error'}`)
  }

  if (result.stats && Object.keys(result.stats).length > 0) {
    console.log('\nStatistics:')
    for (const [key, value] of Object.entries(result.stats)) {
      if (value !== undefined) {
        // Format snake_case to Title Case
        const formatted_key = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
        console.log(`  ${formatted_key}: ${value}`)
      }
    }
  }

  if (verbose && result.completed_at) {
    console.log(`\nCompleted at: ${result.completed_at}`)
  }
}

/**
 * Main entry point
 */
async function main() {
  const options = parse_args()

  if (options.help) {
    print_help()
    process.exit(0)
  }

  if (options.status_only) {
    await show_status({ verbose: options.verbose })
    process.exit(0)
  }

  // Check if server is running
  const server_lock_data = await check_server_lock_file()
  const server_running = server_lock_data !== null

  let result

  if (server_running) {
    if (options.verbose) {
      console.log('Server is running, using trigger file IPC')
    }
    result = await trigger_sync_via_server({
      mode: options.mode,
      verbose: options.verbose
    })
  } else {
    if (options.verbose) {
      console.log('Server is not running, using direct database access')
    }
    result = await run_sync_directly({
      mode: options.mode,
      verbose: options.verbose
    })
  }

  print_result({ result, verbose: options.verbose })
  process.exit(result.success ? 0 : 1)
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`)
  process.exit(1)
})
