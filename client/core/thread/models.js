import { Record, List, Map } from 'immutable'
import { thread_constants } from '@libs-shared/index.mjs'

const { THREAD_STATE, is_valid_thread_state } = thread_constants

// Individual record factories without inheritance
const MessageEntryRecord = Record({
  id: null,
  timestamp: null,
  type: null,
  role: null, // 'user' or 'assistant'
  content: ''
})

const ToolCallEntryRecord = Record({
  id: null,
  timestamp: null,
  type: null,
  tool_name: null,
  parameters: Map()
})

const ToolResultEntryRecord = Record({
  id: null,
  timestamp: null,
  type: null,
  tool_call_id: null, // ID of the related tool call
  result: null,
  error: null
})

const ErrorEntryRecord = Record({
  id: null,
  timestamp: null,
  type: null,
  error_type: null,
  message: ''
})

const ThreadStateChangeEntryRecord = Record({
  id: null,
  timestamp: null,
  type: null,
  previous_thread_state: null,
  new_thread_state: null,
  reason: null
})

export {
  MessageEntryRecord,
  ToolCallEntryRecord,
  ToolResultEntryRecord,
  ErrorEntryRecord,
  ThreadStateChangeEntryRecord
}

/**
 * Model record
 */
export const ModelRecord = Record({
  name: null,
  modified_at: null
})

/**
 * Main thread record
 */
export const ThreadRecord = Record({
  thread_id: null,
  user_id: null,
  inference_provider: null,
  model: null,
  thread_state: THREAD_STATE.ACTIVE,
  created_at: null,
  updated_at: null,
  tools: List(),
  timeline: List(),
  metadata: Map(),
  context_dir: null
})

/**
 * Inference provider record
 */
export const InferenceProviderRecord = Record({
  name: null,
  display_name: null,
  models: List(),
  config: Map()
})

/**
 * Helper function to create a user message entry
 */
export const create_user_message = (content) => {
  return new MessageEntryRecord({
    id: `msg_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: 'message',
    role: 'user',
    content
  })
}

/**
 * Helper function to create an assistant message entry
 */
export const create_assistant_message = (content) => {
  return new MessageEntryRecord({
    id: `msg_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: 'message',
    role: 'assistant',
    content
  })
}

/**
 * Helper function to create a tool call entry
 */
export const create_tool_call = (tool_name, parameters = {}) => {
  return new ToolCallEntryRecord({
    id: `tool_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: 'tool_call',
    tool_name,
    parameters: Map(parameters)
  })
}

/**
 * Helper function to create a tool result entry
 */
export const create_tool_result = (
  tool_call_id,
  result = null,
  error = null
) => {
  return new ToolResultEntryRecord({
    id: `result_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: 'tool_result',
    tool_call_id,
    result,
    error
  })
}

/**
 * Helper function to create an error entry
 */
export const create_error = (error_type, message, details = {}) => {
  return new ErrorEntryRecord({
    id: `error_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: 'error',
    error_type,
    message,
    details: Map(details)
  })
}

/**
 * Helper function to create a thread state change entry
 */
export const create_thread_state_change = (
  previous_thread_state,
  new_thread_state,
  reason = null
) => {
  // Validate that thread states match our defined constants
  if (!is_valid_thread_state(new_thread_state)) {
    console.warn(`Invalid thread state: ${new_thread_state}`)
  }

  return new ThreadStateChangeEntryRecord({
    id: `thread_state_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: 'thread_state_change',
    previous_thread_state,
    new_thread_state,
    reason
  })
}

/**
 * Helper function to parse timeline entries from the server
 */
export const parse_timeline_entry = (entry) => {
  switch (entry.type) {
    case 'message':
      return new MessageEntryRecord({
        ...entry,
        metadata: Map(entry.metadata || {})
      })
    case 'tool_call':
      return new ToolCallEntryRecord({
        ...entry,
        parameters: Map(entry.parameters || {}),
        metadata: Map(entry.metadata || {})
      })
    case 'tool_result':
      return new ToolResultEntryRecord({
        ...entry,
        metadata: Map(entry.metadata || {})
      })
    case 'error':
      return new ErrorEntryRecord({
        ...entry,
        details: Map(entry.details || {})
      })
    case 'state_change':
      return new ThreadStateChangeEntryRecord({
        ...entry
      })
    default:
      // For unknown types, use a generic Record with the entry data
      return new (Record({
        id: null,
        timestamp: null,
        type: null,
        ...entry
      }))()
  }
}

/**
 * Helper function to parse a model from server data
 */
export const parse_model = (model_data) => {
  if (typeof model_data === 'string') {
    return model_data
  }

  return new ModelRecord({
    name: model_data.name,
    modified_at: model_data.modified_at
  })
}

/**
 * Helper function to parse a thread from the server
 */
export const parse_thread = (thread_data) => {
  const timeline = thread_data.timeline
    ? List(thread_data.timeline.map(parse_timeline_entry))
    : List()

  return new ThreadRecord({
    ...thread_data,
    tools: List(thread_data.tools || []),
    timeline,
    metadata: Map(thread_data.metadata || {})
  })
}

/**
 * Helper function to parse inference providers from the server
 */
export const parse_inference_provider = (provider_data) => {
  const models = provider_data.models
    ? List(provider_data.models.map((model) => parse_model(model)))
    : List()

  return new InferenceProviderRecord({
    name: provider_data.name,
    display_name: provider_data.display_name,
    models,
    config: Map(provider_data.config || {})
  })
}
