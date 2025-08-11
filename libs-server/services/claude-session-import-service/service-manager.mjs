import debug from 'debug'
import { EventEmitter } from 'events'

import {
  get_claude_session_import_service_config,
  validate_claude_session_import_service_config,
  get_storage_server_config
} from './config.mjs'
import { directory_exists_in_filesystem } from '#libs-server/filesystem/index.mjs'

const log = debug('claude-session-import-service:manager')

/**
 * Service states
 */
export const SERVICE_STATES = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error'
}

/**
 * Service manager for the Claude session import service
 * Handles service lifecycle, health monitoring, and graceful shutdown
 */
export class ClaudeSessionImportServiceManager extends EventEmitter {
  constructor() {
    super()

    this.service_state = SERVICE_STATES.STOPPED
    this.service_config = null
    this.service_components = new Map()
    this.shutdown_handlers = []
    this.health_check_interval = null
    this.startup_time = null
  }

  /**
   * Get current service state
   * @returns {string} Current service state
   */
  get_service_state() {
    return this.service_state
  }

  /**
   * Get service uptime in milliseconds
   * @returns {number|null} Uptime in milliseconds or null if not running
   */
  get_service_uptime() {
    if (!this.startup_time) {
      return null
    }
    return Date.now() - this.startup_time
  }

  /**
   * Get service configuration
   * @returns {Object|null} Service configuration or null if not initialized
   */
  get_service_config() {
    return this.service_config
  }

  /**
   * Get service component by name
   * @param {string} component_name - Name of the component to retrieve
   * @returns {Object|null} Service component or null if not found
   */
  get_service_component(component_name) {
    return this.service_components.get(component_name) || null
  }

  /**
   * Register a service component
   * @param {string} component_name - Name of the component
   * @param {Object} component_instance - Component instance
   */
  register_service_component(component_name, component_instance) {
    this.service_components.set(component_name, component_instance)
    log(`Registered service component: ${component_name}`)
  }

  /**
   * Register a shutdown handler
   * @param {Function} handler - Shutdown handler function
   */
  register_shutdown_handler(handler) {
    if (typeof handler !== 'function') {
      throw new Error('Shutdown handler must be a function')
    }
    this.shutdown_handlers.push(handler)
  }

  /**
   * Start the service
   * @param {Object} options - Startup options
   * @returns {Promise<void>}
   */
  async start_service(options = {}) {
    if (this.service_state !== SERVICE_STATES.STOPPED) {
      throw new Error(`Cannot start service from state: ${this.service_state}`)
    }

    try {
      this.set_service_state(SERVICE_STATES.STARTING)

      log('Starting Claude session import service...')

      // Load and validate configuration
      await this.initialize_service_configuration()

      // Validate dependencies
      await this.validate_service_dependencies()

      // Start health monitoring
      this.start_health_monitoring()

      // Mark as running
      this.startup_time = Date.now()
      this.set_service_state(SERVICE_STATES.RUNNING)

      this.emit('service-started', {
        timestamp: this.startup_time,
        config: this.service_config
      })

      log('Claude session import service started successfully')
    } catch (error) {
      this.set_service_state(SERVICE_STATES.ERROR)
      log('Service startup failed:', error.message)
      throw error
    }
  }

  /**
   * Stop the service
   * @param {Object} options - Shutdown options
   * @returns {Promise<void>}
   */
  async stop_service(options = {}) {
    const { force = false, timeout_ms = 30000 } = options

    if (this.service_state === SERVICE_STATES.STOPPED) {
      log('Service already stopped')
      return
    }

    try {
      this.set_service_state(SERVICE_STATES.STOPPING)

      log('Stopping Claude session import service...')

      // Stop health monitoring
      this.stop_health_monitoring()

      // Execute shutdown handlers
      if (!force) {
        await this.execute_shutdown_handlers(timeout_ms)
      }

      // Clear components
      this.service_components.clear()
      this.shutdown_handlers = []

      // Mark as stopped
      this.set_service_state(SERVICE_STATES.STOPPED)
      this.startup_time = null

      this.emit('service-stopped', {
        timestamp: Date.now(),
        forced: force
      })

      log('Claude session import service stopped')
    } catch (error) {
      this.set_service_state(SERVICE_STATES.ERROR)
      log('Service shutdown failed:', error.message)
      throw error
    }
  }

  /**
   * Restart the service
   * @param {Object} options - Restart options
   * @returns {Promise<void>}
   */
  async restart_service(options = {}) {
    log('Restarting Claude session import service...')

    await this.stop_service(options)
    await this.start_service(options)

    log('Service restart completed')
  }

