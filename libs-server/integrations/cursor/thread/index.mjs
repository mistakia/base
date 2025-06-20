import debug from 'debug'
import { v5 as uuidv5 } from 'uuid'
import { normalize_cursor_conversation } from '../normalize-session.mjs'
import {
  create_thread_from_session,
  check_thread_exists
} from '../../thread/create-from-session.mjs'

const log = debug('integrations:cursor:thread')

// UUID namespace for Cursor threads
const CURSOR_THREAD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

/**
 * Generate a deterministic thread ID from Cursor composer ID
 */
export const generate_thread_id_from_cursor_conversation = (composer_id) => {
  return uuidv5(`cursor:${composer_id}`, CURSOR_THREAD_NAMESPACE)
}

/**
 * Validate a Cursor conversation for thread creation
 */
export const validate_cursor_conversation = (conversation) => {
  const errors = []

  // Required fields
  if (!conversation.composer_id) {
    errors.push('Missing composer_id')
  }

  if (!conversation.messages || !Array.isArray(conversation.messages)) {
    errors.push('Missing or invalid messages array')
  } else if (conversation.messages.length === 0) {
    errors.push('No messages in conversation')
  }

  // Validate message structure
  for (let i = 0; i < Math.min(conversation.messages.length, 5); i++) {
    const msg = conversation.messages[i]
    if (!msg.id) {
      errors.push(`Message ${i} missing id`)
    }
    if (!msg.role) {
      errors.push(`Message ${i} missing role`)
    }
    if (!msg.content && !msg.content_parts) {
      errors.push(`Message ${i} has no content`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Filter valid Cursor conversations
 */
export const filter_valid_cursor_conversations = (conversations) => {
  const valid = []
  const invalid = []

  for (const conversation of conversations) {
    const validation = validate_cursor_conversation(conversation)
    if (validation.valid) {
      valid.push(conversation)
    } else {
      invalid.push({
        composer_id: conversation.composer_id,
        errors: validation.errors
      })
    }
  }

  return { valid, invalid }
}

/**
 * Create a Base thread from a Cursor conversation
 */
export const create_thread_from_cursor_conversation = async (conversation, options = {}) => {
  log(`Creating thread from Cursor conversation ${conversation.composer_id}`)

  // Validate conversation
  const validation = validate_cursor_conversation(conversation)
  if (!validation.valid) {
    throw new Error(`Invalid conversation: ${validation.errors.join(', ')}`)
  }

  // Generate thread ID
  const thread_id = generate_thread_id_from_cursor_conversation(conversation.composer_id)

  // Check if thread already exists
  const { exists } = await check_thread_exists(
    conversation.composer_id,
    'cursor',
    options.user_base_directory || process.env.USER_BASE_DIRECTORY || '/Users/trashman/user-base'
  )
  if (exists && !options.overwrite) {
    log(`Thread ${thread_id} already exists, skipping`)
    return {
      thread_id,
      status: 'skipped',
      reason: 'already_exists'
    }
  }

  // Normalize conversation to session format
  const session = normalize_cursor_conversation(conversation)

  // Add Cursor-specific metadata
  session.metadata.provider = 'cursor'
  session.metadata.original_composer_id = conversation.composer_id
  session.metadata.thread_id = thread_id

  // Create the thread using common utilities
  const thread = await create_thread_from_session(session, {
    ...options,
    thread_id,
    workflow_name: 'external-cursor-import',
    provider: 'cursor'
  })

  log(`Successfully created thread ${thread_id}`)
  return thread
}

/**
 * Create threads from multiple Cursor conversations
 */
export const create_threads_from_cursor_conversations = async (conversations, options = {}) => {
  log(`Creating threads from ${conversations.length} Cursor conversations`)

  const results = {
    created: [],
    failed: [],
    skipped: []
  }

  for (const conversation of conversations) {
    try {
      const result = await create_thread_from_cursor_conversation(conversation, options)

      if (result.status === 'skipped') {
        results.skipped.push(result)
      } else {
        results.created.push(result)
      }
    } catch (error) {
      log(`Failed to create thread for conversation ${conversation.composer_id}: ${error.message}`)
      results.failed.push({
        composer_id: conversation.composer_id,
        error: error.message
      })
    }
  }

  const total = results.created.length + results.failed.length + results.skipped.length
  const success_rate = total > 0 ? Math.round((results.created.length / total) * 100) : 0

  results.summary = {
    total: conversations.length,
    created: results.created.length,
    failed: results.failed.length,
    skipped: results.skipped.length,
    success_rate
  }

  log(`Thread creation complete: ${results.created.length} created, ${results.failed.length} failed, ${results.skipped.length} skipped`)
  return results
}
