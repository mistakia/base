import { create_api_action_types, create_api_actions } from '../utils'

const GET_USER = 'GET_USER'
const GET_USERS = 'GET_USERS'

export const users_action_types = {
  ...create_api_action_types(GET_USER),
  ...create_api_action_types(GET_USERS)
}

export const get_user_request_actions = create_api_actions(GET_USER)
export const get_users_request_actions = create_api_actions(GET_USERS)
