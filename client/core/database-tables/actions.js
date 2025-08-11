import { create_api_action_types, create_api_actions } from '../utils'

const GET_DATABASE = 'GET_DATABASE'
const GET_DATABASE_ITEMS = 'GET_DATABASE_ITEMS'

export const database_tables_action_types = {
  ...create_api_action_types(GET_DATABASE),
  ...create_api_action_types(GET_DATABASE_ITEMS)
}

export const get_database_request_actions = create_api_actions(GET_DATABASE)
export const get_database_items_request_actions =
  create_api_actions(GET_DATABASE_ITEMS)
