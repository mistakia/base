import path from 'path'
import { EventEmitter } from 'events'
import chokidar from 'chokidar'
import debug from 'debug'

import {
  get_storage_server_config,
  get_sync_file_watching_config
} from './config.mjs'
import { execute_shell_command } from '#libs-server/utils/index.mjs'
import { directory_exists_in_filesystem } from '#libs-server/filesystem/index.mjs'

const log = debug('claude-session-import-service:storage-sync')

/**
 * Storage sync states
 */
export const STORAGE_SYNC_STATES = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  MONITORING: 'monitoring',
  STOPPING: 'stopping',
  ERROR: 'error'
}

/**
 * Storage synchronization class for monitoring thread directory changes
 * and syncing them to remote storage server using rsync
 */
export class StorageSync extends EventEmitter {
  constructor({ thread_directory }) {
    super()

    this.thread_directory = thread_directory
    this.sync_state = STORAGE_SYNC_STATES.STOPPED
    this.storage_server_config = null
    this.file_watching_config = null
    this.chokidar_watcher = null
    this.sync_queue = []
    this.current_syncing = new Set()
    this.sync_debounce_timers = new Map()
    this.sync_stats = {
      syncs_attempted: 0,
      syncs_completed: 0,
      syncs_failed: 0,
      bytes_transferred: 0,
      last_sync_at: null,
      last_failure_at: null
    }
    this.server_availability_checked_at = null
    this.server_available = null

    // Bind methods for event handlers
    this.handle_thread_directory_change =
      this.handle_thread_directory_change.bind(this)
    this.handle_watcher_ready = this.handle_watcher_ready.bind(this)
    this.handle_watcher_error = this.handle_watcher_error.bind(this)
  }

  /**
   * Get current sync state
   * @returns {string} Current sync state
   */
  get_sync_state() {
    return this.sync_state
  }

  /**
   * Get sync statistics
   * @returns {Object} Sync statistics
   */
  get_sync_stats() {
    return { ...this.sync_stats }
  }

  /**
   * Get current sync queue size
   * @returns {number} Number of pending sync operations
   */
  get_sync_queue_size() {
    return this.sync_queue.length
  }

  /**
   * Check if storage server is configured
   * @returns {boolean} True if storage server is configured
   */
  is_storage_server_configured() {
    return this.storage_server_config !== null
  }

  /**
   * Start storage synchronization monitoring
   * @returns {Promise<void>}
   */
  async start_sync_monitoring() {
    if (this.sync_state !== STORAGE_SYNC_STATES.STOPPED) {
      throw new Error(
        `Cannot start sync monitoring from state: ${this.sync_state}`
      )
    }

    try {
      this.set_sync_state(STORAGE_SYNC_STATES.STARTING)

      log('Starting storage sync monitoring...')

      // Load configuration
      this.storage_server_config = get_storage_server_config()
      this.file_watching_config = get_sync_file_watching_config()

      if (!this.storage_server_config) {
        log('Storage server not configured, sync monitoring disabled')
        this.set_sync_state(STORAGE_SYNC_STATES.STOPPED)
        return
      }

      // Validate local thread directory
      await this.validate_local_directory()

      // Check server availability
      await this.check_server_availability()

      // Initialize file watcher for thread directory
      await this.initialize_thread_directory_watcher()

      log('Storage sync monitoring started')
    } catch (error) {
      this.set_sync_state(STORAGE_SYNC_STATES.ERROR)
      log('Storage sync monitoring startup failed:', error.message)
      throw error
    }
  }

  /**
   * Stop storage synchronization monitoring
   * @returns {Promise<void>}
   */
  async stop_sync_monitoring() {
    if (this.sync_state === STORAGE_SYNC_STATES.STOPPED) {
      log('Storage sync monitoring already stopped')
      return
    }

    try {
      this.set_sync_state(STORAGE_SYNC_STATES.STOPPING)

      log('Stopping storage sync monitoring...')

      // Close file watcher
      if (this.chokidar_watcher) {
        await this.chokidar_watcher.close()
        this.chokidar_watcher = null
      }

      // Wait for pending syncs to complete
      if (this.current_syncing.size > 0) {
        log(
          `Waiting for ${this.current_syncing.size} pending syncs to complete...`
        )
        await this.wait_for_pending_syncs()
      }

      // Clear sync queue
      this.sync_queue = []

      this.set_sync_state(STORAGE_SYNC_STATES.STOPPED)

      log('Storage sync monitoring stopped')
    } catch (error) {
      this.set_sync_state(STORAGE_SYNC_STATES.ERROR)
      log('Storage sync monitoring shutdown failed:', error.message)
      throw error
    }
  }

