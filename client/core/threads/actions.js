import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_THREADS = 'GET_THREADS'
const GET_THREAD = 'GET_THREAD'
const GET_MODELS = 'GET_MODELS'
const GET_THREADS_TABLE = 'GET_THREADS_TABLE'
const CREATE_THREAD_SESSION = 'CREATE_THREAD_SESSION'
const RESUME_THREAD_SESSION = 'RESUME_THREAD_SESSION'

export const threads_action_types = {
  ...create_api_action_types(GET_THREADS),
  ...create_api_action_types(GET_THREAD),
  ...create_api_action_types(GET_MODELS),
  ...create_api_action_types(GET_THREADS_TABLE),
  ...create_api_action_types(CREATE_THREAD_SESSION),
  ...create_api_action_types(RESUME_THREAD_SESSION),

  CREATE_THREAD_SESSION,
  RESUME_THREAD_SESSION,

  LOAD_THREADS: 'LOAD_THREADS',
  LOAD_THREAD: 'LOAD_THREAD',
  LOAD_THREADS_TABLE: 'LOAD_THREADS_TABLE',
  SELECT_THREAD: 'SELECT_THREAD',
  CLEAR_SELECTED_THREAD: 'CLEAR_SELECTED_THREAD',
  SET_THREAD_ARCHIVE_STATE: 'SET_THREAD_ARCHIVE_STATE',

  // Table view management actions
  UPDATE_THREAD_TABLE_VIEW: 'UPDATE_THREAD_TABLE_VIEW',
  SET_THREAD_TABLE_STATE: 'SET_THREAD_TABLE_STATE',
  SELECT_THREAD_TABLE_VIEW: 'SELECT_THREAD_TABLE_VIEW',
  // WebSocket events for real-time thread updates
  THREAD_CREATED: 'THREAD_CREATED',
  THREAD_UPDATED: 'THREAD_UPDATED',
  THREAD_TIMELINE_ENTRY_ADDED: 'THREAD_TIMELINE_ENTRY_ADDED',

  THREAD_JOB_FAILED: 'THREAD_JOB_FAILED'
}

export const get_threads_actions = create_api_actions(GET_THREADS)
export const get_thread_actions = create_api_actions(GET_THREAD)
export const get_models_actions = create_api_actions(GET_MODELS)
export const get_threads_table_actions = create_api_actions(GET_THREADS_TABLE)
export const create_thread_session_actions = create_api_actions(
  CREATE_THREAD_SESSION
)
export const resume_thread_session_actions = create_api_actions(
  RESUME_THREAD_SESSION
)

export const threads_actions = {
  load_threads: (params = {}) => ({
    type: threads_action_types.LOAD_THREADS,
    payload: params
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

  update_thread_table_view: ({ view }) => ({
    type: threads_action_types.UPDATE_THREAD_TABLE_VIEW,
    payload: { view }
  }),

  // Set table state directly without triggering a debounced fetch
  set_thread_table_state: ({ view_id, table_state }) => ({
    type: threads_action_types.SET_THREAD_TABLE_STATE,
    payload: { view_id, table_state }
  }),

  select_thread_table_view: ({ view_id }) => ({
    type: threads_action_types.SELECT_THREAD_TABLE_VIEW,
    payload: { view_id }
  }),

  load_threads_table: ({
    view_id = 'default',
    is_append = false,
    url_filters = []
  } = {}) => ({
    type: threads_action_types.LOAD_THREADS_TABLE,
    payload: { view_id, is_append, url_filters }
  }),

  set_thread_archive_state: ({ thread_id, archive_reason, archived_at }) => ({
    type: threads_action_types.SET_THREAD_ARCHIVE_STATE,
    payload: { thread_id, archive_reason, archived_at }
  }),

  create_thread_session: ({ prompt, working_directory }) => ({
    type: threads_action_types.CREATE_THREAD_SESSION,
    payload: { prompt, working_directory }
  }),

  resume_thread_session: ({ thread_id, prompt, working_directory }) => ({
    type: threads_action_types.RESUME_THREAD_SESSION,
    payload: { thread_id, prompt, working_directory }
  })
}
