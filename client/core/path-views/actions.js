import { create_api_action_types, create_api_actions } from '@core/utils'

const POST_DATABASE_VIEW = 'POST_DATABASE_VIEW'
const DELETE_DATABASE_VIEW = 'DELETE_DATABASE_VIEW'

export const path_views_action_types = {
  ...create_api_action_types(POST_DATABASE_VIEW),
  ...create_api_action_types(DELETE_DATABASE_VIEW)
}

export const post_database_view_request_actions =
  create_api_actions(POST_DATABASE_VIEW)
export const delete_database_view_request_actions =
  create_api_actions(DELETE_DATABASE_VIEW)
