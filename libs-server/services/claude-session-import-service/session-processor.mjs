import { EventEmitter } from 'events'
import debug from 'debug'

import { get_processing_config } from './config.mjs'
import { import_claude_sessions_to_threads } from '#libs-server/integrations/claude/index.mjs'
import { file_exists_in_filesystem } from '#libs-server/filesystem/index.mjs'

const log = debug('claude-session-import-service:session-processor')

/**
 * Session processor states
 */
export const SESSION_PROCESSOR_STATES = {
  STOPPED: 'stopped',
  IDLE: 'idle',
  PROCESSING: 'processing',
  ERROR: 'error'
}

/**
 * Session processor class for handling Claude session imports
 * Wraps existing Claude integration with incremental processing capabilities
 */
export class SessionProcessor extends EventEmitter {
  constructor({ user_base_directory, claude_projects_directory }) {
    super()

    this.user_base_directory = user_base_directory
    this.claude_projects_directory = claude_projects_directory
    this.processor_state = SESSION_PROCESSOR_STATES.STOPPED
    this.processing_config = null
    this.processing_queue = []
    this.current_processing = null
    this.processing_stats = {
      sessions_processed: 0,
      sessions_failed: 0,
      threads_created: 0,
      threads_updated: 0,
      last_processed_at: null
    }
  }

