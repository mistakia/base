#!/usr/bin/env node

/**
 * Claude Session Import Service
 *
 * Standalone daemon script for the Claude session import service.
 * Monitors Claude JSONL files for changes and automatically imports them
 * to the user-base repository with real-time storage server synchronization.
 */

import os from 'os'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server/index.mjs'
import {
  get_service_manager,
  get_claude_session_import_service_config,
  validate_claude_session_import_service_config,
  get_notification_config,
  get_storage_server_config
} from '#libs-server/services/claude-session-import-service/index.mjs'
import { ClaudeFileWatcher } from '#libs-server/services/claude-session-import-service/file-watcher.mjs'
import { SessionProcessor } from '#libs-server/services/claude-session-import-service/session-processor.mjs'
import { StorageSync } from '#libs-server/services/claude-session-import-service/storage-sync.mjs'
import { NotificationHandler } from '#libs-server/services/claude-session-import-service/notification.mjs'

const log = debug('claude-session-import-service')

/**
 * Main service orchestrator class
 * Coordinates all service components and handles their lifecycle
 */
class ClaudeSessionImportServiceOrchestrator {
  constructor() {
    this.service_manager = get_service_manager()
    this.service_config = null
    this.components = {
      file_watcher: null,
      session_processor: null,
      storage_sync: null,
      notification_handler: null
    }
  }

  /**
   * Start the complete service
   * @param {Object} options - Service startup options
   */
  async start_service(options = {}) {
    try {
      log('Starting Claude session import service...')

      // Load and validate configuration
      this.service_config = get_claude_session_import_service_config()
      validate_claude_session_import_service_config(this.service_config)

      // Start service manager
      await this.service_manager.start_service(options)

      // Initialize and start all components
      await this.initialize_components()
      await this.start_components()

      // Wire component events
      this.wire_component_events()

      // Send startup notification
      await this.send_startup_notification()

      log('Claude session import service started successfully')
    } catch (error) {
      log('Service startup failed:', error.message)
      throw error
    }
  }

  /**
   * Stop the complete service
   * @param {Object} options - Service shutdown options
   */
  async stop_service(options = {}) {
    try {
      log('Stopping Claude session import service...')

      // Send shutdown notification
      await this.send_shutdown_notification(options)

      // Stop all components
      await this.stop_components()

      // Stop service manager
      await this.service_manager.stop_service(options)

      log('Claude session import service stopped successfully')
    } catch (error) {
      log('Service shutdown failed:', error.message)
      throw error
    }
  }

  /**
   * Initialize all service components
   * @private
   */
  async initialize_components() {
    log('Initializing service components...')

    // Initialize notification handler first
    this.components.notification_handler = new NotificationHandler()
    this.service_manager.register_service_component(
      'notification_handler',
      this.components.notification_handler
    )

    // Initialize file watcher
    this.components.file_watcher = new ClaudeFileWatcher({
      claude_projects_directory: this.service_config.claude_projects_directory
    })
    this.service_manager.register_service_component(
      'file_watcher',
      this.components.file_watcher
    )

    // Initialize session processor
    this.components.session_processor = new SessionProcessor({
      user_base_directory: this.service_config.user_base_directory,
      claude_projects_directory: this.service_config.claude_projects_directory
    })
    this.service_manager.register_service_component(
      'session_processor',
      this.components.session_processor
    )

    // Initialize storage sync
    this.components.storage_sync = new StorageSync({
      thread_directory: this.service_config.thread_directory
    })
    this.service_manager.register_service_component(
      'storage_sync',
      this.components.storage_sync
    )

    // Register shutdown handlers
    this.service_manager.register_shutdown_handler(async () => {
      await this.stop_components()
    })

    log('Service components initialized')
  }

  /**
   * Start all service components
   * @private
   */
  async start_components() {
    log('Starting service components...')

    // Start notification handler first
    await this.components.notification_handler.start_handler()

    // Start session processor
    await this.components.session_processor.start_processor()

    // Start storage sync monitoring
    await this.components.storage_sync.start_sync_monitoring()

    // Start file watcher last (will start emitting events immediately)
    await this.components.file_watcher.start_watching()

    log('All service components started')
  }

