import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'

export const user_actions = {
  LOAD_USER: 'LOAD_USER',
  LOAD_USERS: 'LOAD_USERS',

  load: ({ username }) => ({
    type: user_actions.LOAD_USER,
    payload: {
      username
    }
  }),

  load_users: () => ({
    type: user_actions.LOAD_USERS
  }),

  ...create_api_action_types('GET_USER'),
  ...create_api_action_types('GET_USERS')
}

export const get_user_request_actions = create_api_actions('GET_USER')
export const get_users_request_actions = create_api_actions('GET_USERS')
