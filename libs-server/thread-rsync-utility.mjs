import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'

import config from '#config'
import { execute_shell_command } from '#libs-server/utils/index.mjs'
import { directory_exists_in_filesystem } from '#libs-server/filesystem/index.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

const thread_rsync_log = debug('thread-rsync')

/**
 * Get thread rsync server configuration from main config
 * @returns {Object|null} Thread rsync server config or null if not configured
 */
function get_thread_rsync_server_config() {
  const service_config = config.claude_session_import_service || {}
  const storage_config = service_config.storage_server || {}

  if (!storage_config.host) {
    return null
  }

  return {
    host: storage_config.host,
    user: storage_config.user,
    remote_path: storage_config.remote_path,
    sync_timeout_ms: storage_config.sync_timeout_ms || 30000,
    max_concurrent_syncs: storage_config.max_concurrent_syncs || 3,
    rsync_delete: storage_config.rsync_delete !== false,
    ssh_strict_host_key_checking:
      storage_config.ssh_strict_host_key_checking || false
  }
}

/**
 * Get all thread directory IDs
 * @returns {Promise<string[]>} Array of thread IDs (UUIDs)
 */
async function get_all_thread_ids() {
  const thread_directory = path.join(get_user_base_directory(), 'thread')

  try {
    const thread_entries = await fs.readdir(thread_directory, {
      withFileTypes: true
    })

    return thread_entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((thread_name) =>
        // Validate UUID format
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          thread_name
        )
      )
  } catch (error) {
    thread_rsync_log('Error reading thread directory:', error.message)
    return []
  }
}

/**
 * Execute rsync command for a thread directory
 * @param {Object} params - Parameters
 * @param {string} params.thread_id - Thread ID to sync
 * @param {Object} params.rsync_config - Thread rsync server configuration
 * @returns {Promise<Object>} Rsync result
 */
async function execute_thread_rsync({ thread_id, rsync_config }) {
  const thread_directory = path.join(get_user_base_directory(), 'thread')
  const thread_path = path.join(thread_directory, thread_id)

  // Validate thread directory exists
  const thread_exists = await directory_exists_in_filesystem({
    absolute_path: thread_path
  })

  if (!thread_exists) {
    throw new Error(`Thread directory not found: ${thread_path}`)
  }

  const { host, user, remote_path, sync_timeout_ms, rsync_delete } =
    rsync_config

  // Construct remote thread path
  const remote_thread_path = path.posix.join(remote_path, 'thread', thread_id)
  const timeout_seconds = Math.ceil(sync_timeout_ms / 1000)

  const rsync_command_args = [
    'rsync',
    '-avz',
    rsync_delete ? '--delete' : null,
    `--timeout=${timeout_seconds}`,
    '--partial',
    '--human-readable',
    '--stats',
    `${thread_path}/`,
    `${user}@${host}:${remote_thread_path}/`
  ].filter(Boolean)

  const rsync_command = rsync_command_args.join(' ')

  thread_rsync_log(`Executing rsync for thread ${thread_id}:`, rsync_command)

  try {
    const rsync_result = await execute_shell_command(rsync_command, {
      timeout: sync_timeout_ms,
      cwd: thread_directory
    })

    return {
      thread_id,
      success: true,
      stdout: rsync_result.stdout,
      stderr: rsync_result.stderr,
      execution_time: rsync_result.execution_time
    }
  } catch (error) {
    thread_rsync_log(`Rsync failed for thread ${thread_id}:`, error.message)
    throw new Error(`Thread ${thread_id} rsync failed: ${error.message}`)
  }
}

/**
 * Check if thread rsync server is available
 * @param {Object} rsync_config - Thread rsync server configuration
 * @returns {Promise<boolean>} True if server is available
 */
async function check_thread_rsync_server_availability(rsync_config) {
  const { host, user, ssh_strict_host_key_checking } = rsync_config

  try {
    thread_rsync_log(`Checking thread rsync server availability: ${user}@${host}`)

    const strict_host_key_flag = ssh_strict_host_key_checking ? 'yes' : 'no'
    const ssh_test_command = `ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=${strict_host_key_flag} ${user}@${host} 'echo "connection_test"'`

    const ssh_result = await execute_shell_command(ssh_test_command, {
      timeout: 10000
    })

    const server_available = ssh_result.stdout.includes('connection_test')

    if (server_available) {
      thread_rsync_log('Thread rsync server is available')
    } else {
      thread_rsync_log('Thread rsync server connection test failed')
    }

    return server_available
  } catch (error) {
    thread_rsync_log(
      `Thread rsync server availability check failed: ${error.message}`
    )
    return false
  }
}

