/**
 * File Subscriptions
 *
 * Subscription management for the file subscription system.
 * WebSocket-based file change notifications are in server/services/file-subscriptions/.
 */

export {
  subscribe_to_file,
  unsubscribe_from_file,
  get_file_subscribers,
  remove_connection,
  get_subscriptions
} from './subscription-manager.mjs'
