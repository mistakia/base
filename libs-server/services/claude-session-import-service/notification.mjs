import { EventEmitter } from 'events'
import debug from 'debug'

import { get_notification_config } from './config.mjs'
import { execute_shell_command } from '#libs-server/utils/index.mjs'
import { file_exists_in_filesystem } from '#libs-server/filesystem/index.mjs'

const log = debug('claude-session-import-service:notification')

/**
 * Notification handler states
 */
export const NOTIFICATION_HANDLER_STATES = {
  STOPPED: 'stopped',
  READY: 'ready',
  ERROR: 'error'
}

/**
 * Notification severity levels
 */
export const NOTIFICATION_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
}

/**
 * Notification handler class for Discord alerts and system notifications
 * Handles Discord notifications for errors, warnings, and status updates
 */
export class NotificationHandler extends EventEmitter {
  constructor() {
    super()

    this.handler_state = NOTIFICATION_HANDLER_STATES.STOPPED
    this.notification_config = null
    this.notification_throttle_map = new Map()
    this.notification_stats = {
      notifications_sent: 0,
      notifications_failed: 0,
      notifications_throttled: 0,
      last_notification_at: null,
      last_failure_at: null
    }
  }

  /**
   * Get current handler state
   * @returns {string} Current handler state
   */
  get_handler_state() {
    return this.handler_state
  }

  /**
   * Get notification statistics
   * @returns {Object} Notification statistics
   */
  get_notification_stats() {
    return { ...this.notification_stats }
  }

  /**
   * Start the notification handler
   * @returns {Promise<void>}
   */
  async start_handler() {
    if (this.handler_state !== NOTIFICATION_HANDLER_STATES.STOPPED) {
      throw new Error(
        `Cannot start notification handler from state: ${this.handler_state}`
      )
    }

    try {
      log('Starting notification handler...')

      // Load configuration
      this.notification_config = get_notification_config()

      // Validate Discord script if notifications are enabled
      if (this.notification_config.alert_on_errors) {
        await this.validate_discord_script()
        await this.validate_discord_script_interface()
      }

      this.set_handler_state(NOTIFICATION_HANDLER_STATES.READY)

      log('Notification handler started')
    } catch (error) {
      this.set_handler_state(NOTIFICATION_HANDLER_STATES.ERROR)
      log('Notification handler startup failed:', error.message)
      throw error
    }
  }

  /**
   * Stop the notification handler
   * @returns {Promise<void>}
   */
  async stop_handler() {
    if (this.handler_state === NOTIFICATION_HANDLER_STATES.STOPPED) {
      log('Notification handler already stopped')
      return
    }

    try {
      log('Stopping notification handler...')

      // Clear throttle map
      this.notification_throttle_map.clear()

      this.set_handler_state(NOTIFICATION_HANDLER_STATES.STOPPED)

      log('Notification handler stopped')
    } catch (error) {
      this.set_handler_state(NOTIFICATION_HANDLER_STATES.ERROR)
      log('Notification handler shutdown failed:', error.message)
      throw error
    }
  }

  /**
   * Send a notification
   * @param {Object} notification_data - Notification data
   * @returns {Promise<void>}
   */
  async send_notification(notification_data) {
    const {
      title,
      message,
      severity = NOTIFICATION_SEVERITY.INFO,
      throttle_key = null,
      metadata = {}
    } = notification_data

    if (!this.notification_config.alert_on_errors) {
      log('Notifications disabled, skipping notification')
      return
    }

    try {
      // Check throttling
      if (throttle_key && this.is_notification_throttled(throttle_key)) {
        this.notification_stats.notifications_throttled++
        log(`Notification throttled for key: ${throttle_key}`)
        return
      }

      // Format notification for Discord
      const discord_message = this.format_discord_message({
        title,
        message,
        severity,
        metadata,
        timestamp: Date.now()
      })

      // Send to Discord
      await this.send_discord_notification(discord_message)

      // Update stats
      this.notification_stats.notifications_sent++
      this.notification_stats.last_notification_at = Date.now()

      // Update throttle map
      if (throttle_key) {
        this.notification_throttle_map.set(throttle_key, Date.now())
      }

      // Emit notification sent event
      this.emit('notification-sent', {
        title,
        severity,
        throttle_key,
        timestamp: Date.now()
      })

      log(`Notification sent: ${title} (${severity})`)
    } catch (error) {
      this.notification_stats.notifications_failed++
      this.notification_stats.last_failure_at = Date.now()

      log(`Notification failed: ${error.message}`)

      this.emit('notification-failed', {
        title,
        severity,
        error: error.message,
        timestamp: Date.now()
      })

      // Don't throw error - notification failures shouldn't break the service
    }
  }

