import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'

export const entity_actions = {
  LOAD_ENTITY: 'LOAD_ENTITY',

  load_entity: ({ base_relative_path, root_base_directory }) => ({
    type: entity_actions.LOAD_ENTITY,
    payload: {
      base_relative_path,
      root_base_directory
    }
  }),

  ...create_api_action_types('GET_ENTITY')
}

export const get_entity_request_actions = create_api_actions('GET_ENTITY')
