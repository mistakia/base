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
  SET_THREAD_ARCHIVE_STATE: 'SET_THREAD_ARCHIVE_STATE',

  // Table view management actions
  UPDATE_THREAD_TABLE_VIEW: 'UPDATE_THREAD_TABLE_VIEW',
  SELECT_THREAD_TABLE_VIEW: 'SELECT_THREAD_TABLE_VIEW',
  RESET_THREAD_TABLE_VIEW: 'RESET_THREAD_TABLE_VIEW'
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

  // Table view management actions - update_threads_table_state handles on_view_change
  update_threads_table_state: ({ view }) => ({
    type: threads_action_types.UPDATE_THREAD_TABLE_VIEW,
    payload: { view }
  }),

  select_thread_table_view: ({ view_id }) => ({
    type: threads_action_types.SELECT_THREAD_TABLE_VIEW,
    payload: { view_id }
  }),

  reset_thread_table_view: ({ view_id = 'default' } = {}) => ({
    type: threads_action_types.RESET_THREAD_TABLE_VIEW,
    payload: { view_id }
  }),

  load_threads_table: ({ view_id = 'default', is_append = false } = {}) => ({
    type: threads_action_types.LOAD_THREADS_TABLE,
    payload: { view_id, is_append }
  }),

  set_thread_archive_state: ({ thread_id, archive_reason, archived_at }) => ({
    type: threads_action_types.SET_THREAD_ARCHIVE_STATE,
    payload: { thread_id, archive_reason, archived_at }
  })
}