  /**
   * Manually trigger sync for a specific thread directory
   * @param {string} thread_id - Thread ID to sync
   * @returns {Promise<void>}
   */
  async sync_thread_directory(thread_id) {
    if (!this.storage_server_config) {
      throw new Error('Storage server not configured')
    }

    const thread_dir_path = path.join(this.thread_directory, thread_id)

    // Validate thread directory exists
    const dir_exists = await directory_exists_in_filesystem({
      absolute_path: thread_dir_path
    })
    if (!dir_exists) {
      throw new Error(`Thread directory not found: ${thread_dir_path}`)
    }

    // Queue the sync
    await this.queue_sync_operation({
      thread_id,
      thread_path: thread_dir_path,
      event_type: 'manual',
      timestamp: Date.now()
    })
  }

  /**
   * Queue a sync operation
   * @private
   * @param {Object} sync_operation - Sync operation details
   */
  async queue_sync_operation(sync_operation) {
    const { thread_id } = sync_operation

    // Check if thread is already being synced
    if (this.current_syncing.has(thread_id)) {
      log(`Thread ${thread_id} is already being synced, skipping`)
      return
    }

    // Check if thread is already in queue
    const existing_index = this.sync_queue.findIndex(
      (item) => item.thread_id === thread_id
    )

    if (existing_index !== -1) {
      // Update existing queue item
      this.sync_queue[existing_index] = {
        ...this.sync_queue[existing_index],
        ...sync_operation,
        updated_at: Date.now()
      }
      log(`Updated existing sync queue item for thread: ${thread_id}`)
    } else {
      // Add new queue item
      this.sync_queue.push({
        ...sync_operation,
        queued_at: Date.now(),
        retry_count: 0
      })
      log(`Queued sync operation for thread: ${thread_id}`)
    }

    // Process queue
    this.process_sync_queue()
  }

  /**
   * Process the sync queue
   * @private
   */
  async process_sync_queue() {
    const max_concurrent = this.storage_server_config.max_concurrent_syncs || 3

    // Process queue while we have capacity and items
    while (
      this.current_syncing.size < max_concurrent &&
      this.sync_queue.length > 0
    ) {
      const sync_item = this.sync_queue.shift()

      // Start sync operation (don't await - run concurrently)
      this.execute_sync_operation(sync_item).catch((error) => {
        log(
          `Sync operation failed for thread ${sync_item.thread_id}:`,
          error.message
        )
      })
    }
  }

  /**
   * Execute a sync operation
   * @private
   * @param {Object} sync_item - Sync item from queue
   */
  async execute_sync_operation(sync_item) {
    const { thread_id, thread_path, retry_count = 0 } = sync_item

    this.current_syncing.add(thread_id)

    try {
      log(`Starting sync for thread: ${thread_id}`)

      // Check server availability before sync
      if (!(await this.check_server_availability())) {
        throw new Error('Storage server is not available')
      }

      // Emit sync started event
      this.emit('sync-started', {
        thread_id,
        thread_path,
        timestamp: Date.now()
      })

      // Execute rsync command
      const sync_result = await this.execute_rsync_command(
        thread_path,
        thread_id
      )

      // Update stats
      this.sync_stats.syncs_attempted++
      this.sync_stats.syncs_completed++
      this.sync_stats.last_sync_at = Date.now()

      if (sync_result.bytes_transferred) {
        this.sync_stats.bytes_transferred += sync_result.bytes_transferred
      }

      // Emit sync completed event
      this.emit('sync-completed', {
        thread_id,
        thread_path,
        sync_result,
        timestamp: Date.now()
      })

      log(`Sync completed for thread: ${thread_id}`, sync_result)
    } catch (error) {
      log(`Sync failed for thread ${thread_id}:`, error.message)

      this.sync_stats.syncs_attempted++
      this.sync_stats.syncs_failed++
      this.sync_stats.last_failure_at = Date.now()

      // Handle retry logic
      const max_retries = 3
      if (retry_count < max_retries) {
        const retry_delay = 1000 * Math.pow(2, retry_count) // Exponential backoff

        setTimeout(() => {
          this.sync_queue.push({
            ...sync_item,
            retry_count: retry_count + 1
          })
          this.process_sync_queue()
        }, retry_delay)

        log(
          `Thread ${thread_id} queued for retry ${retry_count + 1}/${max_retries} in ${retry_delay}ms`
        )
      } else {
        // Max retries exceeded
        this.emit('sync-failed', {
          thread_id,
          thread_path,
          error: error.message,
          retry_count,
          timestamp: Date.now()
        })

        log(
          `Thread ${thread_id} sync failed permanently after ${retry_count} retries`
        )
      }
    } finally {
      this.current_syncing.delete(thread_id)
    }
  }

