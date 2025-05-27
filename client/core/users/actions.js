import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'

export const user_actions = {
  LOAD_USER: 'LOAD_USER',

  load: ({ username }) => ({
    type: user_actions.LOAD_USER,
    payload: {
      username
    }
  }),

  ...create_api_action_types('GET_USER')
}

export const get_user_request_actions = create_api_actions('GET_USER')
