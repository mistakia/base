/**
 * File Subscriptions
 *
 * Public API for the file subscription system.
 * Provides WebSocket-based file change notifications with subscription-based targeting.
 */

export {
  subscribe_to_file,
  unsubscribe_from_file,
  get_file_subscribers,
  remove_connection,
  get_subscriptions
} from './subscription-manager.mjs'

export {
  start_file_subscription_watcher,
  stop_file_subscription_watcher,
  emit_file_changed,
  emit_file_deleted
} from './file-watcher.mjs'
