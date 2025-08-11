/**
 * OpenAI Integration - Clean Provider Architecture
 *
 * Streamlined exports focused on the new session provider pattern.
 * No backward compatibility - use OpenAISessionProvider directly.
 */

import debug from 'debug'
import { OpenAISessionProvider } from './openai-session-provider.mjs'
import {
  get_openai_config,
  validate_openai_auth,
  OPENAI_DEFAULT_LIMITS
} from './openai-config.mjs'
import { create_openai_client } from './api/index.mjs'
import { create_threads_from_session_provider } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'

const log = debug('integrations:openai')

// Export the session provider class
export { OpenAISessionProvider }

// Export configuration helpers
export { get_openai_config, validate_openai_auth, OPENAI_DEFAULT_LIMITS }

// Export API client
export { create_openai_client }

/**
 * Import OpenAI conversations to Base threads
 */
export const import_openai_conversations_to_threads = async (options = {}) => {
  const config = get_openai_config(options)
  const provider = new OpenAISessionProvider()

  try {
    log('Starting OpenAI conversation import')

    // Find conversations using provider
    const openai_conversations = await provider.find_sessions({
      auth_options: {
        bearer_token: config.bearer_token,
        session_cookies: config.session_cookies,
        device_id: config.device_id,
        client_version: config.client_version
      },
      max_conversations: config.max_conversations
    })

    log(`Found ${openai_conversations.length} OpenAI conversations`)

    // Validate conversations
    const { valid: valid_conversations, invalid: invalid_conversations } =
      provider.filter_valid_sessions(openai_conversations)
    log(
      `Validation: ${valid_conversations.length} valid, ${invalid_conversations.length} invalid`
    )

    if (config.dry_run) {
      return {
        dry_run: true,
        conversations_found: openai_conversations.length,
        valid_conversations: valid_conversations.length,
        invalid_conversations: invalid_conversations.length
      }
    }

    // Create threads using unified provider system
    const results = await create_threads_from_session_provider({
      provider_name: 'openai',
      user_base_directory: config.user_base_directory,
      verbose: config.verbose,
      provider_options: { openai_conversations: valid_conversations }
    })

    return {
      conversations_found: openai_conversations.length,
      valid_conversations: valid_conversations.length,
      invalid_conversations: invalid_conversations.length,
      threads_created: results.created.length,
      threads_failed: results.failed.length,
      threads_skipped: results.skipped.length,
      results
    }
  } catch (error) {
    log(`OpenAI import failed: ${error.message}`)
    throw error
  }
}

/**
 * List OpenAI conversations
 */
export const list_openai_conversations = async (options = {}) => {
  const config = get_openai_config({
    max_conversations: OPENAI_DEFAULT_LIMITS.openai_list_limit,
    ...options
  })
  const provider = new OpenAISessionProvider()

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
    log(`Failed to list OpenAI conversations: ${error.message}`)
    throw error
  }
}

/**
 * Get OpenAI conversation by ID
 */
export const get_openai_conversation = async (
  conversation_id,
  auth_options
) => {
  const config = get_openai_config(auth_options)

  try {
    validate_openai_auth({
      bearer_token: config.bearer_token,
      session_cookies: config.session_cookies,
      device_id: config.device_id
    })

    const client = create_openai_client({
      bearer_token: config.bearer_token,
      session_cookies: config.session_cookies,
      device_id: config.device_id,
      client_version: config.client_version
    })

    return await client.get_conversation(conversation_id)
  } catch (error) {
    log(
      `Failed to get OpenAI conversation ${conversation_id}: ${error.message}`
    )
    throw error
  }
}

/**
 * Validate OpenAI authentication
 */
export const validate_openai_auth_endpoint = async (auth_options) => {
  try {
    const config = get_openai_config(auth_options)

    validate_openai_auth({
      bearer_token: config.bearer_token,
      session_cookies: config.session_cookies,
      device_id: config.device_id
    })

    const client = create_openai_client({
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
