import debug from 'debug'
import { get_cursor_config } from '#libs-server/integrations/cursor/cursor-config.mjs'
import {
  find_cursor_composer_data,
  read_cursor_conversation,
  read_all_cursor_conversations,
  get_conversation_summary
} from './read-database.mjs'
import {
  normalize_cursor_conversation,
  normalize_cursor_conversations
} from './normalize-session.mjs'
import {
  create_thread_from_cursor_conversation,
  create_threads_from_cursor_conversations,
  validate_cursor_conversation,
  filter_valid_cursor_conversations
} from './thread/index.mjs'

const log = debug('integrations:cursor')

export const import_cursor_conversations_to_threads = async (options = {}) => {
  const config = get_cursor_config(options)
  const {
    cursor_data_path,
    filter_conversations,
    user_base_directory,
    dry_run,
    verbose
  } = config

  try {
    log(`Starting Cursor conversation import from ${cursor_data_path}`)

    // Step 1: Read all Cursor conversations
    log('Step 1: Reading Cursor conversations from SQLite...')
    const cursor_conversations = await read_all_cursor_conversations({
      db_path: cursor_data_path,
      filter_conversations
    })

    if (verbose) {
      log(`Found ${cursor_conversations.length} Cursor conversations:`)
      cursor_conversations.forEach((conv) => {
        const summary = get_conversation_summary(conv)
        log(
          `  ${conv.composer_id}: ${summary.message_count} messages (${summary.duration_minutes?.toFixed(1) || 'unknown'} min)`
        )
      })
    }

    // Step 2: Validate conversations
    log('Step 2: Validating conversations...')
    const { valid: valid_conversations, invalid: invalid_conversations } =
      filter_valid_cursor_conversations(cursor_conversations)

    log(
      `Validation complete: ${valid_conversations.length} valid, ${invalid_conversations.length} invalid`
    )

    if (invalid_conversations.length > 0 && verbose) {
      log('Invalid conversations:')
      invalid_conversations.forEach(({ composer_id, errors }) => {
        log(`  ${composer_id}: ${errors.join(', ')}`)
      })
    }

    if (dry_run) {
      log(
        'Dry run mode - would create threads for the following conversations:'
      )
      valid_conversations.forEach((conv) => {
        const summary = get_conversation_summary(conv)
        log(
          `  ${conv.composer_id}: ${summary.message_count} messages, ${summary.summary || 'No summary'}`
        )
      })

      return {
        dry_run: true,
        conversations_found: cursor_conversations.length,
        valid_conversations: valid_conversations.length,
        invalid_conversations: invalid_conversations.length,
        would_create: valid_conversations.length
      }
    }

    // Step 3: Create threads from valid conversations
    log(
      `Step 3: Creating threads from ${valid_conversations.length} valid conversations...`
    )
    const thread_results = await create_threads_from_cursor_conversations(
      valid_conversations,
      {
        user_base_directory,
        ...options
      }
    )

    // Step 4: Summary
    const final_summary = {
      total_composer_data_processed: cursor_conversations.length,
      conversations_found: cursor_conversations.length,
      valid_conversations: valid_conversations.length,
      invalid_conversations: invalid_conversations.length,
      threads_created: thread_results.created.length,
      threads_failed: thread_results.failed.length,
      success_rate: thread_results.summary.success_rate,
      results: thread_results
    }

    log('=== Import Summary ===')
    log(`Total conversations found: ${final_summary.conversations_found}`)
    log(`Valid conversations: ${final_summary.valid_conversations}`)
    log(`Threads created: ${final_summary.threads_created}`)
    log(`Success rate: ${final_summary.success_rate}%`)

    if (thread_results.failed.length > 0) {
      log('Failed threads:')
      thread_results.failed.forEach(({ composer_id, error }) => {
        log(`  ${composer_id}: ${error}`)
      })
    }

    return final_summary
  } catch (error) {
    log(`Error during Cursor conversation import: ${error.message}`)
    throw error
  }
}

export const import_single_cursor_conversation = async (
  composer_id,
  options = {}
) => {
  try {
    log(`Importing single Cursor conversation: ${composer_id}`)

    // Read the specific conversation
    const conversation = await read_cursor_conversation(composer_id, options)
    if (!conversation) {
      throw new Error(`Conversation ${composer_id} not found`)
    }

    log(
      `Found conversation with ${conversation.messages?.length || 0} messages`
    )

    // Validate
    const validation = validate_cursor_conversation(conversation)
    if (!validation.valid) {
      throw new Error(`Invalid conversation: ${validation.errors.join(', ')}`)
    }

    if (options.dry_run) {
      return {
        dry_run: true,
        composer_id,
        messages_found: conversation.messages?.length || 0,
        valid: true
      }
    }

    // Create thread
    const thread = await create_thread_from_cursor_conversation(
      conversation,
      options
    )

    return {
      composer_id,
      messages_found: conversation.messages?.length || 0,
      thread_created: thread.thread_id,
      thread_dir: thread.thread_dir
    }
  } catch (error) {
    log(`Error importing Cursor conversation ${composer_id}: ${error.message}`)
    throw error
  }
}

export const list_cursor_conversations = async (options = {}) => {
  const config = get_cursor_config(options)
  const { cursor_data_path } = config

  try {
    const conversations = await read_all_cursor_conversations({
      db_path: cursor_data_path
    })

    return conversations.map((conv) => {
      const summary = get_conversation_summary(conv)

      const conv_info = {
        composer_id: conv.composer_id,
        message_count: summary.message_count,
        start_time: summary.start_time,
        end_time: summary.end_time,
        duration_minutes: summary.duration_minutes,
        created_at: conv.created_at,
        last_updated_at: conv.last_updated_at,
        summary: summary.summary,
        has_code_blocks: summary.has_code_blocks,
        model_used: summary.model_used
      }

      return conv_info
    })
  } catch (error) {
    log(`Error listing Cursor conversations: ${error.message}`)
    throw error
  }
}

// Re-export key functions for convenience
export {
  find_cursor_composer_data,
  read_cursor_conversation,
  read_all_cursor_conversations,
  get_conversation_summary,
  normalize_cursor_conversation,
  normalize_cursor_conversations,
  create_thread_from_cursor_conversation,
  create_threads_from_cursor_conversations,
  validate_cursor_conversation,
  filter_valid_cursor_conversations
}
