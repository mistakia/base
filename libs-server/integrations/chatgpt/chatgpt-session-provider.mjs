/**
 * ChatGPT Session Provider
 *
 * Implementation of SessionProviderBase for ChatGPT conversations.
 * Uses helper functions to keep class focused and maintainable.
 */

import { SessionProviderBase } from '#libs-server/integrations/thread/session-provider-base.mjs'
import { normalize_chatgpt_conversation } from '#libs-server/integrations/chatgpt/normalize-session.mjs'
import {
  find_chatgpt_sessions_from_data,
  find_chatgpt_sessions_from_api,
  validate_chatgpt_session_structure,
  extract_chatgpt_models_from_session,
  get_chatgpt_inference_provider,
  get_chatgpt_session_id,
  generate_chatgpt_thread_id,
  generate_chatgpt_thread_metadata
} from './chatgpt-session-helpers.mjs'

export class ChatGPTSessionProvider extends SessionProviderBase {
  constructor() {
    super({ provider_name: 'chatgpt' })
  }

  /**
   * Find ChatGPT conversations from provided data or API
   * If chatgpt_conversations are provided, use them directly.
   * Otherwise, discover conversations from ChatGPT API.
   */
  async find_sessions({
    chatgpt_conversations = [],
    auth_options,
    max_conversations
  } = {}) {
    // If conversations are provided directly, use them
    if (chatgpt_conversations.length > 0) {
      return await find_chatgpt_sessions_from_data({
        conversations: chatgpt_conversations
      })
    }

    // Otherwise discover from API
    return await find_chatgpt_sessions_from_api({
      auth_options,
      max_conversations
    })
  }

  /**
   * Normalize ChatGPT conversation to common format
   */
  normalize_session(raw_session) {
    return normalize_chatgpt_conversation(raw_session)
  }

  /**
   * Validate ChatGPT conversation structure
   */
  validate_session(raw_session) {
    return validate_chatgpt_session_structure({ session: raw_session })
  }

  /**
   * Get inference provider name for ChatGPT
   */
  get_inference_provider() {
    return get_chatgpt_inference_provider()
  }

  /**
   * Extract models from ChatGPT conversation metadata
   */
  get_models_from_session(raw_session) {
    return extract_chatgpt_models_from_session({ raw_session })
  }

  /**
   * Get session ID from ChatGPT conversation
   */
  get_session_id(raw_session) {
    return get_chatgpt_session_id({ raw_session })
  }

  /**
   * Generate thread ID for ChatGPT session
   */
  async generate_thread_id(raw_session) {
    const session_id = this.get_session_id(raw_session)
    return generate_chatgpt_thread_id({ session_id })
  }

  /**
   * Generate thread metadata for ChatGPT conversation
   */
  generate_thread_metadata({ conversation }) {
    return generate_chatgpt_thread_metadata({ conversation })
  }
}
