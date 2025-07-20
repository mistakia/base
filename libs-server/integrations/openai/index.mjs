/**
 * OpenAI Integration Main Entry Point
 *
 * Coordinates OpenAI/ChatGPT conversation import and conversion to Base threads.
 * Handles API access, data normalization, and thread creation.
 */

import debug from 'debug'
import {
  get_openai_config,
  validate_openai_auth,
  OPENAI_DEFAULT_LIMITS
} from '#libs-server/integrations/openai/openai-config.mjs'
import { create_openai_client } from './api/index.mjs'
import {
  normalize_openai_conversation,
  validate_openai_session
} from './normalize-session.mjs'
import { create_threads_from_openai_conversations } from './thread/index.mjs'

const log = debug('integrations:openai')

/**
 * Import OpenAI conversations to Base threads
 */
export async function import_openai_conversations_to_threads(options = {}) {
  const config = get_openai_config(options)
  const {
    // Authentication (required)
    bearer_token,
    session_cookies,
    device_id,
    client_version,

    // Filtering options
    filter_conversations,
    max_conversations,

    // Output options
    user_base_directory,
    dry_run,
    verbose
  } = config

  try {
    log('Starting OpenAI conversation import')

    // Validate authentication
    validate_openai_auth({ bearer_token, session_cookies, device_id })

    if (verbose) {
      log('Options:', {
        max_conversations,
        dry_run,
        has_auth: true
      })
    }

    // Step 1: Create API client
    log('Step 1: Creating OpenAI API client...')
    const client = create_openai_client({
      bearer_token,
      session_cookies,
      device_id,
      client_version
    })

    // Step 2: List conversations
    log('Step 2: Fetching conversations from OpenAI API...')
    const conversations = await client.get_all_conversations({
      max_conversations
    })

    log(`Found ${conversations.length} conversations`)

    // Step 3: Filter conversations if specified
    let filtered_conversations = conversations
    if (filter_conversations && typeof filter_conversations === 'function') {
      filtered_conversations = conversations.filter(filter_conversations)
      log(`Filtered to ${filtered_conversations.length} conversations`)
    }

    // Step 4: Fetch full conversation data
    log('Step 3: Fetching full conversation data...')
    const full_conversations = []
    const failed_fetches = []

    for (const conv_summary of filtered_conversations) {
      try {
        const full_conversation = await client.get_conversation(conv_summary.id)
        full_conversations.push(full_conversation)

        if (verbose) {
          log(`✓ Fetched: ${full_conversation.title} (${full_conversation.id})`)
        }

        // Rate limiting - be respectful to the API
        await new Promise((resolve) =>
          setTimeout(resolve, OPENAI_DEFAULT_LIMITS.openai_request_delay)
        )
      } catch (error) {
        log(
          `✗ Failed to fetch conversation ${conv_summary.id}: ${error.message}`
        )
        failed_fetches.push({
          id: conv_summary.id,
          title: conv_summary.title,
          error: error.message
        })
      }
    }

    log(`Successfully fetched ${full_conversations.length} full conversations`)

    // Step 5: Normalize conversations
    log('Step 4: Normalizing conversation data...')
    const normalized_sessions = []
    const normalization_errors = []

    for (const conversation of full_conversations) {
      try {
        const normalized = normalize_openai_conversation(conversation)
        const validation = validate_openai_session(normalized)

        if (validation.valid) {
          normalized_sessions.push(normalized)
          if (verbose) {
            log(
              `✓ Normalized: ${normalized.title} (${normalized.messages.length} messages)`
            )
          }
        } else {
          log(
            `✗ Invalid session ${conversation.id}: ${validation.errors.join(', ')}`
          )
          normalization_errors.push({
            id: conversation.id,
            title: conversation.title,
            errors: validation.errors
          })
        }
      } catch (error) {
        log(`✗ Normalization error ${conversation.id}: ${error.message}`)
        normalization_errors.push({
          id: conversation.id,
          title: conversation.title || 'Unknown',
          error: error.message
        })
      }
    }

    log(`Normalized ${normalized_sessions.length} valid sessions`)

    // Step 6: Create threads (if not dry run)
    if (dry_run) {
      log('Dry run - skipping thread creation')
      return {
        dry_run: true,
        conversations_found: conversations.length,
        conversations_filtered: filtered_conversations.length,
        conversations_fetched: full_conversations.length,
        valid_sessions: normalized_sessions.length,
        would_create: normalized_sessions.length,
        failed_fetches,
        normalization_errors
      }
    }

    log('Step 5: Creating Base threads...')
    const thread_results = await create_threads_from_openai_conversations(
      normalized_sessions,
      { user_base_directory, verbose }
    )

    const total_time = Date.now() - (options._start_time || Date.now())

    log(`OpenAI import completed in ${(total_time / 1000).toFixed(1)}s`)
    log(
      `Results: ${thread_results.created.length} created, ${thread_results.failed.length} failed, ${thread_results.skipped.length} skipped`
    )

    return {
      conversations_found: conversations.length,
      conversations_filtered: filtered_conversations.length,
      conversations_fetched: full_conversations.length,
      valid_sessions: normalized_sessions.length,
      threads_created: thread_results.created.length,
      threads_failed: thread_results.failed.length,
      threads_skipped: thread_results.skipped.length,
      failed_fetches,
      normalization_errors,
      thread_results
    }
  } catch (error) {
    log(`OpenAI import failed: ${error.message}`)
    throw error
  }
}

/**
 * List OpenAI conversations with filtering
 */
export async function list_openai_conversations(options = {}) {
  const config = get_openai_config({
    max_conversations: OPENAI_DEFAULT_LIMITS.openai_list_limit,
    ...options
  })
  const {
    bearer_token,
    session_cookies,
    device_id,
    client_version,
    max_conversations
  } = config

  try {
    log('Listing OpenAI conversations')

    // Validate authentication
    validate_openai_auth({ bearer_token, session_cookies, device_id })

    const client = create_openai_client({
      bearer_token,
      session_cookies,
      device_id,
      client_version
    })

    const conversations = await client.get_all_conversations({
      max_conversations
    })

    // Always include conversation summaries
    const summaries = conversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      created_at: conv.create_time,
      updated_at: conv.update_time,
      is_archived: conv.is_archived,
      is_starred: conv.is_starred,
      memory_scope: conv.memory_scope,
      gizmo_id: conv.gizmo_id
    }))

    return summaries
  } catch (error) {
    log(`Failed to list OpenAI conversations: ${error.message}`)
    throw error
  }
}

/**
 * Get OpenAI conversation by ID
 */
export async function get_openai_conversation(conversation_id, auth_options) {
  const config = get_openai_config(auth_options)
  const { bearer_token, session_cookies, device_id, client_version } = config

  try {
    // Validate authentication
    validate_openai_auth({ bearer_token, session_cookies, device_id })

    const client = create_openai_client({
      bearer_token,
      session_cookies,
      device_id,
      client_version
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
export async function validate_openai_auth_endpoint(auth_options) {
  try {
    const config = get_openai_config(auth_options)
    const { bearer_token, session_cookies, device_id, client_version } = config

    // Validate authentication
    validate_openai_auth({ bearer_token, session_cookies, device_id })

    const client = create_openai_client({
      bearer_token,
      session_cookies,
      device_id,
      client_version
    })

    // Test with minimal request
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
