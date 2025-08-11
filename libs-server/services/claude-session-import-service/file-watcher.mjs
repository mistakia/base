import path from 'path'
import { EventEmitter } from 'events'
import chokidar from 'chokidar'
import debug from 'debug'
import fs from 'fs'

import { get_file_watching_config } from './config.mjs'

const log = debug('claude-session-import-service:file-watcher')

/**
 * File watcher states
 */
export const FILE_WATCHER_STATES = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  WATCHING: 'watching',
  STOPPING: 'stopping',
  ERROR: 'error'
}

/**
 * Claude file watcher class for monitoring JSONL file changes
 * Watches the Claude projects directory for session file modifications
 */
export class ClaudeFileWatcher extends EventEmitter {
  constructor({ claude_projects_directory }) {
    super()

    this.claude_projects_directory = claude_projects_directory
    this.watcher_state = FILE_WATCHER_STATES.STOPPED
    this.chokidar_watcher = null
    this.file_watching_config = null
    this.debounce_timers = new Map()
    this.watched_files = new Set()

    // Bind methods for event handlers
    this.handle_file_add = this.handle_file_add.bind(this)
    this.handle_file_change = this.handle_file_change.bind(this)
    this.handle_file_unlink = this.handle_file_unlink.bind(this)
    this.handle_watcher_ready = this.handle_watcher_ready.bind(this)
    this.handle_watcher_error = this.handle_watcher_error.bind(this)
  }

  /**
   * Get current watcher state
   * @returns {string} Current watcher state
   */
  get_watcher_state() {
    return this.watcher_state
  }

  /**
   * Get list of currently watched files
   * @returns {Array<string>} Array of watched file paths
   */
  get_watched_files() {
    return Array.from(this.watched_files)
  }

  /**
   * Get watcher statistics
   * @returns {Object} Watcher statistics
   */
  get_watcher_stats() {
    return {
      state: this.watcher_state,
      watched_files_count: this.watched_files.size,
      debounce_timers_count: this.debounce_timers.size,
      directory: this.claude_projects_directory
    }
  }

  /**
   * Start watching for file changes
   * @returns {Promise<void>}
   */
  async start_watching() {
    if (this.watcher_state !== FILE_WATCHER_STATES.STOPPED) {
      throw new Error(`Cannot start watcher from state: ${this.watcher_state}`)
    }

    try {
      this.set_watcher_state(FILE_WATCHER_STATES.STARTING)

      log(
        `Starting file watcher for directory: ${this.claude_projects_directory}`
      )

      // Load configuration
      this.file_watching_config = get_file_watching_config()

      // Create chokidar watcher
      await this.initialize_chokidar_watcher()

      log('File watcher started successfully')
    } catch (error) {
      this.set_watcher_state(FILE_WATCHER_STATES.ERROR)
      log('File watcher startup failed:', error.message)
      throw error
    }
  }

  /**
   * Stop watching for file changes
   * @returns {Promise<void>}
   */
  async stop_watching() {
    if (this.watcher_state === FILE_WATCHER_STATES.STOPPED) {
      log('File watcher already stopped')
      return
    }

    try {
      this.set_watcher_state(FILE_WATCHER_STATES.STOPPING)

      log('Stopping file watcher...')

      // Clear all debounce timers
      this.clear_all_debounce_timers()

      // Close chokidar watcher
      if (this.chokidar_watcher) {
        await this.chokidar_watcher.close()
        this.chokidar_watcher = null
      }

      // Clear tracked files
      this.watched_files.clear()

      this.set_watcher_state(FILE_WATCHER_STATES.STOPPED)

      log('File watcher stopped')
    } catch (error) {
      this.set_watcher_state(FILE_WATCHER_STATES.ERROR)
      log('File watcher shutdown failed:', error.message)
      throw error
    }
  }

