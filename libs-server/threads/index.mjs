/**
 * @fileoverview Thread management functions
 */

import debug from 'debug'

import create_thread from './create-thread.mjs'
import get_thread, { list_threads } from './get-thread.mjs'
import {
  update_thread_state,
  update_thread_metadata
} from './update-thread.mjs'
import add_timeline_entry, {
  add_user_message,
  add_assistant_message,
  add_tool_call,
  add_tool_result,
  add_error
} from './add-timeline-entry.mjs'
import generate_prompt from './generate-prompt.mjs'
import execute_thread from './execute-thread.mjs'
import * as thread_tools from './thread-tools.mjs'
import {
  register_tool,
  has_tool,
  get_tool,
  get_tool_metadata,
  list_tools,
  execute_tool
} from '#libs-server/tools/index.mjs'

const log = debug('threads')

log('Initializing threads module')

/**
 * Export thread management functions
 */
export {
  // Core thread operations
  create_thread,
  get_thread,
  list_threads,
  update_thread_state,
  update_thread_metadata,

  // Timeline operations
  add_timeline_entry,
  add_user_message,
  add_assistant_message,
  add_tool_call,
  add_tool_result,
  add_error,

  // Prompt generation
  generate_prompt,

  // Thread execution
  execute_thread,

  // Thread tools
  thread_tools
}

/**
 * Default export of all thread management functions
 */
export default {
  create_thread,
  get_thread,
  list_threads,
  update_thread_state,
  update_thread_metadata,
  add_timeline_entry,
  add_user_message,
  add_assistant_message,
  add_tool_call,
  add_tool_result,
  add_error,
  generate_prompt,
  execute_thread,
  thread_tools
}

// Re-export tool operations directly from centralized tools implementation
export {
  register_tool,
  has_tool,
  get_tool,
  get_tool_metadata,
  list_tools,
  execute_tool
}
