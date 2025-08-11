import { create_api_action_types, create_api_actions } from '../utils'

const GET_THREADS = 'GET_THREADS'
const GET_THREAD = 'GET_THREAD'
const GET_THREAD_TIMELINE = 'GET_THREAD_TIMELINE'
const GET_THREAD_METADATA = 'GET_THREAD_METADATA'

export const threads_action_types = {
  ...create_api_action_types(GET_THREADS),
  ...create_api_action_types(GET_THREAD),
  ...create_api_action_types(GET_THREAD_TIMELINE),
  ...create_api_action_types(GET_THREAD_METADATA),

  LOAD_THREADS: 'LOAD_THREADS',
  LOAD_THREAD: 'LOAD_THREAD',
  LOAD_THREAD_TIMELINE: 'LOAD_THREAD_TIMELINE',
  LOAD_THREAD_METADATA: 'LOAD_THREAD_METADATA',
  SELECT_THREAD: 'SELECT_THREAD',
  CLEAR_SELECTED_THREAD: 'CLEAR_SELECTED_THREAD'
}

export const get_threads_actions = create_api_actions(GET_THREADS)
export const get_thread_actions = create_api_actions(GET_THREAD)
export const get_thread_timeline_actions =
  create_api_actions(GET_THREAD_TIMELINE)
export const get_thread_metadata_actions =
  create_api_actions(GET_THREAD_METADATA)

export const threads_actions = {
  load_threads: () => ({
    type: threads_action_types.LOAD_THREADS
  }),

  load_thread: (thread_id) => ({
    type: threads_action_types.LOAD_THREAD,
    payload: { thread_id }
  }),

  load_thread_timeline: (thread_id) => ({
    type: threads_action_types.LOAD_THREAD_TIMELINE,
    payload: { thread_id }
  }),

  load_thread_metadata: (thread_id) => ({
    type: threads_action_types.LOAD_THREAD_METADATA,
    payload: { thread_id }
  }),

  select_thread: (thread_id) => ({
    type: threads_action_types.SELECT_THREAD,
    payload: { thread_id }
  }),

  clear_selected_thread: () => ({
    type: threads_action_types.CLEAR_SELECTED_THREAD
  })
}