  /**
   * Perform health check
   * @returns {Promise<Object>} Health check results
   */
  async perform_health_check() {
    const health_status = {
      timestamp: Date.now(),
      state: this.watcher_state,
      stats: this.get_watcher_stats(),
      issues: []
    }

    // Check watcher state
    if (this.watcher_state !== FILE_WATCHER_STATES.WATCHING) {
      health_status.issues.push(
        `File watcher not watching (state: ${this.watcher_state})`
      )
    }

    // Check chokidar watcher
    if (!this.chokidar_watcher) {
      health_status.issues.push('Chokidar watcher not initialized')
    }

    // Check for excessive debounce timers (possible memory leak)
    if (this.debounce_timers.size > 100) {
      health_status.issues.push(
        `Excessive debounce timers: ${this.debounce_timers.size}`
      )
    }

    health_status.healthy = health_status.issues.length === 0

    return health_status
  }

  /**
   * Initialize chokidar watcher with configuration
   * @private
   */
  async initialize_chokidar_watcher() {
    // Check if directory exists and is accessible
    try {
      const stats = await fs.promises.stat(this.claude_projects_directory)
      log('Claude projects directory exists:', stats.isDirectory())

      // List contents to verify we can read it
      const contents = await fs.promises.readdir(this.claude_projects_directory)
      log('Claude projects directory contents:', contents.length, 'items')
    } catch (error) {
      log('Error accessing claude projects directory:', error.message)
      throw error
    }

    // Try watching the directory directly instead of using glob patterns
    const watch_pattern = this.claude_projects_directory

    const chokidar_options = {
      ignored: [
        ...this.file_watching_config.ignore_patterns,
        // Only watch .jsonl files
        (absolute_path, stats) =>
          stats?.isFile() && !absolute_path.endsWith('.jsonl')
      ],
      persistent: true,
      ignoreInitial: false,
      followSymlinks: false,
      recursive: true,
      disableGlobbing: true,
      usePolling: this.file_watching_config.use_polling,
      interval: this.file_watching_config.polling_interval_ms,
      binaryInterval: this.file_watching_config.polling_interval_ms * 2,
      alwaysStat: true,
      depth: undefined,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    }

    log('Initializing chokidar watcher with options:', chokidar_options)
    log('Watching pattern:', watch_pattern)
    log('In directory:', this.claude_projects_directory)

    this.chokidar_watcher = chokidar.watch(watch_pattern, chokidar_options)

    // Register event handlers
    this.chokidar_watcher
      .on('add', this.handle_file_add)
      .on('change', this.handle_file_change)
      .on('unlink', this.handle_file_unlink)
      .on('ready', this.handle_watcher_ready)
      .on('error', this.handle_watcher_error)

    // Wait for ready event
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('File watcher initialization timeout'))
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
   * Set watcher state and emit event
   * @private
   * @param {string} new_state - New watcher state
   */
  set_watcher_state(new_state) {
    const previous_state = this.watcher_state
    this.watcher_state = new_state

    log(`File watcher state changed: ${previous_state} -> ${new_state}`)

    this.emit('state-changed', {
      previous_state,
      current_state: new_state,
      timestamp: Date.now()
    })
  }

  /**
   * Extract session ID from JSONL file path
   * @private
   * @param {string} absolute_path - Absolute path to JSONL file
   * @returns {string|null} Session ID or null if not extractable
   */
  extract_session_id_from_file_path(absolute_path) {
    try {
      // Claude JSONL files typically contain sessionId in the filename or path
      // Pattern examples:
      // - sessions/session-abc123.jsonl
      // - project/sessions/abc123-def456.jsonl
      // - abc123-def456-ghi789.jsonl

      const basename = path.basename(absolute_path, '.jsonl')
      const dirname = path.dirname(absolute_path)

      // Look for UUID-like patterns in the basename
      const uuid_pattern =
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
      const uuid_match = basename.match(uuid_pattern)

      if (uuid_match) {
        return uuid_match[0]
      }

      // If no UUID found, check if the directory name contains session info
      const dir_parts = dirname.split(path.sep)
      for (const part of dir_parts.reverse()) {
        const part_uuid_match = part.match(uuid_pattern)
        if (part_uuid_match) {
          return part_uuid_match[0]
        }
      }

      // Fallback to using the full relative path as session identifier
      const relative_path = path.relative(
        this.claude_projects_directory,
        absolute_path
      )
      return relative_path.replace(/[^a-zA-Z0-9-_]/g, '-')
    } catch (error) {
      log(
        `Error extracting session ID from path ${absolute_path}:`,
        error.message
      )
      return null
    }
  }