  /**
   * Send service startup notification
   * @param {Object} service_info - Service startup information
   */
  async send_service_startup_notification(service_info) {
    await this.send_notification({
      title: 'Claude Session Import Service Started',
      message: `Service started successfully on ${service_info.hostname || 'unknown host'}`,
      severity: NOTIFICATION_SEVERITY.INFO,
      throttle_key: 'service-startup',
      metadata: {
        ...service_info,
        event_type: 'service-startup'
      }
    })
  }

  /**
   * Send service shutdown notification
   * @param {Object} shutdown_info - Service shutdown information
   */
  async send_service_shutdown_notification(shutdown_info) {
    await this.send_notification({
      title: 'Claude Session Import Service Stopped',
      message: `Service stopped ${shutdown_info.forced ? 'forcefully' : 'gracefully'}`,
      severity: shutdown_info.forced
        ? NOTIFICATION_SEVERITY.WARNING
        : NOTIFICATION_SEVERITY.INFO,
      throttle_key: 'service-shutdown',
      metadata: {
        ...shutdown_info,
        event_type: 'service-shutdown'
      }
    })
  }

  /**
   * Send error notification
   * @param {Object} error_info - Error information
   */
  async send_error_notification(error_info) {
    const { component, error, context = {} } = error_info

    await this.send_notification({
      title: `Error in ${component}`,
      message: error.message || error,
      severity: NOTIFICATION_SEVERITY.ERROR,
      throttle_key: `error-${component}`,
      metadata: {
        component,
        error_message: error.message || error,
        error_stack: error.stack,
        ...context,
        event_type: 'error'
      }
    })
  }

  /**
   * Send storage server unavailable notification
   */
  async send_storage_server_unavailable_notification() {
    await this.send_notification({
      title: 'Storage Server Unavailable',
      message:
        'Remote storage server is not reachable. Sync operations will be queued until connection is restored.',
      severity: NOTIFICATION_SEVERITY.WARNING,
      throttle_key: 'storage-server-unavailable',
      metadata: {
        event_type: 'storage-server-unavailable'
      }
    })
  }

  /**
   * Send storage server restored notification
   */
  async send_storage_server_restored_notification() {
    await this.send_notification({
      title: 'Storage Server Connection Restored',
      message:
        'Remote storage server connection has been restored. Resuming sync operations.',
      severity: NOTIFICATION_SEVERITY.INFO,
      throttle_key: 'storage-server-restored',
      metadata: {
        event_type: 'storage-server-restored'
      }
    })
  }

  /**
   * Send daily stats notification
   * @param {Object} daily_stats - Daily statistics
   */
  async send_daily_stats_notification(daily_stats) {
    const {
      sessions_processed,
      threads_created,
      threads_updated,
      syncs_completed,
      sync_failures
    } = daily_stats

    const message = [
      `Sessions processed: ${sessions_processed}`,
      `Threads created: ${threads_created}`,
      `Threads updated: ${threads_updated}`,
      `Syncs completed: ${syncs_completed}`,
      sync_failures > 0 ? `Sync failures: ${sync_failures}` : null
    ]
      .filter(Boolean)
      .join('\n')

    await this.send_notification({
      title: 'Daily Claude Session Import Stats',
      message,
      severity:
        sync_failures > 0
          ? NOTIFICATION_SEVERITY.WARNING
          : NOTIFICATION_SEVERITY.INFO,
      throttle_key: 'daily-stats',
      metadata: {
        ...daily_stats,
        event_type: 'daily-stats'
      }
    })
  }

  /**
   * Check if notification is throttled
   * @private
   * @param {string} throttle_key - Throttle key to check
   * @returns {boolean} True if notification is throttled
   */
  is_notification_throttled(throttle_key) {
    const last_sent = this.notification_throttle_map.get(throttle_key)
    if (!last_sent) {
      return false
    }

    const throttle_duration = this.notification_config.throttle_ms
    return Date.now() - last_sent < throttle_duration
  }

  /**
   * Format message for Discord
   * @private
   * @param {Object} notification_data - Notification data to format
   * @returns {Object} Formatted Discord message
   */
  format_discord_message(notification_data) {
    const { title, message, severity, metadata, timestamp } = notification_data

    // Map severity to text label (avoid emojis per guidelines)
    const severity_labels = {
      [NOTIFICATION_SEVERITY.INFO]: '[INFO]',
      [NOTIFICATION_SEVERITY.WARNING]: '[WARNING]',
      [NOTIFICATION_SEVERITY.ERROR]: '[ERROR]',
      [NOTIFICATION_SEVERITY.CRITICAL]: '[CRITICAL]'
    }
    const label = severity_labels[severity] || '[NOTICE]'

    // Format timestamp
    const formatted_time = new Date(timestamp).toLocaleString()

    // Build Discord message
    let discord_content = `${label} **${title}**\n\n${message}`

    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      const relevant_metadata = Object.entries(metadata)
        .filter(
          ([key, value]) =>
            value !== null &&
            value !== undefined &&
            !key.includes('stack') && // Exclude stack traces
            key !== 'event_type'
        )
        .slice(0, 5) // Limit to first 5 metadata items
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')

      if (relevant_metadata) {
        discord_content += `\n\n**Details:**\n${relevant_metadata}`
      }
    }