  /**
   * Stop all service components
   * @private
   */
  async stop_components() {
    log('Stopping service components...')

    // Stop in reverse order
    if (this.components.file_watcher) {
      await this.components.file_watcher.stop_watching()
    }

    if (this.components.storage_sync) {
      await this.components.storage_sync.stop_sync_monitoring()
    }

    if (this.components.session_processor) {
      await this.components.session_processor.stop_processor()
    }

    if (this.components.notification_handler) {
      await this.components.notification_handler.stop_handler()
    }

    log('All service components stopped')
  }

  /**
   * Wire events between components
   * @private
   */
  wire_component_events() {
    log('Wiring component events...')

    // File watcher -> Session processor
    this.components.file_watcher.on(
      'session-changed',
      async (session_change_event) => {
        log(`Session changed event: ${session_change_event.session_id}`)
        await this.components.session_processor.queue_session_processing(
          session_change_event
        )
      }
    )

    // Session processor -> Storage sync (when threads are created/updated)
    this.components.session_processor.on(
      'session-processing-completed',
      async (completion_event) => {
        log(`Session processing completed: ${completion_event.session_id}`)

        // Trigger sync for any created/updated threads
        if (completion_event.import_result.results?.created) {
          for (const created_thread of completion_event.import_result.results
            .created) {
            await this.components.storage_sync.sync_thread_directory(
              created_thread.thread_id
            )
          }
        }

        if (completion_event.import_result.results?.updated) {
          for (const updated_thread of completion_event.import_result.results
            .updated) {
            await this.components.storage_sync.sync_thread_directory(
              updated_thread.thread_id
            )
          }
        }
      }
    )

    // Error handling - All components -> Notification handler
    const components_to_monitor = [
      { name: 'file_watcher', component: this.components.file_watcher },
      {
        name: 'session_processor',
        component: this.components.session_processor
      },
      { name: 'storage_sync', component: this.components.storage_sync }
    ]

    for (const { name, component } of components_to_monitor) {
      // Monitor error events
      component.on('error', async (error) => {
        log(`Component error in ${name}:`, error)
        await this.components.notification_handler.send_error_notification({
          component: name,
          error
        })
      })

      // Monitor processing/sync failures
      if (component.on) {
        component.on('session-processing-failed', async (failure_event) => {
          await this.components.notification_handler.send_error_notification({
            component: 'session_processor',
            error: new Error(
              `Session processing failed: ${failure_event.error}`
            )
          })
        })

        component.on('sync-failed', async (failure_event) => {
          await this.components.notification_handler.send_error_notification({
            component: 'storage_sync',
            error: new Error(`Storage sync failed: ${failure_event.error}`)
          })
        })
      }
    }

    // Storage sync server availability
    this.components.storage_sync.on(
      'sync-monitoring-error',
      async (error_event) => {
        await this.components.notification_handler.send_storage_server_unavailable_notification()
      }
    )

    log('Component events wired')
  }

  /**
   * Send service startup notification
   * @private
   */
  async send_startup_notification() {
    try {
      await this.components.notification_handler.send_service_startup_notification(
        {
          hostname: os.hostname(),
          user: os.userInfo().username,
          platform: os.platform(),
          arch: os.arch(),
          node_version: process.version,
          pid: process.pid,
          claude_projects_directory:
            this.service_config.claude_projects_directory,
          user_base_directory: this.service_config.user_base_directory
        }
      )
    } catch (error) {
      log('Failed to send startup notification:', error.message)
    }
  }

  /**
   * Send service shutdown notification
   * @private
   */
  async send_shutdown_notification(options = {}) {
    try {
      if (this.components.notification_handler) {
        await this.components.notification_handler.send_service_shutdown_notification(
          {
            hostname: os.hostname(),
            forced: options.force || false,
            reason: options.reason || 'manual'
          }
        )
      }
    } catch (error) {
      log('Failed to send shutdown notification:', error.message)
    }
  }
}

/**
 * CLI command handlers
 */
