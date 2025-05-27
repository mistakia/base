import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'

export const database_table_actions = {
  LOAD_DATABASE: 'LOAD_DATABASE',

  load_database: ({ user_id, database_table_name }) => ({
    type: database_table_actions.LOAD_DATABASE,
    payload: {
      user_id,
      database_table_name
    }
  }),

  ...create_api_action_types('GET_DATABASE'),
  ...create_api_action_types('GET_DATABASE_ITEMS')
}

export const get_database_request_actions = create_api_actions('GET_DATABASE')
export const get_database_items_request_actions =
  create_api_actions('GET_DATABASE_ITEMS')
