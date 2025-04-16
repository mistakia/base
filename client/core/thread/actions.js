import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'
import { thread_constants } from '@libs-shared'

const { THREAD_STATUS } = thread_constants

// Thread action types
export const thread_actions = {
  // Trigger actions
  LOAD_THREADS: 'LOAD_THREADS',
  LOAD_THREAD: 'LOAD_THREAD',
  LOAD_INFERENCE_PROVIDERS: 'LOAD_INFERENCE_PROVIDERS',
  CREATE_THREAD: 'CREATE_THREAD',
  ADD_MESSAGE: 'ADD_MESSAGE',
  UPDATE_THREAD_STATE: 'UPDATE_THREAD_STATE',
  EXECUTE_TOOL: 'EXECUTE_TOOL',

  // Action creators for triggers
  load_threads: () => ({
    type: thread_actions.LOAD_THREADS
  }),

  load_thread: ({ thread_id }) => ({
    type: thread_actions.LOAD_THREAD,
    payload: { thread_id }
  }),

  load_inference_providers: () => ({
    type: thread_actions.LOAD_INFERENCE_PROVIDERS
  }),

  create_thread: ({ inference_provider, model, initial_message, tools }) => ({
    type: thread_actions.CREATE_THREAD,
    payload: { inference_provider, model, initial_message, tools }
  }),

  add_message: (message_data) => ({
    type: thread_actions.ADD_MESSAGE,
    payload: message_data
  }),

  update_thread_state: ({
    thread_id,
    state = THREAD_STATUS.ACTIVE,
    reason
  }) => ({
    type: thread_actions.UPDATE_THREAD_STATE,
    payload: { thread_id, state, reason }
  }),

  execute_tool: (tool_data) => ({
    type: thread_actions.EXECUTE_TOOL,
    payload: tool_data
  }),

  // API actions
  ...create_api_action_types('GET_THREADS'),
  ...create_api_action_types('GET_THREAD'),
  ...create_api_action_types('POST_THREAD'),
  ...create_api_action_types('POST_THREAD_MESSAGE'),
  ...create_api_action_types('PUT_THREAD_STATE'),
  ...create_api_action_types('POST_THREAD_TOOL'),
  ...create_api_action_types('GET_INFERENCE_PROVIDERS'),

  // Streaming-related actions
  START_THREAD_STREAMING: 'START_THREAD_STREAMING',
  RECEIVE_THREAD_STREAM_CHUNK: 'RECEIVE_THREAD_STREAM_CHUNK',
  END_THREAD_STREAMING: 'END_THREAD_STREAMING',
  THREAD_STREAMING_ERROR: 'THREAD_STREAMING_ERROR'
}

// Action creators for API requests
export const get_threads_request_actions = create_api_actions('GET_THREADS')
export const get_thread_request_actions = create_api_actions('GET_THREAD')
export const post_thread_request_actions = create_api_actions('POST_THREAD')
export const post_thread_message_request_actions = create_api_actions(
  'POST_THREAD_MESSAGE'
)
export const put_thread_state_request_actions =
  create_api_actions('PUT_THREAD_STATE')
export const post_thread_tool_request_actions =
  create_api_actions('POST_THREAD_TOOL')
export const get_inference_providers_request_actions = create_api_actions(
  'GET_INFERENCE_PROVIDERS'
)

// Action creators for streaming
export const thread_streaming_actions = {
  start_streaming: (thread_id) => ({
    type: thread_actions.START_THREAD_STREAMING,
    payload: { thread_id }
  }),

  receive_chunk: (thread_id, chunk) => ({
    type: thread_actions.RECEIVE_THREAD_STREAM_CHUNK,
    payload: { thread_id, chunk }
  }),

  end_streaming: (thread_id, final_content) => ({
    type: thread_actions.END_THREAD_STREAMING,
    payload: { thread_id, final_content }
  }),

  streaming_error: (thread_id, error) => ({
    type: thread_actions.THREAD_STREAMING_ERROR,
    payload: { thread_id, error }
  })
}