  /**
   * Get current processor state
   * @returns {string} Current processor state
   */
  get_processor_state() {
    return this.processor_state
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing statistics
   */
  get_processing_stats() {
    return { ...this.processing_stats }
  }

  /**
   * Get current processing queue size
   * @returns {number} Number of sessions in processing queue
   */
  get_queue_size() {
    return this.processing_queue.length
  }

  /**
   * Start the session processor
   * @returns {Promise<void>}
   */
  async start_processor() {
    if (this.processor_state !== SESSION_PROCESSOR_STATES.STOPPED) {
      throw new Error(
        `Cannot start processor from state: ${this.processor_state}`
      )
    }

    try {
      log('Starting session processor...')

      // Load configuration
      this.processing_config = get_processing_config()

      this.set_processor_state(SESSION_PROCESSOR_STATES.IDLE)

      log('Session processor started')
    } catch (error) {
      this.set_processor_state(SESSION_PROCESSOR_STATES.ERROR)
      log('Session processor startup failed:', error.message)
      throw error
    }
  }

  /**
   * Stop the session processor
   * @returns {Promise<void>}
   */
  async stop_processor() {
    if (this.processor_state === SESSION_PROCESSOR_STATES.STOPPED) {
      log('Session processor already stopped')
      return
    }

    try {
      log('Stopping session processor...')

      // Wait for current processing to complete
      if (this.processor_state === SESSION_PROCESSOR_STATES.PROCESSING) {
        log('Waiting for current processing to complete...')
        await this.wait_for_processing_completion()
      }

      // Clear processing queue
      this.processing_queue = []
      this.current_processing = null

      this.set_processor_state(SESSION_PROCESSOR_STATES.STOPPED)

      log('Session processor stopped')
    } catch (error) {
      this.set_processor_state(SESSION_PROCESSOR_STATES.ERROR)
      log('Session processor shutdown failed:', error.message)
      throw error
    }
  }

  /**
   * Queue a session for processing
   * @param {Object} session_change_event - Session change event from file watcher
   * @returns {Promise<void>}
   */
  async queue_session_processing(session_change_event) {
    const { absolute_path, session_id, event_type, timestamp } =
      session_change_event

    log(`Queuing session for processing: ${session_id} (${event_type})`)
    log('Session change event details:', {
      absolute_path,
      session_id,
      event_type,
      timestamp,
      full_event: session_change_event
    })

    // Check if session is already queued
    const existing_index = this.processing_queue.findIndex(
      (item) => item.session_id === session_id
    )

    if (existing_index !== -1) {
      // Update existing queue item with latest event
      this.processing_queue[existing_index] = {
        ...this.processing_queue[existing_index],
        absolute_path,
        event_type,
        timestamp,
        updated_at: Date.now()
      }
      log(`Updated existing queue item for session: ${session_id}`)
    } else {
      // Add new queue item
      this.processing_queue.push({
        session_id,
        absolute_path,
        event_type,
        timestamp,
        queued_at: Date.now(),
        retry_count: 0
      })
      log(`Added new queue item for session: ${session_id}`)
    }

    // Start processing if idle
    if (this.processor_state === SESSION_PROCESSOR_STATES.IDLE) {
      this.process_queue()
    }
  }

  /**
   * Process the session queue
   * @private
   */
  async process_queue() {
    if (this.processor_state !== SESSION_PROCESSOR_STATES.IDLE) {
      return
    }

    if (this.processing_queue.length === 0) {
      return
    }

    try {
      this.set_processor_state(SESSION_PROCESSOR_STATES.PROCESSING)

      while (this.processing_queue.length > 0) {
        const session_item = this.processing_queue.shift()
        this.current_processing = session_item

        try {
          await this.process_session(session_item)

          // Update stats
          this.processing_stats.sessions_processed++
          this.processing_stats.last_processed_at = Date.now()
        } catch (error) {
          log(
            `Session processing failed for ${session_item.session_id}:`,
            error.message
          )

          // Handle retry logic
          if (session_item.retry_count < this.processing_config.max_retries) {
            session_item.retry_count++
            const retry_delay =
              this.processing_config.initial_backoff_ms *
              Math.pow(
                this.processing_config.backoff_factor,
                session_item.retry_count - 1
              )

            session_item.retry_at = Date.now() + retry_delay

            // Schedule re-queue with backoff
            setTimeout(() => {
              this.processing_queue.push(session_item)
              if (this.processor_state === SESSION_PROCESSOR_STATES.IDLE) {
                this.process_queue()
              }
            }, retry_delay)

            log(
              `Session ${session_item.session_id} queued for retry ${session_item.retry_count}/${this.processing_config.max_retries} in ${retry_delay}ms`
            )
          } else {
            // Max retries exceeded
            this.processing_stats.sessions_failed++

            this.emit('session-processing-failed', {
              session_id: session_item.session_id,
              absolute_path: session_item.absolute_path,
              error: error.message,
              retry_count: session_item.retry_count,
              timestamp: Date.now()
            })

            log(
              `Session ${session_item.session_id} failed permanently after ${session_item.retry_count} retries`
            )
          }
        }

        this.current_processing = null
      }

      this.set_processor_state(SESSION_PROCESSOR_STATES.IDLE)
    } catch (error) {
      this.set_processor_state(SESSION_PROCESSOR_STATES.ERROR)
      log('Queue processing failed:', error.message)
      throw error
    }
  }

  /**
   * Process a single session
   * @private
   * @param {Object} session_item - Session item from queue
   * @returns {Promise<void>}
   */
  async process_session(session_item) {
    const { session_id, absolute_path, event_type } = session_item

    log(`Processing session: ${session_id} from file: ${absolute_path}`)
    log('Session item details:', session_item)

    if (!absolute_path) {
      log(`ERROR: absolute_path is undefined for session ${session_id}`)
      throw new Error(`absolute_path is undefined for session ${session_id}`)
    }

    // Check if file still exists (in case it was deleted)
    const file_exists = await file_exists_in_filesystem({ absolute_path })
    if (!file_exists) {
      log(`Session file no longer exists, skipping: ${absolute_path}`)
      return
    }

    // Emit processing started event
    this.emit('session-processing-started', {
      session_id,
      absolute_path,
      event_type,
      timestamp: Date.now()
    })

    try {
      // Use existing Claude integration to import the specific session
      const import_result = await import_claude_sessions_to_threads({
        user_base_directory: this.user_base_directory,
        filter_sessions: (session) => session.session_id === session_id, // Filter to only process this session
        allow_updates: true, // Allow updating existing threads
        dry_run: false
      })

      // Update stats based on results
      if (import_result.threads_created > 0) {
        this.processing_stats.threads_created += import_result.threads_created
      }

      if (import_result.threads_updated > 0) {
        this.processing_stats.threads_updated += import_result.threads_updated
      }

      // Emit processing completed event
      this.emit('session-processing-completed', {
        session_id,
        absolute_path,
        event_type,
        import_result,
        timestamp: Date.now()
      })

      log(`Session processed successfully: ${session_id}`, {
        threads_created: import_result.threads_created,
        threads_updated: import_result.threads_updated
      })
    } catch (error) {
      log(`Session processing error for ${session_id}:`, error.message)
      throw error
    }
  }

  /**
   * Wait for current processing to complete
   * @private
   * @returns {Promise<void>}
   */
  async wait_for_processing_completion() {
    if (this.processor_state !== SESSION_PROCESSOR_STATES.PROCESSING) {
      return
    }

    return new Promise((resolve) => {
      const check_completion = () => {
        if (this.processor_state !== SESSION_PROCESSOR_STATES.PROCESSING) {
          resolve()
        } else {
          setTimeout(check_completion, 100)
        }
      }
      check_completion()
    })
  }

  /**
   * Set processor state and emit event
   * @private
   * @param {string} new_state - New processor state
   */
  set_processor_state(new_state) {
    const previous_state = this.processor_state
    this.processor_state = new_state

    log(`Session processor state changed: ${previous_state} -> ${new_state}`)

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
      state: this.processor_state,
      stats: this.get_processing_stats(),
      queue_size: this.get_queue_size(),
      current_processing: this.current_processing,
      issues: []
    }

    // Check processor state
    if (this.processor_state === SESSION_PROCESSOR_STATES.ERROR) {
      health_status.issues.push('Session processor in error state')
    }

    // Check for stuck processing
    if (this.current_processing) {
      const processing_duration =
        Date.now() - (this.current_processing.queued_at || Date.now())
      const max_processing_time = 300000 // 5 minutes

      if (processing_duration > max_processing_time) {
        health_status.issues.push(
          `Session processing stuck for ${Math.round(processing_duration / 1000)}s`
        )
      }
    }

    // Check for excessive queue size
    if (this.processing_queue.length > 50) {
      health_status.issues.push(
        `Processing queue is large: ${this.processing_queue.length} items`
      )
    }

    // Check failure rate
    const total_processed =
      this.processing_stats.sessions_processed +
      this.processing_stats.sessions_failed
    if (total_processed > 0) {
      const failure_rate =
        this.processing_stats.sessions_failed / total_processed
      if (failure_rate > 0.1) {
        // More than 10% failure rate
        health_status.issues.push(
          `High failure rate: ${Math.round(failure_rate * 100)}%`
        )
      }
    }

    health_status.healthy = health_status.issues.length === 0

    return health_status
  }
}
