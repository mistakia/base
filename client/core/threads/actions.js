import { create_api_action_types, create_api_actions } from '../utils'

const GET_THREADS = 'GET_THREADS'
const GET_THREAD = 'GET_THREAD'
const GET_MODELS = 'GET_MODELS'
const GET_THREADS_TABLE = 'GET_THREADS_TABLE'

export const threads_action_types = {
  ...create_api_action_types(GET_THREADS),
  ...create_api_action_types(GET_THREAD),
  ...create_api_action_types(GET_MODELS),
  ...create_api_action_types(GET_THREADS_TABLE),

  LOAD_THREADS: 'LOAD_THREADS',
  LOAD_THREAD: 'LOAD_THREAD',
  LOAD_THREADS_TABLE: 'LOAD_THREADS_TABLE',
  SELECT_THREAD: 'SELECT_THREAD',
  CLEAR_SELECTED_THREAD: 'CLEAR_SELECTED_THREAD',

  // Table state management actions
  UPDATE_THREADS_TABLE_STATE: 'UPDATE_THREADS_TABLE_STATE',
  RESET_THREADS_TABLE_STATE: 'RESET_THREADS_TABLE_STATE'
}

export const get_threads_actions = create_api_actions(GET_THREADS)
export const get_thread_actions = create_api_actions(GET_THREAD)
export const get_models_actions = create_api_actions(GET_MODELS)
export const get_threads_table_actions = create_api_actions(GET_THREADS_TABLE)

export const threads_actions = {
  load_threads: () => ({
    type: threads_action_types.LOAD_THREADS
  }),

  load_thread: (thread_id) => ({
    type: threads_action_types.LOAD_THREAD,
    payload: { thread_id }
  }),

  select_thread: (thread_id) => ({
    type: threads_action_types.SELECT_THREAD,
    payload: { thread_id }
  }),

  clear_selected_thread: () => ({
    type: threads_action_types.CLEAR_SELECTED_THREAD
  }),

  // Table state management actions
  update_threads_table_state: ({ table_state }) => ({
    type: threads_action_types.UPDATE_THREADS_TABLE_STATE,
    payload: { table_state }
  }),

  reset_threads_table_state: () => ({
    type: threads_action_types.RESET_THREADS_TABLE_STATE
  }),

  load_threads_table: ({
    table_state = null,
    user_public_key = null,
    is_append = false
  } = {}) => ({
    type: threads_action_types.LOAD_THREADS_TABLE,
    payload: { table_state, user_public_key, is_append }
  })
}