/**
 * Sync a specific thread directory to remote storage
 * @param {string} thread_id - Thread ID to sync
 * @returns {Promise<Object>} Sync result
 */
export async function rsync_thread_directory(thread_id) {
  const rsync_config = get_thread_rsync_server_config()

  if (!rsync_config) {
    throw new Error('Thread rsync server not configured')
  }

  if (
    !thread_id ||
    !thread_id.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  ) {
    throw new Error('Invalid thread ID format')
  }

  return await execute_thread_rsync({ thread_id, rsync_config })
}

/**
 * Sync all thread directories to remote storage
 * @returns {Promise<Object[]>} Array of sync results
 */
export async function rsync_all_thread_directories() {
  const rsync_config = get_thread_rsync_server_config()

  if (!rsync_config) {
    throw new Error('Thread rsync server not configured')
  }

  const thread_ids = await get_all_thread_ids()
  const sync_results = []

  thread_rsync_log(`Starting rsync for ${thread_ids.length} threads`)

  // Process threads in batches to respect concurrency limits
  const max_concurrent = rsync_config.max_concurrent_syncs

  for (
    let batch_start = 0;
    batch_start < thread_ids.length;
    batch_start += max_concurrent
  ) {
    const thread_batch = thread_ids.slice(
      batch_start,
      batch_start + max_concurrent
    )

    const batch_sync_promises = thread_batch.map(async (thread_id) => {
      try {
        const sync_result = await execute_thread_rsync({
          thread_id,
          rsync_config
        })
        return sync_result
      } catch (error) {
        return {
          thread_id,
          success: false,
          error: error.message
        }
      }
    })

    const batch_results = await Promise.all(batch_sync_promises)
    sync_results.push(...batch_results)
  }

  const successful_syncs = sync_results.filter((result) => result.success)
  const failed_syncs = sync_results.filter((result) => !result.success)

  thread_rsync_log(
    `Rsync completed: ${successful_syncs.length} successful, ${failed_syncs.length} failed`
  )

  return sync_results
}

/**
 * Get thread rsync status and configuration
 * @returns {Promise<Object>} Status information
 */
export async function get_thread_rsync_status() {
  const rsync_config = get_thread_rsync_server_config()

  if (!rsync_config) {
    return {
      configured: false,
      server_available: false,
      message: 'Thread rsync server not configured'
    }
  }

  try {
    const server_available =
      await check_thread_rsync_server_availability(rsync_config)

    return {
      configured: true,
      server_available,
      config: {
        host: rsync_config.host,
        user: rsync_config.user,
        remote_path: rsync_config.remote_path,
        max_concurrent_syncs: rsync_config.max_concurrent_syncs
      },
      message: server_available
        ? 'Thread rsync server is available'
        : 'Thread rsync server is not available'
    }
  } catch (error) {
    return {
      configured: true,
      server_available: false,
      error: error.message,
      message: 'Error checking thread rsync server availability'
    }
  }
}

/**
 * Test thread rsync server connection
 * @returns {Promise<Object>} Test results
 */
export async function test_thread_rsync_server_connection() {
  const rsync_config = get_thread_rsync_server_config()

  if (!rsync_config) {
    return {
      success: false,
      configured: false,
      message: 'Thread rsync server not configured'
    }
  }

  try {
    const server_available =
      await check_thread_rsync_server_availability(rsync_config)

    return {
      success: server_available,
      configured: true,
      server_available,
      config: {
        host: rsync_config.host,
        user: rsync_config.user,
        remote_path: rsync_config.remote_path
      },
      message: server_available
        ? 'Thread rsync server connection successful'
        : 'Thread rsync server connection failed'
    }
  } catch (error) {
    return {
      success: false,
      configured: true,
      server_available: false,
      error: error.message,
      message: `Thread rsync server connection error: ${error.message}`
    }
  }
}