  /**
   * Execute rsync command for thread directory
   * @private
   * @param {string} thread_path - Local path to thread directory
   * @param {string} thread_id - Thread ID for remote path
   * @returns {Promise<Object>} Rsync result
   */
  async execute_rsync_command(thread_path, thread_id) {
    const { host, user, remote_path, sync_timeout_ms } =
      this.storage_server_config

    // Construct remote thread path
    const remote_thread_path = path.posix.join(remote_path, 'thread', thread_id)

    const timeout_seconds = Math.ceil((sync_timeout_ms || 30000) / 1000)

    const rsync_args = [
      'rsync',
      '-avz',
      this.storage_server_config.rsync_delete ? '--delete' : null,
      `--timeout=${timeout_seconds}`,
      '--partial',
      '--human-readable',
      '--stats',
      `${thread_path}/`,
      `${user}@${host}:${remote_thread_path}/`
    ].filter(Boolean)

    const rsync_command = rsync_args.join(' ')

    log(`Executing rsync command: ${rsync_command}`)

    try {
      const result = await execute_shell_command(rsync_command, {
        timeout: sync_timeout_ms || 30000,
        cwd: this.thread_directory
      })

      // Parse rsync output for statistics
      const bytes_transferred = this.parse_rsync_bytes_transferred(
        result.stdout
      )

      return {
        success: true,
        bytes_transferred,
        stdout: result.stdout,
        stderr: result.stderr,
        execution_time: result.execution_time
      }
    } catch (error) {
      log(`Rsync command failed: ${error.message}`)
      throw new Error(`Rsync failed: ${error.message}`)
    }
  }

  /**
   * Parse bytes transferred from rsync output
   * @private
   * @param {string} rsync_output - Rsync stdout output
   * @returns {number} Number of bytes transferred
   */
  parse_rsync_bytes_transferred(rsync_output) {
    try {
      // Look for rsync transfer summary line
      const transfer_match = rsync_output.match(
        /sent\s+[\d,]+\s+bytes\s+received\s+([\d,]+)\s+bytes/
      )
      if (transfer_match) {
        return parseInt(transfer_match[1].replace(/,/g, ''), 10)
      }
      const total_size_match = rsync_output.match(/total size is\s+([\d,]+)/i)
      if (total_size_match) {
        return parseInt(total_size_match[1].replace(/,/g, ''), 10)
      }
      return 0
    } catch (error) {
      log('Error parsing rsync bytes transferred:', error.message)
      return 0
    }
  }

  /**
   * Check storage server availability
   * @private
   * @returns {Promise<boolean>} True if server is available
   */
  async check_server_availability() {
    if (!this.storage_server_config) {
      return false
    }

    // Cache server availability check for 1 minute
    const cache_duration = 60000
    if (
      this.server_availability_checked_at &&
      Date.now() - this.server_availability_checked_at < cache_duration
    ) {
      return this.server_available
    }

    const { host, user, ssh_strict_host_key_checking } =
      this.storage_server_config

    try {
      log(`Checking server availability: ${user}@${host}`)

      // Simple SSH connection test
      const strict_flag = ssh_strict_host_key_checking ? 'yes' : 'no'
      const ssh_test_command = `ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=${strict_flag} ${user}@${host} 'echo "connection_test"'`

      const result = await execute_shell_command(ssh_test_command, {
        timeout: 10000
      })

      this.server_available = result.stdout.includes('connection_test')
      this.server_availability_checked_at = Date.now()

      if (this.server_available) {
        log('Storage server is available')
      } else {
        log('Storage server connection test failed')
      }

      return this.server_available
    } catch (error) {
      log(`Server availability check failed: ${error.message}`)
      this.server_available = false
      this.server_availability_checked_at = Date.now()
      return false
    }
  }

  /**
   * Validate local thread directory
   * @private
   */
  async validate_local_directory() {
    const dir_exists = await directory_exists_in_filesystem({
      absolute_path: this.thread_directory
    })
    if (!dir_exists) {
      throw new Error(`Thread directory not found: ${this.thread_directory}`)
    }

    log(`Thread directory validated: ${this.thread_directory}`)
  }

  /**
   * Initialize thread directory watcher
   * @private
   */
  async initialize_thread_directory_watcher() {
    const watch_pattern = path.join(this.thread_directory, '*')

    const chokidar_options = {
      ignored: this.file_watching_config.ignore_patterns,
      persistent: true,
      ignoreInitial: true, // Don't sync existing files on startup
      followSymlinks: false,
      cwd: this.thread_directory,
      depth: 2, // Watch thread directories and their files
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Wait 1 second after write stops
        pollInterval: 200
      }
    }

