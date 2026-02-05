/**
 * Thread Subscriptions
 *
 * Public API for the thread subscription system.
 * Provides WebSocket-based thread update targeting with subscription-based delivery.
 */

export {
  subscribe_to_thread,
  unsubscribe_from_thread,
  get_thread_subscribers,
  is_subscribed_to_thread,
  remove_connection,
  get_thread_subscriptions
} from './subscription-manager.mjs'
