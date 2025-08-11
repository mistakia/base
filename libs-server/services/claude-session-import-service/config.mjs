import path from 'path'
import os from 'os'

import config from '#config'
import { get_claude_config } from '#libs-server/integrations/claude/claude-config.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

/**
 * Default configuration values for the Claude session import service
 */
const CLAUDE_SESSION_IMPORT_SERVICE_DEFAULTS = {
  service: {
    health_check_interval_ms: 30000
  },
  processing: {
    debounce_ms: 500,
    max_retries: 3,
    backoff_factor: 2,
    initial_backoff_ms: 1000
  },
  notifications: {
    discord_script: null,
    alert_on_errors: true,
    throttle_ms: 60000 // 1 minute throttling for repeated errors
  },
  storage_server: {
    sync_timeout_ms: 30000,
    check_interval_ms: 5000,
    max_concurrent_syncs: 3,
    max_retries: 3,
    retry_backoff_ms_base: 1000,
    rsync_delete: true,
    ssh_strict_host_key_checking: false,
    debounce_ms: 1000,
    file_watching: {
      ignore_patterns: [
        '**/.DS_Store',
        '**/Thumbs.db',
        '**/*.tmp',
        '**/*.temp',
        '**/*.swp',
        '**/*.swo',
        '**/*~'
      ]
    }
  },
  file_watching: {
    ignore_patterns: [
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.tmp',
      '**/*.temp',
      '**/*.swp',
      '**/*.swo',
      '**/*~'
    ],
    use_polling: false,
    polling_interval_ms: 1000,
    debounce_ms: 500
  }
}

/**
 * Get the complete configuration for the Claude session import service
 * @returns {Object} Service configuration object
 */
export function get_claude_session_import_service_config() {
  const base_config = config.claude_session_import_service || {}
  const claude_config = get_claude_config()

  // Merge with defaults, prioritizing user configuration
  const service_config = {
    ...CLAUDE_SESSION_IMPORT_SERVICE_DEFAULTS,
    ...base_config
  }

  service_config.service = {
    ...CLAUDE_SESSION_IMPORT_SERVICE_DEFAULTS.service,
    ...(base_config.service || {})
  }

  // Merge nested objects properly
  service_config.processing = {
    ...CLAUDE_SESSION_IMPORT_SERVICE_DEFAULTS.processing,
    ...(base_config.processing || {})
  }

  service_config.notifications = {
    ...CLAUDE_SESSION_IMPORT_SERVICE_DEFAULTS.notifications,
    ...(base_config.notifications || {})
  }

  service_config.storage_server = {
    ...CLAUDE_SESSION_IMPORT_SERVICE_DEFAULTS.storage_server,
    ...(base_config.storage_server || {})
  }

  service_config.file_watching = {
    ...CLAUDE_SESSION_IMPORT_SERVICE_DEFAULTS.file_watching,
    ...(base_config.file_watching || {})
  }

  // Add computed values
  // Expand tilde in the projects directory path
  let claude_projects_directory = claude_config.claude_projects_directory
  if (claude_projects_directory && claude_projects_directory.startsWith('~')) {
    claude_projects_directory = path.join(
      os.homedir(),
      claude_projects_directory.slice(1)
    )
  }

  service_config.claude_projects_directory = claude_projects_directory
  service_config.user_base_directory = get_user_base_directory()
  service_config.thread_directory = path.join(
    service_config.user_base_directory,
    'thread'
  )

  return service_config
}

/**
 * Validate the service configuration
 * @param {Object} service_config - The service configuration to validate
 * @throws {Error} If configuration is invalid
 */
export function validate_claude_session_import_service_config(service_config) {
  const required_fields = [
    'claude_projects_directory',
    'user_base_directory',
    'thread_directory'
  ]

  for (const field of required_fields) {
    if (!service_config[field]) {
      throw new Error(`Missing required configuration field: ${field}`)
    }
  }

  // Validate storage server configuration if provided
  if (service_config.storage_server) {
    const { host, user, remote_path } = service_config.storage_server

    if (host && (!user || !remote_path)) {
      throw new Error(
        'Storage server configuration requires host, user, and remote_path when host is specified'
      )
    }

    if (service_config.storage_server.sync_timeout_ms < 1000) {
      throw new Error('Storage server sync timeout must be at least 1000ms')
    }

    if (service_config.storage_server.max_retries < 0) {
      throw new Error('Storage server max_retries must be >= 0')
    }

    if (service_config.storage_server.retry_backoff_ms_base < 0) {
      throw new Error('Storage server retry_backoff_ms_base must be >= 0ms')
    }
  }

  // Validate processing configuration
  if (service_config.processing.debounce_ms < 100) {
    throw new Error('Processing debounce must be at least 100ms')
  }

  if (service_config.processing.max_retries < 1) {
    throw new Error('Processing max_retries must be at least 1')
  }

  if (service_config.processing.backoff_factor < 1) {
    throw new Error('Processing backoff_factor must be at least 1')
  }

  // Validate notification configuration
  if (service_config.notifications.throttle_ms < 1000) {
    throw new Error('Notification throttle must be at least 1000ms')
  }

  // Validate service config
  if (service_config.service.health_check_interval_ms < 1000) {
    throw new Error('Service health_check_interval_ms must be at least 1000ms')
  }
}

/**
 * Get storage server configuration with resolved paths
 * @returns {Object|null} Storage server configuration or null if not configured
 */
export function get_storage_server_config() {
  const service_config = get_claude_session_import_service_config()

  if (!service_config.storage_server?.host) {
    return null
  }

  const { host, user, remote_path, ...rest } = service_config.storage_server

  return {
    host,
    user,
    remote_path,
    local_path: service_config.thread_directory,
    ...rest
  }
}

/**
 * Get notification configuration with resolved script path
 * @returns {Object} Notification configuration
 */
export function get_notification_config() {
  const service_config = get_claude_session_import_service_config()
  const user_base_dir = get_user_base_directory()

  let discord_script_path = service_config.notifications.discord_script

  // Resolve relative path to absolute
  if (discord_script_path && discord_script_path.startsWith('~')) {
    discord_script_path = path.join(os.homedir(), discord_script_path.slice(1))
  } else if (discord_script_path && discord_script_path.startsWith('./')) {
    discord_script_path = path.resolve(
      user_base_dir,
      discord_script_path.slice(2)
    )
  }

  return {
    ...service_config.notifications,
    discord_script: discord_script_path
  }
}

/**
 * Get processing configuration
 * @returns {Object} Processing configuration
 */
export function get_processing_config() {
  const service_config = get_claude_session_import_service_config()
  return service_config.processing
}

/**
 * Get file watching configuration
 * @returns {Object} File watching configuration
 */
export function get_file_watching_config() {
  const service_config = get_claude_session_import_service_config()
  return service_config.file_watching
}

/**
 * Get sync file watching configuration
 * Prefers storage_server scoped file_watching if present
 * @returns {Object} Sync file watching configuration
 */
export function get_sync_file_watching_config() {
  const service_config = get_claude_session_import_service_config()
  return (
    service_config.storage_server?.file_watching || service_config.file_watching
  )
}