  /**
   * Debounce file change event
   * @private
   * @param {string} absolute_path - Absolute path to changed file
   * @param {string} event_type - Type of change event
   */
  debounce_file_change(absolute_path, event_type) {
    const session_id = this.extract_session_id_from_file_path(absolute_path)
    if (!session_id) {
      log(
        `Skipping file change for ${absolute_path}: could not extract session ID`
      )
      return
    }

    // Clear existing timer for this file
    if (this.debounce_timers.has(absolute_path)) {
      clearTimeout(this.debounce_timers.get(absolute_path))
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounce_timers.delete(absolute_path)

      log(
        `Processing ${event_type} event for file: ${absolute_path} (session: ${session_id})`
      )

      this.emit('session-changed', {
        absolute_path,
        session_id,
        event_type,
        timestamp: Date.now()
      })
    }, this.file_watching_config.debounce_ms)

    this.debounce_timers.set(absolute_path, timer)
  }

  /**
   * Clear all debounce timers
   * @private
   */
  clear_all_debounce_timers() {
    for (const timer of this.debounce_timers.values()) {
      clearTimeout(timer)
    }
    this.debounce_timers.clear()
  }

  /**
   * Resolve chokidar event path to absolute path
   * @private
   * @param {string} event_path - Path from chokidar event
   * @returns {string} absolute path
   */
  resolve_event_path(event_path) {
    return path.isAbsolute(event_path)
      ? event_path
      : path.resolve(this.claude_projects_directory, event_path)
  }

  /**
   * Handle file add event
   * @private
   * @param {string} event_path - Path to added file (absolute or relative)
   */
  handle_file_add(event_path) {
    const absolute_path = this.resolve_event_path(event_path)
    this.watched_files.add(absolute_path)

    log(`File added: ${absolute_path}`)
    this.debounce_file_change(absolute_path, 'add')
  }

  /**
   * Handle file change event
   * @private
   * @param {string} event_path - Path to changed file (absolute or relative)
   */
  handle_file_change(event_path) {
    const absolute_path = this.resolve_event_path(event_path)

    log(`File changed: ${absolute_path}`)
    this.debounce_file_change(absolute_path, 'change')
  }

  /**
   * Handle file unlink event
   * @private
   * @param {string} event_path - Path to removed file (absolute or relative)
   */
  handle_file_unlink(event_path) {
    const absolute_path = this.resolve_event_path(event_path)
    this.watched_files.delete(absolute_path)

    // Clear any pending debounce timer for this file
    if (this.debounce_timers.has(absolute_path)) {
      clearTimeout(this.debounce_timers.get(absolute_path))
      this.debounce_timers.delete(absolute_path)
    }

    log(`File removed: ${absolute_path}`)
  }

  /**
   * Handle watcher ready event
   * @private
   */
  handle_watcher_ready() {
    this.set_watcher_state(FILE_WATCHER_STATES.WATCHING)

    const watched_data = this.chokidar_watcher.getWatched()
    log('Chokidar watched data:', watched_data)
    log(
      `File watcher ready, watching ${Object.keys(watched_data).length} directories`
    )

    this.emit('watcher-ready', {
      watched_files_count: this.watched_files.size,
      timestamp: Date.now()
    })
  }

  /**
   * Handle watcher error event
   * @private
   * @param {Error} error - Watcher error
   */
  handle_watcher_error(error) {
    this.set_watcher_state(FILE_WATCHER_STATES.ERROR)

    log('File watcher error:', error.message)

    this.emit('watcher-error', {
      error: error.message,
      timestamp: Date.now()
    })
  }
}