const cli_commands = {
  /**
   * Start the service
   */
  async start(argv) {
    const orchestrator = new ClaudeSessionImportServiceOrchestrator()

    try {
      await orchestrator.start_service({
        verbose: argv.verbose
      })

      // Keep process running
      process.on('SIGINT', async () => {
        log('Received SIGINT, shutting down...')
        await orchestrator.stop_service({ reason: 'SIGINT' })
        process.exit(0)
      })

      process.on('SIGTERM', async () => {
        log('Received SIGTERM, shutting down...')
        await orchestrator.stop_service({ reason: 'SIGTERM' })
        process.exit(0)
      })

      log('Service running. Press Ctrl+C to stop.')
    } catch (error) {
      console.error('Failed to start service:', error.message)
      process.exit(1)
    }
  },

  /**
   * Show service status
   */
  async status(argv) {
    try {
      const service_config = get_claude_session_import_service_config()
      const notification_config = get_notification_config()
      const storage_config = get_storage_server_config()

      console.log('Claude Session Import Service Configuration:')
      console.log(
        `  Claude Projects Directory: ${service_config.claude_projects_directory}`
      )
      console.log(
        `  User Base Directory: ${service_config.user_base_directory}`
      )
      console.log(`  Thread Directory: ${service_config.thread_directory}`)

      if (storage_config?.host) {
        console.log(
          `  Storage Server: ${storage_config.user}@${storage_config.host}:${storage_config.remote_path}`
        )
        console.log(
          `  Storage Sync: delete=${service_config.storage_server.rsync_delete ? 'enabled' : 'disabled'}, max_concurrent=${service_config.storage_server.max_concurrent_syncs}`
        )
      } else {
        console.log('  Storage Server: Not configured')
      }

      console.log(
        `  Notifications: ${service_config.notifications.alert_on_errors ? 'Enabled' : 'Disabled'}`
      )
      if (service_config.notifications.alert_on_errors) {
        console.log(
          `  Notification Script: ${notification_config.discord_script || 'not set'}`
        )
      }
    } catch (error) {
      console.error('Failed to get service status:', error.message)
      process.exit(1)
    }
  },

  /**
   * Validate service configuration
   */
  async validate(argv) {
    try {
      const service_config = get_claude_session_import_service_config()
      validate_claude_session_import_service_config(service_config)

      console.log('Service configuration is valid')
    } catch (error) {
      console.error('Service configuration validation failed:', error.message)
      process.exit(1)
    }
  }
}

/**
 * Main CLI function
 */
const main = async () => {
  try {
    await yargs(hideBin(process.argv))
      .command(
        'start',
        'Start the Claude session import service',
        (yargs) => {
          return yargs.option('verbose', {
            alias: 'v',
            describe: 'Verbose logging',
            type: 'boolean',
            default: false
          })
        },
        cli_commands.start
      )
      .command(
        'status',
        'Show service configuration and status',
        (yargs) => {
          return yargs.option('verbose', {
            alias: 'v',
            describe: 'Verbose output',
            type: 'boolean',
            default: false
          })
        },
        cli_commands.status
      )
      .command(
        'validate',
        'Validate service configuration',
        (yargs) => {
          return yargs.option('verbose', {
            alias: 'v',
            describe: 'Verbose output',
            type: 'boolean',
            default: false
          })
        },
        cli_commands.validate
      )
      .option('help', {
        alias: 'h',
        describe: 'Show help'
      })
      .demandCommand(
        1,
        'You need to specify a command (start, status, or validate)'
      )
      .help()
      .example('$0 start', 'Start the Claude session import service')
      .example('$0 start --verbose', 'Start the service with verbose logging')
      .example('$0 status', 'Show current service configuration')
      .example('$0 validate', 'Validate service configuration').argv
  } catch (error) {
    console.error('Claude session import service failed:', error.message)

    // Show stack trace in debug mode
    if (process.env.DEBUG) {
      console.error(error.stack)
    }

    process.exit(1)
  }
}

// Enable debug logging for the service
if (isMain(import.meta.url)) {
  debug.enable('claude-session-import-service*')
  main()
}
