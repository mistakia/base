import create_thread from './create_thread.mjs'
import get_thread, { list_threads } from './get_thread.mjs'
import {
  update_thread_state,
  update_thread_metadata
} from './update_thread.mjs'
import add_timeline_entry, {
  add_user_message,
  add_assistant_message,
  add_tool_call,
  add_tool_result,
  add_error
} from './add_timeline_entry.mjs'
import generate_prompt from './generate_prompt.mjs'
import {
  register_tool,
  has_tool,
  get_tool,
  get_tool_metadata,
  list_tools,
  execute_tool
} from '#libs-server/tools/registry.mjs'

// Export all thread-related functions
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
  generate_prompt
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
