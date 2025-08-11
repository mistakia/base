import { create_api_action_types, create_api_actions } from '../utils'

const GET_RESOURCE = 'GET_RESOURCE'

export const resource_action_types = {
  ...create_api_action_types(GET_RESOURCE)
}

export const get_resource_request_actions = create_api_actions(GET_RESOURCE)
