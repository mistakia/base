import { create_api_action_types, create_api_actions } from '../utils'

const GET_ENTITY = 'GET_ENTITY'

export const entity_action_types = {
  ...create_api_action_types(GET_ENTITY)
}

export const get_entity_request_actions = create_api_actions(GET_ENTITY)
