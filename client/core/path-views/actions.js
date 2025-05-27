import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'

export const path_view_actions = {
  SET_DATABASE_VIEW: 'SET_DATABASE_VIEW',

  CREATE_PATH_VIEW: 'CREATE_PATH_VIEW',

  DELETE_DATABASE_VIEW: 'DELETE_DATABASE_VIEW',

  ...create_api_action_types('POST_DATABASE_VIEW'),
  ...create_api_action_types('DELETE_DATABASE_VIEW'),

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
  })
}

export const post_database_view_request_actions =
  create_api_actions('POST_DATABASE_VIEW')
export const delete_database_view_request_actions = create_api_actions(
  'DELETE_DATABASE_VIEW'
)