    discord_content += `\n\n*${formatted_time}*`

    return {
      content: discord_content,
      severity,
      timestamp
    }
  }

  /**
   * Send Discord notification using the configured script
   * @private
   * @param {Object} discord_message - Formatted Discord message
   * @returns {Promise<void>}
   */
  async send_discord_notification(discord_message) {
    const discord_script_path = this.notification_config.discord_script

    // Escape the message content for shell
    const escaped_content = discord_message.content.replace(/"/g, '\\"')

    // Map notification severity to Discord script severity
    const severity_mapping = {
      [NOTIFICATION_SEVERITY.INFO]: 'info',
      [NOTIFICATION_SEVERITY.WARNING]: 'warning',
      [NOTIFICATION_SEVERITY.ERROR]: 'error',
      [NOTIFICATION_SEVERITY.CRITICAL]: 'error'
    }

    const script_severity = severity_mapping[discord_message.severity] || 'info'

    const command = `bash "${discord_script_path}" --message "${escaped_content}" --template service --severity ${script_severity}`

    try {
      log('Executing Discord notification command')

      const result = await execute_shell_command(command, {
        timeout: 10000, // 10 second timeout
        encoding: 'utf8'
      })

      if (result.stderr) {
        log('Discord script stderr:', result.stderr)
      }

      log('Discord notification sent successfully')
    } catch (error) {
      log('Discord notification command failed:', error.message)
      throw new Error(`Discord notification failed: ${error.message}`)
    }
  }

  /**
   * Validate Discord script exists and is executable
   * @private
   * @returns {Promise<void>}
   */
  async validate_discord_script() {
    const discord_script_path = this.notification_config.discord_script

    const script_exists = await file_exists_in_filesystem({
      absolute_path: discord_script_path
    })
    if (!script_exists) {
      throw new Error(
        `Discord notification script not found: ${discord_script_path}`
      )
    }

    log(`Discord notification script validated: ${discord_script_path}`)
  }

  /**
   * Validate Discord script interface supports expected flags
   * @private
   */
  async validate_discord_script_interface() {
    try {
      const result = await execute_shell_command(
        `bash "${this.notification_config.discord_script}" --help`,
        { timeout: 5000, encoding: 'utf8' }
      )
      const help_output = result.stdout || ''
      const required_flags = ['--message', '--template', '--severity']
      const missing = required_flags.filter(
        (flag) => !help_output.includes(flag)
      )
      if (missing.length > 0) {
        throw new Error(
          `Discord script missing required flags: ${missing.join(', ')}`
        )
      }
      log('Discord script interface validation passed')
    } catch (error) {
      throw new Error(
        `Discord script validation failed: ${error.message}. Ensure script supports --help`
      )
    }
  }

  /**
   * Set handler state and emit event
   * @private
   * @param {string} new_state - New handler state
   */
  set_handler_state(new_state) {
    const previous_state = this.handler_state
    this.handler_state = new_state

    log(`Notification handler state changed: ${previous_state} -> ${new_state}`)

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
      state: this.handler_state,
      enabled: this.notification_config?.alert_on_errors || false,
      stats: this.get_notification_stats(),
      throttled_notifications: this.notification_throttle_map.size,
      issues: []
    }

    // Check handler state
    if (this.handler_state === NOTIFICATION_HANDLER_STATES.ERROR) {
      health_status.issues.push('Notification handler in error state')
    }

    // Check Discord script availability if notifications are enabled
    if (this.notification_config?.alert_on_errors) {
      try {
        await this.validate_discord_script()
      } catch (error) {
        health_status.issues.push(
          `Discord script validation failed: ${error.message}`
        )
      }
    }

    // Check failure rate
    const total_sent =
      this.notification_stats.notifications_sent +
      this.notification_stats.notifications_failed
    if (total_sent > 0) {
      const failure_rate =
        this.notification_stats.notifications_failed / total_sent
      if (failure_rate > 0.3) {
        // More than 30% failure rate
        health_status.issues.push(
          `High notification failure rate: ${Math.round(failure_rate * 100)}%`
        )
      }
    }

    // Check for excessive throttling
    if (
      this.notification_stats.notifications_throttled >
      this.notification_stats.notifications_sent * 2
    ) {
      health_status.issues.push('High notification throttling rate detected')
    }

    health_status.healthy = health_status.issues.length === 0

    return health_status
  }
}
