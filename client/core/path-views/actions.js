export const path_view_actions = {
  SET_DATABASE_VIEW_TABLE_STATE: 'SET_DATABASE_VIEW_TABLE_STATE',

  CREATE_PATH_VIEW: 'CREATE_PATH_VIEW',

  GET_PATH_VIEWS_PENDING: 'GET_PATH_VIEWS_PENDING',
  GET_PATH_VIEWS_FAILED: 'GET_PATH_VIEWS_FAILED',
  GET_PATH_VIEWS_FULFILLED: 'GET_PATH_VIEWS_FULFILLED',

  PUT_DATBASE_VIEW_PENDING: 'PUT_DATBASE_VIEW_PENDING',
  PUT_DATBASE_VIEW_FAILED: 'PUT_DATBASE_VIEW_FAILED',
  PUT_DATBASE_VIEW_FULFILLED: 'PUT_DATBASE_VIEW_FULFILLED',

  POST_DATBASE_VIEWS_PENDING: 'POST_DATBASE_VIEWS_PENDING',
  POST_DATBASE_VIEWS_FAILED: 'POST_DATBASE_VIEWS_FAILED',
  POST_DATBASE_VIEWS_FULFILLED: 'POST_DATBASE_VIEWS_FULFILLED',

  create_path_view: (path_view) => ({
    type: path_view_actions.CREATE_PATH_VIEW,
    payload: { path_view }
  }),

  set_database_view_table_state: ({ view_id, table_state }) => ({
    type: path_view_actions.SET_DATABASE_VIEW_TABLE_STATE,
    payload: { view_id, table_state }
  }),

  get_path_views_pending: (opts) => ({
    type: path_view_actions.GET_PATH_VIEWS_PENDING,
    payload: { opts }
  }),

  get_path_views_failed: (opts, error) => ({
    type: path_view_actions.GET_PATH_VIEWS_FAILED,
    payload: { opts, error }
  }),

  get_path_views_fulfilled: (opts, data) => ({
    type: path_view_actions.GET_PATH_VIEWS_FULFILLED,
    payload: { opts, data }
  }),

  put_database_view_pending: (opts) => ({
    type: path_view_actions.PUT_DATBASE_VIEW_PENDING,
    payload: { opts }
  }),

  put_database_view_failed: (opts, error) => ({
    type: path_view_actions.PUT_DATBASE_VIEW_FAILED,
    payload: { opts, error }
  }),

  put_database_view_fulfilled: (opts, data) => ({
    type: path_view_actions.PUT_DATBASE_VIEW_FULFILLED,
    payload: { opts, data }
  }),

  post_database_views_pending: (opts) => ({
    type: path_view_actions.POST_DATBASE_VIEWS_PENDING,
    payload: { opts }
  }),

  post_database_views_failed: (opts, error) => ({
    type: path_view_actions.POST_DATBASE_VIEWS_FAILED,
    payload: { opts, error }
  }),

  post_database_views_fulfilled: (opts, data) => ({
    type: path_view_actions.POST_DATBASE_VIEWS_FULFILLED,
    payload: { opts, data }
  })
}

export const get_path_views_request_actions = {
  pending: path_view_actions.get_path_views_pending,
  failed: path_view_actions.get_path_views_failed,
  fulfilled: path_view_actions.get_path_views_fulfilled
}

export const put_database_view_request_actions = {
  pending: path_view_actions.put_database_view_pending,
  failed: path_view_actions.put_database_view_failed,
  fulfilled: path_view_actions.put_database_view_fulfilled
}

export const post_database_views_request_actions = {
  pending: path_view_actions.post_database_views_pending,
  failed: path_view_actions.post_database_views_failed,
  fulfilled: path_view_actions.post_database_views_fulfilled
}
