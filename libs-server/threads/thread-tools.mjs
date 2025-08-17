/**
 * @fileoverview Tools specific to thread execution
 */

import debug from 'debug'
import { v4 as uuidv4 } from 'uuid'

import add_timeline_entry from './add-timeline-entry.mjs'
import { update_thread_state } from './update-thread.mjs'
import { register_tool, get_tool } from '#libs-server/tools/registry.mjs'
import { remove_worktree } from '#libs-server/git/worktree-operations.mjs'
import { get_registered_directories } from '#libs-server/base-uri/index.mjs'

const log = debug('threads:tools')

// Tool definitions
export const THREAD_ARCHIVE_TOOL = 'archive_thread'
export const THREAD_PAUSE_TOOL = 'pause_execution'
export const THREAD_MESSAGE_NOTIFY_TOOL = 'message_notify'
export const THREAD_MESSAGE_ASK_TOOL = 'message_ask'

/**
 * Archive the current thread
 *
 * @param {Object} params Parameters for the archive tool
 * @param {string} params.summary Optional summary of thread results
 * @param {string} params.archive_reason Reason for archiving (completed or user_abandoned)
 * @param {Object} context Execution context
 * @param {string} context.thread_id ID of the thread to archive
 * @returns {Promise<Object>} Result of the tool execution
 */
export const archive_thread = async (params, context = {}) => {
  const {
    summary = 'Thread execution archived',
    archive_reason = 'completed'
  } = params
  const { thread_id } = context

  if (!thread_id) {
    throw new Error('thread_id is required in context')
  }

  log(`Archiving thread ${thread_id}`)

  try {
    // Update thread state to archived
    const updated_thread = await update_thread_state({
      thread_id,
      thread_state: 'archived',
      archive_reason,
      reason: 'Thread archived via archive_thread tool'
    })

    // Add timeline entry for archiving
    await add_timeline_entry({
      thread_id,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'state_change',
        content: {
          from_state: 'active',
          to_state: 'archived',
          reason: 'Thread archived via archive_thread tool',
          archive_reason,
          summary
        }
      }
    })

    // Clean up worktrees if they exist
    if (updated_thread.system_worktree_path) {
      try {
        log(
          `Cleaning up system worktree at ${updated_thread.system_worktree_path}`
        )
        // Get system base directory from registry
        const { system_base_directory } = get_registered_directories()
        await remove_worktree({
          repo_path: system_base_directory,
          worktree_path: updated_thread.system_worktree_path
        })
      } catch (worktree_error) {
        log(`Error removing system worktree: ${worktree_error.message}`)
        // Continue with archiving even if worktree cleanup fails
      }
    }

    if (updated_thread.user_worktree_path) {
      try {
        log(`Cleaning up user worktree at ${updated_thread.user_worktree_path}`)
        // Get user base directory from registry
        const { user_base_directory } = get_registered_directories()
        await remove_worktree({
          repo_path: user_base_directory,
          worktree_path: updated_thread.user_worktree_path
        })
      } catch (worktree_error) {
        log(`Error removing user worktree: ${worktree_error.message}`)
        // Continue with archiving even if worktree cleanup fails
      }
    }

    return {
      success: true,
      message: 'Thread archived successfully',
      archive_reason,
      summary
    }
  } catch (error) {
    log(`Error archiving thread: ${error.message}`)
    return {
      success: false,
      message: `Failed to archive thread: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * Pause the thread execution
 *
 * @param {Object} params Parameters for the pause tool
 * @param {string} params.reason Optional reason for pausing
 * @param {Object} context Execution context
 * @param {string} context.thread_id ID of the thread to pause
 * @returns {Promise<Object>} Result of the tool execution
 */
export const pause_execution = async (params, context = {}) => {
  const { reason = 'Thread execution paused by assistant' } = params
  const { thread_id } = context

  if (!thread_id) {
    throw new Error('thread_id is required in context')
  }

  log(`Pausing thread ${thread_id}`)

  try {
    // Update thread state to paused
    await update_thread_state({
      thread_id,
      thread_state: 'paused',
      reason
    })

    // Add timeline entry for pausing
    await add_timeline_entry({
      thread_id,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'state_change',
        content: {
          from_state: 'active',
          to_state: 'paused',
          reason
        }
      }
    })

    return {
      success: true,
      message: 'Thread paused successfully',
      reason
    }
  } catch (error) {
    log(`Error pausing thread: ${error.message}`)
    return {
      success: false,
      message: `Failed to pause thread: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * Send a notification message to the user (non-blocking)
 *
 * @param {Object} params Parameters for the message_notify tool
 * @param {string} params.message Message to send to the user
 * @param {string} params.level Optional notification level (info, warning, error)
 * @param {Object} context Execution context
 * @param {string} context.thread_id ID of the thread
 * @returns {Promise<Object>} Result of the tool execution
 */
export const message_notify = async (params, context = {}) => {
  const { message, level = 'info' } = params
  const { thread_id } = context

  if (!thread_id) {
    throw new Error('thread_id is required in context')
  }

  if (!message) {
    throw new Error('message parameter is required')
  }

  log(`Sending notification in thread ${thread_id}: ${message}`)

  try {
    // Add timeline entry for the notification
    await add_timeline_entry({
      thread_id,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'notification',
        content: {
          message,
          level
        }
      }
    })

    return {
      success: true,
      message: 'Notification sent successfully',
      notification: {
        message,
        level
      }
    }
  } catch (error) {
    log(`Error sending notification: ${error.message}`)
    return {
      success: false,
      message: `Failed to send notification: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * Ask the user a question and wait for response (blocking)
 *
 * @param {Object} params Parameters for the message_ask tool
 * @param {string} params.question Question to ask the user
 * @param {string} params.options Optional array of predefined answer options
 * @param {Object} context Execution context
 * @param {string} context.thread_id ID of the thread
 * @returns {Promise<Object>} Result of the tool execution
 */
export const message_ask = async (params, context = {}) => {
  const { question, options = [] } = params
  const { thread_id } = context

  if (!thread_id) {
    throw new Error('thread_id is required in context')
  }

  if (!question) {
    throw new Error('question parameter is required')
  }

  log(`Asking user in thread ${thread_id}: ${question}`)

  try {
    // In a real implementation, this would create a human_request object
    // and wait for the user to respond before returning.
    // For now, we'll just add a timeline entry and pretend we got a response.

    // Add timeline entry for the question
    const request_id = uuidv4()
    await add_timeline_entry({
      thread_id,
      entry: {
        id: request_id,
        timestamp: new Date().toISOString(),
        type: 'human_request',
        content: {
          request_id,
          question,
          options,
          status: 'pending'
        }
      }
    })

    // Pause the thread while waiting for response
    await update_thread_state({
      thread_id,
      thread_state: 'paused',
      reason: 'Waiting for user response to question'
    })

    // Add timeline entry for the pause
    await add_timeline_entry({
      thread_id,
      entry: {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: 'state_change',
        content: {
          from_state: 'active',
          to_state: 'paused',
          reason: 'Waiting for user response to question',
          request_id
        }
      }
    })

    return {
      success: true,
      message:
        'Question asked successfully, thread paused waiting for response',
      request_id,
      thread_state: 'paused'
    }
  } catch (error) {
    log(`Error asking question: ${error.message}`)
    return {
      success: false,
      message: `Failed to ask question: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * Define the archive_thread tool schema
 */
const archive_thread_schema = {
  description: 'Archive the thread execution and mark it as archived',
  stops_execution: true,
  inputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Optional summary of the thread results'
      },
      archive_reason: {
        type: 'string',
        description: 'Reason for archiving (completed or user_abandoned)',
        enum: ['completed', 'user_abandoned'],
        default: 'completed'
      }
    },
    required: []
  }
}

/**
 * Define the pause_execution tool schema
 */
const pause_execution_schema = {
  description: 'Pause the thread execution until manually resumed',
  stops_execution: true,
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Optional reason for pausing the thread'
      }
    },
    required: []
  }
}

