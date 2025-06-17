import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'

export const resource_actions = {
  LOAD_RESOURCE: 'LOAD_RESOURCE',
  TOGGLE_DIRECTORY: 'TOGGLE_DIRECTORY',
  CLEAR_RESOURCE: 'CLEAR_RESOURCE',
  CLEAR_ALL_RESOURCES: 'CLEAR_ALL_RESOURCES',

  load_resource: ({ base_uri, username, force_refresh = false }) => ({
    type: resource_actions.LOAD_RESOURCE,
    payload: { base_uri, username, force_refresh }
  }),

  toggle_directory: ({ base_uri }) => ({
    type: resource_actions.TOGGLE_DIRECTORY,
    payload: { base_uri }
  }),

  clear_resource: ({ base_uri }) => ({
    type: resource_actions.CLEAR_RESOURCE,
    payload: { base_uri }
  }),

  clear_all_resources: () => ({
    type: resource_actions.CLEAR_ALL_RESOURCES
  }),

  ...create_api_action_types('GET_RESOURCE')
}

export const get_resource_request_actions = create_api_actions('GET_RESOURCE')
