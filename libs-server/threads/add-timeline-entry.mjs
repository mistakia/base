import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import debug from 'debug'

import get_thread from './get-thread.mjs'
import {
  THREAD_MESSAGE_ROLE,
  validate_thread_message_role
} from './threads-constants.mjs'

const log = debug('threads:timeline')

// Valid timeline entry types
const VALID_ENTRY_TYPES = [
  'message',
  'tool_call',
  'tool_result',
  'state_change',
  'error',
  'thread_main_request'
]

// Validation functions for different entry types
const entry_validators = {
  message: (entry) => {
    if (!entry.role) throw new Error('message entry must have a role')

    // Validate using the standardized roles
    try {
      validate_thread_message_role(entry.role)
    } catch (error) {
      throw new Error(`Invalid message role: ${error.message}`)
    }

    if (!entry.content) throw new Error('message entry must have content')
  },

  thread_main_request: (entry) => {
    if (!entry.content)
      throw new Error('thread_main_request entry must have content')
  },

  tool_call: (entry) => {
    if (!entry.content.tool_name)
      throw new Error('tool_call entry must have a tool_name')
    if (!entry.content.tool_parameters)
      throw new Error('tool_call entry must have parameters')
  },

  tool_result: (entry) => {
    if (!entry.content.result)
      throw new Error('tool_result entry must have a result')
  },

  state_change: (entry) => {
    if (!entry.previous_state)
      throw new Error('state_change entry must have a previous_state')
    if (!entry.new_state)
      throw new Error('state_change entry must have a new_state')
  },

  error: (entry) => {
    if (!entry.error_type)
      throw new Error('error entry must have an error_type')
    if (!entry.message) throw new Error('error entry must have a message')
  }
}

/**
 * Add an entry to a thread's timeline
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {Object} params.entry Timeline entry to add
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Updated thread data
 */
export default async function add_timeline_entry({
  thread_id,
  entry,
  user_base_directory
}) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  if (!entry || typeof entry !== 'object') {
    throw new Error('entry is required and must be an object')
  }

  if (!entry.type) {
    throw new Error('entry must have a type')
  }

  if (!VALID_ENTRY_TYPES.includes(entry.type)) {
    throw new Error(
      `Invalid entry type: ${entry.type}. Must be one of: ${VALID_ENTRY_TYPES.join(', ')}`
    )
  }

  // Get the thread
  const thread = await get_thread({
    thread_id,
    user_base_directory
  })

  // Clone the entry to avoid modifying the original
  const new_entry = { ...entry }

  // Set timestamp and ID if not provided
  if (!new_entry.timestamp) {
    new_entry.timestamp = new Date().toISOString()
  }

  if (!new_entry.id) {
    new_entry.id = `${entry.type}_${uuid().split('-')[0]}`
  }

  // Validate entry based on type
  if (entry_validators[new_entry.type]) {
    try {
      entry_validators[new_entry.type](new_entry)
    } catch (error) {
      throw new Error(`Invalid ${new_entry.type} entry: ${error.message}`)
    }
  }

  log(`Adding ${new_entry.type} entry to thread ${thread_id}`)

  // Add entry to timeline
  const timeline = [...thread.timeline, new_entry]

  // Write updated timeline
  await fs.writeFile(
    path.join(thread.context_dir, 'timeline.json'),
    JSON.stringify(timeline, null, 2),
    'utf-8'
  )

  // Update metadata.updated_at
  const metadata = { ...thread }
  delete metadata.timeline
  delete metadata.context_dir

  metadata.updated_at = new_entry.timestamp

  // Write updated metadata
  await fs.writeFile(
    path.join(thread.context_dir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  )

  // Return updated thread data
  return {
    ...metadata,
    timeline,
    context_dir: thread.context_dir
  }
}

/**
 * Add a user message to a thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} params.content Message content
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Updated thread data with the new message
 */
export async function add_user_message({
  thread_id,
  content,
  user_base_directory
}) {
  if (!content) {
    throw new Error('content is required')
  }

  return add_timeline_entry({
    thread_id,
    entry: {
      type: 'message',
      role: THREAD_MESSAGE_ROLE.USER,
      content
    },
    user_base_directory
  })
}

/**
 * Add an assistant message to a thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} params.content Message content
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Updated thread data with the new message
 */
export async function add_assistant_message({
  thread_id,
  content,
  user_base_directory
}) {
  if (!content) {
    throw new Error('content is required')
  }

  return add_timeline_entry({
    thread_id,
    entry: {
      type: 'message',
      role: THREAD_MESSAGE_ROLE.THREAD_AGENT,
      content
    },
    user_base_directory
  })
}

/**
 * Add a tool call to a thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} params.tool_name Name of the tool
 * @param {Object} params.parameters Tool parameters
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Updated thread data with the tool call
 */
export async function add_tool_call({
  thread_id,
  tool_name,
  parameters,
  user_base_directory
}) {
  if (!tool_name) {
    throw new Error('tool_name is required')
  }

  if (!parameters) {
    throw new Error('parameters is required')
  }

  return add_timeline_entry({
    thread_id,
    entry: {
      type: 'tool_call',
      tool_name,
      parameters
    },
    user_base_directory
  })
}

/**
 * Add a tool result to a thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} params.tool_call_id ID of the tool call
 * @param {Object} params.result Tool execution result
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Updated thread data with the tool result
 */
export async function add_tool_result({
  thread_id,
  tool_call_id,
  result,
  user_base_directory
}) {
  if (!tool_call_id) {
    throw new Error('tool_call_id is required')
  }

  if (result === undefined) {
    throw new Error('result is required')
  }

  return add_timeline_entry({
    thread_id,
    entry: {
      type: 'tool_result',
      tool_call_id,
      result
    },
    user_base_directory
  })
}

/**
 * Add an error to a thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} params.error_type Type of error
 * @param {string} params.message Error message
 * @param {Object} [params.details] Additional error details
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Updated thread data with the error
 */
export async function add_error({
  thread_id,
  error_type,
  message,
  details,
  user_base_directory
}) {
  if (!error_type) {
    throw new Error('error_type is required')
  }

  if (!message) {
    throw new Error('message is required')
  }

  return add_timeline_entry({
    thread_id,
    entry: {
      type: 'error',
      error_type,
      message,
      ...(details ? { details } : {})
    },
    user_base_directory
  })
}

/**
 * Add a thread main request to a thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} params.content Main request content
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Updated thread data with the new thread main request
 */
export async function add_thread_main_request({
  thread_id,
  content,
  user_base_directory
}) {
  if (!content) {
    throw new Error('content is required')
  }

  return add_timeline_entry({
    thread_id,
    entry: {
      type: 'thread_main_request',
      content
    },
    user_base_directory
  })
}
