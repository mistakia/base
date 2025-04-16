import { createSelector } from 'reselect'
import { List } from 'immutable'

// Basic selectors
export const get_thread_state = (state) => state.get('thread')
export const get_threads_map = (state) => get_thread_state(state).get('threads')
export const get_current_thread_id = (state) =>
  get_thread_state(state).get('current_thread')
export const get_streaming_state = (state) =>
  get_thread_state(state).get('streaming')

// Derived selectors

// Get all threads as a list
export const get_threads = createSelector(get_threads_map, (threads_map) =>
  threads_map.valueSeq().toList()
)

// Get sorted threads (newest first)
export const get_sorted_threads = createSelector(get_threads, (threads) =>
  threads.sort((a, b) => {
    const a_time = new Date(a.get('updated_at')).getTime()
    const b_time = new Date(b.get('updated_at')).getTime()
    return b_time - a_time // Newest first
  })
)

// Get a thread by ID
export const get_thread_by_id = (state, thread_id) =>
  get_threads_map(state).get(thread_id)

// Get the current active thread
export const get_current_thread = createSelector(
  get_threads_map,
  get_current_thread_id,
  (threads_map, current_thread_id) =>
    current_thread_id ? threads_map.get(current_thread_id) : null
)

// Get threads loading states
export const get_threads_loading_state = createSelector(
  get_thread_state,
  (thread_state) => ({
    threads_list_loading: thread_state.get('threads_list_loading'),
    current_thread_loading: thread_state.get('current_thread_loading'),
    threads_list_error: thread_state.get('threads_list_error'),
    current_thread_error: thread_state.get('current_thread_error')
  })
)

// Get inference providers
export const get_inference_providers_map = (state) =>
  get_thread_state(state).get('inference_providers')

export const get_inference_providers = createSelector(
  get_inference_providers_map,
  (providers_map) => providers_map.valueSeq().toList()
)

export const get_inference_providers_loading_state = createSelector(
  get_thread_state,
  (thread_state) => ({
    loading: thread_state.get('inference_providers_loading'),
    error: thread_state.get('inference_providers_error')
  })
)

// Get a specific provider by name
export const get_inference_provider = (state, provider_name) =>
  get_inference_providers_map(state).get(provider_name)

// Get streaming information
export const get_streaming_info = createSelector(
  get_streaming_state,
  (streaming) => ({
    thread_id: streaming.get('thread_id'),
    is_streaming: streaming.get('is_streaming'),
    content: streaming.get('content'),
    error: streaming.get('error')
  })
)

// Get timeline entries of a specific type from a thread
export const get_thread_entries_by_type = (thread, type) => {
  if (!thread) return List()
  return thread.get('timeline').filter((entry) => entry.get('type') === type)
}

// Get all messages from a thread
export const get_thread_messages = (thread) => {
  if (!thread) return List()
  return thread
    .get('timeline')
    .filter((entry) => entry.get('type') === 'message')
}

// Get all tool calls from a thread
export const get_thread_tool_calls = (thread) => {
  if (!thread) return List()
  return thread
    .get('timeline')
    .filter((entry) => entry.get('type') === 'tool_call')
}

// Get all tool results from a thread
export const get_thread_tool_results = (thread) => {
  if (!thread) return List()
  return thread
    .get('timeline')
    .filter((entry) => entry.get('type') === 'tool_result')
}

// Get all errors from a thread
export const get_thread_errors = (thread) => {
  if (!thread) return List()
  return thread.get('timeline').filter((entry) => entry.get('type') === 'error')
}
