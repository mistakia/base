/**
 * Claude Session Import Service
 *
 * Main entry point for the Claude session import service that provides:
 * - File system watching for Claude JSONL files
 * - Automatic session processing and thread creation
 * - Real-time synchronization with remote storage server
 * - Discord notifications for errors and status updates
 */

export {
  get_claude_session_import_service_config,
  validate_claude_session_import_service_config,
  get_storage_server_config,
  get_notification_config,
  get_processing_config,
  get_file_watching_config,
  get_sync_file_watching_config
} from './config.mjs'

export {
  ClaudeSessionImportServiceManager,
  get_service_manager,
  SERVICE_STATES
} from './service-manager.mjs'

export { ClaudeFileWatcher, FILE_WATCHER_STATES } from './file-watcher.mjs'

export { StorageSync, STORAGE_SYNC_STATES } from './storage-sync.mjs'

export {
  SessionProcessor,
  SESSION_PROCESSOR_STATES
} from './session-processor.mjs'

export {
  NotificationHandler,
  NOTIFICATION_HANDLER_STATES,
  NOTIFICATION_SEVERITY
} from './notification.mjs'
