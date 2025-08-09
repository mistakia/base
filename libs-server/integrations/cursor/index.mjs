/**
 * Cursor Integration - Clean Provider Architecture
 *
 * Streamlined exports focused on the new session provider pattern.
 * No backward compatibility - use CursorSessionProvider directly.
 */

import debug from 'debug'
import { CursorSessionProvider } from './cursor-session-provider.mjs'
import { get_cursor_config } from './cursor-config.mjs'
import { get_conversation_summary } from './read-database.mjs'

const log = debug('integrations:cursor')

// Export the session provider class
export { CursorSessionProvider }

// Export configuration helpers
export { get_cursor_config }

// Export database utilities
export { get_conversation_summary }

/**
 * Import Cursor conversations to Base threads
 */
export const import_cursor_conversations_to_threads = async (options = {}) => {
  const config = get_cursor_config(options)
  const provider = new CursorSessionProvider()

  try {
    log('Starting Cursor conversation import')

    // Find conversations using provider
    const cursor_conversations = await provider.find_sessions({
      cursor_data_path: config.cursor_data_path,
      filter_conversations: config.filter_conversations
    })

    log(`Found ${cursor_conversations.length} Cursor conversations`)

    // Validate conversations
    const { valid: valid_conversations, invalid: invalid_conversations } =
      provider.filter_valid_sessions(cursor_conversations)
    log(
      `Validation: ${valid_conversations.length} valid, ${invalid_conversations.length} invalid`
    )

    if (config.dry_run) {
      return {
        dry_run: true,
        conversations_found: cursor_conversations.length,
        valid_conversations: valid_conversations.length,
        invalid_conversations: invalid_conversations.length
      }
    }

    // Create threads using unified provider system
    const { create_threads_from_session_provider } = await import(
      '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'
    )
    const results = await create_threads_from_session_provider({
      provider_name: 'cursor',
      user_base_directory: config.user_base_directory,
      verbose: config.verbose,
      provider_options: { cursor_conversations: valid_conversations }
    })

    return {
      conversations_found: cursor_conversations.length,
      valid_conversations: valid_conversations.length,
      invalid_conversations: invalid_conversations.length,
      threads_created: results.created.length,
      threads_failed: results.failed.length,
      threads_skipped: results.skipped.length,
      results
    }
  } catch (error) {
    log(`Cursor import failed: ${error.message}`)
    throw error
  }
}

/**
 * List Cursor conversations
 */
export const list_cursor_conversations = async (options = {}) => {
  const config = get_cursor_config(options)
  const provider = new CursorSessionProvider()

  try {
    const conversations = await provider.find_sessions({
      cursor_data_path: config.cursor_data_path,
      filter_conversations: config.filter_conversations
    })

    return conversations.map((conversation) => {
      const summary = get_conversation_summary(conversation)
      return {
        composer_id: conversation.composer_id,
        message_count: summary.message_count,
        tool_call_count: summary.tool_call_count,
        duration_minutes: summary.duration_minutes,
        created_at: conversation.created_at,
        last_updated_at: conversation.last_updated_at,
        summary: summary.summary,
        has_code_blocks: summary.has_code_blocks,
        model_used: summary.model_used
      }
    })
  } catch (error) {
    log(`Failed to list Cursor conversations: ${error.message}`)
    throw error
  }
}
