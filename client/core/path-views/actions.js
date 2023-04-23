export const path_view_actions = {
  SET_DATABASE_VIEW: 'SET_DATABASE_VIEW',

  CREATE_PATH_VIEW: 'CREATE_PATH_VIEW',

  POST_DATABASE_VIEW_PENDING: 'POST_DATABASE_VIEW_PENDING',
  POST_DATABASE_VIEW_FAILED: 'POST_DATABASE_VIEW_FAILED',
  POST_DATABASE_VIEW_FULFILLED: 'POST_DATABASE_VIEW_FULFILLED',

  DELETE_DATABASE_VIEW: 'DELETE_DATABASE_VIEW',

  DELETE_DATABASE_VIEW_PENDING: 'DELETE_DATABASE_VIEW_PENDING',
  DELETE_DATABASE_VIEW_FAILED: 'DELETE_DATABASE_VIEW_FAILED',
  DELETE_DATABASE_VIEW_FULFILLED: 'DELETE_DATABASE_VIEW_FULFILLED',

  create_path_view: (path_view) => ({
    type: path_view_actions.CREATE_PATH_VIEW,
    payload: { path_view }
  }),

  set_database_view: ({
    view_id,
    view_name,
    view_description,
    table_state,
    table_name
  }) => ({
    type: path_view_actions.SET_DATABASE_VIEW,
    payload: { view_id, view_name, view_description, table_state, table_name }
  }),

  delete_database_view: (view_id) => ({
    type: path_view_actions.DELETE_DATABASE_VIEW,
    payload: { view_id }
  }),

  post_database_view_pending: (opts) => ({
    type: path_view_actions.POST_DATABASE_VIEW_PENDING,
    payload: { opts }
  }),

  post_database_view_failed: (opts, error) => ({
    type: path_view_actions.POST_DATABASE_VIEW_FAILED,
    payload: { opts, error }
  }),

  post_database_view_fulfilled: (opts, data) => ({
    type: path_view_actions.POST_DATABASE_VIEW_FULFILLED,
    payload: { opts, data }
  }),

  delete_database_view_pending: (opts) => ({
    type: path_view_actions.DELETE_DATABASE_VIEW_PENDING,
    payload: { opts }
  }),

  delete_database_view_failed: (opts, error) => ({
    type: path_view_actions.DELETE_DATABASE_VIEW_FAILED,
    payload: { opts, error }
  }),

  delete_database_view_fulfilled: (opts, data) => ({
    type: path_view_actions.DELETE_DATABASE_VIEW_FULFILLED,
    payload: { opts, data }
  })
}

export const post_database_view_request_actions = {
  pending: path_view_actions.post_database_view_pending,
  failed: path_view_actions.post_database_view_failed,
  fulfilled: path_view_actions.post_database_view_fulfilled
}

export const delete_database_view_request_actions = {
  pending: path_view_actions.delete_database_view_pending,
  failed: path_view_actions.delete_database_view_failed,
  fulfilled: path_view_actions.delete_database_view_fulfilled
}
