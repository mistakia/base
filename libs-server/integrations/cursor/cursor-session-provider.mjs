/**
 * Cursor Session Provider
 *
 * Implementation of SessionProviderBase for Cursor conversations.
 * Uses helper functions to keep class focused and maintainable.
 */

import { SessionProviderBase } from '#libs-server/integrations/thread/session-provider-base.mjs'
import { normalize_cursor_conversation } from '#libs-server/integrations/cursor/normalize-session.mjs'
import {
  find_cursor_sessions_from_data,
  find_cursor_sessions_from_database,
  validate_cursor_session_structure,
  extract_cursor_models_from_session,
  get_cursor_inference_provider,
  get_cursor_session_id,
  generate_cursor_thread_id
} from './cursor-session-helpers.mjs'
import { get_cursor_config } from './cursor-config.mjs'

export class CursorSessionProvider extends SessionProviderBase {
  constructor() {
    super({ provider_name: 'cursor' })
  }

  /**
   * Find Cursor conversations from provided data or database
   * If cursor_conversations are provided, use them directly.
   * Otherwise, discover conversations from Cursor database.
   */
  async find_sessions({
    cursor_conversations = [],
    cursor_data_path,
    filter_conversations
  } = {}) {
    // If conversations are provided directly, use them
    if (cursor_conversations.length > 0) {
      return await find_cursor_sessions_from_data({
        conversations: cursor_conversations
      })
    }

    // Otherwise discover from database
    const config = get_cursor_config({ cursor_data_path })
    return await find_cursor_sessions_from_database({
      cursor_data_path: config.cursor_data_path,
      filter_conversations
    })
  }

  /**
   * Normalize Cursor conversation to common format
   */
  normalize_session(raw_session) {
    return normalize_cursor_conversation(raw_session)
  }

  /**
   * Validate Cursor conversation structure
   */
  validate_session(raw_session) {
    return validate_cursor_session_structure({ session: raw_session })
  }

  /**
   * Get inference provider name for Cursor
   */
  get_inference_provider() {
    return get_cursor_inference_provider()
  }

  /**
   * Extract models from Cursor conversation
   */
  get_models_from_session(raw_session) {
    return extract_cursor_models_from_session({ raw_session })
  }

  /**
   * Get session ID from Cursor conversation
   */
  get_session_id(raw_session) {
    return get_cursor_session_id({ raw_session })
  }

  /**
   * Generate thread ID for Cursor session
   */
  async generate_thread_id(raw_session) {
    const composer_id = this.get_session_id(raw_session)
    return generate_cursor_thread_id({ composer_id })
  }
}
