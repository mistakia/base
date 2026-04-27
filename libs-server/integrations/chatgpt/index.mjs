/**
 * ChatGPT Integration - Clean Provider Architecture
 *
 * Streamlined exports focused on the new session provider pattern.
 * No backward compatibility - use ChatGPTSessionProvider directly.
 */

import debug from 'debug'
import { ChatGPTSessionProvider } from './chatgpt-session-provider.mjs'
import {
  get_chatgpt_config,
  validate_chatgpt_auth,
  CHATGPT_DEFAULT_LIMITS
} from './chatgpt-config.mjs'
import { create_chatgpt_client } from './api/index.mjs'
import { create_threads_from_session_provider } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'

const log = debug('integrations:chatgpt')

// Export the session provider class
export { ChatGPTSessionProvider }

// Export configuration helpers
export { get_chatgpt_config, validate_chatgpt_auth, CHATGPT_DEFAULT_LIMITS }

// Export API client
export { create_chatgpt_client }

/**
 * Import ChatGPT conversations to Base threads
 */
export const import_chatgpt_conversations_to_threads = async (options = {}) => {
  const config = get_chatgpt_config(options)
  const provider = new ChatGPTSessionProvider()

  try {
    log('Starting ChatGPT conversation import')

    // Find conversations using provider
    const chatgpt_conversations = await provider.find_sessions({
      auth_options: {
        bearer_token: config.bearer_token,
        session_cookies: config.session_cookies,
        device_id: config.device_id,
        client_version: config.client_version
      },
      max_conversations: config.max_conversations
    })

    log(`Found ${chatgpt_conversations.length} ChatGPT conversations`)

    // Validate conversations
    const { valid: valid_conversations, invalid: invalid_conversations } =
      provider.filter_valid_sessions(chatgpt_conversations)
    log(
      `Validation: ${valid_conversations.length} valid, ${invalid_conversations.length} invalid`
    )

    if (config.dry_run) {
      return {
        dry_run: true,
        conversations_found: chatgpt_conversations.length,
        valid_conversations: valid_conversations.length,
        invalid_conversations: invalid_conversations.length
      }
    }

    // Create threads using unified provider system
    const results = await create_threads_from_session_provider({
      provider_name: 'chatgpt',
      user_base_directory: config.user_base_directory,
      verbose: config.verbose,
      provider_options: { chatgpt_conversations: valid_conversations },
      bulk_import: options.bulk_import === true
    })

    return {
      conversations_found: chatgpt_conversations.length,
      valid_conversations: valid_conversations.length,
      invalid_conversations: invalid_conversations.length,
      threads_created: results.created.length,
      threads_failed: results.failed.length,
      threads_skipped: results.skipped.length,
      results
    }
  } catch (error) {
    log(`ChatGPT import failed: ${error.message}`)
    throw error
  }
}

/**
 * List ChatGPT conversations
 */
export const list_chatgpt_conversations = async (options = {}) => {
  const config = get_chatgpt_config({
    max_conversations: CHATGPT_DEFAULT_LIMITS.chatgpt_list_limit,
    ...options
  })
  const provider = new ChatGPTSessionProvider()

  try {
    const conversations = await provider.find_sessions({
      auth_options: {
        bearer_token: config.bearer_token,
        session_cookies: config.session_cookies,
        device_id: config.device_id,
        client_version: config.client_version
      },
      max_conversations: config.max_conversations
    })

    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.create_time,
      updated_at: conversation.update_time,
      is_archived: conversation.is_archived,
      is_starred: conversation.is_starred,
      memory_scope: conversation.memory_scope,
      gizmo_id: conversation.gizmo_id
    }))
  } catch (error) {
    log(`Failed to list ChatGPT conversations: ${error.message}`)
    throw error
  }
}

/**
 * Get ChatGPT conversation by ID
 */
export const get_chatgpt_conversation = async (
  conversation_id,
  auth_options
) => {
  const config = get_chatgpt_config(auth_options)

  try {
    validate_chatgpt_auth({
      bearer_token: config.bearer_token,
      session_cookies: config.session_cookies,
      device_id: config.device_id
    })

    const client = create_chatgpt_client({
      bearer_token: config.bearer_token,
      session_cookies: config.session_cookies,
      device_id: config.device_id,
      client_version: config.client_version
    })

    return await client.get_conversation(conversation_id)
  } catch (error) {
    log(
      `Failed to get ChatGPT conversation ${conversation_id}: ${error.message}`
    )
    throw error
  }
}

/**
 * Validate ChatGPT authentication
 */
export const validate_chatgpt_auth_endpoint = async (auth_options) => {
  try {
    const config = get_chatgpt_config(auth_options)

    validate_chatgpt_auth({
      bearer_token: config.bearer_token,
      session_cookies: config.session_cookies,
      device_id: config.device_id
    })

    const client = create_chatgpt_client({
      bearer_token: config.bearer_token,
      session_cookies: config.session_cookies,
      device_id: config.device_id,
      client_version: config.client_version
    })

    const response = await client.list_conversations({ limit: 1 })

    return {
      valid: true,
      total_conversations: response.total || 0,
      message: 'Authentication successful'
    }
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      message: 'Authentication failed'
    }
  }
}