/**
 * Define the message_notify tool schema
 */
const message_notify_schema = {
  description: 'Send a notification message to the user (non-blocking)',
  stops_execution: false,
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message to send to the user'
      },
      level: {
        type: 'string',
        description: 'Notification level (info, warning, error)',
        enum: ['info', 'warning', 'error']
      }
    },
    required: ['message']
  }
}

/**
 * Define the message_ask tool schema
 */
const message_ask_schema = {
  description: 'Ask the user a question and wait for response (blocking)',
  stops_execution: true,
  inputSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Question to ask the user'
      },
      options: {
        type: 'array',
        description: 'Optional array of predefined answer options',
        items: {
          type: 'string'
        }
      }
    },
    required: ['question']
  }
}

/**
 * Register all thread tools with the central tool registry
 */
export function register_thread_tools() {
  // Register the archive_thread tool
  register_tool({
    tool_name: THREAD_ARCHIVE_TOOL,
    tool_definition: archive_thread_schema,
    implementation: archive_thread
  })

  // Register the pause_execution tool
  register_tool({
    tool_name: THREAD_PAUSE_TOOL,
    tool_definition: pause_execution_schema,
    implementation: pause_execution
  })

  // Register the message_notify tool
  register_tool({
    tool_name: THREAD_MESSAGE_NOTIFY_TOOL,
    tool_definition: message_notify_schema,
    implementation: message_notify
  })

  // Register the message_ask tool
  register_tool({
    tool_name: THREAD_MESSAGE_ASK_TOOL,
    tool_definition: message_ask_schema,
    implementation: message_ask
  })

  log('Registered all thread tools with central registry')
}

/**
 * Get the list of thread tool names
 *
 * @returns {Array<string>} Array of thread tool names
 */
export const get_thread_tool_names = () => {
  return [
    THREAD_ARCHIVE_TOOL,
    THREAD_PAUSE_TOOL,
    THREAD_MESSAGE_NOTIFY_TOOL,
    THREAD_MESSAGE_ASK_TOOL
  ]
}

/**
 * Check if a tool call is a blocking tool call
 *
 * @param {Object} tool_call The tool call to check
 * @returns {boolean} True if the tool call is blocking
 */
export const is_blocking_tool_call = (tool_call) => {
  // Get the tool definition from the registry
  const tool = get_tool({ tool_name: tool_call.tool_name })

  if (!tool) {
    // If tool is not found, assume it's not blocking
    return false
  }

  // Check if the tool stops execution
  return tool.stops_execution === true
}

// Register the thread tools when this module is imported
register_thread_tools()

export default {
  archive_thread,
  pause_execution,
  message_notify,
  message_ask,
  get_thread_tool_names,
  is_blocking_tool_call,
  register_thread_tools
}