    log('Initializing thread directory watcher with options:', chokidar_options)

    this.chokidar_watcher = chokidar.watch(watch_pattern, chokidar_options)

    // Register event handlers
    this.chokidar_watcher
      .on('addDir', this.handle_thread_directory_change)
      .on('change', this.handle_thread_directory_change)
      .on('add', this.handle_thread_directory_change)
      .on('ready', this.handle_watcher_ready)
      .on('error', this.handle_watcher_error)

    // Wait for ready event
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Thread directory watcher initialization timeout'))
      }, 10000)

      this.chokidar_watcher.once('ready', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.chokidar_watcher.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  /**
   * Handle thread directory change event
   * @private
   * @param {string} changed_path - Path that changed
   */
  handle_thread_directory_change(changed_path) {
    console.log({
      changed_path
    })
    // Extract thread ID from path
    const relative_path = path.relative(this.thread_directory, changed_path)
    const thread_id = relative_path.split(path.sep)[0]

    // Validate thread ID format (should be UUID)
    if (
      !thread_id.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    ) {
      return // Not a thread directory
    }

    const thread_path = path.join(this.thread_directory, thread_id)

    log(`Thread directory changed: ${thread_id}`)

    // Queue sync operation with per-thread debouncing
    const delay = this.storage_server_config.debounce_ms || 1000
    if (this.sync_debounce_timers.has(thread_id)) {
      clearTimeout(this.sync_debounce_timers.get(thread_id))
    }
    const timer = setTimeout(() => {
      this.sync_debounce_timers.delete(thread_id)
      this.queue_sync_operation({
        thread_id,
        thread_path,
        event_type: 'change',
        timestamp: Date.now()
      })
    }, delay)
    this.sync_debounce_timers.set(thread_id, timer)
  }

  /**
   * Handle watcher ready event
   * @private
   */
  handle_watcher_ready() {
    this.set_sync_state(STORAGE_SYNC_STATES.MONITORING)

    log('Thread directory watcher ready')

    this.emit('sync-monitoring-ready', {
      thread_directory: this.thread_directory,
      timestamp: Date.now()
    })
  }

  /**
   * Handle watcher error event
   * @private
   * @param {Error} error - Watcher error
   */
  handle_watcher_error(error) {
    this.set_sync_state(STORAGE_SYNC_STATES.ERROR)

    log('Thread directory watcher error:', error.message)

    this.emit('sync-monitoring-error', {
      error: error.message,
      timestamp: Date.now()
    })
  }

  /**
   * Wait for pending syncs to complete
   * @private
   * @returns {Promise<void>}
   */
  async wait_for_pending_syncs() {
    const timeout = 30000 // 30 seconds timeout
    const start_time = Date.now()

    while (this.current_syncing.size > 0) {
      if (Date.now() - start_time > timeout) {
        log('Timeout waiting for pending syncs')
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  /**
   * Set sync state and emit event
   * @private
   * @param {string} new_state - New sync state
   */
  set_sync_state(new_state) {
    const previous_state = this.sync_state
    this.sync_state = new_state

    log(`Storage sync state changed: ${previous_state} -> ${new_state}`)

    this.emit('state-changed', {
      previous_state,
      current_state: new_state,
      timestamp: Date.now()
    })
  }

  /**
   * Perform health check
   * @returns {Promise<Object>} Health check results
   */
  async perform_health_check() {
    const health_status = {
      timestamp: Date.now(),
      state: this.sync_state,
      configured: this.is_storage_server_configured(),
      server_available: this.server_available,
      stats: this.get_sync_stats(),
      queue_size: this.get_sync_queue_size(),
      current_syncing_count: this.current_syncing.size,
      issues: []
    }

    if (!this.is_storage_server_configured()) {
      health_status.issues.push('Storage server not configured')
    } else {
      // Check sync state
      if (this.sync_state === STORAGE_SYNC_STATES.ERROR) {
        health_status.issues.push('Storage sync in error state')
      }

      // Check server availability
      if (this.server_available === false) {
        health_status.issues.push('Storage server is not available')
      }

      // Check for excessive queue size
      if (this.sync_queue.length > 20) {
        health_status.issues.push(
          `Sync queue is large: ${this.sync_queue.length} items`
        )
      }

      // Check failure rate
      const total_attempted = this.sync_stats.syncs_attempted
      if (total_attempted > 0) {
        const failure_rate = this.sync_stats.syncs_failed / total_attempted
        if (failure_rate > 0.2) {
          // More than 20% failure rate
          health_status.issues.push(
            `High sync failure rate: ${Math.round(failure_rate * 100)}%`
          )
        }
      }
    }

    health_status.healthy = health_status.issues.length === 0

    return health_status
  }
}
