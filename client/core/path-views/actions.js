export const path_view_actions = {
  SET_DATABASE_VIEW_TABLE_STATE: 'SET_DATABASE_VIEW_TABLE_STATE',

  GET_PATH_VIEWS_PENDING: 'GET_PATH_VIEWS_PENDING',
  GET_PATH_VIEWS_FAILED: 'GET_PATH_VIEWS_FAILED',
  GET_PATH_VIEWS_FULFILLED: 'GET_PATH_VIEWS_FULFILLED',

  set_database_view_table_state: ({ view_id, table_state }) => ({
    type: path_view_actions.SET_DATABASE_VIEW_TABLE_STATE,
    payload: { view_id, table_state }
  }),

  get_path_views_pending: ({ opts }) => ({
    type: path_view_actions.GET_PATH_VIEWS_PENDING,
    payload: { opts }
  }),

  get_path_views_failed: ({ opts, error }) => ({
    type: path_view_actions.GET_PATH_VIEWS_FAILED,
    payload: { opts, error }
  }),

  get_path_views_fulfilled: ({ opts, data }) => ({
    type: path_view_actions.GET_PATH_VIEWS_FULFILLED,
    payload: { opts, data }
  })
}

export const get_path_views_request_actions = {
  get_path_views_pending: path_view_actions.get_path_views_pending,
  get_path_views_failed: path_view_actions.get_path_views_failed,
  get_path_views_fulfilled: path_view_actions.get_path_views_fulfilled
}
