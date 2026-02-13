import fs from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import debug from 'debug'

import get_thread from './get-thread.mjs'
import {
  THREAD_MESSAGE_ROLE,
  validate_thread_message_role
} from './threads-constants.mjs'
import {
  append_timeline_entry_jsonl,
  read_timeline_jsonl_or_default
} from '#libs-server/threads/timeline/index.mjs'

const log = debug('threads:timeline')

// Valid timeline entry types
const VALID_ENTRY_TYPES = [
  'message',
  'tool_call',
  'tool_result',
  'state_change',
  'thread_state_change',
  'error',
  'thread_main_request',
  'notification',
  'human_request',
  'assistant_response'
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
    if (!entry.content?.from_state)
      throw new Error('state_change entry must have content.from_state')
    if (!entry.content?.to_state)
      throw new Error('state_change entry must have content.to_state')
  },

  thread_state_change: (entry) => {
    if (!entry.previous_thread_state)
      throw new Error(
        'thread_state_change entry must have previous_thread_state'
      )
    if (!entry.new_thread_state)
      throw new Error('thread_state_change entry must have new_thread_state')
  },

  error: (entry) => {
    if (!entry.error_type)
      throw new Error('error entry must have an error_type')
    if (!entry.message) throw new Error('error entry must have a message')
  },

  notification: (entry) => {
    if (!entry.content.message)
      throw new Error('notification entry must have a message')
  },

  human_request: (entry) => {
    if (!entry.content.question)
      throw new Error('human_request entry must have a question')
  },

  assistant_response: (entry) => {
    if (!entry.content.text && !entry.content.tool_calls)
      throw new Error('assistant_response entry must have text or tool_calls')
  }
}

/**
 * Add an entry to a thread's timeline
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {Object} params.entry Timeline entry to add
 * @returns {Promise<Object>} Updated thread data
 */
export default async function add_timeline_entry({ thread_id, entry }) {
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

  // Get the thread (validates existence and gets context_dir)
  const thread = await get_thread({
    thread_id
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

  const timeline_path = path.join(thread.context_dir, 'timeline.jsonl')

  // Append entry to timeline (streaming write - avoids read-modify-write)
  await append_timeline_entry_jsonl({ timeline_path, entry: new_entry })

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

  // Read updated timeline for return value
  const timeline = await read_timeline_jsonl_or_default({
    timeline_path,
    default_value: []
  })

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
 * @returns {Promise<Object>} Updated thread data with the new message
 */
export async function add_user_message({ thread_id, content }) {
  if (!content) {
    throw new Error('content is required')
  }

  return add_timeline_entry({
    thread_id,
    entry: {
      type: 'message',
      role: THREAD_MESSAGE_ROLE.USER,
      content
    }
  })
}

/**
 * Add an assistant message to a thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} params.content Message content
 * @returns {Promise<Object>} Updated thread data with the new message
 */
export async function add_assistant_message({ thread_id, content }) {
  if (!content) {
    throw new Error('content is required')
  }

  return add_timeline_entry({
    thread_id,
    entry: {
      type: 'message',
      role: THREAD_MESSAGE_ROLE.THREAD_AGENT,
      content
    }
  })
}

/**
 * Add a tool call to a thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} params.tool_name Name of the tool
 * @param {Object} params.parameters Tool parameters
 * @returns {Promise<Object>} Updated thread data with the tool call
 */
export async function add_tool_call({ thread_id, tool_name, parameters }) {
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
    }
  })
}

/**
 * Add a tool result to a thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID
 * @param {string} params.tool_call_id ID of the tool call
 * @param {Object} params.result Tool execution result
 * @returns {Promise<Object>} Updated thread data with the tool result
 */
export async function add_tool_result({ thread_id, tool_call_id, result }) {
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
    }
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
 * @returns {Promise<Object>} Updated thread data with the error
 */
export async function add_error({ thread_id, error_type, message, details }) {
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
    }
  })
}