  /**
   * Perform service health check
   * @returns {Promise<Object>} Health check results
   */
  async perform_health_check() {
    const health_status = {
      timestamp: Date.now(),
      state: this.service_state,
      uptime_ms: this.get_service_uptime(),
      components: {},
      issues: []
    }

    // Check service state
    if (this.service_state !== SERVICE_STATES.RUNNING) {
      health_status.issues.push(
        `Service not running (state: ${this.service_state})`
      )
    }

    // Check configuration
    if (!this.service_config) {
      health_status.issues.push('Service configuration not loaded')
    }

    // Check component health
    for (const [component_name, component] of this.service_components) {
      try {
        if (typeof component.perform_health_check === 'function') {
          const component_health = await component.perform_health_check()
          health_status.components[component_name] = component_health

          if (component_health.issues?.length > 0) {
            health_status.issues.push(
              ...component_health.issues.map(
                (issue) => `${component_name}: ${issue}`
              )
            )
          }
        } else {
          health_status.components[component_name] = { status: 'running' }
        }
      } catch (error) {
        health_status.components[component_name] = {
          status: 'error',
          error: error.message
        }
        health_status.issues.push(`${component_name}: ${error.message}`)
      }
    }

    health_status.healthy = health_status.issues.length === 0

    return health_status
  }

  /**
   * Initialize service configuration
   * @private
   */
  async initialize_service_configuration() {
    log('Loading service configuration...')

    this.service_config = get_claude_session_import_service_config()
    validate_claude_session_import_service_config(this.service_config)

    log('Service configuration loaded and validated')
  }

  /**
   * Validate service dependencies
   * @private
   */
  async validate_service_dependencies() {
    log('Validating service dependencies...')

    // Check Claude projects directory exists
    const claude_dir_exists = await directory_exists_in_filesystem({
      absolute_path: this.service_config.claude_projects_directory
    })
    if (!claude_dir_exists) {
      throw new Error(
        `Claude projects directory not found: ${this.service_config.claude_projects_directory}`
      )
    }

    // Check user base directory exists
    const user_base_dir_exists = await directory_exists_in_filesystem({
      absolute_path: this.service_config.user_base_directory
    })
    if (!user_base_dir_exists) {
      throw new Error(
        `User base directory not found: ${this.service_config.user_base_directory}`
      )
    }

    // Check thread directory exists
    const thread_dir_exists = await directory_exists_in_filesystem({
      absolute_path: this.service_config.thread_directory
    })
    if (!thread_dir_exists) {
      throw new Error(
        `Thread directory not found: ${this.service_config.thread_directory}`
      )
    }

    // Check storage server connectivity if configured
    const storage_config = get_storage_server_config()
    if (storage_config) {
      log(
        'Storage server configured, will validate connectivity during operation'
      )
    }

    log('Service dependencies validated')
  }

  /**
   * Set service state and emit event
   * @private
   * @param {string} new_state - New service state
   */
  set_service_state(new_state) {
    const previous_state = this.service_state
    this.service_state = new_state

    log(`Service state changed: ${previous_state} -> ${new_state}`)

    this.emit('state-changed', {
      previous_state,
      current_state: new_state,
      timestamp: Date.now()
    })
  }

  /**
   * Start health monitoring
   * @private
   */
  start_health_monitoring() {
    const health_check_interval_ms =
      this.service_config?.service?.health_check_interval_ms || 30000

    this.health_check_interval = setInterval(async () => {
      try {
        const health_status = await this.perform_health_check()

        this.emit('health-check', health_status)

        if (!health_status.healthy) {
          log('Health check found issues:', health_status.issues)
        }
      } catch (error) {
        log('Health check failed:', error.message)
        this.emit('health-check-error', error)
      }
    }, health_check_interval_ms)

    log('Health monitoring started')
  }

  /**
   * Stop health monitoring
   * @private
   */
  stop_health_monitoring() {
    if (this.health_check_interval) {
      clearInterval(this.health_check_interval)
      this.health_check_interval = null
      log('Health monitoring stopped')
    }
  }

  /**
   * Execute all shutdown handlers
   * @private
   * @param {number} timeout_ms - Timeout for shutdown handlers
   */
  async execute_shutdown_handlers(timeout_ms) {
    if (this.shutdown_handlers.length === 0) {
      return
    }

    log(`Executing ${this.shutdown_handlers.length} shutdown handlers...`)

    const shutdown_promises = this.shutdown_handlers.map(
      async (handler, index) => {
        try {
          await handler()
          log(`Shutdown handler ${index + 1} completed`)
        } catch (error) {
          log(`Shutdown handler ${index + 1} failed:`, error.message)
        }
      }
    )

    // Wait for all handlers with timeout
    await Promise.race([
      Promise.all(shutdown_promises),
      new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`Shutdown handlers timeout after ${timeout_ms}ms`))
        }, timeout_ms)
      })
    ])

    log('All shutdown handlers executed')
  }
}

/**
 * Create and return a singleton service manager instance
 */
let service_manager_instance = null

export function get_service_manager() {
  if (!service_manager_instance) {
    service_manager_instance = new ClaudeSessionImportServiceManager()
  }
  return service_manager_instance
}
