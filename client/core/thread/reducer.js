import { Map } from 'immutable'

import { thread_actions } from './actions'

import {
  parse_thread,
  parse_inference_provider,
  create_user_message
} from './models'

// Initial state
const initial_state = Map({
  threads: Map(), // Map of thread_id -> ThreadRecord
  threads_list_loading: false,
  threads_list_error: null,

  current_thread: null, // Current active thread
  current_thread_loading: false,
  current_thread_error: null,

  inference_providers: Map(), // Map of provider_name -> InferenceProviderRecord
  inference_providers_loading: false,
  inference_providers_error: null,

  streaming: Map({
    thread_id: null,
    is_streaming: false,
    content: '',
    error: null
  })
})

// Helper function to update a thread in the state
const update_thread_in_state = (state, thread) => {
  const thread_record = parse_thread(thread)
  return state.setIn(['threads', thread.thread_id], thread_record)
}

// Reducer
export const thread_reducer = (state = initial_state, action) => {
  const { type, payload } = action

  switch (type) {
    // Load threads (triggers API request)
    case thread_actions.LOAD_THREADS:
      return state

    // Get threads list
    case thread_actions.GET_THREADS_PENDING:
      return state
        .set('threads_list_loading', true)
        .set('threads_list_error', null)

    case thread_actions.GET_THREADS_FULFILLED: {
      const threads = payload.data
      let threadsUpdatedState = state.set('threads_list_loading', false)

      // Add all threads to the state
      threads.forEach((thread) => {
        threadsUpdatedState = update_thread_in_state(
          threadsUpdatedState,
          thread
        )
      })

      return threadsUpdatedState
    }

    case thread_actions.GET_THREADS_FAILED:
      return state
        .set('threads_list_loading', false)
        .set('threads_list_error', payload.error)

    // Get single thread
    case thread_actions.GET_THREAD_PENDING:
      return state
        .set('current_thread_loading', true)
        .set('current_thread_error', null)

    case thread_actions.GET_THREAD_FULFILLED: {
      const fetchedThread = payload.data
      return update_thread_in_state(state, fetchedThread)
        .set('current_thread', fetchedThread.thread_id)
        .set('current_thread_loading', false)
    }

    case thread_actions.GET_THREAD_FAILED:
      return state
        .set('current_thread_loading', false)
        .set('current_thread_error', payload.error)

    // Create new thread
    case thread_actions.POST_THREAD_PENDING:
      return state
        .set('current_thread_loading', true)
        .set('current_thread_error', null)

    case thread_actions.POST_THREAD_FULFILLED: {
      const newThread = payload.data
      return update_thread_in_state(state, newThread)
        .set('current_thread', newThread.thread_id)
        .set('current_thread_loading', false)
    }

    case thread_actions.POST_THREAD_FAILED:
      return state
        .set('current_thread_loading', false)
        .set('current_thread_error', payload.error)

    // Add message to thread
    case thread_actions.POST_THREAD_MESSAGE_PENDING: {
      const { thread_id, content } = payload.opts

      // Add user message optimistically to the thread
      const thread = state.getIn(['threads', thread_id])
      if (!thread) return state

      const user_message = create_user_message(content)
      const updated_thread = thread.update('timeline', (timeline) =>
        timeline.push(user_message)
      )

      return state
        .setIn(['threads', thread_id], updated_thread)
        .set('current_thread_loading', true)
    }

    case thread_actions.POST_THREAD_MESSAGE_FULFILLED: {
      const updatedThread = payload.data
      return update_thread_in_state(state, updatedThread).set(
        'current_thread_loading',
        false
      )
    }

    case thread_actions.POST_THREAD_MESSAGE_FAILED:
      return state
        .set('current_thread_loading', false)
        .set('current_thread_error', payload.error)

    // Update thread state
    case thread_actions.PUT_THREAD_STATE_PENDING:
      return state.set('current_thread_loading', true)

    case thread_actions.PUT_THREAD_STATE_FULFILLED: {
      const stateUpdatedThread = payload.data
      return update_thread_in_state(state, stateUpdatedThread).set(
        'current_thread_loading',
        false
      )
    }

    case thread_actions.PUT_THREAD_STATE_FAILED:
      return state
        .set('current_thread_loading', false)
        .set('current_thread_error', payload.error)

    // Execute tool
    case thread_actions.POST_THREAD_TOOL_PENDING:
      return state.set('current_thread_loading', true)

    case thread_actions.POST_THREAD_TOOL_FULFILLED: {
      const toolExecutedThread = payload.data
      return update_thread_in_state(state, toolExecutedThread).set(
        'current_thread_loading',
        false
      )
    }

    case thread_actions.POST_THREAD_TOOL_FAILED:
      return state
        .set('current_thread_loading', false)
        .set('current_thread_error', payload.error)

    // Get inference providers
    case thread_actions.GET_INFERENCE_PROVIDERS_PENDING:
      return state
        .set('inference_providers_loading', true)
        .set('inference_providers_error', null)

    case thread_actions.GET_INFERENCE_PROVIDERS_FULFILLED: {
      const providers = payload.data
      let providersUpdatedState = state.set(
        'inference_providers_loading',
        false
      )

      // Add all providers to the state
      providers.forEach((provider) => {
        const provider_record = parse_inference_provider(provider)
        providersUpdatedState = providersUpdatedState.setIn(
          ['inference_providers', provider.name],
          provider_record
        )
      })

      return providersUpdatedState
    }

    case thread_actions.GET_INFERENCE_PROVIDERS_FAILED:
      return state
        .set('inference_providers_loading', false)
        .set('inference_providers_error', payload.error)

    // Streaming actions
    case thread_actions.START_THREAD_STREAMING:
      return state.update('streaming', (streaming) =>
        streaming
          .set('thread_id', payload.thread_id)
          .set('is_streaming', true)
          .set('content', '')
          .set('error', null)
      )

    case thread_actions.RECEIVE_THREAD_STREAM_CHUNK:
      return state.update('streaming', (streaming) =>
        streaming.update('content', (content) => content + payload.chunk)
      )

    case thread_actions.END_THREAD_STREAMING:
      return state.update('streaming', (streaming) =>
        streaming
          .set('is_streaming', false)
          .set('content', payload.final_content || streaming.get('content'))
      )

    case thread_actions.THREAD_STREAMING_ERROR:
      return state.update('streaming', (streaming) =>
        streaming.set('is_streaming', false).set('error', payload.error)
      )

    default:
      return state
  }
}
